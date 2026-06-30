import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import type { Device, PasswordChangeResult } from "@/lib/types";

function sortWeight(result: PasswordChangeResult): number {
  if (result.ok) return 3;
  if (result.phase === "completed") return 0;
  if (result.phase === "validate") return 1;
  return 2;
}

function statusDot(result: PasswordChangeResult): string {
  if (result.ok) return "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.35)]";
  if (result.phase === "completed") return "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.35)]";
  return "bg-amber-400 animate-pulse shadow-[0_0_12px_rgba(251,191,36,0.35)]";
}

interface PasswordChangeProgressProps {
  results: PasswordChangeResult[];
  devices: Device[];
  isPolling: boolean;
  onRetryFailed?: () => void;
}

export function PasswordChangeProgress({
  results,
  devices,
  isPolling,
  onRetryFailed,
}: PasswordChangeProgressProps): JSX.Element {
  const deviceMap = new Map(devices.map((device) => [device.id, device]));
  const orderedResults = [...results].sort((left, right) => sortWeight(left) - sortWeight(right));
  const completed = results.filter((result) => result.ok || result.phase === "completed").length;
  const failedIds = results.filter((result) => !result.ok).map((result) => result.device_id);

  return (
    <section className="space-y-4 rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-heading text-xl text-primary">Execution progress</h3>
          <p className="mt-1 text-sm text-muted">
            {completed} / {results.length} complete {isPolling ? "• polling every 2 seconds" : ""}
          </p>
        </div>
        {failedIds.length > 0 && onRetryFailed ? (
          <Button variant="outline" onClick={onRetryFailed}>
            Retry failed
          </Button>
        ) : null}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-primary/10">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${results.length ? (completed / results.length) * 100 : 0}%` }}
        />
      </div>

      <DataTable<PasswordChangeResult>
        columns={[
          {
            key: "status",
            header: "Status",
            accessor: (result) => (
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusDot(result)}`} />
            ),
            width: "w-16",
          },
          {
            key: "device_id",
            header: "Device",
            accessor: (result) => {
              const device = deviceMap.get(result.device_id);
              return (
                <div>
                  <div className="font-medium text-text">{device?.name ?? `Device ${result.device_id}`}</div>
                  <div className="font-mono text-xs text-muted">
                    {device?.mgmt_ipv4 ?? result.host ?? "Unknown"}
                  </div>
                </div>
              );
            },
          },
          {
            key: "platform",
            header: "Platform",
            accessor: (result) => (
              <span className="rounded-full border border-primary/20 px-2 py-1 font-mono text-xs text-primary">
                {result.platform ?? "unknown"}
              </span>
            ),
          },
          {
            key: "phase",
            header: "Phase",
            accessor: (result) => result.phase ?? "pending",
          },
          {
            key: "details",
            header: "Details",
            accessor: (result) => (
              <span className="text-xs text-muted">
                {result.error ?? result.output ?? (result.ok ? "Completed" : "Waiting")}
              </span>
            ),
          },
        ]}
        data={orderedResults}
        keyExtractor={(result) => result.device_id}
        dense
      />
    </section>
  );
}
