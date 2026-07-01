import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { fetchHealthSummary } from "@/features/monitoring/api/monitoring.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { DeviceHealthBreakdown } from "@/lib/types";

type HealthBucket = "total" | "healthy" | "warning" | "critical";

const BUCKET_TITLES: Record<HealthBucket, string> = {
    total: "Tracked devices",
    healthy: "Healthy devices",
    warning: "Warning devices",
    critical: "Critical devices",
};

interface BucketScopeRow extends DeviceHealthBreakdown {
    /** Device count within the selected bucket for this scope. */
    bucketCount: number;
}

export function MonitoringHealthPage(): JSX.Element {
    const navigate = useNavigate();
    const [activeBucket, setActiveBucket] = useState<HealthBucket | null>(null);
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

    // Scopes (platforms + groups) that contribute to the selected summary bucket.
    const bucketRows = useMemo<BucketScopeRow[]>(() => {
        if (!activeBucket || !data) return [];
        const countFor = (row: DeviceHealthBreakdown): number =>
            activeBucket === "total" ? row.total : (row.statuses[activeBucket] ?? 0);
        return [...(data.by_platform ?? []), ...(data.by_group ?? [])]
            .map((row) => ({ ...row, bucketCount: countFor(row) }))
            .filter((row) => row.bucketCount > 0)
            .sort((left, right) => right.bucketCount - left.bucketCount);
    }, [activeBucket, data]);

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

    const bucketColumns: ColumnDef<BucketScopeRow>[] = [
        {
            key: "scope",
            header: "Scope",
            accessor: (row) => (
                <div>
                    <div className="font-medium text-text">
                        {row.name ?? row.identifier ?? "Unassigned"}
                    </div>
                    <div className="text-xs uppercase tracking-[0.16em] text-muted">
                        {row.scope}
                    </div>
                </div>
            ),
        },
        {
            key: "count",
            header: "Devices",
            accessor: (row) => String(row.bucketCount),
        },
    ];

    const navigateToScope = (row: DeviceHealthBreakdown): void => {
        if (!row.identifier) return;
        const param = row.scope === "group" ? "groupId" : "platformId";
        void navigate(`/inventory/devices?${param}=${encodeURIComponent(row.identifier)}`);
    };

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
                <StatCard
                    label="Tracked devices"
                    value={data.overall.total}
                    accent="primary"
                    onClick={() => setActiveBucket("total")}
                />
                <StatCard
                    label="Healthy"
                    value={data.overall.statuses.healthy ?? 0}
                    accent="emerald"
                    onClick={() => setActiveBucket("healthy")}
                />
                <StatCard
                    label="Warning"
                    value={data.overall.statuses.warning ?? 0}
                    accent="amber"
                    onClick={() => setActiveBucket("warning")}
                />
                <StatCard
                    label="Critical"
                    value={data.overall.statuses.critical ?? 0}
                    accent="red"
                    onClick={() => setActiveBucket("critical")}
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
                        onRowClick={navigateToScope}
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
                        onRowClick={navigateToScope}
                        emptyState={
                            <p className="text-sm text-muted">No group health snapshots yet.</p>
                        }
                    />
                </div>
            </section>

            <Modal
                isOpen={activeBucket !== null}
                onClose={() => setActiveBucket(null)}
                title={activeBucket ? BUCKET_TITLES[activeBucket] : ""}
                size="lg"
            >
                <p className="mb-4 text-sm text-muted">
                    Platforms and groups contributing to this count. Select a row to view the
                    matching devices.
                </p>
                <DataTable
                    columns={bucketColumns}
                    data={bucketRows}
                    keyExtractor={(row) =>
                        `${row.scope}-${row.identifier ?? row.name ?? "scope"}`
                    }
                    dense
                    onRowClick={(row) => {
                        setActiveBucket(null);
                        navigateToScope(row);
                    }}
                    emptyState={
                        <p className="text-sm text-muted">No devices in this bucket.</p>
                    }
                />
            </Modal>
        </div>
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
