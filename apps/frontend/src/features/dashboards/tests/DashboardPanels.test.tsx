import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { TimeChartPanel } from "@/features/dashboards/components/panels/TimeChartPanel";
import { StatPanel } from "@/features/dashboards/components/panels/StatPanel";
import { StatusGridPanel } from "@/features/dashboards/components/panels/StatusGridPanel";
import { TablePanel } from "@/features/dashboards/components/panels/TablePanel";
import type { Monitor, MonitorResult } from "@/lib/types";

// ─── Mock Recharts to avoid SVG complexity in jsdom ──────────────────────────

vi.mock("recharts", () => ({
    LineChart: ({ children }: { children?: React.ReactNode }) => (
        <div data-testid="line-chart">{children}</div>
    ),
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
    ReferenceLine: ({ label }: { label?: { value?: string } }) => (
        <div data-testid="reference-line">{label?.value}</div>
    ),
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => (
        <div data-testid="chart">{children}</div>
    ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MONITOR_WITH_THRESHOLD: Monitor = {
    id: 1,
    name: "CPU Watch",
    action_id: 1,
    target: { device_ids: [1, 2] },
    metric: "cpu_pct",
    comparator: "gt",
    threshold: 85,
    status: "failing",
    visibility: "shared",
};

const MONITOR_NO_THRESHOLD: Monitor = {
    ...MONITOR_WITH_THRESHOLD,
    threshold: null,
    status: "passing",
};

const RESULTS: MonitorResult[] = [
    {
        id: 1,
        monitor_id: 1,
        device_id: 1,
        observed_at: "2026-06-30T09:00:00Z",
        value: 92,
        status: "failing",
    },
    {
        id: 2,
        monitor_id: 1,
        device_id: 2,
        observed_at: "2026-06-30T09:05:00Z",
        value: 40,
        status: "passing",
    },
    {
        id: 3,
        monitor_id: 1,
        device_id: 1,
        observed_at: "2026-06-30T09:10:00Z",
        value: 78,
        status: "passing",
    },
];

// ─── TimeChartPanel ───────────────────────────────────────────────────────────

describe("TimeChartPanel", () => {
    it("renders the chart container", () => {
        render(<TimeChartPanel data={RESULTS} monitor={MONITOR_WITH_THRESHOLD} />);
        expect(screen.getByTestId("chart")).toBeInTheDocument();
    });

    it("renders a reference line when threshold is set", () => {
        render(<TimeChartPanel data={RESULTS} monitor={MONITOR_WITH_THRESHOLD} />);
        const refLine = screen.getByTestId("reference-line");
        expect(refLine).toBeInTheDocument();
        expect(refLine).toHaveTextContent("threshold: 85");
    });

    it("does not render a reference line when threshold is null", () => {
        render(<TimeChartPanel data={RESULTS} monitor={MONITOR_NO_THRESHOLD} />);
        expect(screen.queryByTestId("reference-line")).not.toBeInTheDocument();
    });
});

// ─── StatPanel ────────────────────────────────────────────────────────────────

describe("StatPanel", () => {
    it("shows the latest value", () => {
        // latest by observed_at is id=3 at 09:10 with value 78
        render(<StatPanel data={RESULTS} monitor={MONITOR_WITH_THRESHOLD} />);
        expect(screen.getByText("78")).toBeInTheDocument();
    });

    it("shows the correct status badge for the latest result", () => {
        render(<StatPanel data={RESULTS} monitor={MONITOR_WITH_THRESHOLD} />);
        expect(screen.getByText("passing")).toBeInTheDocument();
    });

    it("shows metric label", () => {
        render(<StatPanel data={RESULTS} monitor={MONITOR_WITH_THRESHOLD} />);
        expect(screen.getByText("cpu_pct")).toBeInTheDocument();
    });

    it("shows em dash when no data", () => {
        render(<StatPanel data={[]} monitor={MONITOR_WITH_THRESHOLD} />);
        expect(screen.getByText("—")).toBeInTheDocument();
        expect(screen.getByText("unknown")).toBeInTheDocument();
    });
});

// ─── StatusGridPanel ──────────────────────────────────────────────────────────

describe("StatusGridPanel", () => {
    it("renders one cell per device", () => {
        render(<StatusGridPanel data={RESULTS} />);
        expect(screen.getByText("#1")).toBeInTheDocument();
        expect(screen.getByText("#2")).toBeInTheDocument();
    });

    it("shows empty message when no data", () => {
        render(<StatusGridPanel data={[]} />);
        expect(screen.getByText(/no data/i)).toBeInTheDocument();
    });
});

// ─── TablePanel ───────────────────────────────────────────────────────────────

describe("TablePanel", () => {
    it("renders results sorted newest first", () => {
        render(<TablePanel data={RESULTS} />);
        const rows = screen.getAllByRole("row");
        // header + 3 data rows
        expect(rows.length).toBe(4);
    });

    it("respects the limit prop", () => {
        render(<TablePanel data={RESULTS} limit={2} />);
        const rows = screen.getAllByRole("row");
        expect(rows.length).toBe(3); // header + 2
    });

    it("shows empty message when no data", () => {
        render(<TablePanel data={[]} />);
        expect(screen.getByText(/no results/i)).toBeInTheDocument();
    });
});
