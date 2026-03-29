import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

import { Button } from "@/components/ui/Button";
import { fetchErrorLogs, fetchRequestLogs } from "@/features/monitoring/api/monitoring.api";
import { QUERY_KEYS } from "@/lib/constants";

const PAGE_SIZE = 25;

export function MonitoringLogsPage(): JSX.Element {
  const [requestPage, setRequestPage] = useState(1);
  const [errorPage, setErrorPage] = useState(1);

  const {
    data: requestLogs = [],
    isLoading: requestLoading,
    isError: requestError,
  } = useQuery({
    queryKey: [QUERY_KEYS.requestLogs, requestPage],
    queryFn: () => fetchRequestLogs({ page: requestPage, per_page: PAGE_SIZE }),
  });

  const {
    data: errorLogs = [],
    isLoading: errorLoading,
    isError: errorError,
  } = useQuery({
    queryKey: [QUERY_KEYS.errorLogs, errorPage],
    queryFn: () => fetchErrorLogs({ page: errorPage, per_page: PAGE_SIZE }),
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
              {requestLogs.length ? (
                requestLogs.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 text-sm text-text">
                      {entry.method} {entry.path}
                    </td>
                    <td className="px-4 py-3 text-sm text-text">{entry.status_code}</td>
                    <td className="px-4 py-3 text-sm text-muted">
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-center text-sm text-muted">
                    No request logs yet…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRequestPage((page) => Math.max(1, page - 1))} disabled={requestPage === 1}>
            Previous
          </Button>
          <Button
            variant="ghost"
            onClick={() => setRequestPage((page) => page + 1)}
            disabled={requestLogs.length < PAGE_SIZE}
          >
            Next
          </Button>
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
              {errorLogs.length ? (
                errorLogs.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 text-sm uppercase text-text">{entry.level}</td>
                    <td className="px-4 py-3 text-sm text-text">{entry.message}</td>
                    <td className="px-4 py-3 text-sm text-muted">
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-center text-sm text-muted">
                    No error logs yet…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setErrorPage((page) => Math.max(1, page - 1))} disabled={errorPage === 1}>
            Previous
          </Button>
          <Button variant="ghost" onClick={() => setErrorPage((page) => page + 1)} disabled={errorLogs.length < PAGE_SIZE}>
            Next
          </Button>
        </div>
      </section>
    </div>
  );
}
