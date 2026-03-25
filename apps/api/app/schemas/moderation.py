from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ModerationQueueStatus = Literal["pending", "approved", "rejected", "escalated"]
ModerationContentType = Literal["story", "chat_message", "digital_twin"]


class ModerationQueueSummary(BaseModel):
    id: UUID
    content_type: ModerationContentType
    content_id: UUID
    user_id: UUID
    user_email: str
    preview: str
    moderation_score: float
    flags: list[str]
    status: ModerationQueueStatus
    created_at: datetime
    reviewed_at: datetime | None


class ModerationQueueDetail(ModerationQueueSummary):
    raw_output: str
    display_output: str
    reviewer_id: UUID | None
    reviewer_email: str | None
    review_notes: str | None


class ModerationQueueReviewRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    status: Literal["approved", "rejected", "escalated"]
    notes: str | None = Field(default=None, max_length=4000)
    final_score: float = Field(ge=0, le=100)


class ModerationEscalationResponse(BaseModel):
    escalated_count: int
