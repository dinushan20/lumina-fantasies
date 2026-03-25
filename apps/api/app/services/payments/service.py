from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import stripe
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.deps import AuthenticatedUserContext
from app.core.config import get_settings
from app.services.profile import ProfileService


class PaymentService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.settings = get_settings()
        self.profile_service = ProfileService(session)

        if self.settings.stripe_secret_key:
            stripe.api_key = self.settings.stripe_secret_key
            stripe.max_network_retries = 2

    async def create_checkout_session(self, current_user: AuthenticatedUserContext, tier: str) -> str:
        self._require_stripe_configured()

        if tier == "free":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Free tier does not require checkout.")

        profile = await self.profile_service.get_or_create_profile(current_user, commit=False)
        customer_id = await self._ensure_customer(current_user=current_user, existing_customer_id=profile.stripe_customer_id)
        price_id = self._get_price_id_for_tier(tier)

        session = await run_in_threadpool(
            lambda: stripe.checkout.Session.create(
                mode="subscription",
                customer=customer_id,
                client_reference_id=str(current_user.id),
                allow_promotion_codes=True,
                line_items=[{"price": price_id, "quantity": 1}],
                success_url=f"{self.settings.web_app_url}/dashboard?checkout=success",
                cancel_url=f"{self.settings.web_app_url}/pricing?checkout=canceled",
                metadata={"user_id": str(current_user.id), "tier": tier},
                subscription_data={"metadata": {"user_id": str(current_user.id), "tier": tier}},
            )
        )

        await self.profile_service.update_subscription_state(
            current_user=current_user,
            stripe_customer_id=customer_id,
        )

        if not getattr(session, "url", None):
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Stripe Checkout did not return a redirect URL.")

        return str(session.url)

    async def create_customer_portal_session(self, current_user: AuthenticatedUserContext) -> str:
        self._require_stripe_configured()

        profile = await self.profile_service.get_or_create_profile(current_user, commit=True)
        if not profile.stripe_customer_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No Stripe customer is linked to this profile yet.")

        portal_session = await run_in_threadpool(
            lambda: stripe.billing_portal.Session.create(
                customer=profile.stripe_customer_id,
                return_url=f"{self.settings.web_app_url}/dashboard",
            )
        )

        if not getattr(portal_session, "url", None):
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Stripe Billing Portal did not return a redirect URL.")

        return str(portal_session.url)

    async def handle_webhook(self, payload: bytes, stripe_signature: str | None) -> dict[str, bool]:
        self._require_stripe_configured(require_webhook_secret=True)

        if not stripe_signature:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe signature header.")

        try:
            event = await run_in_threadpool(
                lambda: stripe.Webhook.construct_event(payload, stripe_signature, self.settings.stripe_webhook_secret)
            )
        except stripe.error.SignatureVerificationError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe webhook signature.") from exc
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe webhook payload.") from exc

        event_type = event["type"]
        data = event["data"]["object"]

        if event_type == "checkout.session.completed":
            await self._handle_checkout_session_completed(data)
        elif event_type in {
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
        }:
            await self._handle_subscription_event(data, deleted=event_type == "customer.subscription.deleted")

        return {"received": True}

    async def _ensure_customer(self, *, current_user: AuthenticatedUserContext, existing_customer_id: str | None) -> str:
        if existing_customer_id:
            return existing_customer_id

        customer = await run_in_threadpool(
            lambda: stripe.Customer.create(
                email=current_user.email,
                metadata={"user_id": str(current_user.id)},
            )
        )
        return str(customer.id)

    async def _handle_checkout_session_completed(self, session_object: Any) -> None:
        metadata = session_object.get("metadata", {}) or {}
        user_id = metadata.get("user_id")
        tier = metadata.get("tier")
        stripe_customer_id = session_object.get("customer")
        stripe_subscription_id = session_object.get("subscription")

        await self.profile_service.update_subscription_state(
            user_id=user_id,
            stripe_customer_id=stripe_customer_id,
            stripe_subscription_id=stripe_subscription_id,
            subscription_tier=tier or "free",
            subscription_status="active" if stripe_subscription_id else "inactive",
            current_period_end=None,
        )

    async def _handle_subscription_event(self, subscription_object: Any, *, deleted: bool) -> None:
        metadata = subscription_object.get("metadata", {}) or {}
        user_id = metadata.get("user_id")
        stripe_customer_id = subscription_object.get("customer")
        stripe_subscription_id = None if deleted else subscription_object.get("id")
        tier = "free" if deleted else (metadata.get("tier") or self._infer_tier_from_subscription(subscription_object))
        subscription_status = "canceled" if deleted else subscription_object.get("status", "inactive")
        current_period_end = self._from_unix_timestamp(subscription_object.get("current_period_end"))

        profile = await self.profile_service.update_subscription_state(
            user_id=user_id,
            stripe_customer_id=stripe_customer_id,
            stripe_subscription_id=stripe_subscription_id,
            subscription_tier=tier,
            subscription_status=subscription_status,
            current_period_end=current_period_end,
        )

        if profile is None and stripe_customer_id:
            await self.profile_service.update_subscription_state(
                stripe_customer_id=stripe_customer_id,
                stripe_subscription_id=stripe_subscription_id,
                subscription_tier=tier,
                subscription_status=subscription_status,
                current_period_end=current_period_end,
            )

    def _require_stripe_configured(self, *, require_webhook_secret: bool = False) -> None:
        if not self.settings.stripe_secret_key:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe secret key is not configured.")
        if require_webhook_secret and not self.settings.stripe_webhook_secret:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe webhook secret is not configured.")

    def _get_price_id_for_tier(self, tier: str) -> str:
        price_map = {
            "basic": self.settings.stripe_price_basic_id,
            "premium": self.settings.stripe_price_premium_id,
            "vip": self.settings.stripe_price_vip_id,
        }
        price_id = price_map.get(tier)
        if not price_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Stripe price id for the {tier} tier is not configured.",
            )
        return price_id

    def _infer_tier_from_subscription(self, subscription_object: Any) -> str:
        items = subscription_object.get("items", {}).get("data", [])
        if not items:
            return "free"

        price_id = items[0].get("price", {}).get("id")
        price_map = {
            self.settings.stripe_price_basic_id: "basic",
            self.settings.stripe_price_premium_id: "premium",
            self.settings.stripe_price_vip_id: "vip",
        }
        return price_map.get(price_id, "free")

    def _from_unix_timestamp(self, value: int | None) -> datetime | None:
        if value is None:
            return None
        return datetime.fromtimestamp(value, tz=timezone.utc)
