from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0004_moderation_queue"
down_revision = "0003_chat_sessions_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chat_messages",
        sa.Column("moderation_status", sa.String(length=32), nullable=False, server_default="approved"),
    )
    op.add_column(
        "chat_messages",
        sa.Column("review_required", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_chat_messages_moderation_status", "chat_messages", ["moderation_status"], unique=False)

    op.create_table(
        "moderation_queue",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("content_type", sa.String(length=32), nullable=False),
        sa.Column("content_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("auth_users.id"), nullable=False),
        sa.Column("raw_output", sa.Text(), nullable=False),
        sa.Column("moderation_score", sa.Float(), nullable=False),
        sa.Column("flags", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("auth_users.id"), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("content_type IN ('story', 'chat_message')", name="ck_moderation_queue_content_type"),
        sa.CheckConstraint("status IN ('pending', 'approved', 'rejected', 'escalated')", name="ck_moderation_queue_status"),
    )
    op.create_index("ix_moderation_queue_content_id", "moderation_queue", ["content_id"], unique=False)
    op.create_index("ix_moderation_queue_content_type", "moderation_queue", ["content_type"], unique=False)
    op.create_index("ix_moderation_queue_status", "moderation_queue", ["status"], unique=False)
    op.create_index("ix_moderation_queue_user_id", "moderation_queue", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_moderation_queue_user_id", table_name="moderation_queue")
    op.drop_index("ix_moderation_queue_status", table_name="moderation_queue")
    op.drop_index("ix_moderation_queue_content_type", table_name="moderation_queue")
    op.drop_index("ix_moderation_queue_content_id", table_name="moderation_queue")
    op.drop_table("moderation_queue")

    op.drop_index("ix_chat_messages_moderation_status", table_name="chat_messages")
    op.drop_column("chat_messages", "review_required")
    op.drop_column("chat_messages", "moderation_status")
