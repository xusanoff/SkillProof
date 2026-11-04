"""verified skills

Revision ID: d7a2e94b10c3
Revises: c1f489b02d77
Create Date: 2026-11-03

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'd7a2e94b10c3'
down_revision: str | None = 'c1f489b02d77'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'verified_skills',
        sa.Column('candidate_id', sa.Uuid(), nullable=False),
        sa.Column('skill_id', sa.Uuid(), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('stage1_score', sa.Float(), nullable=True),
        sa.Column('stage2_score', sa.Float(), nullable=True),
        sa.Column('level', sa.String(length=16), nullable=False),
        sa.Column('source_application_id', sa.Uuid(), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('valid_until', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_public', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['candidate_id'], ['users.id'], name=op.f('fk_verified_skills_candidate_id_users'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['skill_id'], ['skills.id'], name=op.f('fk_verified_skills_skill_id_skills'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['source_application_id'], ['applications.id'], name=op.f('fk_verified_skills_source_application_id_applications'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_verified_skills')),
        sa.UniqueConstraint('candidate_id', 'skill_id', name=op.f('uq_verified_skills_candidate_id')),
    )
    op.create_index(op.f('ix_verified_skills_candidate_id'), 'verified_skills', ['candidate_id'], unique=False)
    op.create_index(op.f('ix_verified_skills_skill_id'), 'verified_skills', ['skill_id'], unique=False)
    op.create_index(op.f('ix_verified_skills_valid_until'), 'verified_skills', ['valid_until'], unique=False)


def downgrade() -> None:
    op.drop_table('verified_skills')
