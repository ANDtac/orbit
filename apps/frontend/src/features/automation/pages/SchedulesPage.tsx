import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef } from "@/components/ui/DataTable";
import {
    deleteSchedule,
    fetchSchedules,
    fireSchedule,
    PRESET_LABELS,
    updateSchedule,
} from "@/features/automation/api/schedules.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { Schedule } from "@/lib/types";

// ─── Filters ──────────────────────────────────────────────────────────────────

type TargetFilter = "all" | "automation" | "monitor";
type EnabledFilter = "all" | "enabled" | "disabled";

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SchedulesPage(): JSX.Element {
    const navigate = useNavigate();
    const qc = useQueryClient();

    const [targetFilter, setTargetFilter] = useState<TargetFilter>("all");
    const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>("all");

    const {
        data: schedules = [],
        isLoading,
        isError,
        refetch,
    } = useQuery({
        queryKey: [QUERY_KEYS.schedules],
        queryFn: () => fetchSchedules(),
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
            updateSchedule(id, { enabled }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.schedules] });
        },
        onError: (err: unknown) => {
            toast.error(err instanceof Error ? err.message : "Failed to update schedule.");
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => deleteSchedule(id),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.schedules] });
            toast.success("Schedule deleted.");
        },
        onError: (err: unknown) => {
            toast.error(err instanceof Error ? err.message : "Failed to delete schedule.");
        },
    });

    const fireMutation = useMutation({
        mutationFn: (id: number) => fireSchedule(id),
        onSuccess: () => {
            toast.success("Run queued.", {
                action: {
                    label: "View Runs",
                    onClick: () => void navigate("/automation/runs"),
                },
            });
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.schedules] });
        },
        onError: (err: unknown) => {
            toast.error(err instanceof Error ? err.message : "Failed to fire schedule.");
        },
    });

    // ── Filtered data ─────────────────────────────────────────────────────────

    const filtered = schedules.filter((s) => {
        if (targetFilter !== "all" && s.target_type !== targetFilter) return false;
        if (enabledFilter === "enabled" && !s.enabled) return false;
        if (enabledFilter === "disabled" && s.enabled) return false;
        return true;
    });

    // ── Columns ───────────────────────────────────────────────────────────────

    const columns: ColumnDef<Schedule>[] = [
        {
            key: "name",
            header: "Name / target",
            accessor: (s) => (
                <div>
                    <div className="font-medium text-text">
                        {s.name ?? (
                            <span className="text-muted italic">Unnamed</span>
                        )}
                    </div>
                    <div className="text-xs text-muted capitalize">
                        {s.target_type} #{s.target_id}
                    </div>
                </div>
            ),
        },
        {
            key: "preset",
            header: "Frequency",
            accessor: (s) => (
                <span className="font-medium text-text">
                    {s.preset ? (PRESET_LABELS[s.preset] ?? s.preset) : s.cron_expr}
                </span>
            ),
        },
        {
            key: "next_run",
            header: "Next run",
            accessor: (s) => (
                <span className="text-sm text-muted">
                    {s.next_run ? new Date(s.next_run).toLocaleString() : "—"}
                </span>
            ),
        },
        {
            key: "last_run",
            header: "Last run",
            accessor: (s) => (
                <span className="text-sm text-muted">
                    {s.last_run ? new Date(s.last_run).toLocaleString() : "—"}
                </span>
            ),
        },
        {
            key: "enabled",
            header: "Enabled",
            accessor: (s) => (
                <button
                    type="button"
                    role="switch"
                    aria-checked={s.enabled}
                    aria-label={s.enabled ? "Disable schedule" : "Enable schedule"}
                    onClick={() => toggleMutation.mutate({ id: s.id, enabled: !s.enabled })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        s.enabled ? "bg-primary" : "bg-primary/20"
                    }`}
                >
                    <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            s.enabled ? "translate-x-4" : "translate-x-0"
                        }`}
                    />
                </button>
            ),
        },
        {
            key: "actions",
            header: "",
            accessor: (s) => (
                <div
                    className="flex justify-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fireMutation.mutate(s.id)}
                        disabled={fireMutation.isPending}
                    >
                        Fire now
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-500"
                        onClick={() => deleteMutation.mutate(s.id)}
                        disabled={deleteMutation.isPending}
                    >
                        Delete
                    </Button>
                </div>
            ),
            cellClassName: "w-[200px]",
        },
    ];

    // ── Render ────────────────────────────────────────────────────────────────

    const SELECT_CLASS =
        "rounded-lg border border-primary/30 bg-surface px-3 py-1.5 text-sm text-text focus:border-primary focus:outline-none";

    return (
        <div className="space-y-4">
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                    <label htmlFor="filter-target" className="text-sm text-muted">
                        Target
                    </label>
                    <select
                        id="filter-target"
                        value={targetFilter}
                        onChange={(e) => setTargetFilter(e.target.value as TargetFilter)}
                        className={SELECT_CLASS}
                    >
                        <option value="all">All</option>
                        <option value="automation">Automation</option>
                        <option value="monitor">Monitor</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <label htmlFor="filter-enabled" className="text-sm text-muted">
                        Status
                    </label>
                    <select
                        id="filter-enabled"
                        value={enabledFilter}
                        onChange={(e) => setEnabledFilter(e.target.value as EnabledFilter)}
                        className={SELECT_CLASS}
                    >
                        <option value="all">All</option>
                        <option value="enabled">Enabled</option>
                        <option value="disabled">Disabled</option>
                    </select>
                </div>
                <span className="ml-auto text-xs text-muted">
                    {filtered.length} schedule{filtered.length !== 1 ? "s" : ""}
                </span>
            </div>

            <DataTable<Schedule>
                columns={columns}
                data={filtered}
                keyExtractor={(s) => s.id}
                isLoading={isLoading}
                isError={isError}
                errorMessage="Unable to load schedules."
                onRetry={() => void refetch()}
                dense
                emptyState={
                    <p className="text-sm text-muted">
                        No schedules found. Create one in the{" "}
                        <button
                            type="button"
                            onClick={() => void navigate("/automation/builder")}
                            className="text-primary underline-offset-2 hover:underline"
                        >
                            Automation Builder
                        </button>
                        .
                    </p>
                }
            />
        </div>
    );
}
