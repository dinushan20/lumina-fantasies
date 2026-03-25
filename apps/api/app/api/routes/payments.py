from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUserContext, get_current_user_context
from app.db.session import get_db_session
from app.schemas.payments import CheckoutSessionResponse, CreateCheckoutRequest, CustomerPortalResponse, StripeWebhookResponse
from app.services.payments import PaymentService

router = APIRouter()


def get_payment_service(session: AsyncSession = Depends(get_db_session)) -> PaymentService:
    return PaymentService(session=session)


@router.post("/payments/create-checkout", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    payload: CreateCheckoutRequest,
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    payment_service: PaymentService = Depends(get_payment_service),
) -> CheckoutSessionResponse:
    return CheckoutSessionResponse(url=await payment_service.create_checkout_session(current_user, payload.tier))


@router.post("/payments/portal", response_model=CustomerPortalResponse)
async def create_customer_portal_session(
    current_user: AuthenticatedUserContext = Depends(get_current_user_context),
    payment_service: PaymentService = Depends(get_payment_service),
) -> CustomerPortalResponse:
    return CustomerPortalResponse(url=await payment_service.create_customer_portal_session(current_user))


@router.post("/payments/webhook", response_model=StripeWebhookResponse)
async def handle_payments_webhook(
    request: Request,
    payment_service: PaymentService = Depends(get_payment_service),
) -> StripeWebhookResponse:
    payload = await request.body()
    stripe_signature = request.headers.get("stripe-signature")
    result = await payment_service.handle_webhook(payload, stripe_signature)
    return StripeWebhookResponse(**result)

