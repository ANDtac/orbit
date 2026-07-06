import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { TimeChartPanel } from "@/features/dashboards/components/panels/TimeChartPanel";
import { ScheduleForm } from "@/features/automation/components/ScheduleForm";
import {
    fetchSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    fireSchedule,
    PRESET_LABELS,
} from "@/features/automation/api/schedules.api";
import {
    fetchMonitor,
    fetchMonitorResults,
    runMonitor,
    COMPARATOR_LABELS,
} from "@/features/monitors/api/monitors.api";
import { QUERY_KEYS } from "@/lib/constants";
import type {
    Monitor,
    MonitorResult,
    MonitorResultStatus,
    MonitorStatus,
    Schedule,
    ScheduleCreateInput,
} from "@/lib/types";

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MonitorStatus | MonitorResultStatus }): JSX.Element {
    const styles: Record<string, string> = {
        passing: "bg-emerald-500/15 text-emerald-400",
        failing: "bg-red-500/15 text-red-400",
        unknown: "bg-primary/15 text-muted",
        error: "bg-amber-500/15 text-amber-400",
    };
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[status] ?? styles.unknown}`}
        >
            {status}
        </span>
    );
}

// ─── Schedule section ─────────────────────────────────────────────────────────

function MonitorScheduleSection({ monitorId }: { monitorId: number }): JSX.Element {
    const qc = useQueryClient();
    const navigate = useNavigate();
    const [isAddOpen, setIsAddOpen] = useState(false);

    const { data: schedules = [], isLoading: schedulesLoading } = useQuery({
        queryKey: [QUERY_KEYS.schedules, "monitor", monitorId],
        queryFn: () => fetchSchedules({ target_type: "monitor", target_id: monitorId }),
    });

    const createMutation = useMutation({
        mutationFn: (input: ScheduleCreateInput) => createSchedule(input),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.schedules] });
            setIsAddOpen(false);
            toast.success("Schedule created.");
        },
        onError: (err: unknown) => {
            toast.error(err instanceof Error ? err.message : "Failed to create schedule.");
        },
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
            updateSchedule(id, { enabled }),
        onSuccess: () => void qc.invalidateQueries({ queryKey: [QUERY_KEYS.schedules] }),
        onError: (err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Failed to update schedule."),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => deleteSchedule(id),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.schedules] });
            toast.success("Schedule deleted.");
        },
        onError: (err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Failed to delete schedule."),
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
        onError: (err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Failed to fire schedule."),
    });

    const scheduleColumns: ColumnDef<Schedule>[] = [
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
            key: "timezone",
            header: "Timezone",
            accessor: (s) => <span className="text-sm text-muted">{s.timezone}</span>,
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
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
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
        },
    ];

    return (
        <div className="space-y-3 border-t border-primary/10 pt-6">
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-text">Schedules</p>
                <Button variant="outline" size="sm" onClick={() => setIsAddOpen(true)}>
                    Add schedule
                </Button>
            </div>
            <DataTable<Schedule>
                columns={scheduleColumns}
                data={schedules}
                keyExtractor={(s) => s.id}
                isLoading={schedulesLoading}
                dense
                emptyState={
                    <p className="text-sm text-muted">
                        No schedules yet.{" "}
                        <button
                            type="button"
                            onClick={() => setIsAddOpen(true)}
                            className="text-primary underline-offset-2 hover:underline"
                        >
                            Add one
                        </button>{" "}
                        to run this monitor on a recurring schedule.
                    </p>
                }
            />
            <Modal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                title="Add schedule"
                size="sm"
            >
                <div className="py-2">
                    <ScheduleForm
                        targetType="monitor"
                        targetId={monitorId}
                        onSubmit={(input) => createMutation.mutate(input)}
                        onCancel={() => setIsAddOpen(false)}
                        isSubmitting={createMutation.isPending}
                    />
                </div>
            </Modal>
        </div>
    );
}

// ─── Detail page ──────────────────────────────────────────────────────────────

export function MonitorDetailPage(): JSX.Element {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const monitorId = Number(id);

    const [page, setPage] = useState(1);
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const LIMIT = 20;

    const monitorQuery = useQuery({
        queryKey: [QUERY_KEYS.monitors, monitorId],
        queryFn: () => fetchMonitor(monitorId),
        enabled: !Number.isNaN(monitorId),
    });
    const monitor: Monitor | undefined = monitorQuery.data;

    const resultsQuery = useQuery({
        queryKey: [QUERY_KEYS.monitorResults, monitorId, page, fromDate, toDate],
        queryFn: () =>
            fetchMonitorResults(monitorId, {
                limit: LIMIT,
                from: fromDate || undefined,
                to: toDate || undefined,
            }),
        enabled: !Number.isNaN(monitorId),
    });
    const results = resultsQuery.data?.data ?? [];

    const runMutation = useMutation({
        mutationFn: () => runMonitor(monitorId),
        onSuccess: ({ job }) => {
            toast.success(`Run queued (job #${job.id}).`, {
                action: {
                    label: "View Runs",
                    onClick: () => void navigate("/automation/runs"),
                },
            });
        },
        onError: (err: unknown) => {
            toast.error(err instanceof Error ? err.message : "Failed to queue run.");
        },
    });

    if (monitorQuery.isError) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-red-400">Unable to load monitor.</p>
                <Button variant="ghost" onClick={() => navigate("/monitoring/monitors")}>
                    Back to monitors
                </Button>
            </div>
        );
    }

    const resultsColumns: ColumnDef<MonitorResult>[] = [
        {
            key: "observed_at",
            header: "Observed at",
            accessor: (r) => (
                <span className="text-sm text-muted">
                    {new Date(r.observed_at).toLocaleString()}
                </span>
            ),
        },
        {
            key: "device_id",
            header: "Device",
            accessor: (r) => (
                <span className="font-mono text-xs text-text">#{r.device_id}</span>
            ),
        },
        {
            key: "value",
            header: "Value",
            accessor: (r) => (
                <span className="font-mono text-xs text-text">
                    {r.value !== null ? String(r.value) : "—"}
                </span>
            ),
        },
        {
            key: "status",
            header: "Status",
            accessor: (r) => <StatusBadge status={r.status} />,
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    {monitorQuery.isLoading ? (
                        <div className="h-8 w-48 animate-pulse rounded-lg bg-primary/10" />
                    ) : (
                        <>
                            <h1 className="font-heading text-2xl text-text">
                                {monitor?.name ?? "Monitor"}
                            </h1>
                            {monitor?.description ? (
                                <p className="text-sm text-muted">{monitor.description}</p>
                            ) : null}
                        </>
                    )}
                    {monitor ? (
                        <div className="pt-1">
                            <StatusBadge status={monitor.status} />
                        </div>
                    ) : null}
                </div>
                <Button
                    onClick={() => runMutation.mutate()}
                    disabled={runMutation.isPending || !monitor}
                >
                    {runMutation.isPending ? "Queuing…" : "Run now"}
                </Button>
            </div>

            {/* Config card */}
            {monitor ? (
                <div className="rounded-2xl border border-primary/10 bg-surface p-5">
                    <h2 className="mb-3 font-heading text-lg text-primary">Configuration</h2>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
                        <div>
                            <dt className="text-xs uppercase tracking-[0.18em] text-muted">Action</dt>
                            <dd className="mt-0.5 text-text">
                                {monitor.action_name ?? `Action #${monitor.action_id}`}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-[0.18em] text-muted">Metric</dt>
                            <dd className="mt-0.5 font-mono text-text">{monitor.metric}</dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-[0.18em] text-muted">
                                Condition
                            </dt>
                            <dd className="mt-0.5 text-text">
                                {COMPARATOR_LABELS[monitor.comparator] ?? monitor.comparator}
                                {monitor.threshold !== null ? ` ${monitor.threshold}` : ""}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs uppercase tracking-[0.18em] text-muted">
                                Target devices
                            </dt>
                            <dd className="mt-0.5 text-text">
                                {monitor.target.device_ids.length} device
                                {monitor.target.device_ids.length !== 1 ? "s" : ""}
                            </dd>
                        </div>
                    </dl>
                </div>
            ) : null}

            {/* Time chart */}
            {results.length > 0 && monitor ? (
                <div className="rounded-2xl border border-primary/10 bg-surface p-5">
                    <h2 className="mb-3 font-heading text-lg text-primary">History</h2>
                    <TimeChartPanel data={results} monitor={monitor} height={220} />
                </div>
            ) : null}

            {/* Results section */}
            <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-heading text-xl text-primary">Results</h2>
                    <div className="flex items-center gap-2 text-sm">
                        <label htmlFor="results-from" className="text-muted">
                            From
                        </label>
                        <input
                            id="results-from"
                            type="datetime-local"
                            value={fromDate}
                            onChange={(e) => {
                                setFromDate(e.target.value);
                                setPage(1);
                            }}
                            className="rounded-lg border border-primary/30 bg-surface px-2 py-1 text-sm text-text focus:outline-none"
                        />
                        <label htmlFor="results-to" className="text-muted">
                            To
                        </label>
                        <input
                            id="results-to"
                            type="datetime-local"
                            value={toDate}
                            onChange={(e) => {
                                setToDate(e.target.value);
                                setPage(1);
                            }}
                            className="rounded-lg border border-primary/30 bg-surface px-2 py-1 text-sm text-text focus:outline-none"
                        />
                    </div>
                </div>

                <DataTable<MonitorResult>
                    columns={resultsColumns}
                    data={results}
                    keyExtractor={(r) => r.id}
                    isLoading={resultsQuery.isLoading}
                    isError={resultsQuery.isError}
                    onRetry={() => void resultsQuery.refetch()}
                    errorMessage="Unable to load monitor results."
                    pagination={{
                        mode: "offset",
                        page,
                        perPage: LIMIT,
                        total: resultsQuery.data?.page.total,
                        onPageChange: setPage,
                    }}
                    dense
                    emptyState={
                        <p className="text-sm text-muted">No results recorded yet.</p>
                    }
                />
            </div>

            {/* Schedule section */}
            {monitor ? <MonitorScheduleSection monitorId={monitor.id} /> : null}
        </div>
    );
}
