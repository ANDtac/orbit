import { useState } from "react";
import Papa from "papaparse";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { QUERY_KEYS } from "@/lib/constants";
import { createDevice } from "../../api/devices.api";
import type { DeviceCreateInput } from "@/lib/types";

interface CSVImportModalProps {
    onClose: () => void;
}

type Step = "upload" | "mapping" | "validation" | "importing" | "results";

interface ColumnMapping {
    [csvColumn: string]: keyof DeviceCreateInput | "";
}

const DEVICE_FIELDS: { key: keyof DeviceCreateInput; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "fqdn", label: "FQDN" },
    { key: "mgmt_ipv4", label: "Management IP" },
    { key: "mgmt_port", label: "Management Port" },
    { key: "os_name", label: "OS Name" },
    { key: "os_version", label: "OS Version" },
    { key: "serial_number", label: "Serial Number" },
    { key: "model_number", label: "Model Number" },
    { key: "notes", label: "Notes" },
];

const AUTO_MAP: Record<string, keyof DeviceCreateInput> = {
    name: "name",
    hostname: "name",
    device_name: "name",
    fqdn: "fqdn",
    ip: "mgmt_ipv4",
    ip_address: "mgmt_ipv4",
    mgmt_ipv4: "mgmt_ipv4",
    management_ip: "mgmt_ipv4",
    port: "mgmt_port",
    mgmt_port: "mgmt_port",
    os: "os_name",
    os_name: "os_name",
    os_version: "os_version",
    version: "os_version",
    serial: "serial_number",
    serial_number: "serial_number",
    model: "model_number",
    model_number: "model_number",
    notes: "notes",
};

