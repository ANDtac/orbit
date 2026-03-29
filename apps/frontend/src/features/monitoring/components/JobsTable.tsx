import { Fragment, useState } from "react";
import { formatDistanceToNow } from "date-fns";

import type { Job } from "@/lib/types";

interface JobsTableProps {
  jobs: Job[];
}

export function JobsTable({ jobs }: JobsTableProps): JSX.Element {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (!jobs.length) {
    return <p className="text-muted">No jobs yet. Trigger an operation to populate monitoring activity.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-primary/10">
        <table className="min-w-full divide-y divide-primary/10">
          <thead className="bg-primary/10">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-primary">Job</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-primary">Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-primary">Queue</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-primary">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary/5 bg-surface">
            {jobs.map((job) => {
              const isExpanded = expandedId === job.id;
              return (
                <Fragment key={job.id}>
                  <tr
                    className="cursor-pointer transition hover:bg-primary/5"
                    onClick={() => setExpandedId((current) => (current === job.id ? null : job.id))}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-text">{job.job_type}</td>
                    <td className="px-4 py-3 text-sm uppercase text-text">{job.status}</td>
                    <td className="px-4 py-3 text-sm text-text">{job.queue ?? "default"}</td>
                    <td className="px-4 py-3 text-sm text-text">
                      {job.timestamps.created_at
                        ? formatDistanceToNow(new Date(job.timestamps.created_at), { addSuffix: true })
                        : "—"}
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr>
                      <td colSpan={4} className="bg-background/40 px-4 py-3 text-sm text-text">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <h4 className="font-semibold">Tasks</h4>
                            <ul className="mt-2 space-y-1 text-sm text-muted">
                              {job.tasks.length ? (
                                job.tasks.map((task) => (
                                  <li key={task.id}>
                                    #{task.sequence} {task.task_type} · {task.status}
                                  </li>
                                ))
                              ) : (
                                <li>No tasks recorded.</li>
                              )}
                            </ul>
                          </div>
                          <div>
                            <h4 className="font-semibold">Events</h4>
                            <ul className="mt-2 space-y-1 text-sm text-muted">
                              {job.events.length ? (
                                job.events.map((event) => <li key={event.id}>{event.event_type}: {event.message ?? "—"}</li>)
                              ) : (
                                <li>No events recorded.</li>
                              )}
                            </ul>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Click a row to inspect task and event drill-down details.</p>
    </div>
  );
}
