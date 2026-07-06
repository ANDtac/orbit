"""phase 6 monitors and monitor_results

Incremental migration for Phase 6. Creates two new tables:

``monitors``
    Stores read-only action + threshold definitions.  Each row pins a
    :class:`~app.models.operations.PlatformOperationTemplates` action (via
    ``action_id`` SET NULL FK), a ``metric`` output-field name, a
    ``comparator``, and an optional numeric ``threshold``.  The aggregated
    worst-case ``status`` of the last run is stored here for fast querying
    (e.g. the Alerts panel).

``monitor_results``
    Time-series rows appended by each scheduled or on-demand monitor run.
    Each row records ``monitor_id`` + ``device_id`` FKs, ``observed_at``
    (DateTime tz, indexed), a numeric ``value``, a ``status`` string, and the
    full ``payload`` JSONB for audit/dashboards.

    Composite index ``ix_monitor_results_monitor_time`` on
    ``(monitor_id, observed_at)`` mirrors the ComplianceResults index shape.

This revision revises: d4e5f6a7b8c9

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-05 14:00:00.000000
"""
import importlib

from alembic import op
import sqlalchemy as sa

# ``app.models`` shadows the ``annotations`` submodule via star imports;
# load it by fully-qualified name so CITEXT/JSONB constructors are available.
orbit_types = importlib.import_module("app.models.annotations")

# revision identifiers, used by Alembic.
revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------
    # monitors
    # ------------------------------------------------------------------
    op.create_table(
        'monitors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('uuid', sa.String(36), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=True),
        sa.Column('disabled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('name', orbit_types.CITEXT(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('action_id', sa.Integer(), nullable=True),
        sa.Column(
            'target',
            orbit_types.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column('metric', sa.String(64), nullable=False),
        sa.Column('comparator', sa.String(16), nullable=False),
        sa.Column('threshold', sa.Float(), nullable=True),
        sa.Column(
            'status',
            orbit_types.CITEXT(),
            nullable=False,
            server_default=sa.text("'unknown'"),
        ),
        sa.Column(
            'visibility',
            orbit_types.CITEXT(),
            nullable=False,
            server_default=sa.text("'private'"),
        ),
        sa.ForeignKeyConstraint(
            ['action_id'],
            ['platform_operation_templates.id'],
            name=op.f('fk_monitors_action_id_platform_operation_templates'),
            ondelete='SET NULL',
        ),
        sa.ForeignKeyConstraint(
            ['owner_id'],
            ['users.id'],
            name=op.f('fk_monitors_owner_id_users'),
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_monitors')),
        sa.UniqueConstraint('uuid', name=op.f('uq_monitors_uuid')),
    )
    with op.batch_alter_table('monitors', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_monitors_action_id'),
            ['action_id'],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f('ix_monitors_disabled_at'),
            ['disabled_at'],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f('ix_monitors_owner_id'),
            ['owner_id'],
            unique=False,
        )

    # ------------------------------------------------------------------
    # monitor_results
    # ------------------------------------------------------------------
    op.create_table(
        'monitor_results',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('monitor_id', sa.Integer(), nullable=False),
        sa.Column('device_id', sa.Integer(), nullable=True),
        sa.Column('observed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('value', sa.Float(), nullable=True),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column(
            'payload',
            orbit_types.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.ForeignKeyConstraint(
            ['device_id'],
            ['devices.id'],
            name=op.f('fk_monitor_results_device_id_devices'),
            ondelete='SET NULL',
        ),
        sa.ForeignKeyConstraint(
            ['monitor_id'],
            ['monitors.id'],
            name=op.f('fk_monitor_results_monitor_id_monitors'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_monitor_results')),
    )
    with op.batch_alter_table('monitor_results', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_monitor_results_device_id'),
            ['device_id'],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f('ix_monitor_results_monitor_id'),
            ['monitor_id'],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f('ix_monitor_results_observed_at'),
            ['observed_at'],
            unique=False,
        )
        batch_op.create_index(
            'ix_monitor_results_monitor_time',
            ['monitor_id', 'observed_at'],
            unique=False,
        )


def downgrade():
    with op.batch_alter_table('monitor_results', schema=None) as batch_op:
        batch_op.drop_index('ix_monitor_results_monitor_time')
        batch_op.drop_index(batch_op.f('ix_monitor_results_observed_at'))
        batch_op.drop_index(batch_op.f('ix_monitor_results_monitor_id'))
        batch_op.drop_index(batch_op.f('ix_monitor_results_device_id'))
    op.drop_table('monitor_results')

    with op.batch_alter_table('monitors', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_monitors_owner_id'))
        batch_op.drop_index(batch_op.f('ix_monitors_disabled_at'))
        batch_op.drop_index(batch_op.f('ix_monitors_action_id'))
    op.drop_table('monitors')
