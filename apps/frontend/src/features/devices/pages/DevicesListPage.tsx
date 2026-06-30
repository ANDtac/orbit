import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef, CursorPagination, SortingConfig, SelectionConfig } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { QUERY_KEYS } from "@/lib/constants";
import { fetchDevices, deleteDevice } from "../api/devices.api";
import type { DevicesQueryOptions } from "../api/devices.api";
import { DeviceFilters, EMPTY_FILTERS } from "../components/DeviceFilters";
import { CSVImportModal } from "../components/CSVImport/CSVImportModal";
import type { DeviceFilterValues } from "../components/DeviceFilters";
import type { Device } from "@/lib/types";

// ---------------------------------------------------------------------------
// Column visibility config
// ---------------------------------------------------------------------------

interface ColumnConfig {
    key: string;
    label: string;
    defaultVisible: boolean;
}

const COLUMN_CONFIGS: ColumnConfig[] = [
    { key: "name", label: "Name", defaultVisible: true },
    { key: "platform", label: "Platform", defaultVisible: true },
    { key: "os_name", label: "OS", defaultVisible: true },
    { key: "is_active", label: "Status", defaultVisible: true },
    { key: "updated_at", label: "Updated", defaultVisible: true },
    { key: "fqdn", label: "FQDN", defaultVisible: false },
    { key: "mgmt_ipv4", label: "Management IP", defaultVisible: false },
    { key: "mgmt_port", label: "Management Port", defaultVisible: false },
    { key: "serial_number", label: "Serial Number", defaultVisible: false },
    { key: "model_number", label: "Model Number", defaultVisible: false },
    { key: "os_version", label: "OS Version", defaultVisible: false },
    { key: "credential_profile_id", label: "Credential Profile", defaultVisible: false },
    { key: "inventory_group_id", label: "Inventory Group", defaultVisible: false },
    { key: "notes", label: "Notes", defaultVisible: false },
];

function buildDefaultVisibility(): Record<string, boolean> {
    return Object.fromEntries(COLUMN_CONFIGS.map((c) => [c.key, c.defaultVisible]));
}

// ---------------------------------------------------------------------------
// Column visibility dropdown
// ---------------------------------------------------------------------------

interface ColumnsDropdownProps {
    visibility: Record<string, boolean>;
    onChange: (key: string, visible: boolean) => void;
}

