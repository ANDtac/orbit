import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchPlatforms } from "@/features/devices/api/platforms.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { SoftwareLifecycle } from "@/lib/types";

import {
    createSoftwareLifecycle,
    deleteSoftwareLifecycle,
    fetchSoftwareLifecycle,
    updateSoftwareLifecycle,
    type SoftwareLifecycleInput,
} from "../api/lifecycle.api";

interface SoftwareFormValues {
    platform_id: string;
    os_name: string;
    match_operator: SoftwareLifecycle["match_operator"];
    match_value: string;
    end_of_sale_date: string;
    end_of_software_maintenance_date: string;
    end_of_security_fixes_date: string;
    last_day_of_support_date: string;
    source_url: string;
    notes: string;
}

const EMPTY_FORM: SoftwareFormValues = {
    platform_id: "",
    os_name: "",
    match_operator: "eq",
    match_value: "",
    end_of_sale_date: "",
    end_of_software_maintenance_date: "",
    end_of_security_fixes_date: "",
    last_day_of_support_date: "",
    source_url: "",
    notes: "",
};

const DELETE_PHRASE = "DELETE";

const MATCH_VALUE_PLACEHOLDERS: Record<SoftwareLifecycle["match_operator"], string> = {
    eq: "17.3.4a",
    prefix: "17.3",
    regex: "^17\\.3\\..*",
};

function isPast(value?: string): boolean {
    return value ? new Date(value) < new Date() : false;
}

function isDueSoon(value?: string, days = 90): boolean {
    if (!value) return false;
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);
    const date = new Date(value);
    return date >= now && date <= future;
}

function formatDate(value?: string): string {
    return value ? new Date(value).toLocaleDateString() : "—";
}

function dateClass(value?: string): string {
    if (!value) return "text-muted";
    if (isPast(value)) return "text-red-500";
    if (isDueSoon(value)) return "text-amber-500";
    return "text-text";
}

