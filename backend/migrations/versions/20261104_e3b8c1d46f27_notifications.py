"""notifications

Revision ID: e3b8c1d46f27
Revises: d7a2e94b10c3
Create Date: 2026-11-04

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e3b8c1d46f27"
down_revision: str | None = "d7a2e94b10c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("notify_email", sa.Boolean(), server_default="true", nullable=False)
    )
    op.add_column(
        "users", sa.Column("notify_telegram", sa.Boolean(), server_default="true", nullable=False)
    )
    op.add_column("users", sa.Column("telegram_chat_id", sa.BigInteger(), nullable=True))
    op.create_table(
        "notifications",
        sa.Column("application_id", sa.Uuid(), nullable=False),
        sa.Column(
            "event",
            sa.Enum(
                "new_applicant",
                "report_ready",
                "stage1_invite",
                "stage2_invite",
                "stage1_failed",
                "disqualified",
                "results_ready",
                "shortlisted",
                "rejected",
                "hired",
                name="notificationevent",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("recipient_id", sa.Uuid(), nullable=True),
        sa.Column(
            "channel",
            sa.Enum("email", "telegram", name="notificationchannel", native_enum=False, length=32),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "sent",
                "failed",
                "skipped",
                name="notificationstatus",
                native_enum=False,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_error", sa.String(length=64), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["application_id"],
            ["applications.id"],
            name=op.f("fk_notifications_application_id_applications"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["recipient_id"],
            ["users.id"],
            name=op.f("fk_notifications_recipient_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notifications")),
    )
    op.create_index(op.f("ix_notifications_application_id"), "notifications", ["application_id"])
    op.create_index(op.f("ix_notifications_recipient_id"), "notifications", ["recipient_id"])
    op.create_index(
        "ix_notifications_due",
        "notifications",
        ["next_attempt_at"],
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_column("users", "telegram_chat_id")
    op.drop_column("users", "notify_telegram")
    op.drop_column("users", "notify_email")
