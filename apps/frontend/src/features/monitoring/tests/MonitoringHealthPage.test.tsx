import { screen } from "@testing-library/react";

import { fetchHealthSummary } from "@/features/monitoring/api/monitoring.api";
import { MonitoringHealthPage } from "@/features/monitoring/pages/MonitoringHealthPage";
import { renderWithProviders } from "@/tests/renderWithProviders";

vi.mock("@/features/monitoring/api/monitoring.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/monitoring/api/monitoring.api")>();
  return {
    ...actual,
    fetchHealthSummary: vi.fn(),
  };
});

describe("MonitoringHealthPage", () => {
  it("renders fleet health rollups", async () => {
    vi.mocked(fetchHealthSummary).mockResolvedValue({
      generated_at: "2026-04-02T12:00:00Z",
      overall: {
        total: 10,
        statuses: {
          healthy: 6,
          warning: 3,
          critical: 1,
        },
      },
      by_platform: [
        {
          scope: "platform",
          identifier: "1",
          name: "Cisco IOS",
          total: 5,
          statuses: { healthy: 4, warning: 1 },
        },
      ],
      by_group: [
        {
          scope: "group",
          identifier: "core",
          name: "Core Routers",
          total: 4,
          statuses: { healthy: 2, critical: 1, warning: 1 },
        },
      ],
    });

    renderWithProviders(<MonitoringHealthPage />);

    expect(await screen.findByText("Tracked devices")).toBeInTheDocument();
    expect(screen.getByText("Cisco IOS")).toBeInTheDocument();
    expect(screen.getByText("Core Routers")).toBeInTheDocument();
    expect(screen.getByText(/critical 1/i)).toBeInTheDocument();
  });
});
