import { useQuery } from "@tanstack/react-query";

import { fetchJobs } from "@/features/monitoring/api/monitoring.api";
import { JobsTable } from "@/features/monitoring/components/JobsTable";
import { QUERY_KEYS } from "@/lib/constants";

export function MonitoringJobsPage(): JSX.Element {
  const { data = [], isLoading, isError } = useQuery({
    queryKey: [QUERY_KEYS.jobs],
    queryFn: fetchJobs,
  });

  if (isLoading) {
    return <p className="text-muted">Loading jobs…</p>;
  }

  if (isError) {
    return <p className="text-red-500">Unable to load jobs right now.</p>;
  }

  return <JobsTable jobs={data} />;
}
