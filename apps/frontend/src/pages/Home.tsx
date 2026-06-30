import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { fetchComplianceResults } from "@/features/compliance/api/compliance.api";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchJobs } from "@/features/monitoring/api/monitoring.api";
import { QUERY_KEYS } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Home dashboard
// ---------------------------------------------------------------------------

export function Home(): JSX.Element {
    const {
        data: devicesResponse,
        isLoading: isDevicesLoading,
        isError: isDevicesError,
    } = useQuery({
        queryKey: [QUERY_KEYS.devices, "homeSummary"],
        queryFn: () => fetchDevices({ "page[size]": 1 }),
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

    // Derived stats -------------------------------------------------------

    const totalDevices = isDevicesError ? null : (devicesResponse?.page?.total ?? null);

    const jobCounts =
        !isJobsError && jobsResponse
            ? jobsResponse.data.reduce(
                  (acc, job) => {
                      if (job.status === "queued" || job.status === "running") {
                          acc.active += 1;
                      }
                      if (job.status === "failed") {
                          acc.failed += 1;
                      }
                      return acc;
                  },
                  { active: 0, failed: 0 },
              )
            : null;

    const complianceRate: number | null = (() => {
        if (isComplianceError || !complianceResults) return null;
        const pass = complianceResults.filter((r) => r.status === "pass").length;
        const fail = complianceResults.filter((r) => r.status === "fail").length;
        const total = pass + fail;
        if (total === 0) return null;
        return Math.round((pass / total) * 100);
    })();

    // Determine the 24-hour failed job count separately so we can colour it
    const failedJobCount = jobCounts?.failed ?? null;

    return (
        <div className="space-y-8">
            {/* Hero heading */}
            <div className="space-y-3">
                <h2 className="font-heading text-4xl font-semibold text-primary">
                    Unified network intelligence
                </h2>
                <p className="max-w-3xl text-lg text-text">
                    Orbit orchestrates device inventory, compliance insights, and automated
                    remediation workflows in one place. Track the health of every platform,
                    execute operations safely, and collaborate with your engineering team in
                    real time.
                </p>
            </div>

            {/* CTA row */}
            <div className="flex flex-wrap items-center gap-4">
                <Link
                    to="/inventory/devices"
                    className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
                >
                    View devices
                </Link>
                <Link
                    to="/monitoring"
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
                    />
                    <StatCard
                        label="Active jobs"
                        value={isJobsLoading ? null : (jobCounts?.active ?? null)}
                        accent="amber"
                    />
                    <StatCard
                        label="Failed jobs"
                        value={isJobsLoading ? null : failedJobCount}
                        accent={failedJobCount != null && failedJobCount > 0 ? "red" : "muted"}
                    />
                    <StatCard
                        label="Compliance pass rate"
                        value={isComplianceLoading ? null : complianceRate}
                        suffix="%"
                        accent="emerald"
                    />
                </div>
            </section>

            {/* Feature cards */}
            <section className="grid gap-4 sm:grid-cols-2" aria-label="Feature highlights">
                <article className="rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm">
                    <h3 className="font-heading text-2xl text-primary">
                        Configuration Compliance
                    </h3>
                    <p className="mt-2 text-sm text-text">
                        Compare device configurations against your approved security baselines.
                        Get instant visibility into which devices are drifting from policy.
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
                        Run password changes, configuration backups, and custom commands across
                        your entire device fleet. Track every action with a full audit trail.
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
        </div>
    );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type Accent = "primary" | "amber" | "red" | "emerald" | "muted";

interface StatCardProps {
    label: string;
    /** null = loading/unavailable; show skeleton or dash */
    value: number | null;
    suffix?: string;
    accent: Accent;
}

function StatCard({ label, value, suffix = "", accent }: StatCardProps): JSX.Element {
    const accentText: Record<Accent, string> = {
        primary: "text-primary",
        amber: "text-amber-500",
        red: "text-red-500",
        emerald: "text-emerald-500",
        muted: "text-text",
    };

    const accentBorder: Record<Accent, string> = {
        primary: "border-primary/20",
        amber: "border-amber-500/20",
        red: "border-red-500/20",
        emerald: "border-emerald-500/20",
        muted: "border-primary/10",
    };

    return (
        <article
            className={`rounded-2xl border bg-surface p-5 shadow-sm ${accentBorder[accent]}`}
        >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                {label}
            </p>
            {value === null ? (
                <div className="mt-2 h-9 w-16 animate-pulse rounded-lg bg-primary/10" />
            ) : (
                <p className={`mt-1 font-heading text-3xl ${accentText[accent]}`}>
                    {value}
                    {suffix}
                </p>
            )}
        </article>
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
