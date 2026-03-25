from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

SubscriptionTier = Literal["free", "basic", "premium", "vip"]


class ProfilePreferences(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    kinks: list[str] = Field(default_factory=list)
    hard_limits: list[str] = Field(default_factory=list)
    favorite_genres: list[str] = Field(default_factory=list)
    custom_boundaries: str | None = Field(default=None, max_length=2000)
    tone_preferences: list[str] = Field(default_factory=list)
    narration_opt_in: bool = False
    digital_twin_interest: bool = False

    @field_validator("kinks", "hard_limits", "favorite_genres", "tone_preferences")
    @classmethod
    def normalize_lists(cls, values: list[str]) -> list[str]:
        return [value.strip() for value in values if value.strip()]


class ProfileOnboardingRequest(BaseModel):
    preferences: ProfilePreferences


class SubscriptionFeatures(BaseModel):
    daily_generation_limit: int | None
    daily_audio_generation_limit: int | None
    audio_enabled: bool
    priority_generation: bool
    early_digital_twin_access: bool


class UsageSummary(BaseModel):
    daily_generation_count: int
    daily_generation_limit: int | None
    daily_generation_remaining: int | None
    daily_audio_generation_count: int
    daily_audio_generation_limit: int | None
    daily_audio_generation_remaining: int | None


class ProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    email: str
    role: str
    preferences: ProfilePreferences
    consent_score: int
    stripe_customer_id: str | None
    subscription_tier: SubscriptionTier
    subscription_status: str
    is_creator: bool
    stripe_subscription_id: str | None
    current_period_end: datetime | None
    updated_at: datetime
    features: SubscriptionFeatures
    usage: UsageSummary
