from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class StoryGeneration(Base):
    __tablename__ = "story_generations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    preference_tags: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list, nullable=False)
    boundaries: Mapped[list[str]] = mapped_column(ARRAY(String(128)), default=list, nullable=False)
    content_style: Mapped[str] = mapped_column(String(32), nullable=False)
    consent_score: Mapped[int] = mapped_column(Integer, nullable=False)
    moderation_status: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    moderation_reasons: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    review_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    system_prompt_version: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_name: Mapped[str] = mapped_column(String(64), nullable=False)
    story_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=utcnow
    )

    moderation_queue_items: Mapped[list["ModerationQueueItem"]] = relationship(back_populates="generation")


class ModerationQueueItem(Base):
    __tablename__ = "moderation_queue_items"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    generation_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("story_generations.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True, nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    reasons: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=utcnow
    )

    generation: Mapped[StoryGeneration] = relationship(back_populates="moderation_queue_items")

