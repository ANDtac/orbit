import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MonitorDetailPage } from "@/features/monitors/pages/MonitorDetailPage";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { DemoProvider } from "@/contexts/DemoContext";
import type { Monitor, MonitorResult } from "@/lib/types";

// ─── API mocks ────────────────────────────────────────────────────────────────

vi.mock("@/features/monitors/api/monitors.api", () => ({
    fetchMonitor: vi.fn(),
    fetchMonitorResults: vi.fn(),
    runMonitor: vi.fn(),
    fetchMonitorAlerts: vi.fn().mockResolvedValue([]),
    COMPARATOR_LABELS: {
        gt: "> (greater than)",
        lt: "< (less than)",
        gte: ">= (greater than or equal)",
        lte: "<= (less than or equal)",
        eq: "= (equal)",
        ne: "≠ (not equal)",
    },
}));

vi.mock("@/features/automation/api/schedules.api", () => ({
    fetchSchedules: vi.fn().mockResolvedValue([]),
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
    fireSchedule: vi.fn(),
    PRESET_LABELS: {
        every_5m:  "Every 5 min",
        every_15m: "Every 15 min",
        every_30m: "Every 30 min",
        hourly:    "Hourly",
        daily:     "Daily",
        weekly:    "Weekly",
    },
    SCHEDULE_PRESETS: [],
    SCHEDULE_TIMEZONES: ["UTC"],
}));

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

import {
    fetchMonitor,
    fetchMonitorResults,
    runMonitor,
} from "@/features/monitors/api/monitors.api";

// ─── Helper that wraps component with routing so useParams works ──────────────

function renderDetailPage(monitorId: number) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <ThemeProvider>
            <QueryClientProvider client={qc}>
                <MemoryRouter
                    initialEntries={[`/monitoring/monitors/${monitorId}`]}
                    future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
                >
                    <DemoProvider>
                        <Routes>
                            <Route
                                path="/monitoring/monitors/:id"
                                element={<MonitorDetailPage />}
                            />
                        </Routes>
                    </DemoProvider>
                </MemoryRouter>
            </QueryClientProvider>
        </ThemeProvider>,
    );
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEMO_MONITOR: Monitor = {
    id: 42,
    name: "CPU Watch",
    description: "Tracks CPU utilisation.",
    action_id: 1,
    action_name: "Show Version",
    target: { device_ids: [1, 2, 3] },
    metric: "cpu_pct",
    comparator: "gt",
    threshold: 85,
    status: "failing",
    visibility: "shared",
    last_run: "2026-06-30T10:00:00Z",
};

const DEMO_RESULTS: MonitorResult[] = [
    {
        id: 1,
        monitor_id: 42,
        device_id: 1,
        observed_at: "2026-06-30T09:55:00Z",
        value: 92,
        status: "failing",
        payload: {},
    },
    {
        id: 2,
        monitor_id: 42,
        device_id: 2,
        observed_at: "2026-06-30T09:55:00Z",
        value: 45,
        status: "passing",
        payload: {},
    },
];

describe("MonitorDetailPage", () => {
    it("renders config summary with monitor details", async () => {
        vi.mocked(fetchMonitor).mockResolvedValue(DEMO_MONITOR);
        vi.mocked(fetchMonitorResults).mockResolvedValue({
            data: DEMO_RESULTS,
            page: { total: 2, limit: 20 },
        });

        renderDetailPage(42);

        expect(await screen.findByText("CPU Watch")).toBeInTheDocument();
        expect(screen.getByText("Tracks CPU utilisation.")).toBeInTheDocument();

        // Config card
        expect(await screen.findByText("Show Version")).toBeInTheDocument();
        expect(screen.getByText("cpu_pct")).toBeInTheDocument();
        expect(screen.getByText(/3 device/i)).toBeInTheDocument();
    });

    it("renders results table", async () => {
        vi.mocked(fetchMonitor).mockResolvedValue(DEMO_MONITOR);
        vi.mocked(fetchMonitorResults).mockResolvedValue({
            data: DEMO_RESULTS,
            page: { total: 2, limit: 20 },
        });

        renderDetailPage(42);

        expect(await screen.findByText("Results")).toBeInTheDocument();
        // device IDs shown as #1, #2
        expect(await screen.findByText("#1")).toBeInTheDocument();
        expect(screen.getByText("#2")).toBeInTheDocument();
    });

    it("calls runMonitor when Run now is clicked", async () => {
        vi.mocked(fetchMonitor).mockResolvedValue(DEMO_MONITOR);
        vi.mocked(fetchMonitorResults).mockResolvedValue({
            data: [],
            page: { total: 0, limit: 20 },
        });
        vi.mocked(runMonitor).mockResolvedValue({
            job: {
                id: 99,
                uuid: "job-99",
                job_type: "monitor.run",
                status: "queued",
                queue: "default",
                priority: 5,
                timestamps: {},
                tasks: [],
                events: [],
            },
            enqueued: true,
        });

        const user = userEvent.setup();
        renderDetailPage(42);

        const runBtn = await screen.findByRole("button", { name: /run now/i });
        await user.click(runBtn);

        await waitFor(() => {
            expect(runMonitor).toHaveBeenCalledWith(42);
        });
    });
});
