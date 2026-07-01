// TODO: Quarterly device lifecycle review requirement
// - All devices should have model_number and os_version populated
// - Reviews should happen quarterly (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec)
// - Current Q1 2026 deadline has passed — all devices are overdue for review
// - Add: compliance rules to check device.model_number and device.os_version are populated
// - Add: badge/alert showing how many devices are missing these fields
// - Add: "devices missing model number" and "devices missing OS version" count cards

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { HardwareLifecycle } from "@/lib/types";

import {
    createHardwareLifecycle,
    deleteHardwareLifecycle,
    fetchHardwareLifecycle,
    updateHardwareLifecycle,
    type HardwareLifecycleInput,
} from "../api/lifecycle.api";
import {
    dateClass,
    formatDate,
    getLifecycleStatus,
    LifecycleDeviceModal,
    LifecycleStatusBadge,
    statusLabel,
    type LifecycleStatus,
} from "../lifecycleUtils";

interface HardwareFormValues {
    product_model_id: string;
    end_of_sale_date: string;
    end_of_software_maintenance_date: string;
    end_of_security_fixes_date: string;
    last_day_of_support_date: string;
    source_url: string;
    notes: string;
}

const EMPTY_FORM: HardwareFormValues = {
    product_model_id: "",
    end_of_sale_date: "",
    end_of_software_maintenance_date: "",
    end_of_security_fixes_date: "",
    last_day_of_support_date: "",
    source_url: "",
    notes: "",
};

const DELETE_PHRASE = "DELETE";

function hardwareStatus(row: HardwareLifecycle): LifecycleStatus {
    return getLifecycleStatus(row.last_day_of_support_date, [
        row.end_of_sale_date,
        row.end_of_software_maintenance_date,
        row.end_of_security_fixes_date,
    ]);
}

function toFormValues(row?: HardwareLifecycle | null): HardwareFormValues {
    if (!row) {
        return EMPTY_FORM;
    }

    const toDateInput = (value?: string) => (value ? value.slice(0, 10) : "");

    return {
        product_model_id: String(row.product_model_id),
        end_of_sale_date: toDateInput(row.end_of_sale_date),
        end_of_software_maintenance_date: toDateInput(row.end_of_software_maintenance_date),
        end_of_security_fixes_date: toDateInput(row.end_of_security_fixes_date),
        last_day_of_support_date: toDateInput(row.last_day_of_support_date),
        source_url: row.source_url ?? "",
        notes: row.notes ?? "",
    };
}

function InfoTooltip({ text }: { text: string }) {
    return (
        <span className="group relative inline-block">
            <svg
                className="ml-1 inline h-3.5 w-3.5 cursor-help text-muted"
                viewBox="0 0 20 20"
                fill="currentColor"
            >
                <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                />
            </svg>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 w-64 -translate-x-1/2 rounded-lg bg-surface border border-primary/20 px-3 py-2 text-xs text-muted opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {text}
            </span>
        </span>
    );
}

