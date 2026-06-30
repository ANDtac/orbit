import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef } from "@/components/ui/DataTable";
import { fetchHealthSummary } from "@/features/monitoring/api/monitoring.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { DeviceHealthBreakdown } from "@/lib/types";

export function MonitoringHealthPage(): JSX.Element {
    const navigate = useNavigate();
    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: [QUERY_KEYS.deviceHealthSummary],
        queryFn: () => fetchHealthSummary(),
    });

    const platformRows = useMemo(
        () => [...(data?.by_platform ?? [])].sort((left, right) => right.total - left.total),
        [data?.by_platform],
    );
    const groupRows = useMemo(
        () => [...(data?.by_group ?? [])].sort((left, right) => right.total - left.total),
        [data?.by_group],
    );

    const columns: ColumnDef<DeviceHealthBreakdown>[] = [
        {
            key: "name",
            header: "Scope",
            accessor: (row) => (
                <div>
                    <div className="font-medium text-text">
                        {row.name ?? row.identifier ?? "Unassigned"}
                    </div>
                    <div className="font-mono text-xs text-muted">{row.identifier ?? "—"}</div>
                </div>
            ),
        },
        {
            key: "total",
            header: "Devices",
            accessor: (row) => String(row.total),
        },
        {
            key: "statuses",
            header: "Statuses",
            accessor: (row) => <StatusSummary statuses={row.statuses} />,
        },
    ];

    if (isLoading) {
        return <p className="text-muted">Loading health summary…</p>;
    }

    if (isError || !data) {
        return <p className="text-red-500">Unable to load device health right now.</p>;
    }

    const lastUpdated = data.generated_at
        ? `Last updated: ${formatDistanceToNow(new Date(data.generated_at), { addSuffix: true })}`
        : null;

    return (
        <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-4">
                <StatCard title="Tracked devices" value={String(data.overall.total)} />
                <StatCard
                    title="Healthy"
                    value={String(data.overall.statuses.healthy ?? 0)}
                    tone="healthy"
                />
                <StatCard
                    title="Warning"
                    value={String(data.overall.statuses.warning ?? 0)}
                    tone="warning"
                />
                <StatCard
                    title="Critical"
                    value={String(data.overall.statuses.critical ?? 0)}
                    tone="critical"
                />
            </section>

            {lastUpdated ? (
                <p className="text-xs text-muted">{lastUpdated}</p>
            ) : null}

            <section className="grid gap-6 xl:grid-cols-2">
                <div className="space-y-3">
                    <div>
                        <h3 className="font-heading text-xl text-primary">By platform</h3>
                        <p className="text-sm text-muted">
                            Network-wide health rollup grouped by platform metadata.
                        </p>
                    </div>
                    <DataTable
                        columns={columns}
                        data={platformRows}
                        keyExtractor={(row) =>
                            `${row.scope}-${row.identifier ?? row.name ?? "platform"}`
                        }
                        isError={isError}
                        onRetry={() => refetch()}
                        errorMessage="Unable to load health by platform."
                        dense
                        onRowClick={(row) => {
                            if (row.identifier) {
                                void navigate(`/inventory/devices?platformId=${encodeURIComponent(row.identifier)}`);
                            }
                        }}
                        emptyState={
                            <p className="text-sm text-muted">No platform health snapshots yet.</p>
                        }
                    />
                </div>

                <div className="space-y-3">
                    <div>
                        <h3 className="font-heading text-xl text-primary">By group</h3>
                        <p className="text-sm text-muted">
                            Inventory-group health distribution based on the newest snapshot per
                            device.
                        </p>
                    </div>
                    <DataTable
                        columns={columns}
                        data={groupRows}
                        keyExtractor={(row) =>
                            `${row.scope}-${row.identifier ?? row.name ?? "group"}`
                        }
                        isError={isError}
                        onRetry={() => refetch()}
                        errorMessage="Unable to load health by group."
                        dense
                        onRowClick={(row) => {
                            if (row.identifier) {
                                void navigate(`/inventory/devices?groupId=${encodeURIComponent(row.identifier)}`);
                            }
                        }}
                        emptyState={
                            <p className="text-sm text-muted">No group health snapshots yet.</p>
                        }
                    />
                </div>
            </section>
        </div>
    );
}

function StatCard({
    title,
    value,
    tone = "default",
}: {
    title: string;
    value: string;
    tone?: "default" | "healthy" | "warning" | "critical";
}) {
    const textTone =
        tone === "healthy"
            ? "text-emerald-500"
            : tone === "warning"
              ? "text-amber-500"
              : tone === "critical"
                ? "text-red-500"
                : "text-primary";

    return (
        <article className="rounded-2xl border border-primary/10 bg-surface p-5 shadow-sm">
            <p className="text-sm text-muted">{title}</p>
            <p className={`mt-1 font-heading text-3xl ${textTone}`}>{value}</p>
        </article>
    );
}

function StatusSummary({ statuses }: { statuses: Record<string, number> }) {
    const entries = Object.entries(statuses).sort((left, right) => right[1] - left[1]);

    return (
        <div className="flex flex-wrap gap-2">
            {entries.length ? (
                entries.map(([status, count]) => (
                    <span
                        key={status}
                        className="inline-flex items-center gap-2 rounded-full border border-primary/20 px-2 py-1 text-xs uppercase tracking-[0.16em] text-text"
                    >
                        <span className={`h-2 w-2 rounded-full ${statusDot(status)}`} />
                        {status} {count}
                    </span>
                ))
            ) : (
                <span className="text-xs text-muted">No status data</span>
            )}
        </div>
    );
}

function statusDot(status: string): string {
    const normalized = status.toLowerCase();
    if (normalized === "healthy" || normalized === "pass") return "bg-emerald-500";
    if (normalized === "warning" || normalized === "degraded") return "bg-amber-500";
    if (normalized === "critical" || normalized === "fail" || normalized === "failed")
        return "bg-red-500";
    return "bg-slate-400";
}
