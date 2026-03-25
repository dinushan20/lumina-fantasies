from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0002_auth_users_profiles"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("role", sa.String(length=32), nullable=False, server_default="user"),
        sa.Column("age_verified", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
    )

    op.create_table(
        "profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("auth_users.id"), nullable=False, unique=True),
        sa.Column("preferences", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.Column("consent_score", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("stripe_customer_id", sa.Text(), nullable=True),
        sa.Column("subscription_tier", sa.Text(), nullable=False, server_default="free"),
        sa.Column("subscription_status", sa.Text(), nullable=False, server_default="inactive"),
        sa.Column("stripe_subscription_id", sa.Text(), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.CheckConstraint("subscription_tier IN ('free', 'basic', 'premium', 'vip')", name="ck_profiles_subscription_tier"),
    )
    op.create_index("ix_profiles_subscription_tier", "profiles", ["subscription_tier"], unique=False)
    op.create_index("ix_profiles_subscription_status", "profiles", ["subscription_status"], unique=False)
    op.create_index("ix_profiles_stripe_customer_id", "profiles", ["stripe_customer_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_profiles_stripe_customer_id", table_name="profiles")
    op.drop_index("ix_profiles_subscription_status", table_name="profiles")
    op.drop_index("ix_profiles_subscription_tier", table_name="profiles")
    op.drop_table("profiles")
    op.drop_table("auth_users")

