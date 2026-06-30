import type { Job } from "@/lib/types";

interface JobDetailPanelProps {
  job: Job;
  deviceNames: Record<number, string>;
}

function formatTimestamp(value?: string): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function taskTarget(task: Job["tasks"][number], deviceNames: Record<number, string>): string {
  if (task.device_id != null) {
    return deviceNames[task.device_id] ?? `Device #${task.device_id}`;
  }
  if (task.target_type && task.target_id != null) {
    return `${task.target_type} #${task.target_id}`;
  }
  return "—";
}

export function JobDetailPanel({ job, deviceNames }: JobDetailPanelProps): JSX.Element {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Tasks</p>
          <div className="mt-2 overflow-hidden rounded-xl border border-primary/10">
            <table className="min-w-full divide-y divide-primary/10">
              <thead className="bg-primary/5">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-primary">Sequence</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-primary">Task</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-primary">Target</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-primary">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/5 bg-surface">
                {job.tasks.length ? (
                  job.tasks.map((task) => (
                    <tr key={task.id}>
                      <td className="px-3 py-2 font-mono text-xs text-text">{task.sequence}</td>
                      <td className="px-3 py-2 text-xs text-text">{task.task_type}</td>
                      <td className="px-3 py-2 text-xs text-text">{taskTarget(task, deviceNames)}</td>
                      <td className="px-3 py-2 text-xs uppercase text-text">{task.status}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-xs text-muted">
                      No task breakdown recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Parameters</p>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-primary/10 bg-background/60 p-4 font-mono text-xs text-text">
            {JSON.stringify(job.parameters ?? {}, null, 2)}
          </pre>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-primary/10 bg-background/40 p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Timing</p>
          <dl className="mt-3 space-y-2 text-sm text-text">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Created</dt>
              <dd>{formatTimestamp(job.timestamps.created_at)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Started</dt>
              <dd>{formatTimestamp(job.timestamps.started_at)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">Finished</dt>
              <dd>{formatTimestamp(job.timestamps.finished_at)}</dd>
            </div>
          </dl>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Events</p>
          <div className="mt-2 space-y-2">
            {job.events.length ? (
              job.events.map((event) => (
                <div key={event.id} className="rounded-xl border border-primary/10 bg-background/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-primary">{event.event_type}</span>
                    <span className="text-xs text-muted">{formatTimestamp(event.occurred_at)}</span>
                  </div>
                  <p className="mt-2 text-sm text-text">{event.message ?? "No message recorded."}</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-primary/10 bg-background/40 p-3 text-sm text-muted">
                No events recorded.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
