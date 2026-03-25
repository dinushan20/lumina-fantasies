from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ModerationQueueEntry(Base):
    __tablename__ = "moderation_queue"
    __table_args__ = (
        CheckConstraint(
            "content_type IN ('story', 'chat_message', 'digital_twin')",
            name="ck_moderation_queue_content_type",
        ),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'escalated')",
            name="ck_moderation_queue_status",
        ),
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    content_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    content_id: Mapped[str] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False, index=True)
    raw_output: Mapped[str] = mapped_column(Text, nullable=False)
    moderation_score: Mapped[float] = mapped_column(Float, nullable=False)
    flags: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False, index=True)
    reviewer_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
