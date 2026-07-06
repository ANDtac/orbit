"""phase 4 schedules

Incremental migration for Phase 4. Creates the ``schedules`` table -- the
recurrence driver that fires Automations (and, in Phase 6, Monitors) at a
user-chosen cron cadence.

Columns
-------
id, uuid, owner_id (FK users), name (CITEXT nullable),
target_type (CITEXT), target_id (Integer),
cron_expr (String(64) not null), next_run (DateTime tz, not null),
last_run (DateTime tz, nullable), last_job_id (FK jobs SET NULL),
enabled (Boolean, default True), timezone (String(64)),
disabled_at (DateTime tz), created_at, updated_at.

Indexes: ix_schedules_target (target_type, target_id),
         ix_schedules_enabled_next_run (enabled, next_run).

Written with ``create_table``/``create_index`` for SQLite + Postgres
compatibility (batch_alter_table is not required for a brand-new table).
Postgres column types are loaded via importlib -- NOT attribute access -- to
avoid the ``app.models`` submodule shadowing issue described in earlier phases.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-05 10:00:00.000000
"""
import importlib

from alembic import op
import sqlalchemy as sa

# ``app.models`` shadows the ``annotations`` submodule via
# ``from __future__ import annotations``; load it from sys.modules by name.
orbit_types = importlib.import_module("app.models.annotations")


# revision identifiers, used by Alembic.
revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'schedules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=True),
        sa.Column('name', orbit_types.CITEXT(), nullable=True),
        sa.Column('target_type', orbit_types.CITEXT(), nullable=False),
        sa.Column('target_id', sa.Integer(), nullable=False),
        sa.Column('cron_expr', sa.String(64), nullable=False),
        sa.Column('next_run', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_run', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_job_id', sa.Integer(), nullable=True),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('timezone', sa.String(64), nullable=False, server_default=sa.text("'UTC'")),
        sa.Column('disabled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ['last_job_id'], ['jobs.id'],
            name=op.f('fk_schedules_last_job_id_jobs'),
            ondelete='SET NULL',
        ),
        sa.ForeignKeyConstraint(
            ['owner_id'], ['users.id'],
            name=op.f('fk_schedules_owner_id_users'),
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_schedules')),
        sa.UniqueConstraint('uuid', name=op.f('uq_schedules_uuid')),
    )
    with op.batch_alter_table('schedules', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_schedules_schedules_disabled_at'), ['disabled_at'], unique=False
        )
        batch_op.create_index(
            batch_op.f('ix_schedules_schedules_owner_id'), ['owner_id'], unique=False
        )
        batch_op.create_index(
            batch_op.f('ix_schedules_schedules_target_id'), ['target_id'], unique=False
        )
        batch_op.create_index(
            batch_op.f('ix_schedules_schedules_next_run'), ['next_run'], unique=False
        )
        batch_op.create_index(
            'ix_schedules_target', ['target_type', 'target_id'], unique=False
        )
        batch_op.create_index(
            'ix_schedules_enabled_next_run', ['enabled', 'next_run'], unique=False
        )


def downgrade():
    with op.batch_alter_table('schedules', schema=None) as batch_op:
        batch_op.drop_index('ix_schedules_enabled_next_run')
        batch_op.drop_index('ix_schedules_target')
        batch_op.drop_index(batch_op.f('ix_schedules_schedules_next_run'))
        batch_op.drop_index(batch_op.f('ix_schedules_schedules_target_id'))
        batch_op.drop_index(batch_op.f('ix_schedules_schedules_owner_id'))
        batch_op.drop_index(batch_op.f('ix_schedules_schedules_disabled_at'))
    op.drop_table('schedules')
