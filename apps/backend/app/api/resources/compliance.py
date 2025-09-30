"""
app/api/resources/compliance.py
-------------------------------
Compliance policy, rule, and result endpoints.

Responsibilities
----------------
- Manage compliance policies and their rules (CRUD).
- Expose historical compliance results with rich filtering.
- Provide a lightweight evaluation stub endpoint that you can later wire to an
  async worker (RQ/Celery) or a service function that evaluates devices against
  policies and rules.

Assumptions
-----------
The following ORM models exist in `app/models.py` (names and common fields shown).
Adjust field names here if your models differ slightly:

- CompliancePolicies
    id: int
    name: str
    description: str | None
    is_active: bool
    scope: dict        # optional: e.g., {"platform_ids":[...], "inventory_group_ids":[...]}

- ComplianceRules
    id: int
    policy_id: int -> CompliancePolicies.id
    name: str
    description: str | None
    severity: str      # e.g., "low" | "medium" | "high" | "critical"
    rule_type: str     # e.g., "config_line_present", "jsonpath", "regex"
    expression: str    # rule expression (syntax depends on rule_type)
    params: dict       # extra parameters (e.g., path, flags)

- ComplianceResults
    id: int
    device_id: int
    policy_id: int
    rule_id: int | None
    evaluated_at: datetime
    status: str        # "pass" | "fail" | "skip" | "error"
    details: dict      # freeform data about the evaluation
    snapshot_id: int | None  # optional link to DeviceConfigSnapshots.id

Endpoints
---------
Policies:
    GET    /compliance/policies
    POST   /compliance/policies
    GET    /compliance/policies/<int:id>
    PATCH  /compliance/policies/<int:id>
    DELETE /compliance/policies/<int:id>

Rules:
    GET    /compliance/rules
    POST   /compliance/rules
    GET    /compliance/rules/<int:id>
    PATCH  /compliance/rules/<int:id>
    DELETE /compliance/rules/<int:id>

Results:
    GET    /compliance/results     (filters: device_id, policy_id, rule_id, status, since, until)

Evaluate (stub you can wire later):
    POST   /compliance/evaluate
           Body: { "device_ids":[...], "policy_ids":[...], "async": true|false }
           Returns 202 with a queued payload. Replace with real runner when ready.

Security
--------
All endpoints require a valid JWT.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import (
    CompliancePolicies,
    ComplianceRules,
    ComplianceResults,
)
from ..utils import get_pagination, apply_sorting

# ---------------------------------------------------------------------------
# Namespace
# ---------------------------------------------------------------------------
ns = Namespace("compliance", description="Compliance policies, rules, and results")


# ---------------------------------------------------------------------------
# Swagger Models (I/O)
# ---------------------------------------------------------------------------
PolicyBase = ns.model(
    "CompliancePolicyBase",
    {
        "name": fields.String(required=True, description="Policy name"),
        "description": fields.String(required=False, description="Optional description"),
        "is_active": fields.Boolean(required=False, description="Whether the policy is active"),
        "scope": fields.Raw(required=False, description="Optional scope selector JSON"),
    },
)
PolicyCreate = ns.clone("CompliancePolicyCreate", PolicyBase, {})
PolicyUpdate = ns.clone("CompliancePolicyUpdate", PolicyBase, {})
PolicyOut = ns.model(
    "CompliancePolicyOut",
    {
        "id": fields.Integer(required=True),
        "name": fields.String(required=True),
        "description": fields.String,
        "is_active": fields.Boolean,
        "scope": fields.Raw,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)

RuleBase = ns.model(
    "ComplianceRuleBase",
    {
        "policy_id": fields.Integer(required=True, description="FK to CompliancePolicies.id"),
        "name": fields.String(required=True, description="Rule name"),
        "description": fields.String(required=False, description="Optional rule description"),
        "severity": fields.String(required=True, description="low|medium|high|critical"),
        "rule_type": fields.String(required=True, description="Type of rule (e.g., 'regex','jsonpath','config_line_present')"),
        "expression": fields.String(required=True, description="Rule expression syntax depends on rule_type"),
        "params": fields.Raw(required=False, description="Additional parameters (JSON)"),
    },
)
RuleCreate = ns.clone("ComplianceRuleCreate", RuleBase, {})
RuleUpdate = ns.clone("ComplianceRuleUpdate", RuleBase, {})
RuleOut = ns.model(
    "ComplianceRuleOut",
    {
        "id": fields.Integer(required=True),
        "policy_id": fields.Integer(required=True),
        "name": fields.String(required=True),
        "description": fields.String,
        "severity": fields.String,
        "rule_type": fields.String,
        "expression": fields.String,
        "params": fields.Raw,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)

ResultOut = ns.model(
    "ComplianceResultOut",
    {
        "id": fields.Integer(required=True),
        "device_id": fields.Integer(required=True),
        "policy_id": fields.Integer(required=True),
        "rule_id": fields.Integer,
        "evaluated_at": fields.DateTime,
        "status": fields.String(description="pass|fail|skip|error"),
        "details": fields.Raw,
        "snapshot_id": fields.Integer,
    },
)

EvaluateIn = ns.model(
    "ComplianceEvaluateIn",
    {
        "device_ids": fields.List(fields.Integer, required=False, description="Devices to evaluate (omit for all in scope)"),
        "policy_ids": fields.List(fields.Integer, required=False, description="Policies to evaluate (omit for all active)"),
        "async": fields.Boolean(required=False, default=True, description="Queue async job rather than synchronous run"),
    },
)

QueuedOut = ns.model(
    "QueuedOut",
    {
        "status": fields.String(example="queued"),
        "enqueued_at": fields.DateTime,
        "job": fields.Raw(description="Opaque job descriptor (future use)"),
    },
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _parse_iso_dt(value: str | None) -> datetime | None:
    """
    Parse an ISO8601 timestamp from a query parameter.

    Parameters
    ----------
    value : str | None
        The raw string value (e.g., '2025-01-31T00:00:00Z').

    Returns
    -------
    datetime | None
        Parsed UTC datetime or None on failure/absence.
    """
    if not value:
        return None
    try:
        v = value.rstrip("Z")
        return datetime.fromisoformat(v)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Policies
# ---------------------------------------------------------------------------
@ns.route("/policies")
class PolicyList(Resource):
    """
    Resource: /compliance/policies
    ------------------------------
    List and create compliance policies.
    """

    @jwt_required()
    @ns.marshal_list_with(PolicyOut, code=200)
    def get(self):
        """
        List policies with pagination and sorting.

        Query Parameters
        ----------------
        page : int
        per_page : int
        sort : str   (e.g., "-id,name")
        name : str   (filter by partial name)
        is_active : bool-like

        Returns
        -------
        list[CompliancePolicyOut]
        """
        page, per_page = get_pagination()
        q = CompliancePolicies.query

        name = request.args.get("name")
        if name:
            q = q.filter(CompliancePolicies.name.ilike(f"%{name}%"))

        is_active = request.args.get("is_active")
        if is_active is not None:
            v = is_active.strip().lower()
            if v in {"1", "true", "yes", "on"}:
                q = q.filter(CompliancePolicies.is_active.is_(True))
            elif v in {"0", "false", "no", "off"}:
                q = q.filter(CompliancePolicies.is_active.is_(False))

        q = apply_sorting(
            q,
            CompliancePolicies,
            default="-id",
            allowed={"id", "name", "is_active", "created_at", "updated_at"},
        )
        rows = q.paginate(page=page, per_page=per_page, error_out=False).items
        return rows, 200

    @jwt_required()
    @ns.expect(PolicyCreate, validate=True)
    @ns.marshal_with(PolicyOut, code=201)
    def post(self):
        """
        Create a compliance policy.

        Body
        ----
        CompliancePolicyCreate

        Returns
        -------
        CompliancePolicyOut
        """
        payload = request.get_json(force=True) or {}
        row = CompliancePolicies(**payload)
        db.session.add(row)
        db.session.commit()
        return row, 201


@ns.route("/policies/<int:id>")
class PolicyItem(Resource):
    """
    Resource: /compliance/policies/<id>
    -----------------------------------
    Retrieve, update, or delete a specific policy.
    """

    @jwt_required()
    @ns.marshal_with(PolicyOut, code=200)
    def get(self, id: int):
        """
        Retrieve a policy by ID.

        Parameters
        ----------
        id : int

        Returns
        -------
        CompliancePolicyOut
        """
        return CompliancePolicies.query.get_or_404(id), 200

    @jwt_required()
    @ns.expect(PolicyUpdate, validate=False)
    @ns.marshal_with(PolicyOut, code=200)
    def patch(self, id: int):
        """
        Update a policy (partial).

        Parameters
        ----------
        id : int

        Body
        ----
        CompliancePolicyUpdate

        Returns
        -------
        CompliancePolicyOut
        """
        row = CompliancePolicies.query.get_or_404(id)
        data = request.get_json(force=True) or {}
        for k, v in data.items():
            if hasattr(row, k):
                setattr(row, k, v)
        db.session.commit()
        return row, 200

    @jwt_required()
    def delete(self, id: int):
        """
        Delete a policy.

        Parameters
        ----------
        id : int

        Returns
        -------
        dict
            Confirmation message.
        """
        row = CompliancePolicies.query.get_or_404(id)
        db.session.delete(row)
        db.session.commit()
        return {"message": "deleted"}, 200


# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------
@ns.route("/rules")
class RuleList(Resource):
    """
    Resource: /compliance/rules
    ---------------------------
    List and create compliance rules.
    """

    @jwt_required()
    @ns.marshal_list_with(RuleOut, code=200)
    def get(self):
        """
        List rules with pagination and sorting.

        Query Parameters
        ----------------
        page : int
        per_page : int
        sort : str       (e.g., "-id,name")
        policy_id : int
        severity : str
        rule_type : str
        name : str

        Returns
        -------
        list[ComplianceRuleOut]
        """
        page, per_page = get_pagination()
        q = ComplianceRules.query

        policy_id = request.args.get("policy_id", type=int)
        if policy_id is not None:
            q = q.filter(ComplianceRules.policy_id == policy_id)

        severity = request.args.get("severity")
        if severity:
            q = q.filter(ComplianceRules.severity.ilike(severity))

        rule_type = request.args.get("rule_type")
        if rule_type:
            q = q.filter(ComplianceRules.rule_type.ilike(rule_type))

        name = request.args.get("name")
        if name:
            q = q.filter(ComplianceRules.name.ilike(f"%{name}%"))

        q = apply_sorting(
            q,
            ComplianceRules,
            default="-id",
            allowed={"id", "policy_id", "name", "severity", "created_at", "updated_at"},
        )
        rows = q.paginate(page=page, per_page=per_page, error_out=False).items
        return rows, 200

    @jwt_required()
    @ns.expect(RuleCreate, validate=True)
    @ns.marshal_with(RuleOut, code=201)
    def post(self):
        """
        Create a rule.

        Body
        ----
        ComplianceRuleCreate

        Returns
        -------
        ComplianceRuleOut
        """
        payload = request.get_json(force=True) or {}
        row = ComplianceRules(**payload)
        db.session.add(row)
        db.session.commit()
        return row, 201


@ns.route("/rules/<int:id>")
class RuleItem(Resource):
    """
    Resource: /compliance/rules/<id>
    --------------------------------
    Retrieve, update, or delete a specific rule.
    """

    @jwt_required()
    @ns.marshal_with(RuleOut, code=200)
    def get(self, id: int):
        """
        Retrieve a rule by ID.

        Parameters
        ----------
        id : int

        Returns
        -------
        ComplianceRuleOut
        """
        return ComplianceRules.query.get_or_404(id), 200

    @jwt_required()
    @ns.expect(RuleUpdate, validate=False)
    @ns.marshal_with(RuleOut, code=200)
    def patch(self, id: int):
        """
        Update a rule (partial).

        Parameters
        ----------
        id : int

        Body
        ----
        ComplianceRuleUpdate

        Returns
        -------
        ComplianceRuleOut
        """
        row = ComplianceRules.query.get_or_404(id)
        data = request.get_json(force=True) or {}
        for k, v in data.items():
            if hasattr(row, k):
                setattr(row, k, v)
        db.session.commit()
        return row, 200

    @jwt_required()
    def delete(self, id: int):
        """
        Delete a rule.

        Parameters
        ----------
        id : int

        Returns
        -------
        dict
            Confirmation message.
        """
        row = ComplianceRules.query.get_or_404(id)
        db.session.delete(row)
        db.session.commit()
        return {"message": "deleted"}, 200


# ---------------------------------------------------------------------------
# Results
# ---------------------------------------------------------------------------
@ns.route("/results")
class ResultList(Resource):
    """
    Resource: /compliance/results
    -----------------------------
    List historical compliance results (filterable).
    """

    @jwt_required()
    @ns.marshal_list_with(ResultOut, code=200)
    def get(self):
        """
        List results with filters, pagination, and sorting.

        Query Parameters
        ----------------
        page : int
        per_page : int
        sort : str        (e.g., "-evaluated_at,id")
        device_id : int
        policy_id : int
        rule_id : int
        status : str      ("pass","fail","skip","error")
        since : ISO8601   (inclusive)
        until : ISO8601   (exclusive)

        Returns
        -------
        list[ComplianceResultOut]
        """
        page, per_page = get_pagination()
        q = ComplianceResults.query

        device_id = request.args.get("device_id", type=int)
        if device_id is not None:
            q = q.filter(ComplianceResults.device_id == device_id)

        policy_id = request.args.get("policy_id", type=int)
        if policy_id is not None:
            q = q.filter(ComplianceResults.policy_id == policy_id)

        rule_id = request.args.get("rule_id", type=int)
        if rule_id is not None:
            q = q.filter(ComplianceResults.rule_id == rule_id)

        status = request.args.get("status")
        if status:
            q = q.filter(ComplianceResults.status.ilike(status))

        since = _parse_iso_dt(request.args.get("since"))
        if since:
            q = q.filter(ComplianceResults.evaluated_at >= since)

        until = _parse_iso_dt(request.args.get("until"))
        if until:
            q = q.filter(ComplianceResults.evaluated_at < until)

        q = apply_sorting(
            q,
            ComplianceResults,
            default="-evaluated_at",
            allowed={"id", "device_id", "policy_id", "rule_id", "status", "evaluated_at"},
        )
        rows = q.paginate(page=page, per_page=per_page, error_out=False).items
        return rows, 200


# ---------------------------------------------------------------------------
# Evaluate (stub)
# ---------------------------------------------------------------------------
@ns.route("/evaluate")
class Evaluate(Resource):
    """
    Resource: /compliance/evaluate
    ------------------------------
    Stub endpoint to kick off compliance evaluation.

    Implementation notes
    --------------------
    Replace the body with a call to your evaluator service (sync or async).
    For async: enqueue a job and return job metadata.
    For sync: compute immediately and persist ComplianceResults rows.

    Current behavior
    ----------------
    Returns 202 Accepted with a simple 'queued' payload for the requested scope.
    """

    @jwt_required()
    @ns.expect(EvaluateIn, validate=False)
    @ns.marshal_with(QueuedOut, code=202)
    def post(self):
        """
        Queue an evaluation of devices against policies.

        Body
        ----
        ComplianceEvaluateIn

        Returns
        -------
        QueuedOut
            A simple queued response; replace with real job id when wired.
        """
        payload: dict[str, Any] = request.get_json(silent=True) or {}
        device_ids = payload.get("device_ids")
        policy_ids = payload.get("policy_ids")
        run_async = bool(payload.get("async", True))

        # Here you could:
        #   - resolve device/policy scope
        #   - enqueue async work item
        #   - return job identifier and correlation id
        # For now, we just acknowledge the request.
        return {
            "status": "queued" if run_async else "queued",
            "enqueued_at": datetime.utcnow().isoformat() + "Z",
            "job": {
                "device_ids": device_ids,
                "policy_ids": policy_ids,
                "mode": "async" if run_async else "sync",
            },
        }, 202