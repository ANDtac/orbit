import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchOperationJob } from "@/features/automation/api/automation.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { Job } from "@/lib/types";

import { JobDetailPanel } from "@/components/JobDetailPanel";
import { reRunJob } from "./RunsPage";

function statusTone(status?: Job["status"]): string {
  if (status === "succeeded" || status === "finished")
    return "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.45)]";
  if (status === "failed" || status === "cancelled")
    return "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.45)]";
  if (status === "running") return "bg-amber-400 animate-pulse";
  return "bg-slate-400";
}

function isTerminalStatus(status?: string): boolean {
  return (
    status === "succeeded" || status === "failed" || status === "cancelled" || status === "finished"
  );
}

export function RunDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const jobId = Number(id);
  const [isReRunOpen, setIsReRunOpen] = useState(false);

  const {
    data: job,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: [QUERY_KEYS.jobs, "run-detail", jobId],
    queryFn: () => fetchOperationJob(jobId),
    enabled: Number.isFinite(jobId),
  });

  const { data: devicesResponse } = useQuery({
    queryKey: [QUERY_KEYS.devices, "run-detail-device-map"],
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

  const reRunMutation = useMutation({
    mutationFn: reRunJob,
    onSuccess: () => {
      toast.success("Re-run job queued successfully.");
      setIsReRunOpen(false);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Failed to queue re-run job.";
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-4">
      <Link to="/automation/runs" className="text-sm text-primary hover:underline">
        ← Back to Runs
      </Link>

      {isLoading ? (
        <p className="text-sm text-muted">Loading run detail…</p>
      ) : isError || !job ? (
        <div className="rounded-2xl border border-primary/10 bg-surface p-6 text-sm text-muted">
          <p>Unable to load this run.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-primary">#{job.id}</span>
                <span className="inline-flex rounded-full border border-primary/20 px-2 py-1 font-mono text-xs text-primary">
                  {job.job_type}
                </span>
              </div>
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-text">
                <span className={`h-2 w-2 rounded-full ${statusTone(job.status)}`} />
                {job.status}
              </p>
            </div>
            {isTerminalStatus(job.status) ? (
              <Button variant="outline" onClick={() => setIsReRunOpen(true)}>
                Re-run
              </Button>
            ) : null}
          </section>

          <JobDetailPanel job={job} deviceNames={deviceNames} />

          <Modal
            isOpen={isReRunOpen}
            onClose={() => setIsReRunOpen(false)}
            title="Re-run"
            footer={
              <>
                <Button variant="ghost" onClick={() => setIsReRunOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => reRunMutation.mutate(job)}
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
            <div className="mt-3 rounded-xl border border-primary/10 bg-background/40 px-4 py-3 text-xs text-muted">
              <span className="font-mono text-primary">#{job.id}</span> — {job.job_type}
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
