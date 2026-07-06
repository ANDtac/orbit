import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { MonitorForm } from "@/features/monitors/components/MonitorForm";
import {
    createMonitor,
    fetchMonitors,
    type MonitorCreateInput,
} from "@/features/monitors/api/monitors.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { Monitor, MonitorStatus } from "@/lib/types";

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MonitorStatus }): JSX.Element {
    const styles: Record<MonitorStatus, string> = {
        passing: "bg-emerald-500/15 text-emerald-400",
        failing: "bg-red-500/15 text-red-400",
        unknown: "bg-primary/15 text-muted",
    };
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[status]}`}
        >
            {status}
        </span>
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function MonitorsPage(): JSX.Element {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    const monitorsQuery = useQuery({
        queryKey: [QUERY_KEYS.monitors],
        queryFn: fetchMonitors,
    });
    const monitors = monitorsQuery.data ?? [];

    const passingCount = monitors.filter((m) => m.status === "passing").length;
    const failingCount = monitors.filter((m) => m.status === "failing").length;
    const unknownCount = monitors.filter((m) => m.status === "unknown").length;

    const createMutation = useMutation({
        mutationFn: (input: MonitorCreateInput) => createMonitor(input),
        onSuccess: (monitor) => {
            void queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.monitors] });
            setIsCreateOpen(false);
            toast.success(`Monitor "${monitor.name}" created.`);
        },
        onError: () => {
            toast.error("Failed to create monitor.");
        },
    });

    const columns: ColumnDef<Monitor>[] = [
        {
            key: "name",
            header: "Name",
            accessor: (m) => (
                <div>
                    <div className="font-medium text-text">{m.name}</div>
                    {m.description ? (
                        <div className="text-xs text-muted">{m.description}</div>
                    ) : null}
                </div>
            ),
        },
        {
            key: "action",
            header: "Action",
            accessor: (m) => (
                <span className="text-sm text-muted">{m.action_name ?? `Action #${m.action_id}`}</span>
            ),
        },
        {
            key: "metric",
            header: "Metric",
            accessor: (m) => (
                <span className="font-mono text-xs text-text">{m.metric}</span>
            ),
        },
        {
            key: "status",
            header: "Status",
            accessor: (m) => <StatusBadge status={m.status} />,
        },
        {
            key: "last_run",
            header: "Last run",
            accessor: (m) =>
                m.last_run ? (
                    <span className="text-sm text-muted">
                        {new Date(m.last_run).toLocaleString()}
                    </span>
                ) : (
                    <span className="text-sm text-muted">Never</span>
                ),
        },
    ];

    return (
        <div className="space-y-6">
            {/* Stat cards */}
            <section className="grid grid-cols-3 gap-4">
                <StatCard
                    label="Passing"
                    value={monitorsQuery.isLoading ? null : passingCount}
                    accent="emerald"
                />
                <StatCard
                    label="Failing"
                    value={monitorsQuery.isLoading ? null : failingCount}
                    accent="red"
                />
                <StatCard
                    label="Unknown"
                    value={monitorsQuery.isLoading ? null : unknownCount}
                    accent="muted"
                />
            </section>

            {/* Table header */}
            <div className="flex items-center justify-between">
                <h2 className="font-heading text-xl text-primary">Monitors</h2>
                <Button onClick={() => setIsCreateOpen(true)}>Create monitor</Button>
            </div>

            {/* Monitor list */}
            <DataTable<Monitor>
                columns={columns}
                data={monitors}
                keyExtractor={(m) => m.id}
                isLoading={monitorsQuery.isLoading}
                isError={monitorsQuery.isError}
                onRetry={() => void monitorsQuery.refetch()}
                errorMessage="Unable to load monitors."
                emptyState={
                    <p className="text-sm text-muted">
                        No monitors defined yet.{" "}
                        <button
                            type="button"
                            onClick={() => setIsCreateOpen(true)}
                            className="text-primary underline-offset-2 hover:underline"
                        >
                            Create one
                        </button>{" "}
                        to start tracking metrics.
                    </p>
                }
                onRowClick={(m) => navigate(`/monitoring/monitors/${m.id}`)}
            />

            {/* Create modal */}
            <Modal
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                title="Create monitor"
                size="xl"
            >
                <div className="py-2">
                    <MonitorForm
                        onSubmit={(input) => createMutation.mutate(input)}
                        onCancel={() => setIsCreateOpen(false)}
                        isSubmitting={createMutation.isPending}
                    />
                </div>
            </Modal>
        </div>
    );
}