export function CSVImportModal({ onClose }: CSVImportModalProps): JSX.Element {
    const queryClient = useQueryClient();
    const [step, setStep] = useState<Step>("upload");
    const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
    const [csvColumns, setCsvColumns] = useState<string[]>([]);
    const [mapping, setMapping] = useState<ColumnMapping>({});
    const [importResults, setImportResults] = useState<{
        success: number;
        failed: number;
        errors: string[];
    }>({ success: 0, failed: 0, errors: [] });
    const [importProgress, setImportProgress] = useState(0);

    function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const data = results.data as Record<string, string>[];
                const columns = results.meta.fields ?? [];
                setCsvData(data);
                setCsvColumns(columns);

                const autoMapping: ColumnMapping = {};
                for (const col of columns) {
                    const normalized = col.toLowerCase().trim().replace(/\s+/g, "_");
                    if (AUTO_MAP[normalized]) {
                        autoMapping[col] = AUTO_MAP[normalized];
                    }
                }
                setMapping(autoMapping);
                setStep("mapping");
            },
        });
    }

    function getValidatedRows(): { valid: DeviceCreateInput[]; errors: string[] } {
        const valid: DeviceCreateInput[] = [];
        const errors: string[] = [];

        for (let i = 0; i < csvData.length; i++) {
            const row = csvData[i];
            const device: Partial<DeviceCreateInput> = {};

            for (const [csvCol, fieldKey] of Object.entries(mapping)) {
                if (!fieldKey) continue;
                const value = row[csvCol]?.trim();
                if (!value) continue;
                if (fieldKey === "mgmt_port") {
                    device[fieldKey] = Number(value);
                } else {
                    (device as Record<string, unknown>)[fieldKey] = value;
                }
            }

            if (!device.name) {
                errors.push(`Row ${i + 1}: Missing required field "name"`);
            } else {
                valid.push(device as DeviceCreateInput);
            }
        }

        return { valid, errors };
    }

    function handleProceedToValidation() {
        setStep("validation");
    }

    async function handleImport() {
        setStep("importing");
        const { valid } = getValidatedRows();
        let success = 0;
        let failed = 0;
        const errors: string[] = [];

        for (let i = 0; i < valid.length; i++) {
            try {
                await createDevice(valid[i]);
                success++;
            } catch (err) {
                failed++;
                errors.push(`${valid[i].name}: ${err instanceof Error ? err.message : "Unknown error"}`);
            }
            setImportProgress(i + 1);
        }

        setImportResults({ success, failed, errors });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.devices] });
        setStep("results");
    }

    const { valid: validRows, errors: validationErrors } =
        step === "validation" || step === "importing" || step === "results"
            ? getValidatedRows()
            : { valid: [], errors: [] };

    return (
        <Modal
            isOpen
            title="Import Devices from CSV"
            onClose={onClose}
            footer={
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        {step === "results" ? "Done" : "Cancel"}
                    </Button>
                    {step === "mapping" && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleProceedToValidation}
                            disabled={!Object.values(mapping).includes("name")}
                        >
                            Validate
                        </Button>
                    )}
                    {step === "validation" && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleImport}
                            disabled={validRows.length === 0}
                        >
                            Import {validRows.length} Devices
                        </Button>
                    )}
                </div>
            }
        >
            {/* Upload */}
            {step === "upload" && (
                <div className="space-y-4">
                    <div className="py-6 text-center">
                        <label className="cursor-pointer rounded-xl border-2 border-dashed border-primary/20 bg-primary/5 p-8 transition hover:border-primary/40 block">
                            <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            <p className="text-sm font-medium text-primary">Click to upload CSV file</p>
                            <p className="mt-1 text-xs text-muted">
                                Headers should include: name/hostname, ip, os_name, os_version, serial, etc.
                            </p>
                        </label>
                    </div>
                    <div className="text-center">
                        <button
                            type="button"
                            className="text-xs text-primary underline-offset-2 hover:underline"
                            onClick={() => {
                                const headers = "name,fqdn,mgmt_ipv4,mgmt_port,os_name,os_version,serial_number,model_number,notes";
                                const example = "switch01,switch01.corp.example.com,10.0.0.1,22,ios-xe,17.3.4,FXS1234567,C9300-48P,Example device";
                                const csv = `${headers}\n${example}\n`;
                                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement("a");
                                link.href = url;
                                link.download = "orbit-devices-template.csv";
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                URL.revokeObjectURL(url);
                            }}
                        >
                            Download template CSV
                        </button>
                    </div>
                </div>
            )}

            {/* Mapping */}
            {step === "mapping" && (
                <div className="space-y-4">
                    <p className="text-sm text-muted">
                        Found {csvData.length} rows and {csvColumns.length} columns. Map CSV columns to device fields:
                    </p>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                        {csvColumns.map((col) => (
                            <div key={col} className="flex items-center gap-3">
                                <span className="w-40 truncate text-sm font-mono text-text">{col}</span>
                                <span className="text-xs text-muted">→</span>
                                <select
                                    value={mapping[col] ?? ""}
                                    onChange={(e) =>
                                        setMapping((prev) => ({
                                            ...prev,
                                            [col]: e.target.value as keyof DeviceCreateInput | "",
                                        }))
                                    }
                                    className="flex-1 rounded-lg border border-primary/20 bg-background px-2 py-1.5 text-sm text-text"
                                >
                                    <option value="">— Skip —</option>
                                    {DEVICE_FIELDS.map((f) => (
                                        <option key={f.key} value={f.key}>
                                            {f.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ))}
                    </div>
                    {csvData.length > 0 && (
                        <div>
                            <p className="mb-1 text-xs font-medium text-muted">Preview (first 3 rows):</p>
                            <div className="overflow-x-auto rounded-lg border border-primary/10">
                                <table className="min-w-full text-xs">
                                    <thead className="bg-primary/5">
                                        <tr>
                                            {csvColumns.map((col) => (
                                                <th key={col} className="px-2 py-1 text-left font-medium text-muted">
                                                    {col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {csvData.slice(0, 3).map((row, i) => (
                                            <tr key={i} className="border-t border-primary/5">
                                                {csvColumns.map((col) => (
                                                    <td key={col} className="px-2 py-1 text-text">
                                                        {row[col] ?? ""}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Validation */}
            {step === "validation" && (
                <div className="space-y-3">
                    <div className="flex gap-4">
                        <div className="rounded-lg bg-green-500/10 px-3 py-2 text-center">
                            <p className="text-lg font-semibold text-green-600">{validRows.length}</p>
                            <p className="text-xs text-muted">Valid</p>
                        </div>
                        <div className="rounded-lg bg-red-400/10 px-3 py-2 text-center">
                            <p className="text-lg font-semibold text-red-500">{validationErrors.length}</p>
                            <p className="text-xs text-muted">Errors</p>
                        </div>
                    </div>
                    {validationErrors.length > 0 && (
                        <div className="max-h-32 overflow-y-auto rounded-lg bg-red-400/5 p-2">
                            {validationErrors.map((err, i) => (
                                <p key={i} className="text-xs text-red-500">{err}</p>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Importing */}
            {step === "importing" && (
                <div className="py-6 text-center">
                    <p className="text-sm text-muted">
                        Importing {importProgress} of {validRows.length}...
                    </p>
                    <div
                        className="mx-auto mt-3 h-2 w-64 overflow-hidden rounded-full bg-primary/10"
                        role="progressbar"
                        aria-valuenow={importProgress}
                        aria-valuemin={0}
                        aria-valuemax={validRows.length}
                        aria-label="Import progress"
                    >
                        <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{
                                width: `${validRows.length > 0 ? (importProgress / validRows.length) * 100 : 0}%`,
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Results */}
            {step === "results" && (
                <div className="space-y-3">
                    <div className="flex gap-4">
                        <div className="rounded-lg bg-green-500/10 px-4 py-3 text-center">
                            <p className="text-xl font-semibold text-green-600">{importResults.success}</p>
                            <p className="text-xs text-muted">Imported</p>
                        </div>
                        {importResults.failed > 0 && (
                            <div className="rounded-lg bg-red-400/10 px-4 py-3 text-center">
                                <p className="text-xl font-semibold text-red-500">{importResults.failed}</p>
                                <p className="text-xs text-muted">Failed</p>
                            </div>
                        )}
                    </div>
                    {importResults.errors.length > 0 && (
                        <div className="max-h-32 overflow-y-auto rounded-lg bg-red-400/5 p-2">
                            {importResults.errors.map((err, i) => (
                                <p key={i} className="text-xs text-red-500">{err}</p>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
