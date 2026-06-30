import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchAppEvents, fetchErrorLogs, fetchJobs } from "@/features/monitoring/api/monitoring.api";
import { PasswordChangeCard } from "@/features/monitoring/components/PasswordRotationCard";
import { QUERY_KEYS } from "@/lib/constants";

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-block">
      <svg className="ml-1 inline h-3.5 w-3.5 cursor-help text-muted" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 w-64 -translate-x-1/2 rounded-lg bg-surface border border-primary/20 px-3 py-2 text-xs text-muted opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

export function MonitoringOverviewPage(): JSX.Element {
  const {
    data: devicesResponse,
    isLoading: isDevicesLoading,
    isError: isDevicesError,
  } = useQuery({
    queryKey: [QUERY_KEYS.devices],
    queryFn: () => fetchDevices({ "page[size]": 1 }),
  });

  const {
    data: jobsResponse,
    isLoading: isJobsLoading,
    isError: isJobsError,
  } = useQuery({
    queryKey: [QUERY_KEYS.jobs],
    queryFn: () => fetchJobs(),
  });

  const {
    data: recentPasswordEvents = [],
    isLoading: isPasswordEventsLoading,
    isError: isPasswordEventsError,
  } = useQuery({
    queryKey: [QUERY_KEYS.appEvents, "recentPasswordChanges"],
    queryFn: () => fetchAppEvents({ page: 1, per_page: 5, event: "password_change.completed" }),
  });

  const {
    data: recentErrors = [],
    isLoading: isErrorsLoading,
    isError: isErrorsError,
  } = useQuery({
    queryKey: [QUERY_KEYS.errorLogs, "recent"],
    queryFn: () => fetchErrorLogs({ page: 1, per_page: 5 }),
  });

  if (isDevicesLoading || isJobsLoading || isPasswordEventsLoading || isErrorsLoading) {
    return <p className="text-muted">Loading monitoring summary…</p>;
  }

  if (isDevicesError || isJobsError || isPasswordEventsError || isErrorsError) {
    return <p className="text-red-500">Monitoring summary unavailable.</p>;
  }

  const jobs = jobsResponse?.data ?? [];

  const stats = jobs.reduce(
    (accumulator, job) => {
      if (job.status === "queued") {
        accumulator.queuedJobs += 1;
      }

      if (job.status === "failed") {
        accumulator.failedJobs += 1;
      }

      return accumulator;
    },
    {
      queuedJobs: 0,
      failedJobs: 0,
    },
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Managed devices" value={String(devicesResponse?.page?.total ?? 0)} />
        <StatCard title="Queued jobs" value={String(stats.queuedJobs)} />
        <StatCard title="Failed jobs" value={String(stats.failedJobs)} emphasize={stats.failedJobs > 0} />
      </section>

      <section className="flex flex-wrap gap-3">
        <Link
          to="/monitoring/probes"
          className="rounded-xl border border-primary/30 bg-surface px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/10"
        >
          Queue probes
        </Link>
        <Link
          to="/operations/password-change"
          className="rounded-xl border border-primary/30 bg-surface px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/10"
        >
          Run password change
        </Link>
        <Link
          to="/monitoring/alerts"
          className="rounded-xl border border-primary/30 bg-surface px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/10"
        >
          View alerts
        </Link>
      </section>

      <PasswordChangeCard />

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm">
          <div>
            <h3 className="font-heading text-xl text-primary">Recent password changes</h3>
            <p className="mt-1 text-sm text-muted">Latest completed password-change batches from the application event stream.</p>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-primary/10">
            <table className="min-w-full divide-y divide-primary/10">
              <thead className="bg-primary/10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.18em] text-primary">Event</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.18em] text-primary">Summary</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.18em] text-primary">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/5 bg-surface">
                {recentPasswordEvents.length ? recentPasswordEvents.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-3 py-2 text-xs text-text">
                      <div className="font-medium">{entry.event}</div>
                      <div className="text-muted">{entry.level}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-text">{formatPasswordChangeSummary(entry)}</td>
                    <td className="px-3 py-2 text-xs text-muted">{formatRelative(entry.created_at)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-sm text-muted">
                      No recent password change events.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-right">
            <Link to="/operations/password-change" className="text-sm font-medium text-primary hover:underline">
              View all →
            </Link>
          </div>
        </article>

        <article className="rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm">
          <div>
            <h3 className="font-heading text-xl text-primary">Recent errors</h3>
            <p className="mt-1 text-sm text-muted">Newest error log entries captured by the backend runtime.</p>
          </div>

          <div className="mt-4 space-y-3">
            {recentErrors.length ? recentErrors.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-primary/10 bg-background/50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500">{entry.level}</span>
                  <span className="text-xs text-muted">{formatRelative(entry.created_at)}</span>
                </div>
                <p className="mt-2 text-sm text-text">{entry.message}</p>
                <p className="mt-1 font-mono text-xs text-muted">
                  <span className="text-muted">
                    Correlation ID
                    <InfoTooltip text="A unique identifier for this error. Share it with your engineering team when reporting this issue." />
                    :
                  </span>{" "}
                  {entry.correlation_id}
                </p>
              </div>
            )) : (
              <p className="rounded-2xl border border-primary/10 bg-background/50 px-4 py-6 text-center text-sm text-muted">
                No recent errors logged.
              </p>
            )}
          </div>
          <div className="mt-3 text-right">
            <Link to="/monitoring/logs" className="text-sm font-medium text-primary hover:underline">
              View all errors →
            </Link>
          </div>
        </article>
      </section>
    </div>
  );
}

function StatCard({ title, value, emphasize = false }: { title: string; value: string; emphasize?: boolean }) {
  return (
    <article className="rounded-2xl border border-primary/10 bg-surface p-5 shadow-sm">
      <p className="text-sm text-muted">{title}</p>
      <p className={`mt-1 font-heading text-3xl ${emphasize ? "text-red-500" : "text-primary"}`}>{value}</p>
    </article>
  );
}

function formatPasswordChangeSummary(entry: {
  message?: string | null;
  extra?: Record<string, unknown>;
}): string {
  const total = Number(entry.extra?.total ?? 0);
  const succeeded = Number(entry.extra?.succeeded ?? 0);
  const failed = Number(entry.extra?.failed ?? 0);
  const requestedBy = typeof entry.extra?.requested_by === "string" ? entry.extra.requested_by : null;

  if (total > 0) {
    return `${succeeded}/${total} succeeded, ${failed} failed${requestedBy ? ` by ${requestedBy}` : ""}`;
  }

  return entry.message ?? "Password change completed";
}

function formatRelative(value?: string): string {
  return value ? formatDistanceToNow(new Date(value), { addSuffix: true }) : "—";
}
