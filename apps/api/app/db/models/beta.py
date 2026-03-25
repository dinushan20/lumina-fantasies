from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class FeedbackItem(Base):
    __tablename__ = "feedback_items"
    __table_args__ = (
        CheckConstraint("status IN ('new', 'triaged', 'resolved')", name="ck_feedback_items_status"),
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), ForeignKey("auth_users.id"), index=True, nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    category: Mapped[str] = mapped_column(String(32), default="general", nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    page_context: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="new", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class CreatorInvite(Base):
    __tablename__ = "creator_invites"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'claimed', 'expired', 'revoked')", name="ck_creator_invites_status"),
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    invite_token: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    invite_url: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False, index=True)
    invited_by: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False)
    claimed_by: Mapped[str | None] = mapped_column(UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BetaAccessRequest(Base):
    __tablename__ = "beta_access_requests"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'approved', 'rejected', 'waitlisted')", name="ck_beta_access_requests_status"),
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    interest: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_creator_access: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source: Mapped[str] = mapped_column(String(64), default="landing", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=utcnow
    )


class DailyUsageMetric(Base):
    __tablename__ = "daily_usage_metrics"

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    metric_date: Mapped[date] = mapped_column(Date, unique=True, index=True, nullable=False)
    active_users: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    story_generations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    audio_renders: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    twin_chat_messages: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    feedback_submissions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    beta_access_requests: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=utcnow
    )
