"""admin, moderation, AI usage, retention

Revision ID: f4c9d2e7a1b8
Revises: e3b8c1d46f27
Create Date: 2026-11-04

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'f4c9d2e7a1b8'
down_revision: str | None = 'e3b8c1d46f27'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('companies', sa.Column('blocked_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('companies', sa.Column('block_reason', sa.String(length=500), nullable=True))
    op.add_column('vacancies', sa.Column('hidden_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('vacancies', sa.Column('hidden_reason', sa.String(length=500), nullable=True))
    op.add_column('interview_sessions', sa.Column('data_purged_at', sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        'platform_settings',
        sa.Column('key', sa.String(length=64), nullable=False),
        sa.Column('value', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('updated_by', sa.Uuid(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id'], name=op.f('fk_platform_settings_updated_by_users'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('key', name=op.f('pk_platform_settings')),
    )
    op.create_table(
        'ai_usage',
        sa.Column('kind', sa.String(length=8), nullable=False),
        sa.Column('provider', sa.String(length=40), nullable=False),
        sa.Column('model', sa.String(length=120), nullable=False),
        sa.Column('role', sa.String(length=60), nullable=False),
        sa.Column('input_tokens', sa.Integer(), nullable=False),
        sa.Column('output_tokens', sa.Integer(), nullable=False),
        sa.Column('seconds', sa.Float(), nullable=False),
        sa.Column('characters', sa.Integer(), nullable=False),
        sa.Column('latency_ms', sa.Integer(), nullable=False),
        sa.Column('outcome', sa.String(length=16), nullable=False),
        sa.Column('cost_usd', sa.Float(), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_ai_usage')),
    )
    op.create_index('ix_ai_usage_created_at', 'ai_usage', ['created_at'])


def downgrade() -> None:
    op.drop_table('ai_usage')
    op.drop_table('platform_settings')
    op.drop_column('interview_sessions', 'data_purged_at')
    op.drop_column('vacancies', 'hidden_reason')
    op.drop_column('vacancies', 'hidden_at')
    op.drop_column('companies', 'block_reason')
    op.drop_column('companies', 'blocked_at')
