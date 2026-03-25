from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.profile import SubscriptionTier

TwinConsentStatus = Literal["pending", "approved", "rejected"]
TwinStatus = Literal["draft", "training", "active", "suspended"]


class TwinReferenceData(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    voice_style: str | None = Field(default=None, max_length=500)
    personality_traits: list[str] = Field(default_factory=list, max_length=24)
    allowed_kinks: list[str] = Field(default_factory=list, max_length=24)
    hard_limits: list[str] = Field(default_factory=list, max_length=24)
    example_prompts: list[str] = Field(default_factory=list, max_length=8)

    @field_validator("personality_traits", "allowed_kinks", "hard_limits", "example_prompts")
    @classmethod
    def normalize_items(cls, values: list[str]) -> list[str]:
        return [value.strip() for value in values if value.strip()]


class TwinConsentAttestation(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    creator_is_adult: bool
    rights_holder_confirmed: bool
    likeness_use_consent_confirmed: bool
    no_raw_likeness_storage_acknowledged: bool
    audience_is_adult_only_confirmed: bool
    signature_name: str = Field(min_length=2, max_length=120)


class TwinAccessSummary(BaseModel):
    required_subscription_tier: SubscriptionTier
    viewer_subscription_tier: SubscriptionTier
    viewer_subscription_status: str
    can_chat: bool
    access_message: str | None = None


class DigitalTwinCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=160)
    description: str = Field(min_length=20, max_length=4000)
    reference_data: TwinReferenceData
    consent: TwinConsentAttestation
    preferred_voice_id: str | None = Field(default=None, max_length=200)
    required_subscription_tier: SubscriptionTier = "premium"


class DigitalTwinUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, min_length=20, max_length=4000)
    reference_data: TwinReferenceData | None = None
    consent: TwinConsentAttestation | None = None
    preferred_voice_id: str | None = Field(default=None, max_length=200)
    required_subscription_tier: SubscriptionTier | None = None


class DigitalTwinResponse(BaseModel):
    id: UUID
    creator_id: UUID
    creator_email: str
    name: str
    description: str
    consent_status: TwinConsentStatus
    reference_data: TwinReferenceData
    preferred_voice_id: str | None
    status: TwinStatus
    required_subscription_tier: SubscriptionTier
    moderation_score: float
    access: TwinAccessSummary
    created_at: datetime
    updated_at: datetime
