import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

import { fetchComplianceResults } from "@/features/compliance/api/compliance.api";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { AlertsPanel } from "@/features/monitoring/components/AlertsPanel";
import { fetchJobs } from "@/features/monitoring/api/monitoring.api";
import { fetchPinnedDashboards } from "@/features/dashboards/api/dashboards.api";
import { StatCard } from "@/components/ui/StatCard";
import { Modal } from "@/components/ui/Modal";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef } from "@/components/ui/DataTable";
import { QUERY_KEYS } from "@/lib/constants";
import type { ComplianceResult, Dashboard, Device, Job } from "@/lib/types";

// ---------------------------------------------------------------------------
// Home dashboard
// ---------------------------------------------------------------------------

type HomeModal = "devices" | "active" | "failed" | "compliance";

function formatTimestamp(value?: string): string {
    if (!value) return "—";
    return formatDistanceToNow(new Date(value), { addSuffix: true });
}

export function Home(): JSX.Element {
    const navigate = useNavigate();
    const [activeModal, setActiveModal] = useState<HomeModal | null>(null);

    const {
        data: devicesResponse,
        isLoading: isDevicesLoading,
        isError: isDevicesError,
    } = useQuery({
        queryKey: [QUERY_KEYS.devices, "homeSummary"],
        queryFn: () => fetchDevices({ "page[size]": 25, sort: "name" }),
    });

    const {
        data: jobsResponse,
        isLoading: isJobsLoading,
        isError: isJobsError,
    } = useQuery({
        queryKey: [QUERY_KEYS.jobs, "homeSummary"],
        queryFn: () => fetchJobs(),
    });

    const {
        data: complianceResults,
        isLoading: isComplianceLoading,
        isError: isComplianceError,
    } = useQuery({
        queryKey: [QUERY_KEYS.complianceResults, "homeSummary"],
        queryFn: () => fetchComplianceResults({ per_page: 200, sort: "-evaluated_at" }),
    });

    const { data: pinnedDashboards = [] } = useQuery({
        queryKey: [QUERY_KEYS.dashboards, "pinned"],
        queryFn: fetchPinnedDashboards,
    });

    // Derived stats -------------------------------------------------------

    const totalDevices = isDevicesError ? null : (devicesResponse?.page?.total ?? null);
    const deviceRows = devicesResponse?.data ?? [];

    const allJobs = !isJobsError && jobsResponse ? jobsResponse.data : [];
    const activeJobs = allJobs.filter(
        (job) => job.status === "queued" || job.status === "running",
    );
    const failedJobs = allJobs.filter((job) => job.status === "failed");
    const jobCounts = !isJobsError && jobsResponse ? { active: activeJobs.length, failed: failedJobs.length } : null;

    const complianceRate: number | null = (() => {
        if (isComplianceError || !complianceResults) return null;
        const pass = complianceResults.filter((r) => r.status === "pass").length;
        const fail = complianceResults.filter((r) => r.status === "fail").length;
        const total = pass + fail;
        if (total === 0) return null;
        return Math.round((pass / total) * 100);
    })();

    // Failing results first for the drill-in modal.
    const complianceRows = complianceResults
        ? [...complianceResults].sort((a, b) => Number(b.status === "fail") - Number(a.status === "fail"))
        : [];

    // Determine the 24-hour failed job count separately so we can colour it
    const failedJobCount = jobCounts?.failed ?? null;

    const deviceColumns: ColumnDef<Device>[] = [
        {
            key: "name",
            header: "Name",
            accessor: (row) => <span className="font-medium text-text">{row.name}</span>,
        },
        {
            key: "ip",
            header: "Mgmt IP",
            accessor: (row) => (
                <span className="font-mono text-xs text-muted">{row.mgmt_ipv4 ?? "—"}</span>
            ),
        },
        {
            key: "os",
            header: "OS",
            accessor: (row) => [row.os_name, row.os_version].filter(Boolean).join(" ") || "—",
        },
    ];

    const jobColumns: ColumnDef<Job>[] = [
        { key: "type", header: "Type", accessor: (row) => row.job_type },
        { key: "status", header: "Status", accessor: (row) => row.status },
        {
            key: "created",
            header: "Created",
            accessor: (row) => formatTimestamp(row.timestamps.created_at),
        },
    ];

    const complianceColumns: ColumnDef<ComplianceResult>[] = [
        { key: "device", header: "Device", accessor: (row) => `#${row.device_id}` },
        { key: "status", header: "Status", accessor: (row) => row.status },
        {
            key: "evaluated",
            header: "Evaluated",
            accessor: (row) => formatTimestamp(row.evaluated_at),
        },
    ];

    const closeModal = (): void => setActiveModal(null);

    const modalLinkClass =
        "inline-flex items-center rounded-full border border-primary/30 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";

    return (
        <div className="space-y-8">
            {/* CTA row */}
            <div className="flex flex-wrap items-center gap-4">
                <Link
                    to="/inventory/devices"
                    className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
                >
                    View devices
                </Link>
                <Link
                    to="/monitoring/health"
                    className="inline-flex items-center justify-center rounded-full border border-primary px-6 py-3 text-base font-medium text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
                >
                    Open monitoring
                </Link>
            </div>

            {/* Live stats */}
            <section aria-label="Live summary statistics">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                    Live summary
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        label="Managed devices"
                        value={isDevicesLoading ? null : totalDevices}
                        accent="primary"
                        onClick={() => setActiveModal("devices")}
                    />
                    <StatCard
                        label="Active jobs"
                        value={isJobsLoading ? null : (jobCounts?.active ?? null)}
                        accent="amber"
                        onClick={() => setActiveModal("active")}
                    />
                    <StatCard
                        label="Failed jobs"
                        value={isJobsLoading ? null : failedJobCount}
                        accent={failedJobCount != null && failedJobCount > 0 ? "red" : "muted"}
                        onClick={() => setActiveModal("failed")}
                    />
                    <StatCard
                        label="Compliance pass rate"
                        value={isComplianceLoading ? null : complianceRate}
                        suffix="%"
                        accent="emerald"
                        onClick={() => setActiveModal("compliance")}
                    />
                </div>
            </section>

            {/* Pinned dashboards */}
            {pinnedDashboards.length > 0 ? (
                <section aria-label="Pinned dashboards">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                        Pinned Dashboards
                    </h3>
                    <div className="flex gap-4 overflow-x-auto pb-2">
                        {pinnedDashboards.map((dashboard) => (
                            <PinnedDashboardCard key={dashboard.id} dashboard={dashboard} />
                        ))}
                    </div>
                </section>
            ) : null}

            {/* Feature cards */}
            <section className="grid gap-4 sm:grid-cols-2" aria-label="Feature highlights">
                <article className="rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm">
                    <h3 className="font-heading text-2xl text-primary">
                        Configuration Compliance
                    </h3>
                    <p className="mt-2 text-sm text-text">
                        Compare running configs against approved baselines and spot policy drift
                        instantly.
                    </p>
                    <Link
                        to="/compliance/policies"
                        className="mt-4 inline-flex items-center text-sm font-medium text-primary underline-offset-2 hover:underline"
                    >
                        Go to Compliance →
                    </Link>
                </article>
                <article className="rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm">
                    <h3 className="font-heading text-2xl text-primary">
                        Automated Operations
                    </h3>
                    <p className="mt-2 text-sm text-text">
                        Run password changes, backups, and commands fleet-wide with a full audit
                        trail.
                    </p>
                    <Link
                        to="/operations/password-change"
                        className="mt-4 inline-flex items-center text-sm font-medium text-primary underline-offset-2 hover:underline"
                    >
                        Go to Operations →
                    </Link>
                </article>
            </section>

            {/* Quick actions */}
            <section aria-label="Quick actions">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                    Quick actions
                </h3>
                <div className="flex flex-wrap gap-3">
                    <QuickActionButton to="/inventory/devices/new" label="Add a device" />
                    <QuickActionButton
                        to="/operations/password-change"
                        label="Run password change"
                    />
                    <QuickActionButton
                        to="/compliance/results"
                        label="View compliance results"
                    />
                </div>
            </section>

            {/* Alerts (folded in from Monitoring) */}
            <section aria-label="Alerts">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                    Alerts
                </h3>
                <AlertsPanel />
            </section>

            {/* Drill-in context modals ---------------------------------------- */}
            <Modal
                isOpen={activeModal === "devices"}
                onClose={closeModal}
                title="Managed devices"
                size="lg"
                footer={
                    <Link to="/inventory/devices" onClick={closeModal} className={modalLinkClass}>
                        View all devices →
                    </Link>
                }
            >
                <DataTable
                    columns={deviceColumns}
                    data={deviceRows}
                    keyExtractor={(row) => row.id}
                    dense
                    onRowClick={(row) => {
                        closeModal();
                        void navigate(`/inventory/devices/${row.id}`);
                    }}
                    emptyState={<p className="text-sm text-muted">No devices to show.</p>}
                />
            </Modal>

            <Modal
                isOpen={activeModal === "active"}
                onClose={closeModal}
                title="Active jobs"
                size="lg"
                footer={
                    <Link to="/automation/runs" onClick={closeModal} className={modalLinkClass}>
                        View all runs →
                    </Link>
                }
            >
                <DataTable
                    columns={jobColumns}
                    data={activeJobs}
                    keyExtractor={(row) => row.id}
                    dense
                    emptyState={<p className="text-sm text-muted">No queued or running jobs.</p>}
                />
            </Modal>

            <Modal
                isOpen={activeModal === "failed"}
                onClose={closeModal}
                title="Failed jobs"
                size="lg"
                footer={
                    <Link to="/automation/runs" onClick={closeModal} className={modalLinkClass}>
                        View all runs →
                    </Link>
                }
            >
                <DataTable
                    columns={jobColumns}
                    data={failedJobs}
                    keyExtractor={(row) => row.id}
                    dense
                    emptyState={<p className="text-sm text-muted">No failed jobs.</p>}
                />
            </Modal>

            <Modal
                isOpen={activeModal === "compliance"}
                onClose={closeModal}
                title="Compliance results"
                size="lg"
                footer={
                    <Link to="/compliance/results" onClick={closeModal} className={modalLinkClass}>
                        View all results →
                    </Link>
                }
            >
                <DataTable
                    columns={complianceColumns}
                    data={complianceRows}
                    keyExtractor={(row) => row.id}
                    dense
                    emptyState={<p className="text-sm text-muted">No compliance results yet.</p>}
                />
            </Modal>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PinnedDashboardCard({ dashboard }: { dashboard: Dashboard }): JSX.Element {
    return (
        <Link
            to={`/dashboards/${dashboard.id}`}
            className="min-w-[200px] max-w-[240px] shrink-0 rounded-2xl border border-primary/10 bg-surface p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md"
        >
            <p className="font-heading text-base font-medium text-text truncate">{dashboard.name}</p>
            <p className="mt-1 text-xs text-muted">
                {dashboard.panels.length} panel{dashboard.panels.length !== 1 ? "s" : ""}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-primary">
                Open →
            </p>
        </Link>
    );
}

function QuickActionButton({
    to,
    label,
}: {
    to: string;
    label: string;
}): JSX.Element {
    return (
        <Link
            to={to}
            className="inline-flex items-center justify-center rounded-full border border-primary/30 bg-surface px-5 py-2.5 text-sm font-medium text-primary shadow-sm transition hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
        >
            {label}
        </Link>
    );
}
