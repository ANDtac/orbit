import type { MonitorResult, MonitorResultStatus } from "@/lib/types";

interface TablePanelProps {
    data: MonitorResult[];
    limit?: number;
}

function StatusBadge({ status }: { status: MonitorResultStatus }): JSX.Element {
    const styles: Record<string, string> = {
        passing: "bg-emerald-500/15 text-emerald-400",
        failing: "bg-red-500/15 text-red-400",
        error: "bg-amber-500/15 text-amber-400",
    };
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[status] ?? ""}`}
        >
            {status}
        </span>
    );
}

export function TablePanel({ data, limit = 10 }: TablePanelProps): JSX.Element {
    const rows = [...data]
        .sort((a, b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime())
        .slice(0, limit);

    if (rows.length === 0) {
        return <p className="p-4 text-sm text-muted">No results recorded yet.</p>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-primary/10">
                        <th className="py-2 pr-4 text-left text-xs uppercase tracking-[0.18em] text-muted">
                            Observed
                        </th>
                        <th className="py-2 pr-4 text-left text-xs uppercase tracking-[0.18em] text-muted">
                            Device
                        </th>
                        <th className="py-2 pr-4 text-left text-xs uppercase tracking-[0.18em] text-muted">
                            Value
                        </th>
                        <th className="py-2 text-left text-xs uppercase tracking-[0.18em] text-muted">
                            Status
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.id} className="border-b border-primary/5">
                            <td className="py-1.5 pr-4 text-muted">
                                {new Date(row.observed_at).toLocaleString()}
                            </td>
                            <td className="py-1.5 pr-4 font-mono text-text">#{row.device_id}</td>
                            <td className="py-1.5 pr-4 font-mono text-text">
                                {row.value !== null ? String(row.value) : "—"}
                            </td>
                            <td className="py-1.5">
                                <StatusBadge status={row.status} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
