import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef, CursorPagination } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { fetchJobs } from "@/features/monitoring/api/monitoring.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { Job } from "@/lib/types";
import apiClient from "@/lib/apiClient";

type Classification = "all" | "runs" | "system";

const CLASSIFICATION_OPTIONS: { value: Classification; label: string }[] = [
  { value: "all", label: "All" },
  { value: "runs", label: "Runs" },
  { value: "system", label: "System" },
];

// Maps the segmented toggle to the backend `run_as_internal` query param.
// System jobs (e.g. device.discovery) set run_as_internal=true; operator Runs
// are false. "All" omits the param entirely.
function classificationToParam(classification: Classification): boolean | undefined {
  if (classification === "system") return true;
  if (classification === "runs") return false;
  return undefined;
}

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

function isTerminalStatus(status?: string): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled" || status === "finished";
}

// NOTE: The jobs backend (app/api/v1/resources/jobs.py) exposes only list/create/get —
// there is no cancel/abort endpoint, so no Cancel action is offered (no dead surfaces).

// Re-run a job by re-posting the same job_type + parameters to /jobs
// TODO: Confirm re-run API endpoint with backend — using POST /jobs with original job_type and parameters as best guess
export async function reRunJob(job: Job): Promise<Job> {
  const { data } = await apiClient.post<Job>("/jobs", {
    job_type: job.job_type,
    parameters: job.parameters ?? {},
  });
  return data;
}

export function RunsPage(): JSX.Element {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [classification, setClassification] = useState<Classification>("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reRunTarget, setReRunTarget] = useState<Job | null>(null);

  const queryOptions = useMemo(
    () => ({
      cursor,
      "page[size]": 25,
      status: statusFilter || undefined,
      run_as_internal: classificationToParam(classification),
    }),
    [cursor, statusFilter, classification],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [QUERY_KEYS.jobs, "runs", queryOptions],
    queryFn: () => fetchJobs(queryOptions),
  });

  const reRunMutation = useMutation({
    mutationFn: reRunJob,
    onSuccess: () => {
      toast.success("Re-run job queued successfully.");
      setReRunTarget(null);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Failed to queue re-run job.";
      toast.error(msg);
    },
  });

  // Client-side date filtering
  // TODO: Pass date params to API when backend supports date range filtering on /jobs
  const filteredJobs = useMemo(() => {
    const jobs = data?.data ?? [];
    if (!dateFrom && !dateTo) return jobs;
    const from = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
    const to = dateTo ? new Date(dateTo + "T23:59:59").getTime() : Infinity;
    return jobs.filter((job) => {
      const created = job.timestamps.created_at ? new Date(job.timestamps.created_at).getTime() : 0;
      return created >= from && created <= to;
    });
  }, [data?.data, dateFrom, dateTo]);

  const columns: ColumnDef<Job>[] = [
    {
      key: "id",
      header: "ID",
      accessor: (job) => <span className="font-mono text-xs">#{job.id}</span>,
    },
    {
      key: "classification",
      header: "Kind",
      accessor: (job) =>
        job.run_as_internal ? (
          <span className="inline-flex rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-sky-300">
            System
          </span>
        ) : (
          <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-primary">
            Run
          </span>
        ),
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
    {
      key: "actions",
      header: "",
      accessor: (job) => (
        <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/automation/runs/${job.id}`)}
          >
            View
          </Button>
          {isTerminalStatus(job.status) ? (
            <Button variant="ghost" size="sm" onClick={() => setReRunTarget(job)}>
              Re-run
            </Button>
          ) : null}
        </div>
      ),
      cellClassName: "w-[150px]",
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
          Every asynchronous execution across Orbit. Use the toggle to focus on operator runs or
          system jobs, and select a row to open its full run detail page.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Classification</span>
            <div
              role="group"
              aria-label="Classification"
              className="inline-flex rounded-xl border border-primary/30 bg-surface p-0.5"
            >
              {CLASSIFICATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={classification === option.value}
                  onClick={() => {
                    setCursor(undefined);
                    setClassification(option.value);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-sm transition ${
                    classification === option.value
                      ? "bg-primary/20 text-primary"
                      : "text-muted hover:text-text"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-[140px]">
            <label className="mb-1 block text-xs font-medium text-muted">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setCursor(undefined);
                setDateFrom(event.target.value);
              }}
              className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
            />
          </div>
          <div className="min-w-[140px]">
            <label className="mb-1 block text-xs font-medium text-muted">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setCursor(undefined);
                setDateTo(event.target.value);
              }}
              className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
            />
          </div>
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
      </div>

      <DataTable
        columns={columns}
        data={filteredJobs}
        keyExtractor={(job) => job.id}
        pagination={pagination}
        onRowClick={(job) => navigate(`/automation/runs/${job.id}`)}
        isLoading={isLoading}
        isError={isError}
        errorMessage="Unable to load runs."
        onRetry={() => void refetch()}
        dense
        emptyState={<p className="text-sm text-muted">No runs match the current filters.</p>}
      />

      <Modal
        isOpen={Boolean(reRunTarget)}
        onClose={() => setReRunTarget(null)}
        title="Re-run"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReRunTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => reRunTarget && reRunMutation.mutate(reRunTarget)}
              disabled={reRunMutation.isPending}
            >
              {reRunMutation.isPending ? "Queuing…" : "Confirm re-run"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text">
          Re-run this job? This will create a new job with the same parameters.
        </p>
        {reRunTarget ? (
          <div className="mt-3 rounded-xl border border-primary/10 bg-background/40 px-4 py-3 text-xs text-muted">
            <span className="font-mono text-primary">#{reRunTarget.id}</span> — {reRunTarget.job_type}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
