from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthenticatedUserContext
from app.db.models.audit import AuditLog
from app.db.models.identity import AuthUser, Profile
from app.db.models.story import StoryGeneration
from app.schemas.profile import ProfileOnboardingRequest, ProfilePreferences, ProfileResponse, UsageSummary


@dataclass(frozen=True, slots=True)
class SubscriptionFeaturesConfig:
    daily_generation_limit: int | None
    daily_audio_generation_limit: int | None
    audio_enabled: bool
    priority_generation: bool
    early_digital_twin_access: bool


SUBSCRIPTION_FEATURES: dict[str, SubscriptionFeaturesConfig] = {
    "free": SubscriptionFeaturesConfig(
        daily_generation_limit=3,
        daily_audio_generation_limit=0,
        audio_enabled=False,
        priority_generation=False,
        early_digital_twin_access=False,
    ),
    "basic": SubscriptionFeaturesConfig(
        daily_generation_limit=30,
        daily_audio_generation_limit=0,
        audio_enabled=False,
        priority_generation=False,
        early_digital_twin_access=False,
    ),
    "premium": SubscriptionFeaturesConfig(
        daily_generation_limit=None,
        daily_audio_generation_limit=20,
        audio_enabled=True,
        priority_generation=False,
        early_digital_twin_access=False,
    ),
    "vip": SubscriptionFeaturesConfig(
        daily_generation_limit=None,
        daily_audio_generation_limit=80,
        audio_enabled=True,
        priority_generation=True,
        early_digital_twin_access=True,
    ),
}

SUBSCRIPTION_TIER_ORDER: dict[str, int] = {
    "free": 0,
    "basic": 1,
    "premium": 2,
    "vip": 3,
}

UNSET = object()


def get_subscription_features(subscription_tier: str) -> SubscriptionFeaturesConfig:
    return SUBSCRIPTION_FEATURES.get(subscription_tier, SUBSCRIPTION_FEATURES["free"])


def subscription_meets_tier(subscription_tier: str, required_tier: str) -> bool:
    return SUBSCRIPTION_TIER_ORDER.get(subscription_tier, 0) >= SUBSCRIPTION_TIER_ORDER.get(required_tier, 0)


def subscription_has_access(*, subscription_tier: str, subscription_status: str, required_tier: str) -> bool:
    if required_tier == "free":
        return True
    if subscription_status != "active":
        return False
    return subscription_meets_tier(subscription_tier, required_tier)


def default_preferences() -> dict[str, Any]:
    return ProfilePreferences().model_dump()


