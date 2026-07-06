import type { MonitorResult, MonitorResultStatus } from "@/lib/types";

interface StatusGridPanelProps {
    data: MonitorResult[];
}

function StatusDot({ status }: { status: MonitorResultStatus | "unknown" }): JSX.Element {
    const styles: Record<string, string> = {
        passing: "bg-emerald-400",
        failing: "bg-red-400",
        error: "bg-amber-400",
        unknown: "bg-primary/30",
    };
    return (
        <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${styles[status] ?? styles.unknown}`}
        />
    );
}

export function StatusGridPanel({ data }: StatusGridPanelProps): JSX.Element {
    // Per device, take the latest result
    const deviceMap = new Map<number, MonitorResult>();
    for (const row of [...data].sort(
        (a, b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime(),
    )) {
        if (!deviceMap.has(row.device_id)) {
            deviceMap.set(row.device_id, row);
        }
    }

    const entries = [...deviceMap.entries()].sort((a, b) => a[0] - b[0]);

    if (entries.length === 0) {
        return <p className="p-4 text-sm text-muted">No data available.</p>;
    }

    return (
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
            {entries.map(([deviceId, result]) => (
                <div
                    key={deviceId}
                    className="flex items-center gap-2 rounded-lg border border-primary/10 bg-surface px-3 py-2"
                >
                    <StatusDot status={result.status} />
                    <span className="font-mono text-xs text-text">#{deviceId}</span>
                </div>
            ))}
        </div>
    );
}
