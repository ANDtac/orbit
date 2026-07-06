import type { Monitor, MonitorResult, MonitorResultStatus } from "@/lib/types";

interface StatPanelProps {
    data: MonitorResult[];
    monitor: Monitor;
}

function StatusBadge({ status }: { status: MonitorResultStatus | "unknown" }): JSX.Element {
    const styles: Record<string, string> = {
        passing: "bg-emerald-500/15 text-emerald-400",
        failing: "bg-red-500/15 text-red-400",
        error: "bg-amber-500/15 text-amber-400",
        unknown: "bg-primary/15 text-muted",
    };
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[status] ?? styles.unknown}`}
        >
            {status}
        </span>
    );
}

export function StatPanel({ data, monitor }: StatPanelProps): JSX.Element {
    // Latest result = most recent observed_at
    const sorted = [...data].sort(
        (a, b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime(),
    );
    const latest = sorted[0];

    const value = latest?.value;
    const status = latest?.status ?? "unknown";
    const displayValue = value !== null && value !== undefined ? String(value) : "—";

    return (
        <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">{monitor.metric}</p>
            <p className="font-heading text-4xl font-semibold text-text">{displayValue}</p>
            <StatusBadge status={status as MonitorResultStatus | "unknown"} />
            {latest?.observed_at ? (
                <p className="text-xs text-muted">
                    {new Date(latest.observed_at).toLocaleString()}
                </p>
            ) : null}
        </div>
    );
}
