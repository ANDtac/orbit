/**
 * Tests for the monitor-alerts subsection added to AlertsPanel in Phase 6.
 * The full AlertsPanel already has tests at:
 *   src/features/monitoring/tests/MonitoringAlertsPage.test.tsx
 * These tests focus on the new monitor-alerts slice only.
 */
import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { MonitoringAlertsPage } from "@/features/monitoring/pages/MonitoringAlertsPage";
import { renderWithProviders } from "@/tests/renderWithProviders";
import type { Monitor } from "@/lib/types";

vi.mock("@/features/compliance/api/compliance.api", () => ({
    fetchComplianceResults: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/monitoring/api/monitoring.api", () => ({
    fetchJobs: vi.fn().mockResolvedValue({ data: [], page: { cursor: "0", size: 10, total: 0, next: null, prev: null } }),
    fetchErrorLogs: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/monitors/api/monitors.api", () => ({
    fetchMonitorAlerts: vi.fn(),
    fetchMonitors: vi.fn().mockResolvedValue([]),
    COMPARATOR_LABELS: {},
    COMPARATOR_OPTIONS: [],
    VISIBILITY_OPTIONS: [],
}));

import { fetchMonitorAlerts } from "@/features/monitors/api/monitors.api";

const FAILING_MONITORS: Monitor[] = [
    {
        id: 2,
        name: "Interface Errors",
        action_id: 2,
        target: { device_ids: [1] },
        metric: "error_rate",
        comparator: "gt",
        threshold: 0,
        status: "failing",
        visibility: "shared",
        last_run: "2026-06-30T08:00:00Z",
    },
];

describe("AlertsPanel — monitor alerts subsection", () => {
    it("renders failing monitors in the monitor alerts section", async () => {
        vi.mocked(fetchMonitorAlerts).mockResolvedValue(FAILING_MONITORS);

        renderWithProviders(<MonitoringAlertsPage />);

        // Both the h3 and the stat card have text "Monitor alerts"; use findAllByText
        const headings = await screen.findAllByText("Monitor alerts");
        expect(headings.length).toBeGreaterThanOrEqual(1);

        expect(await screen.findByText("Interface Errors")).toBeInTheDocument();
        // status badge
        const failingBadges = screen.getAllByText("failing");
        expect(failingBadges.length).toBeGreaterThanOrEqual(1);
    });

    it("shows 'No failing monitors.' when all monitors are passing", async () => {
        vi.mocked(fetchMonitorAlerts).mockResolvedValue([]);

        renderWithProviders(<MonitoringAlertsPage />);

        const headings = await screen.findAllByText("Monitor alerts");
        expect(headings.length).toBeGreaterThanOrEqual(1);

        expect(await screen.findByText("No failing monitors.")).toBeInTheDocument();
    });

    it("shows a link to the monitors list page", async () => {
        vi.mocked(fetchMonitorAlerts).mockResolvedValue([]);

        renderWithProviders(<MonitoringAlertsPage />);

        expect(await screen.findByText(/view all monitors/i)).toBeInTheDocument();
    });
});
