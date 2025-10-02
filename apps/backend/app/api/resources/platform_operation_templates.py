"""
app/api/resources/platform_operation_templates.py
-------------------------------------------------
Platform operation template endpoints (CRUD + list with filters).

Responsibilities
----------------
- Expose `/platform_operation_templates` collection with pagination, sorting, and filters.
- Expose `/platform_operation_templates/<id>` item for read/update/delete.
- Store reusable templates for platform-specific operations (e.g., password change, backup).

Model Assumptions
-----------------
The ORM model `PlatformOperationTemplates` exists in `app/models.py` with fields like:

- id : int
- platform_id : int               # FK -> Platforms.id
- name : str                      # template name, e.g., "Change Password"
- description : str | None
- op_type : str                   # category, e.g., "password_change","backup","compliance"
- template : str                  # Jinja2 or CLI snippet
- variables : dict | None         # expected variables for the template (JSON schema-like)
- notes : str | None
- created_at : datetime
- updated_at : datetime

Endpoints
---------
GET    /platform_operation_templates
POST   /platform_operation_templates
GET    /platform_operation_templates/<int:id>
PATCH  /platform_operation_templates/<int:id>
DELETE /platform_operation_templates/<int:id>

Query Parameters (GET /platform_operation_templates)
----------------------------------------------------
page : int
per_page : int
sort : str
    Comma-separated fields; prefix with '-' for DESC. Example: `-id,name`.
platform_id : int
op_type : str
name : str

Security
--------
All endpoints require a valid JWT (see /auth/login).

Notes
-----
- The `template` field may store multiline text.
- Rendering and execution are handled in `services/operations.py`.
"""

from __future__ import annotations

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import PlatformOperationTemplates
from ..utils import get_pagination, apply_sorting

# ---------------------------------------------------------------------------
# Namespace
# ---------------------------------------------------------------------------
ns = Namespace("platform_operation_templates", description="Templates for platform-specific operations")


# ---------------------------------------------------------------------------
# Swagger Models (I/O)
# ---------------------------------------------------------------------------
TemplateBase = ns.model(
    "PlatformOperationTemplateBase",
    {
        "platform_id": fields.Integer(required=True, description="FK to Platforms.id"),
        "name": fields.String(required=True, description="Template name, e.g., 'Change Password'"),
        "description": fields.String(required=False, description="Optional description"),
        "op_type": fields.String(required=True, description="Operation type (e.g., 'password_change','backup')"),
        "template": fields.String(required=True, description="Jinja2/CLI template text"),
        "variables": fields.Raw(required=False, description="Expected variables schema (JSON)"),
        "notes": fields.String(required=False, description="Freeform notes"),
    },
)

TemplateCreate = ns.clone("PlatformOperationTemplateCreate", TemplateBase, {})
TemplateUpdate = ns.clone("PlatformOperationTemplateUpdate", TemplateBase, {})  # all optional on PATCH

TemplateOut = ns.model(
    "PlatformOperationTemplateOut",
    {
        "id": fields.Integer(required=True),
        "platform_id": fields.Integer(required=True),
        "name": fields.String(required=True),
        "description": fields.String,
        "op_type": fields.String,
        "template": fields.String,
        "variables": fields.Raw,
        "notes": fields.String,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _apply_filters(q):
    """
    Apply URL query filters to a base PlatformOperationTemplates query.

    Parameters
    ----------
    q : sqlalchemy.orm.Query
        Base query.

    Returns
    -------
    sqlalchemy.orm.Query
        Filtered query.
    """
    platform_id = request.args.get("platform_id", type=int)
    if platform_id is not None:
        q = q.filter(PlatformOperationTemplates.platform_id == platform_id)

    op_type = request.args.get("op_type")
    if op_type:
        q = q.filter(PlatformOperationTemplates.op_type.ilike(op_type))

    name = request.args.get("name")
    if name:
        q = q.filter(PlatformOperationTemplates.name.ilike(f"%{name}%"))

    return q


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------
@ns.route("")
class TemplateList(Resource):
    """
    Resource: /platform_operation_templates
    ---------------------------------------
    List templates (with filters, pagination, sorting) and create new templates.
    """

    @jwt_required()
    @ns.marshal_list_with(TemplateOut, code=HTTPStatus.OK)
    def get(self):
        """
        List operation templates.

        Query Parameters
        ----------------
        page : int
        per_page : int
        sort : str
        platform_id : int
        op_type : str
        name : str

        Returns
        -------
        list[PlatformOperationTemplateOut]
        """
        page, per_page = get_pagination()
        q = PlatformOperationTemplates.query
        q = _apply_filters(q)
        q = apply_sorting(
            q,
            PlatformOperationTemplates,
            default="-id",
            allowed={"id", "platform_id", "name", "op_type", "created_at", "updated_at"},
        )
        rows = db.paginate(q, page=page, per_page=per_page, error_out=False).items
        return rows, HTTPStatus.OK

    @jwt_required()
    @ns.expect(TemplateCreate, validate=True)
    @ns.marshal_with(TemplateOut, code=HTTPStatus.CREATED)
    def post(self):
        """
        Create an operation template.

        Body
        ----
        PlatformOperationTemplateCreate

        Returns
        -------
        PlatformOperationTemplateOut
        """
        payload = request.get_json(force=True) or {}
        row = PlatformOperationTemplates(**payload)
        db.session.add(row)
        db.session.commit()
        return row, HTTPStatus.CREATED


@ns.route("/<int:id>")
class TemplateItem(Resource):
    """
    Resource: /platform_operation_templates/<id>
    --------------------------------------------
    Retrieve, update, or delete a specific operation template.
    """

    @jwt_required()
    @ns.marshal_with(TemplateOut, code=HTTPStatus.OK)
    def get(self, id: int):
        """
        Retrieve an operation template by ID.

        Parameters
        ----------
        id : int

        Returns
        -------
        PlatformOperationTemplateOut
        """
        return PlatformOperationTemplates.query.get_or_404(id), HTTPStatus.OK

    @jwt_required()
    @ns.expect(TemplateUpdate, validate=False)
    @ns.marshal_with(TemplateOut, code=HTTPStatus.OK)
    def patch(self, id: int):
        """
        Update an operation template (partial).

        Parameters
        ----------
        id : int

        Body
        ----
        PlatformOperationTemplateUpdate

        Returns
        -------
        PlatformOperationTemplateOut
        """
        row = PlatformOperationTemplates.query.get_or_404(id)
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
        Delete an operation template.

        Parameters
        ----------
        id : int

        Returns
        -------
        dict
            Confirmation message.
        """
        row = PlatformOperationTemplates.query.get_or_404(id)
        db.session.delete(row)
        db.session.commit()
        return {"message": "deleted"}, HTTPStatus.OK