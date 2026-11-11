"""AI spending reservations shared across an application's stages and report."""

import sqlalchemy as sa
from alembic import op

revision = "b91a42c8d013"
down_revision = "a8e5c7f31d92"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_budgets",
        sa.Column("application_id", sa.Uuid(), nullable=False),
        sa.Column("tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("stt_ms", sa.Integer(), server_default="0", nullable=False),
        sa.Column("tts_characters", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(["application_id"], ["applications.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("application_id"),
    )


def downgrade() -> None:
    op.drop_table("ai_budgets")
