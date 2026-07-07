import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine,
    ResponsiveContainer,
} from "recharts";
import type { Monitor, MonitorResult } from "@/lib/types";

interface TimeChartPanelProps {
    data: MonitorResult[];
    monitor: Monitor;
    height?: number;
    deviceNames?: Record<number, string>;
    onDeviceClick?: (deviceId: number) => void;
}

const DEVICE_COLORS = [
    "#47B9FF",
    "#3fb950",
    "#f85149",
    "#d29922",
    "#bc8cff",
    "#79c0ff",
];

export function TimeChartPanel({
    data,
    monitor,
    height = 240,
    deviceNames,
    onDeviceClick,
}: TimeChartPanelProps): JSX.Element {
    const deviceIds = [...new Set(data.map((r) => r.device_id))].filter((id): id is number => id != null).sort((a, b) => a - b);

    const timeSet = [...new Set(data.map((r) => r.observed_at))].sort();
    const lookup = new Map(data.map((r) => [`${r.observed_at}:${r.device_id}`, r]));
    const chartData = timeSet.map((ts) => {
        const point: Record<string, unknown> = {
            ts,
            label: new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        for (const deviceId of deviceIds) {
            const row = lookup.get(`${ts}:${deviceId}`);
            point[`device_${deviceId}`] = row?.value ?? null;
        }
        return point;
    });

    const threshold = monitor.threshold;

    function deviceLabel(deviceId: number): string {
        return deviceNames?.[deviceId] ?? `Device #${deviceId}`;
    }

    const CustomTooltip = ({ active, payload, label }: Record<string, unknown>) => {
        if (!active || !Array.isArray(payload) || !payload.length) return null;
        return (
            <div
                style={{
                    background: "var(--color-surface, #0a1628)",
                    border: "1px solid rgba(71,185,255,0.2)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12,
                }}
            >
                <p style={{ marginBottom: 4, color: "var(--color-muted, #888)" }}>{String(label)}</p>
                {payload.map((entry: Record<string, unknown>, i: number) => {
                    const dId = deviceIds[i];
                    return (
                        <p key={i} style={{ color: entry.color as string, margin: "2px 0" }}>
                            <span
                                style={onDeviceClick && dId != null ? { cursor: "pointer", textDecoration: "underline" } : undefined}
                                onClick={() => dId != null && onDeviceClick?.(dId)}
                            >
                                {String(entry.name)}
                            </span>
                            {": "}
                            {entry.value != null ? String(entry.value) : "—"}
                        </p>
                    );
                })}
            </div>
        );
    };

    return (
        <div style={{ width: "100%", height }}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(71,185,255,0.1)" />
                    <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "var(--color-muted, #888)" }}
                        tickLine={false}
                        axisLine={false}
                    />
                    <YAxis
                        tick={{ fontSize: 11, fill: "var(--color-muted, #888)" }}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    {deviceIds.length > 1 && (
                        <Legend
                            wrapperStyle={{ fontSize: 12 }}
                            formatter={(value, entry) => {
                                const idx = deviceIds.indexOf(Number(value.replace("device_", "")));
                                const dId = deviceIds[idx >= 0 ? idx : 0];
                                return deviceLabel(dId ?? 0);
                            }}
                        />
                    )}
                    {threshold !== null && (
                        <ReferenceLine
                            y={threshold}
                            stroke="#f85149"
                            strokeDasharray="6 3"
                            label={{ value: `threshold: ${threshold}`, fill: "#f85149", fontSize: 11 }}
                        />
                    )}
                    {deviceIds.map((deviceId, idx) => (
                        <Line
                            key={deviceId}
                            type="monotone"
                            dataKey={`device_${deviceId}`}
                            name={deviceLabel(deviceId)}
                            stroke={DEVICE_COLORS[idx % DEVICE_COLORS.length]}
                            strokeWidth={2}
                            dot={false}
                            connectNulls={false}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
