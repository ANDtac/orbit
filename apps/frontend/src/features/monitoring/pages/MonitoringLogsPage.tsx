import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

import { fetchErrorLogs, fetchRequestLogs } from "@/features/monitoring/api/monitoring.api";
import { QUERY_KEYS } from "@/lib/constants";

export function MonitoringLogsPage(): JSX.Element {
  const {
    data: requestLogs = [],
    isLoading: requestLoading,
    isError: requestError,
  } = useQuery({
    queryKey: [QUERY_KEYS.requestLogs],
    queryFn: fetchRequestLogs,
  });

  const {
    data: errorLogs = [],
    isLoading: errorLoading,
    isError: errorError,
  } = useQuery({
    queryKey: [QUERY_KEYS.errorLogs],
    queryFn: fetchErrorLogs,
  });

  if (requestLoading || errorLoading) {
    return <p className="text-muted">Loading logs…</p>;
  }

  if (requestError || errorError) {
    return <p className="text-red-500">Unable to load logs right now.</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3">
        <h3 className="font-heading text-xl text-primary">Request logs</h3>
        <div className="overflow-hidden rounded-2xl border border-primary/10">
          <table className="min-w-full divide-y divide-primary/10">
            <thead className="bg-primary/10">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-primary">Path</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-primary">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-primary">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary/5 bg-surface">
              {requestLogs.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 text-sm text-text">{entry.method} {entry.path}</td>
                  <td className="px-4 py-3 text-sm text-text">{entry.status_code}</td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-heading text-xl text-primary">Error logs</h3>
        <div className="overflow-hidden rounded-2xl border border-primary/10">
          <table className="min-w-full divide-y divide-primary/10">
            <thead className="bg-primary/10">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-primary">Level</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-primary">Message</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-primary">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary/5 bg-surface">
              {errorLogs.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 text-sm uppercase text-text">{entry.level}</td>
                  <td className="px-4 py-3 text-sm text-text">{entry.message}</td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
