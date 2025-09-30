"""
app/api/resources/eox_hardware.py
---------------------------------
Hardware lifecycle (EoX) endpoints per product model.

Responsibilities
----------------
- CRUD for hardware lifecycle milestones tied to `ProductModels`.
- Filter and list lifecycle rows, including "past" and "due soon" helpers.
- Provide stable Swagger schemas.

Model Assumptions
-----------------
`HardwareLifecycle` in app/models.py with fields:
- id : int
- product_model_id : int (FK -> ProductModels.id, unique)
- end_of_sale_date : datetime | None
- end_of_software_maintenance_date : datetime | None
- end_of_security_fixes_date : datetime | None
- last_day_of_support_date : datetime | None
- source_url : str | None
- notes : str | None

Endpoints
---------
GET    /eox_hardware
POST   /eox_hardware
GET    /eox_hardware/<int:id>
PATCH  /eox_hardware/<int:id>
DELETE /eox_hardware/<int:id>

Query Parameters (GET /eox_hardware)
------------------------------------
product_model_id : int
past : str                  one of: eos|eoswm|eosec|ldos   (return rows with that milestone already past)
due_in_days : int           include rows with any milestone within the window (>= now and <= now+N days)

Security
--------
All endpoints require a valid JWT.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import HardwareLifecycle, ProductModels

ns = Namespace("eox_hardware", description="Hardware lifecycle per product model")

HardwareIn = ns.model("HardwareLifecycleIn", {
    "product_model_id": fields.Integer(required=True, description="FK to ProductModels.id"),
    "end_of_sale_date": fields.DateTime,
    "end_of_software_maintenance_date": fields.DateTime,
    "end_of_security_fixes_date": fields.DateTime,
    "last_day_of_support_date": fields.DateTime,
    "source_url": fields.String,
    "notes": fields.String,
})
HardwareOut = HardwareIn.clone("HardwareLifecycleOut", {"id": fields.Integer})


@ns.route("")
class HardwareList(Resource):
    """
    Resource: /eox_hardware
    -----------------------
    List lifecycle rows and create new entries.
    """

    @jwt_required()
    @ns.marshal_list_with(HardwareOut)
    def get(self):
        """
        List hardware lifecycle rows.

        Query Parameters
        ----------------
        product_model_id : int
        past : str          (eos|eoswm|eosec|ldos)
        due_in_days : int

        Returns
        -------
        list[HardwareLifecycleOut]
        """
        q = HardwareLifecycle.query
        pm_id = request.args.get("product_model_id", type=int)
        past = request.args.get("past")
        due_in_days = request.args.get("due_in_days", type=int)

        if pm_id is not None:
            q = q.filter_by(product_model_id=pm_id)

        rows = q.all()

        if past or due_in_days:
            as_of = datetime.utcnow()
            soon = as_of + timedelta(days=due_in_days or 0)
            out = []
            for r in rows:
                milestone_map = {
                    "eos": r.end_of_sale_date,
                    "eoswm": r.end_of_software_maintenance_date,
                    "eosec": r.end_of_security_fixes_date,
                    "ldos": r.last_day_of_support_date,
                }
                if past:
                    dt = milestone_map.get(past.lower())
                    if dt and dt < as_of:
                        out.append(r)
                elif due_in_days:
                    for dt in milestone_map.values():
                        if dt and as_of <= dt <= soon:
                            out.append(r)
                            break
            return out, 200

        return rows, 200

    @jwt_required()
    @ns.expect(HardwareIn, validate=True)
    @ns.marshal_with(HardwareOut, code=201)
    def post(self):
        """
        Create a hardware lifecycle row.

        Returns
        -------
        HardwareLifecycleOut
        """
        payload = request.get_json(force=True)
        ProductModels.query.get_or_404(payload["product_model_id"])
        row = HardwareLifecycle(**payload)
        db.session.add(row)
        db.session.commit()
        return row, 201


@ns.route("/<int:id>")
class HardwareItem(Resource):
    """
    Resource: /eox_hardware/<id>
    ----------------------------
    Retrieve, update, or delete a hardware lifecycle row.
    """

    @jwt_required()
    @ns.marshal_with(HardwareOut)
    def get(self, id: int):
        """Retrieve a lifecycle row by ID."""
        return HardwareLifecycle.query.get_or_404(id), 200

    @jwt_required()
    @ns.expect(HardwareIn, validate=False)
    @ns.marshal_with(HardwareOut)
    def patch(self, id: int):
        """Partially update a lifecycle row."""
        row = HardwareLifecycle.query.get_or_404(id)
        for k, v in (request.get_json(force=True) or {}).items():
            setattr(row, k, v)
        db.session.commit()
        return row, 200

    @jwt_required()
    def delete(self, id: int):
        """Delete a lifecycle row."""
        row = HardwareLifecycle.query.get_or_404(id)
        db.session.delete(row)
        db.session.commit()
        return {"message": "deleted"}, 200