class ProfileService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_or_create_profile(self, current_user: AuthenticatedUserContext, commit: bool = False) -> Profile:
        user = await self.session.get(AuthUser, current_user.id)

        if user is None:
            user = AuthUser(
                id=current_user.id,
                email=current_user.email,
                role=current_user.role,
                age_verified=current_user.age_verified,
            )
            self.session.add(user)
        else:
            user.email = current_user.email
            user.role = "admin" if user.role == "admin" or current_user.role == "admin" else current_user.role
            user.age_verified = user.age_verified or current_user.age_verified

        result = await self.session.execute(select(Profile).where(Profile.user_id == current_user.id))
        profile = result.scalar_one_or_none()

        if profile is None:
            profile = Profile(
                user_id=current_user.id,
                preferences=default_preferences(),
                consent_score=100,
                subscription_tier="free",
                subscription_status="inactive",
                is_creator=False,
            )
            self.session.add(profile)

        await self.session.flush()

        if commit:
            await self.session.commit()
            await self.session.refresh(profile)

        return profile

    async def get_profile_response(self, current_user: AuthenticatedUserContext) -> ProfileResponse:
        profile = await self.get_or_create_profile(current_user, commit=True)
        return await self._serialize_profile(profile=profile, current_user=current_user)

    async def save_onboarding(self, current_user: AuthenticatedUserContext, payload: ProfileOnboardingRequest) -> ProfileResponse:
        profile = await self.get_or_create_profile(current_user, commit=False)
        profile.preferences = payload.preferences.model_dump()
        profile.consent_score = self._compute_profile_consent_score(payload.preferences)
        await self.session.commit()
        await self.session.refresh(profile)
        return await self._serialize_profile(profile=profile, current_user=current_user)

    async def update_subscription_state(
        self,
        *,
        current_user: AuthenticatedUserContext | None = None,
        user_id: str | None = None,
        stripe_customer_id: str | None = None,
        stripe_subscription_id: str | None = None,
        subscription_tier: str | None = None,
        subscription_status: str | None = None,
        current_period_end: datetime | None | object = UNSET,
    ) -> Profile | None:
        profile: Profile | None = None

        if current_user is not None:
            profile = await self.get_or_create_profile(current_user, commit=False)
        elif user_id is not None:
            try:
                parsed_user_id = UUID(user_id)
            except ValueError:
                parsed_user_id = None

            if parsed_user_id is not None:
                result = await self.session.execute(select(Profile).where(Profile.user_id == parsed_user_id))
                profile = result.scalar_one_or_none()

        if profile is None and stripe_customer_id is not None:
            result = await self.session.execute(select(Profile).where(Profile.stripe_customer_id == stripe_customer_id))
            profile = result.scalar_one_or_none()

        if profile is None:
            return None

        if stripe_customer_id is not None:
            profile.stripe_customer_id = stripe_customer_id
        if stripe_subscription_id is not None or subscription_status == "canceled":
            profile.stripe_subscription_id = stripe_subscription_id
        if subscription_tier is not None:
            profile.subscription_tier = subscription_tier
        if subscription_status is not None:
            profile.subscription_status = subscription_status
        if current_period_end is not UNSET:
            profile.current_period_end = current_period_end

        await self.session.commit()
        await self.session.refresh(profile)
        return profile

    async def get_today_generation_count(self, user_id: str) -> int:
        start_of_day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = start_of_day + timedelta(days=1)

        result = await self.session.execute(
            select(func.count(StoryGeneration.id)).where(
                StoryGeneration.user_id == user_id,
                StoryGeneration.created_at >= start_of_day,
                StoryGeneration.created_at < end_of_day,
                StoryGeneration.moderation_status.in_(["approved", "pending", "rejected", "escalated", "flagged"]),
            )
        )
        return int(result.scalar_one() or 0)

    async def get_today_audio_generation_count(self, user_id: UUID | str) -> int:
        parsed_user_id = UUID(str(user_id)) if not isinstance(user_id, UUID) else user_id
        start_of_day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = start_of_day + timedelta(days=1)

        result = await self.session.execute(
            select(func.count(AuditLog.id)).where(
                AuditLog.actor_user_id == parsed_user_id,
                AuditLog.action == "audio.generated",
                AuditLog.created_at >= start_of_day,
                AuditLog.created_at < end_of_day,
            )
        )
        return int(result.scalar_one() or 0)

    async def _serialize_profile(self, *, profile: Profile, current_user: AuthenticatedUserContext) -> ProfileResponse:
        auth_user = await self.session.get(AuthUser, current_user.id)
        features = get_subscription_features(profile.subscription_tier)
        daily_generation_count = await self.get_today_generation_count(str(current_user.id))
        daily_audio_generation_count = await self.get_today_audio_generation_count(current_user.id)
        daily_generation_remaining = (
            None
            if features.daily_generation_limit is None
            else max(features.daily_generation_limit - daily_generation_count, 0)
        )
        daily_audio_generation_remaining = (
            None
            if features.daily_audio_generation_limit is None
            else max(features.daily_audio_generation_limit - daily_audio_generation_count, 0)
        )

        return ProfileResponse(
            id=profile.id,
            user_id=profile.user_id,
            email=current_user.email,
            role=auth_user.role if auth_user is not None else current_user.role,
            preferences=ProfilePreferences.model_validate(profile.preferences or default_preferences()),
            consent_score=profile.consent_score,
            stripe_customer_id=profile.stripe_customer_id,
            subscription_tier=profile.subscription_tier,
            subscription_status=profile.subscription_status,
            is_creator=profile.is_creator,
            stripe_subscription_id=profile.stripe_subscription_id,
            current_period_end=profile.current_period_end,
            updated_at=profile.updated_at,
            features=asdict(features),
            usage=UsageSummary(
                daily_generation_count=daily_generation_count,
                daily_generation_limit=features.daily_generation_limit,
                daily_generation_remaining=daily_generation_remaining,
                daily_audio_generation_count=daily_audio_generation_count,
                daily_audio_generation_limit=features.daily_audio_generation_limit,
                daily_audio_generation_remaining=daily_audio_generation_remaining,
            ),
        )

    def _compute_profile_consent_score(self, preferences: ProfilePreferences) -> int:
        score = 90
        if preferences.hard_limits:
            score += 5
        if preferences.custom_boundaries:
            score += 5
        return min(score, 100)
