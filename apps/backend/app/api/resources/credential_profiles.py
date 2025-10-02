"""
app/api/resources/credential_profiles.py
----------------------------------------
Credential profile endpoints (CRUD + list with filters).

Responsibilities
----------------
- Expose `/credential_profiles` collection with pagination, sorting, and filters.
- Expose `/credential_profiles/<id>` item for read/update/delete.
- Keep secrets out of responses by design (store only references/metadata).

Model Assumptions
-----------------
The ORM model `CredentialProfiles` exists in `app/models.py` with fields like:

- id : int
- name : str
- description : str | None
- auth_type : str                # e.g., "username_password", "ssh_key", "api_token", "oauth"
- username : str | None          # optional username hint
- secret_ref : str | None        # reference to secret in external store (Vault/KMS/Secrets Manager)
- secret_metadata : dict | None  # any non-sensitive metadata (e.g., key IDs, rotation policy tags)
- params : dict | None           # driver-specific extras (JSON)
- is_active : bool
- created_at : datetime
- updated_at : datetime

Security
--------
- Do NOT return actual secrets.
- Only return references/metadata sufficient for the runner to fetch secrets
  from your secret store at runtime.

Endpoints
---------
GET    /credential_profiles
POST   /credential_profiles
GET    /credential_profiles/<int:id>
PATCH  /credential_profiles/<int:id>
DELETE /credential_profiles/<int:id>

Query Parameters (GET /credential_profiles)
-------------------------------------------
page : int
per_page : int
sort : str
    Comma-separated fields; prefix with '-' for DESC. Example: `-id,name`.
name : str
auth_type : str
is_active : bool-like

All endpoints require a valid JWT (see /auth/login).
"""

from __future__ import annotations

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import CredentialProfiles
from ..utils import get_pagination, apply_sorting

# ---------------------------------------------------------------------------
# Namespace
# ---------------------------------------------------------------------------
ns = Namespace("credential_profiles", description="Credential profiles (secret references only)")


# ---------------------------------------------------------------------------
# Swagger Models (I/O)
# ---------------------------------------------------------------------------
CredProfileBase = ns.model(
    "CredentialProfileBase",
    {
        "name": fields.String(required=True, description="Profile name"),
        "description": fields.String(required=False, description="Optional description"),
        "auth_type": fields.String(required=True, description="Auth mechanism (e.g., 'username_password','ssh_key','api_token')"),
        "username": fields.String(required=False, description="Optional username hint (no passwords here)"),
        "secret_ref": fields.String(required=False, description="Opaque reference to secret in external store (e.g., Vault path, KMS ARN)"),
        "secret_metadata": fields.Raw(required=False, description="Non-sensitive metadata (e.g., key id, rotation policy)"),
        "params": fields.Raw(required=False, description="Driver-specific extras (JSON)"),
        "is_active": fields.Boolean(required=False, description="Whether this profile is active"),
    },
)

CredProfileCreate = ns.clone("CredentialProfileCreate", CredProfileBase, {})
CredProfileUpdate = ns.clone("CredentialProfileUpdate", CredProfileBase, {})

CredProfileOut = ns.model(
    "CredentialProfileOut",
    {
        "id": fields.Integer(required=True),
        "name": fields.String(required=True),
        "description": fields.String,
        "auth_type": fields.String,
        "username": fields.String,
        "secret_ref": fields.String,
        "secret_metadata": fields.Raw,
        "params": fields.Raw,
        "is_active": fields.Boolean,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _apply_filters(q):
    """
    Apply URL query filters to a base CredentialProfiles query.

    Parameters
    ----------
    q : sqlalchemy.orm.Query
        Base query.

    Returns
    -------
    sqlalchemy.orm.Query
        Filtered query.
    """
    name = request.args.get("name")
    if name:
        q = q.filter(CredentialProfiles.name.ilike(f"%{name}%"))

    auth_type = request.args.get("auth_type")
    if auth_type:
        q = q.filter(CredentialProfiles.auth_type.ilike(auth_type))

    is_active = request.args.get("is_active")
    if is_active is not None:
        v = is_active.strip().lower()
        if v in {"1", "true", "yes", "on"}:
            q = q.filter(CredentialProfiles.is_active.is_(True))
        elif v in {"0", "false", "no", "off"}:
            q = q.filter(CredentialProfiles.is_active.is_(False))

    return q


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------
@ns.route("")
class CredentialProfileList(Resource):
    """
    Resource: /credential_profiles
    ------------------------------
    List credential profiles and create new profiles.
    """

    @jwt_required()
    @ns.marshal_list_with(CredProfileOut, code=HTTPStatus.OK)
    def get(self):
        """
        List credential profiles.

        Query Parameters
        ----------------
        page : int
        per_page : int
        sort : str
        name : str
        auth_type : str
        is_active : bool-like

        Returns
        -------
        list[CredentialProfileOut]
        """
        page, per_page = get_pagination()
        q = CredentialProfiles.query
        q = _apply_filters(q)
        q = apply_sorting(
            q,
            CredentialProfiles,
            default="-id",
            allowed={"id", "name", "auth_type", "is_active", "created_at", "updated_at"},
        )
        rows = db.paginate(q, page=page, per_page=per_page, error_out=False).items
        return rows, HTTPStatus.OK

    @jwt_required()
    @ns.expect(CredProfileCreate, validate=True)
    @ns.marshal_with(CredProfileOut, code=HTTPStatus.CREATED)
    def post(self):
        """
        Create a credential profile.

        Body
        ----
        CredentialProfileCreate

        Returns
        -------
        CredentialProfileOut
        """
        payload = request.get_json(force=True) or {}
        row = CredentialProfiles(**payload)
        db.session.add(row)
        db.session.commit()
        return row, HTTPStatus.CREATED


@ns.route("/<int:id>")
class CredentialProfileItem(Resource):
    """
    Resource: /credential_profiles/<id>
    -----------------------------------
    Retrieve, update, or delete a specific credential profile.
    """

    @jwt_required()
    @ns.marshal_with(CredProfileOut, code=HTTPStatus.OK)
    def get(self, id: int):
        """
        Retrieve a credential profile by ID.

        Parameters
        ----------
        id : int

        Returns
        -------
        CredentialProfileOut
        """
        return CredentialProfiles.query.get_or_404(id), HTTPStatus.OK

    @jwt_required()
    @ns.expect(CredProfileUpdate, validate=False)
    @ns.marshal_with(CredProfileOut, code=HTTPStatus.OK)
    def patch(self, id: int):
        """
        Update a credential profile (partial).

        Parameters
        ----------
        id : int

        Body
        ----
        CredentialProfileUpdate

        Returns
        -------
        CredentialProfileOut
        """
        row = CredentialProfiles.query.get_or_404(id)
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
        Delete a credential profile.

        Parameters
        ----------
        id : int

        Returns
        -------
        dict
            Confirmation message.
        """
        row = CredentialProfiles.query.get_or_404(id)
        db.session.delete(row)
        db.session.commit()
        return {"message": "deleted"}, HTTPStatus.OK
