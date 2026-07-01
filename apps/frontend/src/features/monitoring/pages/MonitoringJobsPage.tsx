import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef, CursorPagination } from "@/components/ui/DataTable";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchJobs } from "@/features/monitoring/api/monitoring.api";
import { JobDetailPanel } from "@/components/JobDetailPanel";
import { QUERY_KEYS } from "@/lib/constants";
import type { Job } from "@/lib/types";

function statusTone(status: Job["status"]): string {
  if (status === "succeeded" || status === "finished") return "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.45)]";
  if (status === "failed" || status === "cancelled") return "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.45)]";
  if (status === "running") return "bg-amber-400 animate-pulse";
  return "bg-slate-400";
}

function formatDuration(start?: string, end?: string): string {
  if (!start || !end) {
    return "—";
  }

  const elapsed = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(elapsed) || elapsed <= 0) {
    return "—";
  }

  const seconds = Math.round(elapsed / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

export function MonitoringJobsPage(): JSX.Element {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState("");

  const queryOptions = useMemo(
    () => ({
      cursor,
      "page[size]": 25,
      status: statusFilter || undefined,
    }),
    [cursor, statusFilter],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [QUERY_KEYS.jobs, "monitoring", queryOptions],
    queryFn: () => fetchJobs(queryOptions),
  });

  const { data: devicesResponse } = useQuery({
    queryKey: [QUERY_KEYS.devices, "monitoring-jobs-device-map"],
    queryFn: () => fetchDevices({ "page[size]": 200, sort: "name" }),
    staleTime: 5 * 60 * 1000,
  });

  const deviceNames = useMemo(
    () =>
      (devicesResponse?.data ?? []).reduce<Record<number, string>>((acc, device) => {
        acc[device.id] = device.name;
        return acc;
      }, {}),
    [devicesResponse],
  );

  const columns: ColumnDef<Job>[] = [
    {
      key: "id",
      header: "ID",
      accessor: (job) => <span className="font-mono text-xs">#{job.id}</span>,
    },
    {
      key: "job_type",
      header: "Job Type",
      accessor: (job) => (
        <span className="inline-flex rounded-full border border-primary/20 px-2 py-1 font-mono text-xs text-primary">
          {job.job_type}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      accessor: (job) => (
        <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-text">
          <span className={`h-2 w-2 rounded-full ${statusTone(job.status)}`} />
          {job.status}
        </span>
      ),
    },
    {
      key: "devices",
      header: "Devices",
      accessor: (job) => String(job.progress?.total ?? job.tasks.length),
    },
    {
      key: "created_at",
      header: "Created",
      accessor: (job) =>
        job.timestamps.created_at ? new Date(job.timestamps.created_at).toLocaleString() : "—",
    },
    {
      key: "duration",
      header: "Duration",
      accessor: (job) => formatDuration(job.timestamps.started_at, job.timestamps.finished_at),
    },
  ];

  const pagination: CursorPagination | undefined = data
    ? {
        mode: "cursor",
        cursor: data.page.cursor,
        next: data.page.next,
        prev: data.page.prev,
        total: data.page.total,
        pageSize: data.page.size,
        onPageChange: setCursor,
      }
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted">
          All monitoring jobs. Click a row to inspect task and event details.
        </p>
        <div className="min-w-[160px]">
          <label className="mb-1 block text-xs font-medium text-muted">Status</label>
          <select
            value={statusFilter}
            onChange={(event) => {
              setCursor(undefined);
              setStatusFilter(event.target.value);
            }}
            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
          >
            <option value="">All statuses</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(job) => job.id}
        pagination={pagination}
        expandable={{
          render: (job) => <JobDetailPanel job={job} deviceNames={deviceNames} />,
        }}
        isLoading={isLoading}
        isError={isError}
        errorMessage="Unable to load monitoring jobs."
        onRetry={() => refetch()}
        dense
        emptyState={<p className="text-sm text-muted">No jobs match the current filters.</p>}
      />
    </div>
  );
}
