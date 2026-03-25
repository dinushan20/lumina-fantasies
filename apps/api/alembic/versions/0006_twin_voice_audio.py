from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0006_twin_voice_audio"
down_revision = "0005_digital_twins"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("digital_twins", sa.Column("preferred_voice_id", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("digital_twins", "preferred_voice_id")
