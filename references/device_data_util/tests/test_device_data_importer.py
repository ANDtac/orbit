"""Reference tests for `device_data_importer` scaffolding."""

from __future__ import annotations

from io import StringIO
from pathlib import Path

from references.device_data_util import device_data_importer as importer


class TestSniffCsvDialect:
    def test_prefers_comma_when_counts_are_highest(self) -> None:
        """Comma delimiters should win when they yield the most columns."""

        sample = "name,serial_number\nedge,ABC123\n"

        result = importer.sniff_csv_dialect(sample)

        assert result == ","

    def test_falls_back_to_first_delimiter_on_tie(self) -> None:
        """When counts tie, ensure deterministic delimiter selection."""

        sample = "name,serial;platform\nrouter,XYZ;core\n"

        result = importer.sniff_csv_dialect(sample, delimiters=(",", ";"))

        assert result == ","


class TestNormalizeHeaders:
    def test_strips_whitespace_and_lowercases(self) -> None:
        """Whitespace and casing should be normalized consistently."""

        headers = [" Name ", "Serial Number", "MGMT IPv4"]

        result = importer.normalize_headers(headers)

        assert result == ["name", "serial_number", "mgmt_ipv4"]

    def test_handles_duplicate_headers(self) -> None:
        """Duplicate headers should be deconflicted with numeric suffixes."""

        headers = ["serial", "Serial", "SERIAL"]

        result = importer.normalize_headers(headers)

        assert result == ["serial", "serial_2", "serial_3"]


class TestLoadCsvRows:
    def test_reads_basic_csv_payload(self) -> None:
        """CSV payloads should be parsed into a list of dictionaries."""

        payload = StringIO("Name,Serial Number\nedge-router,ABC123\n")

        rows = importer.load_csv_rows(payload)

        assert rows == [{"name": "edge-router", "serial_number": "ABC123"}]

    def test_respects_explicit_dialect(self) -> None:
        """Callers can pass a dialect override to force delimiter usage."""

        payload = StringIO("Name;Serial Number\ncore-switch;XYZ789\n")

        rows = importer.load_csv_rows(payload, dialect=";")

        assert rows == [{"name": "core-switch", "serial_number": "XYZ789"}]


class TestLoadNdjsonRows:
    def test_parses_newline_delimited_json(self) -> None:
        """Each line of NDJSON should map to a row dictionary."""

        payload = StringIO("{""name"": ""core-switch""}\n{""name"": ""edge""}\n")

        rows = importer.load_ndjson_rows(payload)

        assert rows == [{"name": "core-switch"}, {"name": "edge"}]

    def test_ignores_blank_lines(self) -> None:
        """Blank lines should be skipped during NDJSON parsing."""

        payload = StringIO("{""name"": ""core""}\n\n{""name"": ""edge""}\n")

        rows = importer.load_ndjson_rows(payload)

        assert rows == [{"name": "core"}, {"name": "edge"}]


class TestLoadJsonRows:
    def test_accepts_string_payload(self) -> None:
        """String payloads with JSON arrays should produce row dictionaries."""

        payload = "[{\"name\": \"core\"}]"

        rows = importer.load_json_rows(payload)

        assert rows == [{"name": "core"}]

    def test_accepts_bytes_payload(self) -> None:
        """Byte payloads should be decoded and parsed identically."""

        payload = b"[{\"name\": \"edge\"}]"

        rows = importer.load_json_rows(payload)

        assert rows == [{"name": "edge"}]


class TestLoadExcelRows:
    def test_reads_first_worksheet_by_default(self, tmp_path: Path) -> None:
        """Excel import should use the first worksheet when none specified."""

        workbook_path = tmp_path / "devices.xlsx"
        _write_excel_fixture(workbook_path)

        rows = importer.load_excel_rows(workbook_path)

        assert rows == [
            {"name": "core-switch", "serial_number": "ABC", "platform": "cisco_ios"},
            {"name": "edge-router", "serial_number": "XYZ", "platform": "juniper_junos"},
        ]

    def test_honors_named_worksheet(self, tmp_path: Path) -> None:
        """Providing a worksheet name should select the matching sheet."""

        workbook_path = tmp_path / "devices.xlsx"
        _write_excel_fixture(workbook_path, secondary_sheet=True)

        rows = importer.load_excel_rows(workbook_path, worksheet="Staging")

        assert rows == [
            {"name": "staging-switch", "serial_number": "STG", "platform": "arista_eos"}
        ]


class TestSummarizeImport:
    def test_counts_rows_and_unique_identifiers(self) -> None:
        """Import summary should expose counts for downstream logging."""

        rows = [
            {"name": "core-switch", "mgmt_ipv4": "10.0.0.1", "serial_number": "ABC"},
            {"name": "edge-router", "mgmt_ipv4": "10.0.0.2", "serial_number": "ABC"},
        ]

        summary = importer.summarize_import(rows)

        assert summary["total_rows"] == 2
        assert summary["unique"]["name"] == 2
        assert summary["unique"]["mgmt_ipv4"] == 2
        assert summary["unique"]["serial_number"] == 1


class TestValidateImportStructure:
    def test_reports_missing_required_fields(self) -> None:
        """Structural validation should report missing columns by name."""

        rows = [{"name": "core-switch"}]

        errors = importer.validate_import_structure(rows, required_fields=["name", "mgmt_ipv4"])

        assert errors == ["Missing required field: mgmt_ipv4"]

    def test_returns_empty_list_when_structure_is_valid(self) -> None:
        """No structural issues should yield an empty error collection."""

        rows = [{"name": "core-switch", "mgmt_ipv4": "10.0.0.1"}]

        errors = importer.validate_import_structure(rows, required_fields=["name", "mgmt_ipv4"])

        assert errors == []


def _write_excel_fixture(path: Path, *, secondary_sheet: bool = False) -> None:
    """Write a simple workbook used for importer tests."""

    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Devices"
    ws.append(["Name", "Serial Number", "Platform"])
    ws.append(["core-switch", "ABC", "cisco_ios"])
    ws.append(["edge-router", "XYZ", "juniper_junos"])

    if secondary_sheet:
        staging = wb.create_sheet("Staging")
        staging.append(["Name", "Serial Number", "Platform"])
        staging.append(["staging-switch", "STG", "arista_eos"])

    wb.save(path)
