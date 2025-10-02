"""
app/api/resources/eox_queries.py
--------------------------------
Lifecycle cross-cutting queries that join lifecycle data with devices.

Responsibilities
----------------
- Report devices whose hardware/software milestones are past or due soon.
- Compute earliest milestone per device for software when multiple match rows exist.
- Keep results lightweight but informative for UI.

Model Assumptions
-----------------
Uses:
- Devices
- HardwareLifecycle
- SoftwareLifecycle (uses .matches_version(version) helper)

Endpoints
---------
GET /eox/devices
  Query:
    milestone   : str    (eos|eoswm|eosec|ldos) default 'ldos'
    past        : bool   (default true)  -> return devices with that milestone in past
    within_days : int    (default 0)     -> when past=false, return devices due within N days

Security
--------
All endpoints require a valid JWT.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import jwt_required

from ...models import Devices, HardwareLifecycle, SoftwareLifecycle

ns = Namespace("eox", description="Lifecycle (EoX) queries")

DeviceEoxOut = ns.model("DeviceEoxOut", {
    "device_id": fields.Integer,
    "name": fields.String,
    "mgmt_ipv4": fields.String,
    "hardware": fields.Raw,  # dict milestone -> {date, state}
    "software": fields.Raw,
})


@ns.route("/devices")
class DevicesEox(Resource):
    """
    Resource: /eox/devices
    ----------------------
    Return devices with lifecycle status for hardware and software.
    """

    @jwt_required()
    @ns.marshal_list_with(DeviceEoxOut)
    def get(self):
        """
        List devices with lifecycle markers.

        Query Parameters
        ----------------
        milestone : str    (eos|eoswm|eosec|ldos) default 'ldos'
        past : bool        default true
        within_days : int  default 0 (only used when past=false)

        Returns
        -------
        list[DeviceEoxOut]
        """
        milestone = (request.args.get("milestone") or "ldos").lower()
        past = (request.args.get("past", "true").lower() == "true")
        within_days = request.args.get("within_days", default=0, type=int)

        as_of = datetime.utcnow()
        soon = as_of + timedelta(days=max(0, within_days))

        devices = Devices.query.all()
        hw_map = {r.product_model_id: r for r in HardwareLifecycle.query.all()}
        sw_rows = SoftwareLifecycle.query.all()

        def sw_matches(dev):
            matches = []
            for r in sw_rows:
                if r.os_name and (dev.os_name or "").lower() != (r.os_name or "").lower():
                    continue
                if r.platform_id and dev.platform_id != r.platform_id:
                    continue
                if r.matches_version(dev.os_version or ""):
                    matches.append(r)
            return matches

        out = []
        for d in devices:
            hw = hw_map.get(d.product_model_id)
            hw_status = {}
            sw_status = {}

            # Hardware states
            if hw:
                for key, attr in {
                    "eos": "end_of_sale_date",
                    "eoswm": "end_of_software_maintenance_date",
                    "eosec": "end_of_security_fixes_date",
                    "ldos": "last_day_of_support_date",
                }.items():
                    dt = getattr(hw, attr, None)
                    if not dt:
                        continue
                    state = "past" if dt < as_of else ("soon" if as_of <= dt <= soon else "future")
                    hw_status[key] = {"date": (dt.isoformat() + "Z"), "state": state}

            # Software: keep earliest date per milestone among matches
            for r in sw_matches(d):
                for key, dt in {
                    "eos": r.end_of_sale_date,
                    "eoswm": r.end_of_software_maintenance_date,
                    "eosec": r.end_of_security_fixes_date,
                    "ldos": r.last_day_of_support_date,
                }.items():
                    if not dt:
                        continue
                    state = "past" if dt < as_of else ("soon" if as_of <= dt <= soon else "future")
                    prev = sw_status.get(key)
                    if not prev or dt < datetime.fromisoformat(prev["date"].replace("Z", "")):
                        sw_status[key] = {"date": (dt.isoformat() + "Z"), "state": state}

            # Optional filtering by requested milestone/window
            if milestone in ("eos", "eoswm", "eosec", "ldos"):
                states = []
                if milestone in hw_status:
                    states.append(hw_status[milestone]["state"])
                if milestone in sw_status:
                    states.append(sw_status[milestone]["state"])
                if not states:
                    continue
                if past and not any(s == "past" for s in states):
                    continue
                if not past and within_days > 0 and not any(s == "soon" for s in states):
                    continue

            out.append({
                "device_id": d.id,
                "name": d.name,
                "mgmt_ipv4": str(d.mgmt_ipv4) if d.mgmt_ipv4 else None,
                "hardware": hw_status or None,
                "software": sw_status or None,
            })
        return out, HTTPStatus.OK