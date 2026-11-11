"""Application conversations, status history and per-user read cursors.

Revision ID: c24e85a6f901
Revises: b91a42c8d013
"""

import sqlalchemy as sa
from alembic import op

revision = "c24e85a6f901"
down_revision = "b91a42c8d013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "application_id",
            sa.Uuid(),
            sa.ForeignKey("applications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence", sa.BigInteger(), sa.Identity(), unique=True, nullable=False),
        sa.Column("sender_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("client_id", sa.Uuid()),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("text", sa.Text()),
        sa.Column("application_status", sa.String(40)),
        sa.UniqueConstraint(
            "application_id", "sender_id", "client_id", name="uq_chat_message_retry"
        ),
    )
    op.create_index(
        "ix_chat_messages_thread_sequence", "chat_messages", ["application_id", "sequence"]
    )
    op.create_table(
        "chat_reads",
        sa.Column(
            "application_id",
            sa.Uuid(),
            sa.ForeignKey("applications.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("last_sequence", sa.BigInteger(), nullable=False),
    )
    # Existing applications get their current status; do not invent historical transitions.
    op.execute(
        "INSERT INTO chat_messages (id, application_id, kind, application_status, created_at) SELECT gen_random_uuid(), id, 'status', status, updated_at FROM applications"
    )


def downgrade() -> None:
    op.drop_table("chat_reads")
    op.drop_table("chat_messages")
