"""phase 2 action outputs and is_mutating

Incremental migration for Phase 2. Extends the Actions catalog
(``platform_operation_templates``) with a typed output-field schema
(``outputs``), a change-type flag (``is_mutating``) and enable/disable tracking
(``disabled_at`` from :class:`DisableableMixin`).

Autogenerate could not run (dev uses ``manage.py create-db``, so the dev
database is not stamped at the Phase 1 baseline). This migration is therefore
hand-written to contain ONLY the three intended ``add_column`` operations, each
with a server default so existing rows backfill safely. Written with
``batch_alter_table`` for SQLite compatibility.

Revision ID: a1b2c3d4e5f6
Revises: 5b313abfb3fa
Create Date: 2026-07-02 15:35:00.000000

"""
import importlib

from alembic import op
import sqlalchemy as sa

# See the Phase 1 baseline migration: ``app.models`` shadows the ``annotations``
# submodule via ``from __future__ import annotations``, so load it from sys.modules.
orbit_types = importlib.import_module("app.models.annotations")


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '5b313abfb3fa'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('platform_operation_templates', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'outputs',
                orbit_types.JSONB(),
                nullable=False,
                server_default=sa.text("'{}'"),
            )
        )
        batch_op.add_column(
            sa.Column(
                'is_mutating',
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        batch_op.add_column(
            sa.Column(
                'disabled_at',
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )
        batch_op.create_index(
            batch_op.f(
                'ix_platform_operation_templates_platform_operation_templates_disabled_at'
            ),
            ['disabled_at'],
            unique=False,
        )


def downgrade():
    with op.batch_alter_table('platform_operation_templates', schema=None) as batch_op:
        batch_op.drop_index(
            batch_op.f(
                'ix_platform_operation_templates_platform_operation_templates_disabled_at'
            )
        )
        batch_op.drop_column('disabled_at')
        batch_op.drop_column('is_mutating')
        batch_op.drop_column('outputs')
