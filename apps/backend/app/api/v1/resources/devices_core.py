"""Core CRUD and listing routes for the devices namespace."""

from __future__ import annotations

from flask_jwt_extended import jwt_required
from flask_restx import Resource
from flask_restx._http import HTTPStatus

from app.extensions import db
from app.models import Devices
from app.observability.activity import record_model_change, serialize_model_state
from ..utils import apply_sorting, cursor_paginate, get_cursor_pagination
from .devices_shared import (
    DeviceCollection,
    DeviceCreate,
    DeviceOut,
    DeviceUpdate,
    _apply_device_filters,
    _prepare_device_payload,
    _set_device_inventory_group,
    ns,
)


@ns.route("")
class DeviceList(Resource):
    @jwt_required()
    @ns.marshal_with(DeviceCollection, code=HTTPStatus.OK)
    def get(self):
        query = _apply_device_filters(Devices.query)
        query = apply_sorting(
            query,
            Devices,
            default="-id",
            allowed={
                "id",
                "name",
                "mgmt_ipv4",
                "platform_id",
                "os_name",
                "os_version",
                "created_at",
                "updated_at",
            },
        )
        cursor, size = get_cursor_pagination()
        return cursor_paginate(query, cursor=cursor, size=size), HTTPStatus.OK

    @jwt_required()
    @ns.expect(DeviceCreate, validate=True)
    @ns.marshal_with(DeviceOut, code=HTTPStatus.CREATED)
    def post(self):
        payload, inventory_group_id = _prepare_device_payload(force=True)
        device = Devices(**payload)
        db.session.add(device)
        db.session.flush()

        if inventory_group_id is not None and device.id is not None:
            _set_device_inventory_group(device.id, inventory_group_id, commit=False)

        record_model_change(
            action="device.create",
            target_type="device",
            target=device,
            before=None,
            after=serialize_model_state(device),
            message=f"Created device {device.name}",
        )
        db.session.commit()

        return device, HTTPStatus.CREATED


@ns.route("/<int:id>")
class DeviceItem(Resource):
    @jwt_required()
    @ns.marshal_with(DeviceOut, code=HTTPStatus.OK)
    def get(self, id: int):
        return Devices.query.get_or_404(id), HTTPStatus.OK

    @jwt_required()
    @ns.expect(DeviceUpdate, validate=False)
    @ns.marshal_with(DeviceOut, code=HTTPStatus.OK)
    def patch(self, id: int):
        device = Devices.query.get_or_404(id)
        before = serialize_model_state(device)
        payload, inventory_group_id = _prepare_device_payload(force=True)

        for key, value in payload.items():
            if hasattr(device, key):
                setattr(device, key, value)

        if inventory_group_id is not None:
            _set_device_inventory_group(device.id, inventory_group_id, commit=False)

        record_model_change(
            action="device.update",
            target_type="device",
            target=device,
            before=before,
            after=serialize_model_state(device),
            message=f"Updated device {device.name}",
        )
        db.session.commit()

        return device, HTTPStatus.OK

    @jwt_required()
    def delete(self, id: int):
        device = Devices.query.get_or_404(id)
        before = serialize_model_state(device)
        db.session.delete(device)
        record_model_change(
            action="device.delete",
            target_type="device",
            target=device,
            before=before,
            after=None,
            message=f"Deleted device {device.name}",
        )
        db.session.commit()
        return {"message": "deleted"}, HTTPStatus.OK
