"""
app/api/resources/platforms.py
------------------------------
Platforms resource endpoints (CRUD + list with filters).

Responsibilities
----------------
- Expose `/platforms` collection with pagination, sorting, and filters.
- Expose `/platforms/<id>` item for read/update/delete.
- Provide schemas that cover Nornir/NAPALM and future Ansible settings.

Endpoints
---------
GET    /platforms
POST   /platforms
GET    /platforms/<int:id>
PATCH  /platforms/<int:id>
DELETE /platforms/<int:id>

Query Parameters (GET /platforms)
---------------------------------
page : int
per_page : int
sort : str
    Comma-separated fields; prefix with '-' for DESC. Example: `-id,slug`.
slug : str
display_name : str
napalm_driver : str
is_active : bool-like

Security
--------
All endpoints require a valid JWT (see /auth/login).
"""

from __future__ import annotations

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import Platforms
from ..utils import get_pagination, apply_sorting, paginate_query

# ---------------------------------------------------------------------------
# Namespace
# ---------------------------------------------------------------------------
ns = Namespace("platforms", description="Device platforms (NAPALM/Ansible metadata)")


# ---------------------------------------------------------------------------
# Swagger Models (I/O)
# ---------------------------------------------------------------------------
PlatformBase = ns.model(
    "PlatformBase",
    {
        "slug": fields.String(required=True, description="Stable platform key (e.g., 'cisco_xe','cisco_nxos')"),
        "display_name": fields.String(required=False, description="Human-readable name"),
        "napalm_driver": fields.String(required=False, description="NAPALM driver name (e.g., 'ios','nxos','junos')"),
        "napalm_optional_args": fields.Raw(required=False, description="NAPALM optional_args JSON"),
        "handler_entrypoint": fields.String(required=False, description="Python path to custom handler class (e.g., 'orbit.handlers.xe:XeHandler')"),
        # Future-ready: Ansible
        "ansible_network_os": fields.String(required=False, description="Ansible network_os (e.g., 'cisco.ios.ios')"),
        "ansible_connection": fields.String(required=False, description="Ansible connection plugin (e.g., 'network_cli','httpapi')"),
        "ansible_vars": fields.Raw(required=False, description="Ansible group_vars/host_vars style JSON"),
        "notes": fields.String(required=False, description="Freeform notes"),
        "is_active": fields.Boolean(required=False, description="Whether this platform is active/usable"),
    },
)

PlatformCreate = ns.clone("PlatformCreate", PlatformBase, {})
PlatformUpdate = ns.clone("PlatformUpdate", PlatformBase, {})

PlatformOut = ns.model(
    "PlatformOut",
    {
        "id": fields.Integer(required=True),
        "slug": fields.String(required=True),
        "display_name": fields.String,
        "napalm_driver": fields.String,
        "napalm_optional_args": fields.Raw,
        "handler_entrypoint": fields.String,
        "ansible_network_os": fields.String,
        "ansible_connection": fields.String,
        "ansible_vars": fields.Raw,
        "notes": fields.String,
        "is_active": fields.Boolean,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _apply_platform_filters(q):
    """
    Apply URL query filters to a base Platforms query.

    Parameters
    ----------
    q : sqlalchemy.orm.Query
        Base query.

    Returns
    -------
    sqlalchemy.orm.Query
        Filtered query.
    """
    slug = request.args.get("slug")
    if slug:
        q = q.filter(Platforms.slug.ilike(f"%{slug}%"))

    display_name = request.args.get("display_name")
    if display_name:
        q = q.filter(Platforms.display_name.ilike(f"%{display_name}%"))

    napalm_driver = request.args.get("napalm_driver")
    if napalm_driver:
        q = q.filter(Platforms.napalm_driver.ilike(napalm_driver))

    is_active = request.args.get("is_active")
    if is_active is not None:
        v = is_active.strip().lower()
        if v in {"1", "true", "yes", "on"}:
            q = q.filter(Platforms.is_active.is_(True))
        elif v in {"0", "false", "no", "off"}:
            q = q.filter(Platforms.is_active.is_(False))

    return q


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------
@ns.route("")
class PlatformList(Resource):
    """
    Resource: /platforms
    --------------------
    List platforms (with filters, pagination, sorting) and create new platforms.
    """

    @jwt_required()
    @ns.marshal_list_with(PlatformOut, code=HTTPStatus.OK)
    def get(self):
        """
        List platforms.

        Query Parameters
        ----------------
        page : int
        per_page : int
        sort : str
        slug : str
        display_name : str
        napalm_driver : str
        is_active : bool-like

        Returns
        -------
        list[PlatformOut]
        """
        page, per_page = get_pagination()
        q = Platforms.query
        q = _apply_platform_filters(q)
        q = apply_sorting(
            q,
            Platforms,
            default="-id",
            allowed={"id", "slug", "display_name", "napalm_driver", "is_active", "created_at", "updated_at"},
        )
        rows = paginate_query(q, page=page, per_page=per_page).items
        return rows, HTTPStatus.OK

    @jwt_required()
    @ns.expect(PlatformCreate, validate=True)
    @ns.marshal_with(PlatformOut, code=HTTPStatus.CREATED)
    def post(self):
        """
        Create a platform.

        Body
        ----
        PlatformCreate

        Returns
        -------
        PlatformOut
        """
        payload = request.get_json(force=True) or {}
        row = Platforms(**payload)
        db.session.add(row)
        db.session.commit()
        return row, HTTPStatus.CREATED


@ns.route("/<int:id>")
class PlatformItem(Resource):
    """
    Resource: /platforms/<id>
    -------------------------
    Retrieve, update, or delete a specific platform.
    """

    @jwt_required()
    @ns.marshal_with(PlatformOut, code=HTTPStatus.OK)
    def get(self, id: int):
        """
        Retrieve a platform by ID.

        Parameters
        ----------
        id : int
            Platform primary key.

        Returns
        -------
        PlatformOut
        """
        return Platforms.query.get_or_404(id), HTTPStatus.OK

    @jwt_required()
    @ns.expect(PlatformUpdate, validate=False)
    @ns.marshal_with(PlatformOut, code=HTTPStatus.OK)
    def patch(self, id: int):
        """
        Partially update a platform.

        Parameters
        ----------
        id : int
            Platform primary key.

        Body
        ----
        PlatformUpdate

        Returns
        -------
        PlatformOut
        """
        row = Platforms.query.get_or_404(id)
        data = request.get_json(force=True) or {}
        for k, v in data.items():
            if not hasattr(row, k):
                continue
            setattr(row, k, v)
        db.session.commit()
        return row, HTTPStatus.OK

    @jwt_required()
    def delete(self, id: int):
        """
        Delete a platform.

        Parameters
        ----------
        id : int
            Platform primary key.

        Returns
        -------
        dict
            Confirmation message.
        """
        row = Platforms.query.get_or_404(id)
        db.session.delete(row)
        db.session.commit()
        return {"message": "deleted"}, HTTPStatus.OK