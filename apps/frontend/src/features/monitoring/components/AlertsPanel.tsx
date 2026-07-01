import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef } from "@/components/ui/DataTable";
import { fetchComplianceResults } from "@/features/compliance/api/compliance.api";
import { fetchJobs, fetchErrorLogs } from "@/features/monitoring/api/monitoring.api";
import { JobDetailPanel } from "@/components/JobDetailPanel";
import { QUERY_KEYS } from "@/lib/constants";
import type { ComplianceResult, ErrorLogEntry, Job } from "@/lib/types";

const AUTO_REFRESH_INTERVAL = 30_000;

/**
 * Consolidated alerts view: recent backend errors, failed jobs, and failing
 * compliance results. Shared by the global Overview (Home) and any dedicated
 * alerts surface.
 */
export function AlertsPanel(): JSX.Element {
  const [autoRefresh, setAutoRefresh] = useState(false);

  const refetchInterval = autoRefresh ? AUTO_REFRESH_INTERVAL : false;

  const errorsQuery = useQuery({
    queryKey: [QUERY_KEYS.monitoringAlerts, "errors"],
    queryFn: () => fetchErrorLogs({ page: 1, per_page: 10 }),
    refetchInterval,
  });

  const failedJobsQuery = useQuery({
    queryKey: [QUERY_KEYS.monitoringAlerts, "failedJobs"],
    queryFn: () => fetchJobs({ "page[size]": 10, status: "failed" }),
    refetchInterval,
  });

  const complianceFailuresQuery = useQuery({
    queryKey: [QUERY_KEYS.monitoringAlerts, "complianceFailures"],
    queryFn: () => fetchComplianceResults({ per_page: 10, status: "fail" }),
    refetchInterval,
  });

  const errorColumns: ColumnDef<ErrorLogEntry>[] = [
    {
      key: "message",
      header: "Error",
      accessor: (entry) => (
        <div>
          <div className="font-medium text-text">{entry.message}</div>
          <div className="font-mono text-xs text-muted">{entry.correlation_id}</div>
        </div>
      ),
    },
    {
      key: "level",
      header: "Level",
      accessor: (entry) => entry.level,
    },
    {
      key: "created_at",
      header: "When",
      accessor: (entry) => new Date(entry.created_at).toLocaleString(),
    },
  ];

  const jobColumns: ColumnDef<Job>[] = [
    {
      key: "id",
      header: "Job",
      accessor: (job) => (
        <div>
          <div className="font-medium text-text">#{job.id}</div>
          <div className="font-mono text-xs text-muted">{job.job_type}</div>
        </div>
      ),
    },
    {
      key: "queue",
      header: "Queue",
      accessor: (job) => job.queue ?? "default",
    },
    {
      key: "created_at",
      header: "Created",
      accessor: (job) => (job.timestamps.created_at ? new Date(job.timestamps.created_at).toLocaleString() : "—"),
    },
  ];

  const complianceColumns: ColumnDef<ComplianceResult>[] = useMemo(
    () => [
      {
        key: "device_id",
        header: "Device",
        accessor: (result) => `Device #${result.device_id}`,
      },
      {
        key: "policy_id",
        header: "Policy",
        accessor: (result) => `Policy #${result.policy_id}`,
      },
      {
        key: "details",
        header: "Details",
        accessor: (result) => String(result.details?.summary ?? result.details?.observed ?? "Failure recorded"),
      },
      {
        key: "evaluated_at",
        header: "When",
        accessor: (result) => (result.evaluated_at ? new Date(result.evaluated_at).toLocaleString() : "—"),
      },
    ],
    [],
  );

  const errorCount = errorsQuery.data?.length ?? 0;
  const failedJobCount = failedJobsQuery.data?.data.length ?? 0;
  const complianceCount = complianceFailuresQuery.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-4 w-4 rounded border-primary/30 text-primary focus:ring-primary/50"
          />
          Auto-refresh (30s)
        </label>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <AlertStatCard title="Recent errors" value={String(errorCount)} tone="critical" />
        <AlertStatCard title="Failed jobs" value={String(failedJobCount)} tone="warning" />
        <AlertStatCard title="Compliance failures" value={String(complianceCount)} tone="critical" />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-3">
          <h3 className="font-heading text-xl text-primary">Error stream</h3>
          <DataTable
            columns={errorColumns}
            data={errorsQuery.data ?? []}
            keyExtractor={(entry) => entry.id}
            expandable={{
              render: (entry) => (
                <div className="space-y-2">
                  <p className="text-sm text-text">{entry.message}</p>
                  <p className="font-mono text-xs text-muted">
                    Correlation ID: {entry.correlation_id}
                  </p>
                </div>
              ),
            }}
            isLoading={errorsQuery.isLoading}
            isError={errorsQuery.isError}
            onRetry={() => errorsQuery.refetch()}
            errorMessage="Unable to load recent errors."
            dense
            emptyState={<p className="text-sm text-muted">No recent errors logged.</p>}
          />
          <div className="text-right">
            <Link to="/monitoring/logs" className="text-sm font-medium text-primary hover:underline">
              View all errors →
            </Link>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-heading text-xl text-primary">Failed jobs</h3>
          <DataTable
            columns={jobColumns}
            data={failedJobsQuery.data?.data ?? []}
            keyExtractor={(job) => job.id}
            expandable={{
              render: (job) => <JobDetailPanel job={job} deviceNames={{}} />,
            }}
            isLoading={failedJobsQuery.isLoading}
            isError={failedJobsQuery.isError}
            onRetry={() => failedJobsQuery.refetch()}
            errorMessage="Unable to load failed jobs."
            dense
            emptyState={<p className="text-sm text-muted">No failed jobs in the current window.</p>}
          />
          <div className="text-right">
            <Link to="/automation/runs?status=failed" className="text-sm font-medium text-primary hover:underline">
              View all failed jobs →
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-heading text-xl text-primary">Compliance failures</h3>
        <DataTable
          columns={complianceColumns}
          data={complianceFailuresQuery.data ?? []}
          keyExtractor={(result) => result.id}
          expandable={{
            render: (result) => (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">Details</p>
                <pre className="overflow-x-auto rounded-xl border border-primary/10 bg-background/60 p-3 font-mono text-xs text-text">
                  {JSON.stringify(result.details ?? {}, null, 2)}
                </pre>
              </div>
            ),
          }}
          isLoading={complianceFailuresQuery.isLoading}
          isError={complianceFailuresQuery.isError}
          onRetry={() => complianceFailuresQuery.refetch()}
          errorMessage="Unable to load compliance failures."
          dense
          emptyState={<p className="text-sm text-muted">No failing compliance results returned.</p>}
        />
        <div className="text-right">
          <Link to="/compliance/results?status=fail" className="text-sm font-medium text-primary hover:underline">
            View all compliance failures →
          </Link>
        </div>
      </section>
    </div>
  );
}

function AlertStatCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: "warning" | "critical";
}) {
  return (
    <article className="rounded-2xl border border-primary/10 bg-surface p-5 shadow-sm">
      <p className="text-sm text-muted">{title}</p>
      <p className={`mt-1 font-heading text-3xl ${tone === "critical" ? "text-red-500" : "text-amber-500"}`}>{value}</p>
    </article>
  );
}