function ColumnsDropdown({ visibility, onChange }: ColumnsDropdownProps): JSX.Element {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={open}
            >
                <svg
                    className="mr-1.5 h-3.5 w-3.5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path
                        fillRule="evenodd"
                        d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm1 4a1 1 0 100 2h12a1 1 0 100-2H4z"
                        clipRule="evenodd"
                    />
                </svg>
                Columns
            </Button>
            {open && (
                <div className="absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border border-primary/20 bg-surface p-2 shadow-lg">
                    <p className="mb-1.5 px-2 text-xs font-semibold text-muted uppercase tracking-wide">
                        Toggle Columns
                    </p>
                    {COLUMN_CONFIGS.map((col) => (
                        <label
                            key={col.key}
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text hover:bg-primary/5"
                        >
                            <input
                                type="checkbox"
                                checked={visibility[col.key] ?? col.defaultVisible}
                                onChange={(e) => onChange(col.key, e.target.checked)}
                                className="h-3.5 w-3.5 accent-primary"
                            />
                            {col.label}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Export dropdown
// ---------------------------------------------------------------------------

interface ExportDropdownProps {
    onExportCSV: () => void;
    isExporting: boolean;
}

function ExportDropdown({ onExportCSV, isExporting }: ExportDropdownProps): JSX.Element {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={open}
            >
                <svg
                    className="mr-1.5 h-3.5 w-3.5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path
                        fillRule="evenodd"
                        d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                        clipRule="evenodd"
                    />
                </svg>
                Export
                <svg className="ml-1 h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                    />
                </svg>
            </Button>
            {open && (
                <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-primary/20 bg-surface py-1 shadow-lg">
                    <button
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => {
                            setOpen(false);
                            onExportCSV();
                        }}
                        disabled={isExporting}
                    >
                        <svg className="h-4 w-4 text-muted" viewBox="0 0 20 20" fill="currentColor">
                            <path
                                fillRule="evenodd"
                                d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                                clipRule="evenodd"
                            />
                        </svg>
                        {isExporting ? "Exporting..." : "Export CSV"}
                    </button>

                    {/* TODO: Implement SecureCRT session export — this will generate a session folder
                        structure organized by device platform, compatible with SecureCRT's XML session
                        format. Data is available: device name, mgmt_ipv4, mgmt_port, platform. */}
                    <span className="group relative flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-muted/50 cursor-not-allowed">
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path
                                fillRule="evenodd"
                                d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z"
                                clipRule="evenodd"
                            />
                        </svg>
                        Export for SecureCRT
                        <span className="ml-auto text-[10px] rounded bg-secondary/15 px-1.5 py-0.5 font-medium text-secondary">
                            Soon
                        </span>
                        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 w-64 -translate-x-1/2 rounded-lg bg-surface border border-primary/20 px-3 py-2 text-xs text-muted opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                            SecureCRT session export coming soon. This will generate a session folder
                            structure organized by device platform.
                        </span>
                    </span>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function DevicesListPage(): JSX.Element {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [filters, setFilters] = useState<DeviceFilterValues>(EMPTY_FILTERS);
    const [cursor, setCursor] = useState<string | undefined>();
    const [sortField, setSortField] = useState("name");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
    const [selected, setSelected] = useState<Set<string | number>>(new Set());

    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
    const [deletePhrase, setDeletePhrase] = useState("");
    const [showCSVImport, setShowCSVImport] = useState(false);

    // Bulk delete state
    const [showBulkDelete, setShowBulkDelete] = useState(false);
    const [bulkDeletePhrase, setBulkDeletePhrase] = useState("");
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    // Export state
    const [isExporting, setIsExporting] = useState(false);

    // Column visibility
    const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(
        buildDefaultVisibility,
    );

    function handleColumnVisibilityChange(key: string, visible: boolean) {
        setColumnVisibility((prev) => ({ ...prev, [key]: visible }));
    }

    const queryOptions = useMemo((): DevicesQueryOptions => {
        const opts: DevicesQueryOptions = {
            "page[size]": 25,
            sort: sortDir === "desc" ? `-${sortField}` : sortField,
        };
        if (cursor) opts["page[cursor]"] = cursor;
        if (filters.name) opts["filter[name]"] = filters.name;
        if (filters.platformId) opts["filter[platform_id]"] = Number(filters.platformId);
        if (filters.groupId) opts["filter[inventory_group_id]"] = Number(filters.groupId);
        if (filters.isActive) opts["filter[is_active]"] = filters.isActive;
        if (filters.osName) opts["filter[os_name]"] = filters.osName;
        return opts;
    }, [filters, cursor, sortField, sortDir]);

    const { data: response, isLoading, isError, refetch } = useQuery({
        queryKey: [QUERY_KEYS.devices, queryOptions],
        queryFn: () => fetchDevices(queryOptions),
    });

    const deleteMutation = useMutation({
        mutationFn: deleteDevice,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.devices] });
            setDeleteConfirmId(null);
            setDeletePhrase("");
            setSelected(new Set());
            toast.success("Device deleted");
        },
        onError: () => {
            toast.error("Failed to delete device");
        },
    });

    // ---------------------------------------------------------------------------
    // Bulk delete handler
    // ---------------------------------------------------------------------------
    async function handleBulkDelete() {
        setIsBulkDeleting(true);
        const ids = Array.from(selected).map(Number);
        let successCount = 0;
        let failCount = 0;

        await Promise.all(
            ids.map(async (id) => {
                try {
                    await deleteDevice(id);
                    successCount++;
                } catch {
                    failCount++;
                }
            }),
        );

        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.devices] });
        setShowBulkDelete(false);
        setBulkDeletePhrase("");
        setSelected(new Set());
        setIsBulkDeleting(false);

        if (successCount > 0) {
            toast.success(`${successCount} device${successCount !== 1 ? "s" : ""} deleted`);
        }
        if (failCount > 0) {
            toast.error(`${failCount} device${failCount !== 1 ? "s" : ""} failed to delete`);
        }
    }

    // ---------------------------------------------------------------------------
    // CSV export handler
    // ---------------------------------------------------------------------------
    async function handleExportCSV() {
        setIsExporting(true);
        try {
            const exportOpts: DevicesQueryOptions = {
                "page[size]": 1000,
                sort: sortDir === "desc" ? `-${sortField}` : sortField,
            };
            if (filters.name) exportOpts["filter[name]"] = filters.name;
            if (filters.platformId) exportOpts["filter[platform_id]"] = Number(filters.platformId);
            if (filters.groupId) exportOpts["filter[inventory_group_id]"] = Number(filters.groupId);
            if (filters.isActive) exportOpts["filter[is_active]"] = filters.isActive;
            if (filters.osName) exportOpts["filter[os_name]"] = filters.osName;

            const result = await fetchDevices(exportOpts);
            const devices = result.data;

            const headers = [
                "name",
                "fqdn",
                "mgmt_ipv4",
                "mgmt_port",
                "os_name",
                "os_version",
                "serial_number",
                "model_number",
                "is_active",
            ];

            function escapeCSV(value: unknown): string {
                if (value === null || value === undefined) return "";
                const str = String(value);
                if (str.includes(",") || str.includes('"') || str.includes("\n")) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            }

            const rows = devices.map((d) =>
                [
                    d.name,
                    d.fqdn,
                    d.mgmt_ipv4,
                    d.mgmt_port,
                    d.os_name,
                    d.os_version,
                    d.serial_number,
                    d.model_number,
                    d.is_active,
                ]
                    .map(escapeCSV)
                    .join(","),
            );

            const csv = [headers.join(","), ...rows].join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `orbit-devices-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast.success(`Exported ${devices.length} devices`);
        } catch {
            toast.error("Failed to export devices");
        } finally {
            setIsExporting(false);
        }
    }

    const handleFilterChange = useCallback((newFilters: DeviceFilterValues) => {
        setFilters(newFilters);
        setCursor(undefined);
        setSelected(new Set());
    }, []);

    const handleSort = useCallback((field: string, direction: "asc" | "desc") => {
        setSortField(field);
        setSortDir(direction);
        setCursor(undefined);
    }, []);

    const handlePageChange = useCallback((newCursor: string | undefined) => {
        setCursor(newCursor);
        setSelected(new Set());
    }, []);

    const devices = response?.data ?? [];
    const page = response?.page;

    // ---------------------------------------------------------------------------
    // All columns definition (filtered by visibility below)
    // ---------------------------------------------------------------------------
    const allColumns: ColumnDef<Device>[] = useMemo(
        () => [
            {
                key: "name",
                header: "Name",
                accessor: (d) => <span className="font-medium">{d.name}</span>,
                sortable: true,
            },
            {
                key: "platform",
                header: "Platform",
                accessor: (d) =>
                    d.platform_id ? (
                        <span className="text-xs text-muted">ID:{d.platform_id}</span>
                    ) : (
                        "—"
                    ),
            },
            {
                key: "os_name",
                header: "OS",
                accessor: (d) =>
                    d.os_name
                        ? `${d.os_name}${d.os_version ? ` ${d.os_version}` : ""}`
                        : "—",
                sortable: true,
                sortKey: "os_name",
            },
            {
                key: "is_active",
                header: "Status",
                accessor: (d) => (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <span
                            className={`inline-block h-2 w-2 rounded-full ${
                                d.is_active !== false ? "bg-green-500" : "bg-red-400"
                            }`}
                        />
                        {d.is_active !== false ? "Active" : "Inactive"}
                    </span>
                ),
            },
            {
                key: "updated_at",
                header: "Updated",
                accessor: (d) =>
                    d.updated_at
                        ? new Date(d.updated_at).toLocaleDateString()
                        : "—",
                sortable: true,
            },
            {
                key: "fqdn",
                header: "FQDN",
                accessor: (d) =>
                    d.fqdn ? (
                        <span className="font-mono text-xs">{d.fqdn}</span>
                    ) : (
                        "—"
                    ),
            },
            {
                key: "mgmt_ipv4",
                header: "Management IP",
                accessor: (d) => (
                    <span className="font-mono text-xs">{d.mgmt_ipv4 ?? "—"}</span>
                ),
                sortable: true,
            },
            {
                key: "mgmt_port",
                header: "Mgmt Port",
                accessor: (d) => d.mgmt_port ?? "—",
            },
            {
                key: "serial_number",
                header: "Serial Number",
                accessor: (d) =>
                    d.serial_number ? (
                        <span className="font-mono text-xs">{d.serial_number}</span>
                    ) : (
                        "—"
                    ),
            },
            {
                key: "model_number",
                header: "Model Number",
                accessor: (d) => d.model_number ?? "—",
            },
            {
                key: "os_version",
                header: "OS Version",
                accessor: (d) => d.os_version ?? "—",
            },
            {
                key: "credential_profile_id",
                header: "Credential Profile",
                accessor: (d) =>
                    d.credential_profile_id ? `Profile #${d.credential_profile_id}` : "—",
            },
            {
                key: "inventory_group_id",
                header: "Inventory Group",
                accessor: (d) =>
                    d.inventory_group_id ? `Group #${d.inventory_group_id}` : "—",
            },
            {
                key: "notes",
                header: "Notes",
                accessor: (d) =>
                    d.notes ? (
                        <span className="max-w-xs truncate text-xs text-muted">{d.notes}</span>
                    ) : (
                        "—"
                    ),
            },
        ],
        [],
    );

    const columns = useMemo(
        () => allColumns.filter((col) => columnVisibility[col.key] !== false),
        [allColumns, columnVisibility],
    );

    const sorting: SortingConfig = {
        field: sortField,
        direction: sortDir,
        onSort: handleSort,
    };

    const pagination: CursorPagination = {
        mode: "cursor",
        cursor: page?.cursor,
        next: page?.next,
        prev: page?.prev,
        total: page?.total,
        pageSize: 25,
        onPageChange: handlePageChange,
    };

    const selection: SelectionConfig = {
        selected,
        onSelectionChange: setSelected,
    };

    const selectedCount = selected.size;

    const bulkActions = (
        <div className="flex items-center gap-2">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                    setBulkDeletePhrase("");
                    setShowBulkDelete(true);
                }}
            >
                Delete selected ({selectedCount})
            </Button>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                    <DeviceFilters values={filters} onChange={handleFilterChange} />
                </div>
                <div className="flex items-center gap-2">
                    <ColumnsDropdown
                        visibility={columnVisibility}
                        onChange={handleColumnVisibilityChange}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCSVImport(true)}
                    >
                        Import CSV
                    </Button>
                    <ExportDropdown onExportCSV={handleExportCSV} isExporting={isExporting} />
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => navigate("/inventory/devices/new")}
                    >
                        Add Device
                    </Button>
                </div>
            </div>

            <DataTable
                columns={columns}
                data={devices}
                keyExtractor={(d) => d.id}
                sorting={sorting}
                pagination={pagination}
                selection={selection}
                bulkActions={bulkActions}
                isLoading={isLoading}
                isError={isError}
                errorMessage="Unable to load devices right now."
                onRetry={() => refetch()}
                onRowClick={(d) => navigate(`/inventory/devices/${d.id}`)}
                dense
                emptyState={
                    <div className="py-4 text-center">
                        <p className="text-sm text-muted">
                            No devices found. Add a device to get started.
                        </p>
                        <Button
                            variant="primary"
                            size="sm"
                            className="mt-3"
                            onClick={() => navigate("/inventory/devices/new")}
                        >
                            Add your first device
                        </Button>
                    </div>
                }
            />

            {/* CSV Import modal */}
            {showCSVImport && (
                <CSVImportModal onClose={() => setShowCSVImport(false)} />
            )}

            {/* Single-device delete confirmation modal */}
            <Modal
                isOpen={deleteConfirmId !== null}
                title="Delete Device"
                onClose={() => {
                    setDeleteConfirmId(null);
                    setDeletePhrase("");
                }}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setDeleteConfirmId(null);
                                setDeletePhrase("");
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={deletePhrase !== "DELETE" || deleteMutation.isPending}
                            onClick={() => {
                                if (deleteConfirmId !== null) {
                                    deleteMutation.mutate(deleteConfirmId);
                                }
                            }}
                        >
                            {deleteMutation.isPending ? "Deleting..." : "Confirm Delete"}
                        </Button>
                    </div>
                }
            >
                <p className="text-sm text-text">
                    This action cannot be undone. Type{" "}
                    <strong className="font-mono">DELETE</strong> to confirm.
                </p>
                <input
                    type="text"
                    value={deletePhrase}
                    onChange={(e) => setDeletePhrase(e.target.value)}
                    placeholder="Type DELETE"
                    className="mt-3 w-full rounded-lg border border-primary/20 bg-background px-3 py-2 text-sm text-text placeholder:text-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                    autoFocus
                />
            </Modal>

            {/* Bulk delete confirmation modal */}
            <Modal
                isOpen={showBulkDelete}
                title="Delete Selected Devices"
                onClose={() => {
                    setShowBulkDelete(false);
                    setBulkDeletePhrase("");
                }}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setShowBulkDelete(false);
                                setBulkDeletePhrase("");
                            }}
                            disabled={isBulkDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={bulkDeletePhrase !== "DELETE" || isBulkDeleting}
                            onClick={handleBulkDelete}
                        >
                            {isBulkDeleting
                                ? "Deleting..."
                                : `Delete ${selectedCount} Device${selectedCount !== 1 ? "s" : ""}`}
                        </Button>
                    </div>
                }
            >
                <p className="text-sm text-text">
                    Delete <strong>{selectedCount}</strong> selected device
                    {selectedCount !== 1 ? "s" : ""}? This cannot be undone.
                    Type <strong className="font-mono">DELETE</strong> to confirm.
                </p>
                <input
                    type="text"
                    value={bulkDeletePhrase}
                    onChange={(e) => setBulkDeletePhrase(e.target.value)}
                    placeholder="Type DELETE"
                    className="mt-3 w-full rounded-lg border border-primary/20 bg-background px-3 py-2 text-sm text-text placeholder:text-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                    autoFocus
                />
            </Modal>
        </div>
    );
}
