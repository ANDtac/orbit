import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { DashboardDetailPage } from "@/features/dashboards/pages/DashboardDetailPage";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { DemoProvider } from "@/contexts/DemoContext";
import type { Dashboard } from "@/lib/types";

// ─── Mock Recharts ────────────────────────────────────────────────────────────

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
    ReferenceLine: () => null,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => (
        <div data-testid="chart">{children}</div>
    ),
}));

// ─── API mocks ────────────────────────────────────────────────────────────────

vi.mock("@/features/dashboards/api/dashboards.api", () => ({
    fetchDashboard: vi.fn(),
    pinDashboard: vi.fn(),
    unpinDashboard: vi.fn(),
    createPanel: vi.fn(),
    deletePanel: vi.fn(),
    updatePanel: vi.fn(),
    fetchPanelData: vi.fn(),
}));

vi.mock("@/features/monitors/api/monitors.api", () => ({
    fetchMonitor: vi.fn(),
    fetchMonitors: vi.fn(),
    fetchMonitorAlerts: vi.fn().mockResolvedValue([]),
    COMPARATOR_LABELS: {},
}));

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

import {
    fetchDashboard,
    createPanel,
    fetchPanelData,
} from "@/features/dashboards/api/dashboards.api";
import { fetchMonitor, fetchMonitors } from "@/features/monitors/api/monitors.api";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEMO_DASHBOARD: Dashboard = {
    id: 1,
    name: "Network Health Overview",
    description: "Core router health.",
    visibility: "shared",
    panels: [
        {
            id: 1,
            dashboard_id: 1,
            monitor_id: 1,
            title: "CPU Utilisation",
            viz_type: "stat",
            position: { col: 0, row: 0, w: 6, h: 3 },
        },
    ],
    is_pinned: true,
    created_at: "2026-01-01T00:00:00Z",
};

const DEMO_MONITOR = {
    id: 1,
    name: "CPU Watch",
    action_id: 1,
    target: { device_ids: [1] },
    metric: "cpu_pct",
    comparator: "gt" as const,
    threshold: 85,
    status: "failing" as const,
    visibility: "shared" as const,
};

function renderDetailPage(dashboardId: number) {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <ThemeProvider>
            <QueryClientProvider client={qc}>
                <MemoryRouter
                    initialEntries={[`/dashboards/${dashboardId}`]}
                    future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
                >
                    <DemoProvider>
                        <Routes>
                            <Route path="/dashboards/:id" element={<DashboardDetailPage />} />
                        </Routes>
                    </DemoProvider>
                </MemoryRouter>
            </QueryClientProvider>
        </ThemeProvider>,
    );
}

describe("DashboardDetailPage", () => {
    beforeEach(() => {
        vi.mocked(fetchDashboard).mockResolvedValue(DEMO_DASHBOARD);
        vi.mocked(fetchMonitor).mockResolvedValue(DEMO_MONITOR);
        vi.mocked(fetchMonitors).mockResolvedValue([DEMO_MONITOR]);
        vi.mocked(fetchPanelData).mockResolvedValue({ data: [] });
    });

    it("renders the dashboard name and visibility badge", async () => {
        renderDetailPage(1);
        expect(await screen.findByText("Network Health Overview")).toBeInTheDocument();
        expect(screen.getByText("shared")).toBeInTheDocument();
    });

    it("renders panel cards", async () => {
        renderDetailPage(1);
        expect(await screen.findByText("CPU Utilisation")).toBeInTheDocument();
    });

    it("shows Unpin button for a pinned dashboard", async () => {
        renderDetailPage(1);
        expect(await screen.findByRole("button", { name: /unpin/i })).toBeInTheDocument();
    });

    it("opens the Add Panel modal on button click", async () => {
        const user = userEvent.setup();
        renderDetailPage(1);

        await screen.findByText("Network Health Overview");
        // Click the "Add Panel" button in the header
        const addPanelBtns = await screen.findAllByRole("button", { name: /add panel/i });
        await user.click(addPanelBtns[0]);
        // The modal reveals a monitor select dropdown
        expect(await screen.findByLabelText(/monitor/i)).toBeInTheDocument();
    });

    it("submits the add-panel form and calls createPanel", async () => {
        vi.mocked(createPanel).mockResolvedValue({
            id: 99,
            dashboard_id: 1,
            monitor_id: 1,
            viz_type: "stat",
            position: { col: 0, row: 0, w: 6, h: 3 },
        });

        const user = userEvent.setup();
        renderDetailPage(1);

        await screen.findByText("Network Health Overview");
        const addPanelBtns = await screen.findAllByRole("button", { name: /add panel/i });
        await user.click(addPanelBtns[0]);

        // Select a monitor from the dropdown (monitors loaded from fetchMonitors)
        const select = await screen.findByLabelText(/monitor/i);
        await user.selectOptions(select, "1");

        // Click the submit button inside the modal (last "Add Panel" button)
        const submitBtns = screen.getAllByRole("button", { name: /add panel/i });
        await user.click(submitBtns[submitBtns.length - 1]);

        await waitFor(() => {
            expect(createPanel).toHaveBeenCalledWith(
                1,
                expect.objectContaining({ monitor_id: 1 }),
            );
        });
    });
});
