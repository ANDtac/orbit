import { useQuery } from "@tanstack/react-query";

import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchJobs } from "@/features/monitoring/api/monitoring.api";
import { PasswordRotationCard } from "@/features/monitoring/components/PasswordRotationCard";
import { QUERY_KEYS } from "@/lib/constants";

export function MonitoringOverviewPage(): JSX.Element {
  const {
    data: devices = [],
    isLoading: isDevicesLoading,
    isError: isDevicesError,
  } = useQuery({
    queryKey: [QUERY_KEYS.devices],
    queryFn: fetchDevices,
  });

  const {
    data: jobsResponse,
    isLoading: isJobsLoading,
    isError: isJobsError,
  } = useQuery({
    queryKey: [QUERY_KEYS.jobs],
    queryFn: () => fetchJobs(),
  });

  if (isDevicesLoading || isJobsLoading) {
    return <p className="text-muted">Loading monitoring summary…</p>;
  }

  if (isDevicesError || isJobsError) {
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
        <StatCard title="Managed devices" value={String(devices.length)} />
        <StatCard title="Queued jobs" value={String(stats.queuedJobs)} />
        <StatCard title="Failed jobs" value={String(stats.failedJobs)} emphasize={stats.failedJobs > 0} />
      </section>

      <PasswordRotationCard />
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
