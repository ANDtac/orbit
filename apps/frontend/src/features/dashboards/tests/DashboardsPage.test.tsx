import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { DashboardsPage } from "@/features/dashboards/pages/DashboardsPage";
import { renderWithProviders } from "@/tests/renderWithProviders";
import type { Dashboard } from "@/lib/types";

// ─── API mocks ─────────────────────────────────────────────────────────────

vi.mock("@/features/dashboards/api/dashboards.api", () => ({
    fetchDashboards: vi.fn(),
    createDashboard: vi.fn(),
    pinDashboard: vi.fn(),
    unpinDashboard: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

import {
    fetchDashboards,
    createDashboard,
    pinDashboard,
    unpinDashboard,
} from "@/features/dashboards/api/dashboards.api";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PRIVATE_DASHBOARD: Dashboard = {
    id: 1,
    name: "My Private Board",
    visibility: "private",
    panels: [],
    is_pinned: false,
    created_at: "2026-01-01T00:00:00Z",
};

const SHARED_DASHBOARD: Dashboard = {
    id: 2,
    name: "Team Overview",
    description: "Shared with the team.",
    visibility: "shared",
    panels: [{ id: 1, dashboard_id: 2, monitor_id: 1, viz_type: "stat", position: { col: 0, row: 0, w: 6, h: 3 } }],
    is_pinned: true,
    created_at: "2026-01-02T00:00:00Z",
};

describe("DashboardsPage", () => {
    beforeEach(() => {
        vi.mocked(fetchDashboards).mockResolvedValue([PRIVATE_DASHBOARD, SHARED_DASHBOARD]);
        vi.mocked(createDashboard).mockResolvedValue({ ...PRIVATE_DASHBOARD, id: 3, name: "New Board" });
        vi.mocked(pinDashboard).mockResolvedValue(undefined);
        vi.mocked(unpinDashboard).mockResolvedValue(undefined);
    });

    it("renders private dashboards by default", async () => {
        renderWithProviders(<DashboardsPage />);
        expect(await screen.findByText("My Private Board")).toBeInTheDocument();
    });

    it("renders shared dashboards on tab switch", async () => {
        const user = userEvent.setup();
        renderWithProviders(<DashboardsPage />);

        await screen.findByText("My Private Board");
        await user.click(screen.getByRole("button", { name: /shared/i }));
        expect(await screen.findByText("Team Overview")).toBeInTheDocument();
    });

    it("shows panel count on each card", async () => {
        const user = userEvent.setup();
        renderWithProviders(<DashboardsPage />);
        await screen.findByText("My Private Board");

        // Switch to shared tab to see the 1-panel board
        await user.click(screen.getByRole("button", { name: /shared/i }));
        expect(await screen.findByText(/1 panel/i)).toBeInTheDocument();
    });

    it("shows Pin to Home button for unpinned dashboard", async () => {
        renderWithProviders(<DashboardsPage />);
        expect(await screen.findByRole("button", { name: /pin to home/i })).toBeInTheDocument();
    });

    it("calls pinDashboard when Pin button clicked", async () => {
        const user = userEvent.setup();
        renderWithProviders(<DashboardsPage />);

        const pinBtn = await screen.findByRole("button", { name: /pin to home/i });
        await user.click(pinBtn);

        await waitFor(() => {
            expect(pinDashboard).toHaveBeenCalledWith(1);
        });
    });

    it("calls unpinDashboard for pinned dashboards", async () => {
        const user = userEvent.setup();
        renderWithProviders(<DashboardsPage />);
        await screen.findByText("My Private Board");

        // Switch to shared tab — SHARED_DASHBOARD has is_pinned=true
        await user.click(screen.getByRole("button", { name: /shared/i }));
        const unpinBtn = await screen.findByRole("button", { name: /unpin/i });
        await user.click(unpinBtn);

        await waitFor(() => {
            expect(unpinDashboard).toHaveBeenCalledWith(2);
        });
    });

    it("opens the Create Dashboard modal on button click", async () => {
        const user = userEvent.setup();
        renderWithProviders(<DashboardsPage />);
        await screen.findByText("My Private Board");

        await user.click(screen.getByRole("button", { name: /create dashboard/i }));
        // The modal contains the name input — that's our proof it opened
        expect(await screen.findByPlaceholderText("My Dashboard")).toBeInTheDocument();
    });

    it("submits the create form and calls createDashboard", async () => {
        const user = userEvent.setup();
        renderWithProviders(<DashboardsPage />);
        await screen.findByText("My Private Board");

        await user.click(screen.getByRole("button", { name: /create dashboard/i }));
        const nameInput = await screen.findByPlaceholderText("My Dashboard");
        await user.type(nameInput, "New Board");
        await user.click(screen.getByRole("button", { name: /^create$/i }));

        await waitFor(() => {
            expect(createDashboard).toHaveBeenCalledWith(
                expect.objectContaining({ name: "New Board" }),
            );
        });
    });
});
