from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ChatStreamRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    message: str = Field(min_length=1, max_length=4000)
    session_id: UUID | None = None
    twin_id: UUID | None = None
    audio_requested: bool = False
    character_name: str | None = Field(default=None, min_length=2, max_length=80)


class ChatMessageResponse(BaseModel):
    id: UUID
    role: Literal["user", "assistant"]
    content: str
    audio_url: str | None = None
    created_at: datetime


class ChatMessageAudioResponse(BaseModel):
    message_id: UUID
    audio_url: str
    cached: bool


class ChatSessionSummary(BaseModel):
    id: UUID
    twin_id: UUID | None
    character_name: str
    last_message_preview: str | None
    updated_at: datetime


class ChatSessionDetail(BaseModel):
    session: ChatSessionSummary
    messages: list[ChatMessageResponse]
