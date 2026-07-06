"""phase 7 dashboards, dashboard_panels, user_pinned_dashboards

Incremental migration for Phase 7.  Creates three new tables:

``dashboards``
    Owner-visible or shared grid of monitoring panels.  Stores ``name``
    (CITEXT), ``description`` (Text), ``visibility`` (CITEXT — private/shared/
    role), and ``layout`` (JSONB — optional grid metadata).  Uses the same
    mixin columns as Monitors: ``id``, ``uuid``, ``owner_id``, ``created_at``,
    ``updated_at``.

``dashboard_panels``
    One panel within a dashboard.  ``dashboard_id`` FK (CASCADE) +
    ``monitor_id`` FK (SET NULL, nullable) + ``title`` (String 128, nullable) +
    ``viz_type`` (CITEXT — timechart/stat/statusgrid/table) +
    ``position`` (JSONB — {col, row, w, h}) + ``config`` (JSONB).

``user_pinned_dashboards``
    Pin-to-home join table.  ``user_id`` FK (CASCADE) + ``dashboard_id`` FK
    (CASCADE) + ``pinned_at`` (DateTime tz).  UniqueConstraint on
    ``(user_id, dashboard_id)``.

This revision revises: e5f6a7b8c9d0

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-05 15:00:00.000000
"""
import importlib

from alembic import op
import sqlalchemy as sa

# ``app.models`` shadows the ``annotations`` submodule via star imports;
# load it by fully-qualified name so CITEXT/JSONB constructors are available.
orbit_types = importlib.import_module("app.models.annotations")

# revision identifiers, used by Alembic.
revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade():
    # ------------------------------------------------------------------
    # dashboards
    # ------------------------------------------------------------------
    op.create_table(
        'dashboards',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('uuid', sa.String(36), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('name', orbit_types.CITEXT(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column(
            'visibility',
            orbit_types.CITEXT(),
            nullable=False,
            server_default=sa.text("'private'"),
        ),
        sa.Column(
            'layout',
            orbit_types.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.ForeignKeyConstraint(
            ['owner_id'],
            ['users.id'],
            name=op.f('fk_dashboards_owner_id_users'),
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_dashboards')),
        sa.UniqueConstraint('uuid', name=op.f('uq_dashboards_uuid')),
    )
    with op.batch_alter_table('dashboards', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_dashboards_owner_id'),
            ['owner_id'],
            unique=False,
        )

    # ------------------------------------------------------------------
    # dashboard_panels
    # ------------------------------------------------------------------
    op.create_table(
        'dashboard_panels',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('uuid', sa.String(36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('dashboard_id', sa.Integer(), nullable=False),
        sa.Column('monitor_id', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(128), nullable=True),
        sa.Column(
            'viz_type',
            orbit_types.CITEXT(),
            nullable=False,
            server_default=sa.text("'timechart'"),
        ),
        sa.Column(
            'position',
            orbit_types.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            'config',
            orbit_types.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.ForeignKeyConstraint(
            ['dashboard_id'],
            ['dashboards.id'],
            name=op.f('fk_dashboard_panels_dashboard_id_dashboards'),
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['monitor_id'],
            ['monitors.id'],
            name=op.f('fk_dashboard_panels_monitor_id_monitors'),
            ondelete='SET NULL',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_dashboard_panels')),
        sa.UniqueConstraint('uuid', name=op.f('uq_dashboard_panels_uuid')),
    )
    with op.batch_alter_table('dashboard_panels', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_dashboard_panels_dashboard_id'),
            ['dashboard_id'],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f('ix_dashboard_panels_monitor_id'),
            ['monitor_id'],
            unique=False,
        )

    # ------------------------------------------------------------------
    # user_pinned_dashboards
    # ------------------------------------------------------------------
    op.create_table(
        'user_pinned_dashboards',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('dashboard_id', sa.Integer(), nullable=False),
        sa.Column('pinned_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ['dashboard_id'],
            ['dashboards.id'],
            name=op.f('fk_user_pinned_dashboards_dashboard_id_dashboards'),
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['user_id'],
            ['users.id'],
            name=op.f('fk_user_pinned_dashboards_user_id_users'),
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_user_pinned_dashboards')),
        sa.UniqueConstraint(
            'user_id',
            'dashboard_id',
            name='uq_user_pinned_dashboards_user_id_dashboard_id',
        ),
    )
    with op.batch_alter_table('user_pinned_dashboards', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_user_pinned_dashboards_user_id'),
            ['user_id'],
            unique=False,
        )
        batch_op.create_index(
            batch_op.f('ix_user_pinned_dashboards_dashboard_id'),
            ['dashboard_id'],
            unique=False,
        )


def downgrade():
    with op.batch_alter_table('user_pinned_dashboards', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_user_pinned_dashboards_dashboard_id'))
        batch_op.drop_index(batch_op.f('ix_user_pinned_dashboards_user_id'))
    op.drop_table('user_pinned_dashboards')

    with op.batch_alter_table('dashboard_panels', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_dashboard_panels_monitor_id'))
        batch_op.drop_index(batch_op.f('ix_dashboard_panels_dashboard_id'))
    op.drop_table('dashboard_panels')

    with op.batch_alter_table('dashboards', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_dashboards_owner_id'))
    op.drop_table('dashboards')
