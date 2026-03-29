import { useQuery } from "@tanstack/react-query";

import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchJobs } from "@/features/monitoring/api/monitoring.api";
import { PasswordRotationCard } from "@/features/monitoring/components/PasswordRotationCard";
import { QUERY_KEYS } from "@/lib/constants";

export function MonitoringOverviewPage(): JSX.Element {
  const { data: devices = [] } = useQuery({
    queryKey: [QUERY_KEYS.devices],
    queryFn: fetchDevices,
  });

  const { data: jobs = [], isLoading, isError } = useQuery({
    queryKey: [QUERY_KEYS.jobs],
    queryFn: fetchJobs,
  });

  const queuedJobs = jobs.filter((job) => job.status === "queued").length;
  const failedJobs = jobs.filter((job) => job.status === "failed").length;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Managed devices" value={String(devices.length)} />
        <StatCard title="Queued jobs" value={String(queuedJobs)} />
        <StatCard title="Failed jobs" value={String(failedJobs)} emphasize={failedJobs > 0} />
      </section>

      {isLoading ? <p className="text-muted">Loading monitoring summary…</p> : null}
      {isError ? <p className="text-red-500">Monitoring summary unavailable.</p> : null}

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
