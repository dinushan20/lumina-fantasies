from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DigitalTwin(Base):
    __tablename__ = "digital_twins"
    __table_args__ = (
        CheckConstraint("consent_status IN ('pending', 'approved', 'rejected')", name="ck_digital_twins_consent_status"),
        CheckConstraint("status IN ('draft', 'training', 'active', 'suspended')", name="ck_digital_twins_status"),
        CheckConstraint(
            "required_subscription_tier IN ('free', 'basic', 'premium', 'vip')",
            name="ck_digital_twins_required_subscription_tier",
        ),
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    creator_id: Mapped[str] = mapped_column(UUID(as_uuid=True), ForeignKey("auth_users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    consent_status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False, index=True)
    consent_attestation: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    reference_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    preferred_voice_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False, index=True)
    required_subscription_tier: Mapped[str] = mapped_column(String(32), default="premium", nullable=False)
    moderation_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=utcnow)
