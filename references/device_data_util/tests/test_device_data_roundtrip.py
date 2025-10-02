"""Reference tests describing round-trip expectations for import/export helpers."""

from __future__ import annotations

from pathlib import Path
from io import StringIO
from typing import Any

import pytest
from references.device_data_util import device_data_exporter as exporter
from references.device_data_util import device_data_importer as importer


@pytest.fixture
def sample_devices() -> list[dict[str, Any]]:
    """Provide a representative set of device dictionaries for round-trip tests."""
    return [
        {
            "name": "core-switch-1",
            "mgmt_ipv4": "10.0.0.1",
            "serial_number": "ABC123456",
            "platform": "cisco_ios",
            "site": "hq",
        },
        {
            "name": "edge-router-1",
            "mgmt_ipv4": "192.168.0.1",
            "serial_number": "XYZ987654",
            "platform": "juniper_junos",
            "site": "branch",
        },
    ]


def test_csv_round_trip(sample_devices: list[dict[str, Any]]) -> None:
    """CSV exports should be readable by the CSV importer without data loss."""

    columns = ["name", "mgmt_ipv4", "serial_number", "platform", "site"]
    csv_payload = exporter.render_csv(sample_devices, columns=columns)

    rows = importer.load_csv_rows(StringIO(csv_payload), dialect=",")

    assert rows == sample_devices


def test_json_round_trip(sample_devices: list[dict[str, Any]]) -> None:
    """JSON exports should be readable by the JSON importer without data loss."""

    payload = exporter.render_json(sample_devices, indent=None)

    rows = importer.load_json_rows(payload)

    assert rows == sample_devices


def test_excel_round_trip(sample_devices: list[dict[str, Any]], tmp_path: Path) -> None:
    """Excel exports should be consumable by the Excel importer."""

    columns = ["name", "mgmt_ipv4", "serial_number", "platform", "site"]
    destination = tmp_path / "devices.xlsx"
    exporter.write_excel(sample_devices, columns=columns, destination=destination, worksheet_title="Devices")

    rows = importer.load_excel_rows(destination)

    assert rows == sample_devices
