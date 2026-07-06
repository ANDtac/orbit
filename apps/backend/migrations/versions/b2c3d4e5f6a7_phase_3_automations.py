"""phase 3 automations

Incremental migration for Phase 3. Creates the ``automations`` table -- the
no-code, single-action automation definitions (owner, name, action FK,
operator-filled ``variable_values``, ``target`` selector, ``visibility``,
``on_failure`` and an ``approval_required`` maker/checker seam).

Autogenerate could not run (dev uses ``manage.py create-db``, so the dev
database is not stamped at a baseline revision). This migration is therefore
hand-written to contain ONLY the ``create_table`` for ``automations``. Written
with ``batch_alter_table``-friendly plain ``create_table``/``create_index`` for
SQLite compatibility.

The Postgres-flavored column types (``CITEXT``/``JSONB``/UUID) are loaded via
``importlib.import_module`` -- NOT ``app.models.annotations.X`` attribute access
-- because ``app.models`` shadows the ``annotations`` submodule through
``from __future__ import annotations`` (see the Phase 1/2 baseline migrations).

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-02 16:10:00.000000

"""
import importlib

from alembic import op
import sqlalchemy as sa

# ``app.models`` shadows the ``annotations`` submodule via
# ``from __future__ import annotations``; load it from sys.modules by name.
orbit_types = importlib.import_module("app.models.annotations")


# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'automations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('uuid', sa.UUID(), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=True),
        sa.Column('name', orbit_types.CITEXT(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('action_id', sa.Integer(), nullable=True),
        sa.Column('variable_values', orbit_types.JSONB(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column('target', orbit_types.JSONB(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column('visibility', orbit_types.CITEXT(), nullable=False, server_default=sa.text("'private'")),
        sa.Column('on_failure', orbit_types.CITEXT(), nullable=False, server_default=sa.text("'stop'")),
        sa.Column('approval_required', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('disabled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ['action_id'], ['platform_operation_templates.id'],
            name=op.f('fk_automations_action_id_platform_operation_templates'),
            ondelete='SET NULL',
        ),
        sa.ForeignKeyConstraint(
            ['owner_id'], ['users.id'],
            name=op.f('fk_automations_owner_id_users'),
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_automations')),
        sa.UniqueConstraint('uuid', name=op.f('uq_automations_uuid')),
    )
    with op.batch_alter_table('automations', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_automations_automations_action_id'), ['action_id'], unique=False
        )
        batch_op.create_index(
            batch_op.f('ix_automations_automations_disabled_at'), ['disabled_at'], unique=False
        )
        batch_op.create_index(
            batch_op.f('ix_automations_automations_owner_id'), ['owner_id'], unique=False
        )
        batch_op.create_index(
            'ix_automations_owner_visibility', ['owner_id', 'visibility'], unique=False
        )


def downgrade():
    with op.batch_alter_table('automations', schema=None) as batch_op:
        batch_op.drop_index('ix_automations_owner_visibility')
        batch_op.drop_index(batch_op.f('ix_automations_automations_owner_id'))
        batch_op.drop_index(batch_op.f('ix_automations_automations_disabled_at'))
        batch_op.drop_index(batch_op.f('ix_automations_automations_action_id'))
    op.drop_table('automations')
