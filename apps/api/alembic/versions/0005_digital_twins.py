from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0005_digital_twins"
down_revision = "0004_moderation_queue"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("profiles", sa.Column("is_creator", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index("ix_profiles_is_creator", "profiles", ["is_creator"], unique=False)

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("auth_users.id"), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=32), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
    )
    op.create_index("ix_audit_logs_actor_user_id", "audit_logs", ["actor_user_id"], unique=False)
    op.create_index("ix_audit_logs_target_id", "audit_logs", ["target_id"], unique=False)
    op.create_index("ix_audit_logs_target_type", "audit_logs", ["target_type"], unique=False)

    op.create_table(
        "digital_twins",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("creator_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("auth_users.id"), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("consent_status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("consent_attestation", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("reference_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("required_subscription_tier", sa.String(length=32), nullable=False, server_default="premium"),
        sa.Column("moderation_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.CheckConstraint("consent_status IN ('pending', 'approved', 'rejected')", name="ck_digital_twins_consent_status"),
        sa.CheckConstraint("status IN ('draft', 'training', 'active', 'suspended')", name="ck_digital_twins_status"),
        sa.CheckConstraint(
            "required_subscription_tier IN ('free', 'basic', 'premium', 'vip')",
            name="ck_digital_twins_required_subscription_tier",
        ),
    )
    op.create_index("ix_digital_twins_creator_id", "digital_twins", ["creator_id"], unique=False)
    op.create_index("ix_digital_twins_status", "digital_twins", ["status"], unique=False)
    op.create_index("ix_digital_twins_consent_status", "digital_twins", ["consent_status"], unique=False)

    op.add_column(
        "chat_sessions",
        sa.Column("twin_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("digital_twins.id"), nullable=True),
    )
    op.create_index("ix_chat_sessions_twin_id", "chat_sessions", ["twin_id"], unique=False)

    op.drop_constraint("ck_moderation_queue_content_type", "moderation_queue", type_="check")
    op.create_check_constraint(
        "ck_moderation_queue_content_type",
        "moderation_queue",
        "content_type IN ('story', 'chat_message', 'digital_twin')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_moderation_queue_content_type", "moderation_queue", type_="check")
    op.create_check_constraint(
        "ck_moderation_queue_content_type",
        "moderation_queue",
        "content_type IN ('story', 'chat_message')",
    )

    op.drop_index("ix_chat_sessions_twin_id", table_name="chat_sessions")
    op.drop_column("chat_sessions", "twin_id")

    op.drop_index("ix_digital_twins_consent_status", table_name="digital_twins")
    op.drop_index("ix_digital_twins_status", table_name="digital_twins")
    op.drop_index("ix_digital_twins_creator_id", table_name="digital_twins")
    op.drop_table("digital_twins")

    op.drop_index("ix_audit_logs_target_type", table_name="audit_logs")
    op.drop_index("ix_audit_logs_target_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_actor_user_id", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index("ix_profiles_is_creator", table_name="profiles")
    op.drop_column("profiles", "is_creator")
