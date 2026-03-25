from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0007_beta_preparation"
down_revision = "0006_twin_voice_audio"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feedback_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("auth_users.id"), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("category", sa.String(length=32), nullable=False, server_default="general"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("page_context", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="new"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.CheckConstraint("status IN ('new', 'triaged', 'resolved')", name="ck_feedback_items_status"),
    )
    op.create_index("ix_feedback_items_user_id", "feedback_items", ["user_id"], unique=False)
    op.create_index("ix_feedback_items_status", "feedback_items", ["status"], unique=False)

    op.create_table(
        "creator_invites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("invite_token", sa.String(length=128), nullable=False),
        sa.Column("invite_url", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("invited_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("auth_users.id"), nullable=False),
        sa.Column("claimed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("auth_users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('pending', 'claimed', 'expired', 'revoked')", name="ck_creator_invites_status"),
    )
    op.create_index("ix_creator_invites_email", "creator_invites", ["email"], unique=False)
    op.create_index("ix_creator_invites_status", "creator_invites", ["status"], unique=False)
    op.create_index("ix_creator_invites_invite_token", "creator_invites", ["invite_token"], unique=True)

    op.create_table(
        "beta_access_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("interest", sa.Text(), nullable=True),
        sa.Column("requested_creator_access", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("source", sa.String(length=64), nullable=False, server_default="landing"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("timezone('utc', now())"),
        ),
        sa.CheckConstraint("status IN ('pending', 'approved', 'rejected', 'waitlisted')", name="ck_beta_access_requests_status"),
    )
    op.create_index("ix_beta_access_requests_email", "beta_access_requests", ["email"], unique=False)
    op.create_index("ix_beta_access_requests_status", "beta_access_requests", ["status"], unique=False)

    op.create_table(
        "daily_usage_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("metric_date", sa.Date(), nullable=False),
        sa.Column("active_users", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("story_generations", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("audio_renders", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("twin_chat_messages", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("feedback_submissions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("beta_access_requests", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("timezone('utc', now())"),
        ),
    )
    op.create_index("ix_daily_usage_metrics_metric_date", "daily_usage_metrics", ["metric_date"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_daily_usage_metrics_metric_date", table_name="daily_usage_metrics")
    op.drop_table("daily_usage_metrics")

    op.drop_index("ix_beta_access_requests_status", table_name="beta_access_requests")
    op.drop_index("ix_beta_access_requests_email", table_name="beta_access_requests")
    op.drop_table("beta_access_requests")

    op.drop_index("ix_creator_invites_invite_token", table_name="creator_invites")
    op.drop_index("ix_creator_invites_status", table_name="creator_invites")
    op.drop_index("ix_creator_invites_email", table_name="creator_invites")
    op.drop_table("creator_invites")

    op.drop_index("ix_feedback_items_status", table_name="feedback_items")
    op.drop_index("ix_feedback_items_user_id", table_name="feedback_items")
    op.drop_table("feedback_items")
