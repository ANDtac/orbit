"""Health summary and detail routes for the devices namespace."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from flask_jwt_extended import jwt_required
from flask_restx import Resource
from flask_restx._http import HTTPStatus

from app.models import DeviceHealthSnapshots
from ..utils import problem_response
from .devices_shared import (
    HealthDetailOut,
    HealthSummaryOut,
    _get_device_or_404,
    _serialize_health_snapshot,
    ns,
)


@ns.route("/health")
class DeviceHealthSummary(Resource):
    @jwt_required()
    @ns.marshal_with(HealthSummaryOut, code=HTTPStatus.OK)
    def get(self):
        snapshots = DeviceHealthSnapshots.query.order_by(DeviceHealthSnapshots.observed_at.desc()).all()
        latest: dict[int, DeviceHealthSnapshots] = {}
        for snapshot in snapshots:
            if snapshot.device_id not in latest:
                latest[snapshot.device_id] = snapshot

        overall: dict[str, int] = {}
        by_platform: dict[int | None, dict[str, Any]] = {}
        by_group: dict[str, dict[str, Any]] = {}

        for snapshot in latest.values():
            status = snapshot.status or "unknown"
            overall[status] = overall.get(status, 0) + 1

            device = snapshot.device
            platform_id = getattr(device, "platform_id", None)
            platform_entry = by_platform.setdefault(
                platform_id,
                {
                    "scope": "platform",
                    "identifier": str(platform_id) if platform_id is not None else "none",
                    "name": getattr(device.platform, "name", None),
                    "total": 0,
                    "statuses": {},
                },
            )
            platform_entry["total"] += 1
            platform_entry["statuses"][status] = platform_entry["statuses"].get(status, 0) + 1

            for group in getattr(device, "groups", []) or []:
                key = group.slug or str(group.id)
                group_entry = by_group.setdefault(
                    key,
                    {
                        "scope": "group",
                        "identifier": key,
                        "name": group.name,
                        "total": 0,
                        "statuses": {},
                    },
                )
                group_entry["total"] += 1
                group_entry["statuses"][status] = group_entry["statuses"].get(status, 0) + 1

        return {
            "generated_at": datetime.now(timezone.utc),
            "overall": {"total": len(latest), "statuses": overall},
            "by_platform": list(by_platform.values()),
            "by_group": list(by_group.values()),
        }


@ns.route("/<int:device_id>/health")
class DeviceHealthDetail(Resource):
    @jwt_required()
    @ns.marshal_with(HealthDetailOut, code=HTTPStatus.OK)
    def get(self, device_id: int):
        try:
            _get_device_or_404(device_id)
        except ValueError:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Device not found")

        snapshot = DeviceHealthSnapshots.query.filter_by(device_id=device_id).order_by(
            DeviceHealthSnapshots.observed_at.desc()
        ).first()
        if not snapshot:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Health snapshot not found")

        return _serialize_health_snapshot(snapshot)
