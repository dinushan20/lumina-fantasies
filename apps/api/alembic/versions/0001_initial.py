from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "story_generations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=True),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("preference_tags", postgresql.ARRAY(sa.String(length=64)), nullable=False, server_default="{}"),
        sa.Column("boundaries", postgresql.ARRAY(sa.String(length=128)), nullable=False, server_default="{}"),
        sa.Column("content_style", sa.String(length=32), nullable=False),
        sa.Column("consent_score", sa.Integer(), nullable=False),
        sa.Column("moderation_status", sa.String(length=32), nullable=False),
        sa.Column("moderation_reasons", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("review_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("system_prompt_version", sa.String(length=32), nullable=False),
        sa.Column("provider_name", sa.String(length=64), nullable=False),
        sa.Column("story_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
    )
    op.create_index("ix_story_generations_created_at", "story_generations", ["created_at"], unique=False)
    op.create_index("ix_story_generations_moderation_status", "story_generations", ["moderation_status"], unique=False)

    op.create_table(
        "moderation_queue_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("generation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("story_generations.id"), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("reasons", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
    )
    op.create_index("ix_moderation_queue_items_status", "moderation_queue_items", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_moderation_queue_items_status", table_name="moderation_queue_items")
    op.drop_table("moderation_queue_items")
    op.drop_index("ix_story_generations_moderation_status", table_name="story_generations")
    op.drop_index("ix_story_generations_created_at", table_name="story_generations")
    op.drop_table("story_generations")

