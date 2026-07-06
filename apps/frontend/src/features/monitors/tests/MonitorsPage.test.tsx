import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { MonitorsPage } from "@/features/monitors/pages/MonitorsPage";
import { renderWithProviders } from "@/tests/renderWithProviders";
import type { Monitor } from "@/lib/types";

vi.mock("@/features/monitors/api/monitors.api", () => ({
    fetchMonitors: vi.fn(),
    createMonitor: vi.fn(),
    COMPARATOR_OPTIONS: [],
    COMPARATOR_LABELS: {},
    VISIBILITY_OPTIONS: [
        { value: "private", label: "Private" },
        { value: "shared", label: "Shared" },
        { value: "role", label: "Role-based" },
    ],
}));

vi.mock("@/features/admin/api/operationTemplates.api", () => ({
    fetchOperationTemplates: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/devices/api/devices.api", () => ({
    fetchDevices: vi.fn().mockResolvedValue({ data: [], page: { cursor: "0", size: 25, total: 0, next: null, prev: null } }),
}));

vi.mock("@/features/devices/api/platforms.api", () => ({
    fetchPlatforms: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/devices/api/credentialProfiles.api", () => ({
    fetchCredentialProfiles: vi.fn().mockResolvedValue([]),
}));

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

import { fetchMonitors } from "@/features/monitors/api/monitors.api";

const DEMO_MONITORS: Monitor[] = [
    {
        id: 1,
        name: "CPU Watch",
        action_id: 1,
        action_name: "Show Version",
        target: { device_ids: [1, 2] },
        metric: "cpu_pct",
        comparator: "gt",
        threshold: 85,
        status: "passing",
        visibility: "shared",
    },
    {
        id: 2,
        name: "Interface Errors",
        action_id: 2,
        action_name: "Health Check",
        target: { device_ids: [3] },
        metric: "error_rate",
        comparator: "gt",
        threshold: 0,
        status: "failing",
        visibility: "private",
    },
    {
        id: 3,
        name: "BGP State",
        action_id: 3,
        action_name: "BGP Status",
        target: { device_ids: [] },
        metric: "peer_status",
        comparator: "eq",
        threshold: null,
        status: "unknown",
        visibility: "private",
    },
];

describe("MonitorsPage", () => {
    it("renders stat cards with correct counts", async () => {
        vi.mocked(fetchMonitors).mockResolvedValue(DEMO_MONITORS);

        renderWithProviders(<MonitorsPage />);

        // stat card labels (rendered as-is; CSS applies uppercase visually)
        expect(screen.getByText("Passing")).toBeInTheDocument();
        expect(screen.getByText("Failing")).toBeInTheDocument();
        expect(screen.getByText("Unknown")).toBeInTheDocument();

        // wait for data
        expect(await screen.findByText("CPU Watch")).toBeInTheDocument();

        // stat values
        const ones = screen.getAllByText("1");
        expect(ones.length).toBeGreaterThanOrEqual(2); // failing=1, unknown=1
    });

    it("renders monitor list with status badges", async () => {
        vi.mocked(fetchMonitors).mockResolvedValue(DEMO_MONITORS);

        renderWithProviders(<MonitorsPage />);

        expect(await screen.findByText("CPU Watch")).toBeInTheDocument();
        expect(screen.getByText("Interface Errors")).toBeInTheDocument();
        expect(screen.getByText("BGP State")).toBeInTheDocument();

        // status badges
        const passingBadges = screen.getAllByText("passing");
        expect(passingBadges.length).toBeGreaterThanOrEqual(1);
        const failingBadges = screen.getAllByText("failing");
        expect(failingBadges.length).toBeGreaterThanOrEqual(1);
        const unknownBadges = screen.getAllByText("unknown");
        expect(unknownBadges.length).toBeGreaterThanOrEqual(1);
    });

    it("shows Create monitor button", () => {
        vi.mocked(fetchMonitors).mockResolvedValue([]);
        renderWithProviders(<MonitorsPage />);
        expect(screen.getByRole("button", { name: /create monitor/i })).toBeInTheDocument();
    });
});
