from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ConsentSignals(BaseModel):
    user_is_adult: bool = Field(description="The requester has confirmed they are an adult.")
    roleplay_consent_confirmed: bool = True
    prohibited_topics_acknowledged: bool = True
    wants_boundary_respect: bool = True


class StoryGenerateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    user_id: str | None = None
    prompt: str = Field(min_length=12, max_length=4000)
    preference_tags: list[str] = Field(default_factory=list, max_length=24)
    freeform_preferences: str | None = Field(default=None, max_length=2000)
    boundaries: list[str] = Field(default_factory=list, max_length=24)
    content_style: Literal["romantic", "sensual", "dominant", "playful", "explicit"] = "sensual"
    branching_depth: int = Field(default=3, ge=2, le=4)
    narration_requested: bool = False
    consent: ConsentSignals

    @field_validator("preference_tags", "boundaries")
    @classmethod
    def normalize_text_items(cls, values: list[str]) -> list[str]:
        return [value.strip() for value in values if value.strip()]


class StoryBranch(BaseModel):
    id: str
    label: str
    direction: str


class StoryModerationSummary(BaseModel):
    allowed: bool
    blocked_reasons: list[str]
    flags: list[str]
    review_required: bool
    consent_score: int


class StoryGenerateResponse(BaseModel):
    request_id: UUID
    title: str
    story: str
    branches: list[StoryBranch]
    audio_available: bool
    audio_url: str | None = None
    audio_error: str | None = None
    provider: str
    moderation: StoryModerationSummary