export function HardwareEoxPage(): JSX.Element {
    const queryClient = useQueryClient();
    const [productModelFilter, setProductModelFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState<LifecycleStatus | null>(null);
    const [viewingRow, setViewingRow] = useState<HardwareLifecycle | null>(null);
    const [deviceDrillRow, setDeviceDrillRow] = useState<HardwareLifecycle | null>(null);
    const [editingRow, setEditingRow] = useState<HardwareLifecycle | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<HardwareLifecycle | null>(null);
    const [deletePhrase, setDeletePhrase] = useState("");
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [formValues, setFormValues] = useState<HardwareFormValues>(EMPTY_FORM);
    const [formError, setFormError] = useState<string | null>(null);

    const lifecycleQuery = useQuery({
        queryKey: [QUERY_KEYS.hardwareEox],
        queryFn: () => fetchHardwareLifecycle(),
    });

    const devicesQuery = useQuery({
        queryKey: [QUERY_KEYS.devices, { "page[size]": 1000 }],
        queryFn: () => fetchDevices({ "page[size]": 1000 }),
        staleTime: 5 * 60 * 1000,
    });

    const createMutation = useMutation({
        mutationFn: createHardwareLifecycle,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.hardwareEox] });
            toast.success("Hardware lifecycle record created.");
            closeForm();
        },
        onError: (error) => {
            const message = error instanceof Error ? error.message : "Failed to save row.";
            setFormError(message);
            toast.error(message);
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, input }: { id: number; input: Partial<HardwareLifecycleInput> }) =>
            updateHardwareLifecycle(id, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.hardwareEox] });
            toast.success("Hardware lifecycle record updated.");
            closeForm();
        },
        onError: (error) => {
            const message = error instanceof Error ? error.message : "Failed to save row.";
            setFormError(message);
            toast.error(message);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: deleteHardwareLifecycle,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.hardwareEox] });
            toast.success("Hardware lifecycle record deleted.");
            setDeleteTarget(null);
            setDeletePhrase("");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to delete record.");
        },
    });

    const deviceList = useMemo(() => devicesQuery.data?.data ?? [], [devicesQuery.data]);

    const matchDevices = (row: HardwareLifecycle) =>
        deviceList.filter((device) => device.model_number === String(row.product_model_id));

    const rows = useMemo(() => {
        const items = lifecycleQuery.data ?? [];
        const query = productModelFilter.trim();
        return items.filter((row) => {
            const modelMatch = query ? String(row.product_model_id).includes(query) : true;
            const statusMatch = statusFilter ? hardwareStatus(row) === statusFilter : true;
            return modelMatch && statusMatch;
        });
    }, [lifecycleQuery.data, productModelFilter, statusFilter]);

    const summary = useMemo(() => {
        const counts: Record<LifecycleStatus, number> = { past: 0, dueSoon: 0, active: 0 };
        (lifecycleQuery.data ?? []).forEach((row) => {
            counts[hardwareStatus(row)] += 1;
        });
        return counts;
    }, [lifecycleQuery.data]);

    function toggleStatusFilter(status: LifecycleStatus) {
        setStatusFilter((current) => (current === status ? null : status));
    }

    // TODO: Add timeline/Gantt visualization showing lifecycle milestones for all products — helps identify clustering of support end dates

    const columns: ColumnDef<HardwareLifecycle>[] = [
        {
            key: "product_model_id",
            header: "Product Model",
            accessor: (row) => <span className="font-mono text-xs">{row.product_model_id}</span>,
        },
        {
            key: "status",
            header: "Status",
            accessor: (row) => <LifecycleStatusBadge status={hardwareStatus(row)} />,
        },
        {
            key: "devices",
            header: "Devices",
            accessor: (row) => {
                const count = matchDevices(row).length;
                if (count === 0) {
                    return <span className="text-muted">0</span>;
                }
                return (
                    <button
                        type="button"
                        className="font-medium text-primary hover:underline"
                        onClick={(event) => {
                            event.stopPropagation();
                            setDeviceDrillRow(row);
                        }}
                    >
                        {count}
                    </button>
                );
            },
        },
        {
            key: "end_of_sale_date",
            header: "End of Sale",
            accessor: (row) => (
                <span className={dateClass(row.end_of_sale_date)}>{formatDate(row.end_of_sale_date)}</span>
            ),
        },
        {
            key: "end_of_software_maintenance_date",
            header: "SW Maintenance",
            accessor: (row) => (
                <span className={dateClass(row.end_of_software_maintenance_date)}>
                    {formatDate(row.end_of_software_maintenance_date)}
                </span>
            ),
        },
        {
            key: "end_of_security_fixes_date",
            header: "Security Fixes",
            accessor: (row) => (
                <span className={dateClass(row.end_of_security_fixes_date)}>
                    {formatDate(row.end_of_security_fixes_date)}
                </span>
            ),
        },
        {
            key: "last_day_of_support_date",
            header: "Last Day of Support",
            accessor: (row) => (
                <span className={dateClass(row.last_day_of_support_date)}>
                    {formatDate(row.last_day_of_support_date)}
                </span>
            ),
        },
        {
            key: "actions",
            header: "Actions",
            accessor: (row) => (
                <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setEditingRow(row);
                            setFormValues(toFormValues(row));
                            setFormError(null);
                            setIsFormOpen(true);
                        }}
                    >
                        Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => {
                        setDeleteTarget(row);
                        setDeletePhrase("");
                    }}>
                        Delete
                    </Button>
                </div>
            ),
        },
    ];

    function closeForm() {
        setEditingRow(null);
        setFormValues(EMPTY_FORM);
        setFormError(null);
        setIsFormOpen(false);
    }

    function handleFormChange(field: keyof HardwareFormValues, value: string) {
        setFormValues((current) => ({ ...current, [field]: value }));
    }

    function handleSubmit() {
        if (!formValues.product_model_id.trim()) {
            setFormError("Product model ID is required.");
            return;
        }

        const payload: HardwareLifecycleInput = {
            product_model_id: Number(formValues.product_model_id),
            end_of_sale_date: formValues.end_of_sale_date || undefined,
            end_of_software_maintenance_date: formValues.end_of_software_maintenance_date || undefined,
            end_of_security_fixes_date: formValues.end_of_security_fixes_date || undefined,
            last_day_of_support_date: formValues.last_day_of_support_date || undefined,
            source_url: formValues.source_url.trim() || undefined,
            notes: formValues.notes.trim() || undefined,
        };

        setFormError(null);
        if (editingRow) {
            updateMutation.mutate({ id: editingRow.id, input: payload });
            return;
        }
        createMutation.mutate(payload);
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
                <StatCard
                    label="Past EoL"
                    value={summary.past}
                    accent="red"
                    onClick={() => toggleStatusFilter("past")}
                />
                <StatCard
                    label="Due Soon"
                    value={summary.dueSoon}
                    accent="amber"
                    onClick={() => toggleStatusFilter("dueSoon")}
                />
                <StatCard
                    label="Active"
                    value={summary.active}
                    accent="emerald"
                    onClick={() => toggleStatusFilter("active")}
                />
            </div>

            {statusFilter ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                    <span>
                        Filtered by status: <strong className="text-text">{statusLabel(statusFilter)}</strong>
                    </span>
                    <button
                        type="button"
                        className="rounded-full border border-primary/30 px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
                        onClick={() => setStatusFilter(null)}
                    >
                        Clear
                    </button>
                </div>
            ) : null}

            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-[220px]">
                    <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-muted">
                        Product Model
                    </label>
                    <input
                        value={productModelFilter}
                        onChange={(event) => setProductModelFilter(event.target.value)}
                        className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
                        placeholder="1001"
                    />
                </div>
                <Button
                    onClick={() => {
                        setEditingRow(null);
                        setFormValues(EMPTY_FORM);
                        setFormError(null);
                        setIsFormOpen(true);
                    }}
                >
                    New hardware record
                </Button>
            </div>

            <DataTable
                columns={columns}
                data={rows}
                keyExtractor={(row) => row.id}
                isLoading={lifecycleQuery.isLoading}
                isError={lifecycleQuery.isError}
                errorMessage="Unable to load hardware lifecycle data."
                onRetry={() => lifecycleQuery.refetch()}
                onRowClick={(row) => setViewingRow(row)}
                dense
                emptyState={
                    <p className="text-sm text-muted">No hardware lifecycle rows match the current filters.</p>
                }
            />

            <Modal
                isOpen={Boolean(viewingRow)}
                onClose={() => setViewingRow(null)}
                title="Hardware lifecycle record"
                size="lg"
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setViewingRow(null)}>
                            Close
                        </Button>
                        <Button
                            onClick={() => {
                                const row = viewingRow;
                                if (!row) return;
                                setViewingRow(null);
                                setEditingRow(row);
                                setFormValues(toFormValues(row));
                                setFormError(null);
                                setIsFormOpen(true);
                            }}
                        >
                            Edit
                        </Button>
                    </>
                }
            >
                {viewingRow ? (
                    <dl className="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2">
                        <DetailRow label="Status">
                            <LifecycleStatusBadge status={hardwareStatus(viewingRow)} />
                        </DetailRow>
                        <DetailRow label="Product Model">
                            <span className="font-mono">{viewingRow.product_model_id}</span>
                        </DetailRow>
                        <DetailRow label="Affected Devices">
                            {matchDevices(viewingRow).length > 0 ? (
                                <button
                                    type="button"
                                    className="font-medium text-primary hover:underline"
                                    onClick={() => setDeviceDrillRow(viewingRow)}
                                >
                                    {matchDevices(viewingRow).length} device(s)
                                </button>
                            ) : (
                                <span className="text-muted">0</span>
                            )}
                        </DetailRow>
                        <DetailRow label="End of Sale">
                            <span className={dateClass(viewingRow.end_of_sale_date)}>
                                {formatDate(viewingRow.end_of_sale_date)}
                            </span>
                        </DetailRow>
                        <DetailRow label="SW Maintenance">
                            <span className={dateClass(viewingRow.end_of_software_maintenance_date)}>
                                {formatDate(viewingRow.end_of_software_maintenance_date)}
                            </span>
                        </DetailRow>
                        <DetailRow label="Security Fixes">
                            <span className={dateClass(viewingRow.end_of_security_fixes_date)}>
                                {formatDate(viewingRow.end_of_security_fixes_date)}
                            </span>
                        </DetailRow>
                        <DetailRow label="Last Day of Support">
                            <span className={dateClass(viewingRow.last_day_of_support_date)}>
                                {formatDate(viewingRow.last_day_of_support_date)}
                            </span>
                        </DetailRow>
                        <DetailRow label="Source">
                            {viewingRow.source_url ? (
                                <a
                                    href={viewingRow.source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary hover:underline"
                                >
                                    View bulletin
                                </a>
                            ) : (
                                <span className="text-muted">—</span>
                            )}
                        </DetailRow>
                        <div className="sm:col-span-2">
                            <DetailRow label="Notes">
                                <span className="whitespace-pre-wrap">{viewingRow.notes || "—"}</span>
                            </DetailRow>
                        </div>
                    </dl>
                ) : null}
            </Modal>

            <LifecycleDeviceModal
                isOpen={Boolean(deviceDrillRow)}
                onClose={() => setDeviceDrillRow(null)}
                title={
                    deviceDrillRow
                        ? `Devices on model ${deviceDrillRow.product_model_id}`
                        : "Devices"
                }
                devices={deviceDrillRow ? matchDevices(deviceDrillRow) : []}
            />

            <Modal
                isOpen={isFormOpen}
                onClose={closeForm}
                title={editingRow ? "Edit hardware lifecycle row" : "Create hardware lifecycle row"}
                footer={
                    <>
                        <Button variant="ghost" onClick={closeForm}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={createMutation.isPending || updateMutation.isPending}
                        >
                            {editingRow ? "Save row" : "Create row"}
                        </Button>
                    </>
                }
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <p className="md:col-span-2 text-xs text-muted">
                        Fields marked <span className="text-red-500">*</span> are required.
                    </p>

                    {/* Product Model ID — required */}
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-text" htmlFor="product_model_id">
                            Product Model ID
                            <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
                        </label>
                        <input
                            id="product_model_id"
                            name="product_model_id"
                            value={formValues.product_model_id}
                            onChange={(event) => handleFormChange("product_model_id", event.target.value)}
                            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:outline-none"
                        />
                    </div>

                    {/* Source URL with tooltip */}
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-text" htmlFor="hardware_source_url">
                            Source URL
                            <InfoTooltip text="Link to the official vendor lifecycle announcement for this product (e.g., Cisco End-of-Life bulletin URL)" />
                        </label>
                        <input
                            id="hardware_source_url"
                            name="source_url"
                            value={formValues.source_url}
                            onChange={(event) => handleFormChange("source_url", event.target.value)}
                            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:outline-none"
                        />
                    </div>

                    <p className="md:col-span-2 text-xs text-muted">
                        Lifecycle dates can be found in vendor End-of-Life bulletins. Leave any unknown dates
                        blank — they are all optional.
                    </p>

                    <Input
                        label="End Of Sale"
                        name="end_of_sale_date"
                        type="date"
                        value={formValues.end_of_sale_date}
                        onChange={(event) => handleFormChange("end_of_sale_date", event.target.value)}
                    />
                    <Input
                        label="SW Maintenance"
                        name="end_of_software_maintenance_date"
                        type="date"
                        value={formValues.end_of_software_maintenance_date}
                        onChange={(event) =>
                            handleFormChange("end_of_software_maintenance_date", event.target.value)
                        }
                    />
                    <Input
                        label="Security Fixes"
                        name="end_of_security_fixes_date"
                        type="date"
                        value={formValues.end_of_security_fixes_date}
                        onChange={(event) =>
                            handleFormChange("end_of_security_fixes_date", event.target.value)
                        }
                    />
                    <Input
                        label="Last Day Of Support"
                        name="last_day_of_support_date"
                        type="date"
                        value={formValues.last_day_of_support_date}
                        onChange={(event) =>
                            handleFormChange("last_day_of_support_date", event.target.value)
                        }
                    />

                    <div className="space-y-1 md:col-span-2">
                        <label className="block text-sm font-medium text-text" htmlFor="hardware_notes">
                            Notes
                        </label>
                        <textarea
                            id="hardware_notes"
                            value={formValues.notes}
                            onChange={(event) => handleFormChange("notes", event.target.value)}
                            className="min-h-24 w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text shadow-sm transition focus:border-primary focus:outline-none"
                        />
                    </div>

                    {formError ? (
                        <p className="md:col-span-2 text-sm text-red-500">{formError}</p>
                    ) : null}
                </div>
            </Modal>

            <Modal
                isOpen={Boolean(deleteTarget)}
                onClose={() => {
                    setDeleteTarget(null);
                    setDeletePhrase("");
                }}
                title="Delete hardware lifecycle row"
                footer={
                    <>
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setDeleteTarget(null);
                                setDeletePhrase("");
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                            disabled={deleteMutation.isPending || deletePhrase !== DELETE_PHRASE}
                        >
                            Delete row
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <p className="text-sm text-text">
                        Delete lifecycle tracking for product model{" "}
                        <strong>{deleteTarget?.product_model_id}</strong>. This action cannot be undone.
                    </p>
                    <div className="space-y-1">
                        <label
                            className="block text-sm font-medium text-text"
                            htmlFor="hardware_delete_confirm"
                        >
                            Type <span className="font-mono font-bold">{DELETE_PHRASE}</span> to confirm
                        </label>
                        <input
                            id="hardware_delete_confirm"
                            value={deletePhrase}
                            onChange={(event) => setDeletePhrase(event.target.value)}
                            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text shadow-sm transition focus:border-primary focus:outline-none"
                            placeholder={DELETE_PHRASE}
                            autoComplete="off"
                        />
                    </div>
                </div>
            </Modal>
        </div>
    );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }): JSX.Element {
    return (
        <div className="space-y-1">
            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{label}</dt>
            <dd className="text-sm text-text">{children}</dd>
        </div>
    );
}