function toFormValues(row?: SoftwareLifecycle | null): SoftwareFormValues {
    if (!row) {
        return EMPTY_FORM;
    }

    const toDateInput = (value?: string) => (value ? value.slice(0, 10) : "");

    return {
        platform_id: row.platform_id ? String(row.platform_id) : "",
        os_name: row.os_name,
        match_operator: row.match_operator,
        match_value: row.match_value,
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

function countMatchingDevices(
    devices: Array<{ os_name?: string; os_version?: string }>,
    row: SoftwareLifecycle,
): number {
    return devices.filter((device) => {
        if (device.os_name !== row.os_name) return false;
        const version = device.os_version ?? "";
        switch (row.match_operator) {
            case "eq":
                return version === row.match_value;
            case "prefix":
                return version.startsWith(row.match_value);
            case "regex": {
                try {
                    return new RegExp(row.match_value).test(version);
                } catch {
                    return false;
                }
            }
            default:
                return false;
        }
    }).length;
}

export function SoftwareEoxPage(): JSX.Element {
    const queryClient = useQueryClient();
    const [platformFilter, setPlatformFilter] = useState("");
    const [osNameFilter, setOsNameFilter] = useState("");
    const [editingRow, setEditingRow] = useState<SoftwareLifecycle | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<SoftwareLifecycle | null>(null);
    const [deletePhrase, setDeletePhrase] = useState("");
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [formValues, setFormValues] = useState<SoftwareFormValues>(EMPTY_FORM);
    const [formError, setFormError] = useState<string | null>(null);

    const lifecycleQuery = useQuery({
        queryKey: [QUERY_KEYS.softwareEox],
        queryFn: () => fetchSoftwareLifecycle(),
    });

    const platformsQuery = useQuery({
        queryKey: [QUERY_KEYS.platforms],
        queryFn: fetchPlatforms,
        staleTime: 5 * 60 * 1000,
    });

    const devicesQuery = useQuery({
        queryKey: [QUERY_KEYS.devices, { "page[size]": 1000 }],
        queryFn: () => fetchDevices({ "page[size]": 1000 }),
        staleTime: 5 * 60 * 1000,
    });

    const createMutation = useMutation({
        mutationFn: createSoftwareLifecycle,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.softwareEox] });
            toast.success("Software lifecycle record created.");
            closeForm();
        },
        onError: (error) => {
            const message = error instanceof Error ? error.message : "Failed to save row.";
            setFormError(message);
            toast.error(message);
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, input }: { id: number; input: Partial<SoftwareLifecycleInput> }) =>
            updateSoftwareLifecycle(id, input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.softwareEox] });
            toast.success("Software lifecycle record updated.");
            closeForm();
        },
        onError: (error) => {
            const message = error instanceof Error ? error.message : "Failed to save row.";
            setFormError(message);
            toast.error(message);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: deleteSoftwareLifecycle,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.softwareEox] });
            toast.success("Software lifecycle record deleted.");
            setDeleteTarget(null);
            setDeletePhrase("");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to delete record.");
        },
    });

    const platformNames = useMemo(
        () =>
            (platformsQuery.data ?? []).reduce<Record<number, string>>((acc, platform) => {
                acc[platform.id] = platform.display_name;
                return acc;
            }, {}),
        [platformsQuery.data],
    );

    const deviceList = useMemo(() => devicesQuery.data?.data ?? [], [devicesQuery.data]);

    const rows = useMemo(() => {
        return (lifecycleQuery.data ?? []).filter((row) => {
            const platformMatch = platformFilter ? String(row.platform_id ?? "") === platformFilter : true;
            const osMatch = osNameFilter
                ? row.os_name.toLowerCase().includes(osNameFilter.toLowerCase())
                : true;
            return platformMatch && osMatch;
        });
    }, [lifecycleQuery.data, osNameFilter, platformFilter]);

    const summary = useMemo(
        () => ({
            pastEos: (lifecycleQuery.data ?? []).filter((row) => isPast(row.end_of_sale_date)).length,
            dueSoon: (lifecycleQuery.data ?? []).filter((row) =>
                [
                    row.end_of_sale_date,
                    row.end_of_software_maintenance_date,
                    row.end_of_security_fixes_date,
                    row.last_day_of_support_date,
                ].some((value) => isDueSoon(value)),
            ).length,
        }),
        [lifecycleQuery.data],
    );

    // TODO: Add 'Test match' button that shows which devices in inventory match the current OS Name + Operator + Value combination before saving

    const columns: ColumnDef<SoftwareLifecycle>[] = [
        {
            key: "platform_id",
            header: "Platform",
            accessor: (row) => platformNames[row.platform_id ?? 0] ?? "Any platform",
        },
        {
            key: "os_name",
            header: "OS",
            accessor: (row) => (
                <div>
                    <div className="font-medium text-text">{row.os_name}</div>
                    <div className="font-mono text-xs text-muted">
                        {row.match_operator}:{row.match_value}
                    </div>
                </div>
            ),
        },
        {
            key: "devices",
            header: "Devices",
            accessor: (row) => {
                const count = countMatchingDevices(deviceList, row);
                if (count === 0) {
                    return <span className="text-muted">0</span>;
                }
                // TODO: Link to device list filtered by OS version once that filter is available
                return <span className="font-medium text-text">{count}</span>;
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
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setDeleteTarget(row);
                            setDeletePhrase("");
                        }}
                    >
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

    function handleFormChange(field: keyof SoftwareFormValues, value: string) {
        setFormValues((current) => ({ ...current, [field]: value }));
    }

    function handleSubmit() {
        if (!formValues.os_name.trim() || !formValues.match_value.trim()) {
            setFormError("OS name and match value are required.");
            return;
        }

        const payload: SoftwareLifecycleInput = {
            platform_id: formValues.platform_id ? Number(formValues.platform_id) : undefined,
            os_name: formValues.os_name.trim(),
            match_operator: formValues.match_operator,
            match_value: formValues.match_value.trim(),
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
            <div className="grid gap-3 md:grid-cols-2">
                <SummaryCard label="Past EoS" value={summary.pastEos} tone="danger" />
                <SummaryCard label="Due In 90 Days" value={summary.dueSoon} tone="warning" />
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-end gap-3">
                    {/* TODO: Add 'Test match' button that shows which devices in inventory match the current OS Name + Operator + Value combination before saving */}
                    <div className="min-w-[220px]">
                        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-muted">
                            OS Name
                        </label>
                        <input
                            value={osNameFilter}
                            onChange={(event) => setOsNameFilter(event.target.value)}
                            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
                            placeholder="ios-xe"
                        />
                    </div>
                    <div className="min-w-[220px]">
                        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-muted">
                            Platform
                        </label>
                        <select
                            value={platformFilter}
                            onChange={(event) => setPlatformFilter(event.target.value)}
                            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
                        >
                            <option value="">All platforms</option>
                            {(platformsQuery.data ?? []).map((platform) => (
                                <option key={platform.id} value={String(platform.id)}>
                                    {platform.display_name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <Button
                    onClick={() => {
                        setEditingRow(null);
                        setFormValues(EMPTY_FORM);
                        setFormError(null);
                        setIsFormOpen(true);
                    }}
                >
                    New software record
                </Button>
            </div>

            <DataTable
                columns={columns}
                data={rows}
                keyExtractor={(row) => row.id}
                isLoading={lifecycleQuery.isLoading || platformsQuery.isLoading}
                isError={lifecycleQuery.isError || platformsQuery.isError}
                errorMessage="Unable to load software lifecycle data."
                onRetry={() => {
                    lifecycleQuery.refetch();
                    platformsQuery.refetch();
                }}
                onRowClick={(row) => {
                    setEditingRow(row);
                    setFormValues(toFormValues(row));
                    setFormError(null);
                    setIsFormOpen(true);
                }}
                dense
                emptyState={
                    <p className="text-sm text-muted">No software lifecycle rows match the current filters.</p>
                }
            />

            <Modal
                isOpen={isFormOpen}
                onClose={closeForm}
                title={editingRow ? "Edit software lifecycle row" : "Create software lifecycle row"}
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

                    {/* Platform (optional) */}
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-text" htmlFor="software_platform">
                            Platform
                        </label>
                        <select
                            id="software_platform"
                            value={formValues.platform_id}
                            onChange={(event) => handleFormChange("platform_id", event.target.value)}
                            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
                        >
                            <option value="">Any platform</option>
                            {(platformsQuery.data ?? []).map((platform) => (
                                <option key={platform.id} value={String(platform.id)}>
                                    {platform.display_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* OS Name — required */}
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-text" htmlFor="software_os_name">
                            OS Name
                            <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
                        </label>
                        <input
                            id="software_os_name"
                            name="software_os_name"
                            value={formValues.os_name}
                            onChange={(event) => handleFormChange("os_name", event.target.value)}
                            placeholder="ios-xe"
                            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:outline-none"
                        />
                    </div>

                    {/* Match Operator with tooltip */}
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-text" htmlFor="match_operator">
                            Match Operator
                            <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
                            <InfoTooltip text="How Orbit matches this record to devices by OS version. Equals: exact match. Prefix: version starts with value (e.g. '17.3' matches '17.3.1'). Regex: advanced pattern matching." />
                        </label>
                        <select
                            id="match_operator"
                            value={formValues.match_operator}
                            onChange={(event) =>
                                handleFormChange(
                                    "match_operator",
                                    event.target.value as SoftwareLifecycle["match_operator"],
                                )
                            }
                            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
                        >
                            <option value="eq">Equals</option>
                            <option value="prefix">Prefix</option>
                            <option value="regex">Regex</option>
                        </select>
                    </div>

                    {/* Match Value — required, dynamic placeholder */}
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-text" htmlFor="match_value">
                            Match Value
                            <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
                        </label>
                        <input
                            id="match_value"
                            name="match_value"
                            value={formValues.match_value}
                            onChange={(event) => handleFormChange("match_value", event.target.value)}
                            placeholder={MATCH_VALUE_PLACEHOLDERS[formValues.match_operator]}
                            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:outline-none"
                        />
                    </div>

                    <p className="md:col-span-2 text-xs text-muted">
                        Lifecycle dates can be found in vendor software release notes and End-of-Life bulletins.
                    </p>

                    <Input
                        label="End Of Sale"
                        name="software_end_of_sale_date"
                        type="date"
                        value={formValues.end_of_sale_date}
                        onChange={(event) => handleFormChange("end_of_sale_date", event.target.value)}
                    />
                    <Input
                        label="SW Maintenance"
                        name="software_maintenance_date"
                        type="date"
                        value={formValues.end_of_software_maintenance_date}
                        onChange={(event) =>
                            handleFormChange("end_of_software_maintenance_date", event.target.value)
                        }
                    />
                    <Input
                        label="Security Fixes"
                        name="software_security_date"
                        type="date"
                        value={formValues.end_of_security_fixes_date}
                        onChange={(event) =>
                            handleFormChange("end_of_security_fixes_date", event.target.value)
                        }
                    />
                    <Input
                        label="Last Day Of Support"
                        name="software_ldos_date"
                        type="date"
                        value={formValues.last_day_of_support_date}
                        onChange={(event) =>
                            handleFormChange("last_day_of_support_date", event.target.value)
                        }
                    />

                    {/* Source URL with tooltip */}
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-text" htmlFor="software_source_url">
                            Source URL
                            <InfoTooltip text="Link to the official vendor lifecycle announcement for this OS version (e.g., Cisco End-of-Life bulletin URL)" />
                        </label>
                        <input
                            id="software_source_url"
                            name="software_source_url"
                            value={formValues.source_url}
                            onChange={(event) => handleFormChange("source_url", event.target.value)}
                            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:outline-none"
                        />
                    </div>

                    <div className="space-y-1 md:col-span-2">
                        <label className="block text-sm font-medium text-text" htmlFor="software_notes">
                            Notes
                        </label>
                        <textarea
                            id="software_notes"
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
                title="Delete software lifecycle row"
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
                        Delete software lifecycle tracking for{" "}
                        <strong>{deleteTarget?.os_name}</strong>. This action cannot be undone.
                    </p>
                    <div className="space-y-1">
                        <label
                            className="block text-sm font-medium text-text"
                            htmlFor="software_delete_confirm"
                        >
                            Type <span className="font-mono font-bold">{DELETE_PHRASE}</span> to confirm
                        </label>
                        <input
                            id="software_delete_confirm"
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

function SummaryCard({
    label,
    value,
    tone,
}: {
    label: string;
    value: number;
    tone: "danger" | "warning";
}): JSX.Element {
    const toneClasses =
        tone === "danger"
            ? "border-red-500/20 bg-red-500/10 text-red-500"
            : "border-amber-500/20 bg-amber-500/10 text-amber-500";

    return (
        <div className={`rounded-2xl border px-4 py-4 ${toneClasses}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]">{label}</p>
            <p className="mt-2 font-heading text-3xl">{value}</p>
            <p className="mt-1 text-xs opacity-70">OS versions affected</p>
        </div>
    );
}
