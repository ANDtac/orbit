import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchJobs } from "@/features/monitoring/api/monitoring.api";
import { JobsTable } from "@/features/monitoring/components/JobsTable";
import { Button } from "@/components/ui/Button";
import { QUERY_KEYS } from "@/lib/constants";

export function MonitoringJobsPage(): JSX.Element {
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isLoading, isError } = useQuery({
    queryKey: [QUERY_KEYS.jobs, cursor],
    queryFn: () => fetchJobs({ cursor, "page[size]": 25 }),
  });

  if (isLoading) {
    return <p className="text-muted">Loading jobs…</p>;
  }

  if (isError || !data) {
    return <p className="text-red-500">Unable to load jobs right now.</p>;
  }

  return (
    <div className="space-y-4">
      <JobsTable jobs={data.data} />
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => setCursor(data.page.prev)} disabled={!data.page.prev}>
          Previous
        </Button>
        <Button variant="ghost" onClick={() => setCursor(data.page.next)} disabled={!data.page.next}>
          Next
        </Button>
      </div>
    </div>
  );
}
