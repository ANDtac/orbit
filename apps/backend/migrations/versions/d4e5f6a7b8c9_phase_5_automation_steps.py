"""phase 5 automation steps

Incremental migration for Phase 5. Creates the ``automation_steps`` table --
the ordered per-step rows that extend a single-action :class:`Automations` row
into a linear multi-step sequence.

Columns
-------
id (PK), uuid (unique), automation_id (FK automations CASCADE, index),
sequence (Integer not null), action_id (FK platform_operation_templates SET NULL,
nullable, index), variable_bindings (JSONB, server_default '{}'),
on_failure (CITEXT, server_default 'stop'),
created_at (DateTime tz), updated_at (DateTime tz).

Constraints
-----------
uq_automation_steps_sequence (automation_id, sequence) -- enforces ordering
uniqueness within each automation.

Written with create_table / batch_alter_table for SQLite + Postgres
compatibility (no new columns added to existing tables).
Postgres column types are loaded via importlib to avoid the app.models
submodule-shadowing issue noted in prior phase migrations.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-05 12:00:00.000000
"""
import importlib

from alembic import op
import sqlalchemy as sa

# ``app.models`` shadows the ``annotations`` submodule via star imports;
# load it by fully-qualified name so CITEXT/JSONB constructors are available.
orbit_types = importlib.import_module("app.models.annotations")


# revision identifiers, used by Alembic.
revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'automation_steps',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.Column('automation_id', sa.Integer(), nullable=False),
        sa.Column('sequence', sa.Integer(), nullable=False),
        sa.Column('action_id', sa.Integer(), nullable=True),
        sa.Column(
            'variable_bindings',
            orbit_types.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            'on_failure',
            orbit_types.CITEXT(),
            nullable=False,
            server_default=sa.text("'stop'"),
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ['action_id'],
            ['platform_operation_templates.id'],
            name=op.f('fk_automation_steps_action_id_platform_operation_templates'),
            ondelete='SET NULL',
        ),
        sa.ForeignKeyConstraint(
            ['automation_id'],
            ['automations.id'],
            name=op.f('fk_automation_steps_automation_id_automations'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_automation_steps')),
        sa.UniqueConstraint('uuid', name=op.f('uq_automation_steps_uuid')),
        sa.UniqueConstraint(
            'automation_id',
            'sequence',
            name='uq_automation_steps_sequence',
        ),
    )
    with op.batch_alter_table('automation_steps', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_automation_steps_automation_steps_action_id'),
            ['action_id'],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f('ix_automation_steps_automation_steps_automation_id'),
            ['automation_id'],
            unique=False,
        )


def downgrade():
    with op.batch_alter_table('automation_steps', schema=None) as batch_op:
        batch_op.drop_index(
            batch_op.f('ix_automation_steps_automation_steps_automation_id')
        )
        batch_op.drop_index(
            batch_op.f('ix_automation_steps_automation_steps_action_id')
        )
    op.drop_table('automation_steps')
