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
}

const DEVICE_COLORS = [
    "#47B9FF",
    "#3fb950",
    "#f85149",
    "#d29922",
    "#bc8cff",
    "#79c0ff",
];

export function TimeChartPanel({ data, monitor, height = 240 }: TimeChartPanelProps): JSX.Element {
    // Group by device so we can draw one line per device
    const deviceIds = [...new Set(data.map((r) => r.device_id))].sort((a, b) => a - b);

    // Build a unified timeline sorted oldest-first
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

    return (
        <ResponsiveContainer width="100%" height={height}>
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
                <Tooltip
                    contentStyle={{
                        background: "var(--color-surface, #0a1628)",
                        border: "1px solid rgba(71,185,255,0.2)",
                        borderRadius: 8,
                        fontSize: 12,
                    }}
                    labelFormatter={(label) => String(label)}
                />
                {deviceIds.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
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
                        name={`Device #${deviceId}`}
                        stroke={DEVICE_COLORS[idx % DEVICE_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                    />
                ))}
            </LineChart>
        </ResponsiveContainer>
    );
}
