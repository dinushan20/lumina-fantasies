from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FeedbackCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    category: str = Field(default="general", min_length=2, max_length=32)
    message: str = Field(min_length=10, max_length=2000)
    page_context: str | None = Field(default=None, max_length=255)


class FeedbackResponse(BaseModel):
    id: UUID
    user_id: UUID | None
    email: str | None
    category: str
    message: str
    page_context: str | None
    status: str
    created_at: datetime


class CreatorInviteCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str = Field(min_length=5, max_length=255)
    expires_in_days: int = Field(default=14, ge=1, le=90)


class CreatorInviteResponse(BaseModel):
    id: UUID
    email: str
    invite_token: str
    invite_url: str
    status: str
    created_at: datetime
    expires_at: datetime | None
    claimed_at: datetime | None


class BetaAccessCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str = Field(min_length=5, max_length=255)
    interest: str | None = Field(default=None, max_length=2000)
    requested_creator_access: bool = False
    source: str = Field(default="landing", min_length=2, max_length=64)


class BetaAccessResponse(BaseModel):
    id: UUID
    email: str
    interest: str | None
    requested_creator_access: bool
    source: str
    status: str
    created_at: datetime


class DailyUsageMetricResponse(BaseModel):
    metric_date: date
    active_users: int
    story_generations: int
    audio_renders: int
    twin_chat_messages: int
    feedback_submissions: int
    beta_access_requests: int
    updated_at: datetime


class AnalyticsSummary(BaseModel):
    active_users: int
    story_generations: int
    audio_renders: int
    twin_chat_messages: int
    feedback_submissions: int
    beta_access_requests: int
    pending_beta_requests: int
    pending_feedback_items: int
    active_creator_invites: int


class AnalyticsOverviewResponse(BaseModel):
    summary: AnalyticsSummary
    series: list[DailyUsageMetricResponse]
