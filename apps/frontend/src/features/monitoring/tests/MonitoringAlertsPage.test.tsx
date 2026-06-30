import { screen } from "@testing-library/react";

import { fetchComplianceResults } from "@/features/compliance/api/compliance.api";
import { fetchJobs, fetchErrorLogs } from "@/features/monitoring/api/monitoring.api";
import { MonitoringAlertsPage } from "@/features/monitoring/pages/MonitoringAlertsPage";
import { mockJob } from "@/tests/factories";
import { renderWithProviders } from "@/tests/renderWithProviders";

vi.mock("@/features/compliance/api/compliance.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/compliance/api/compliance.api")>();
  return {
    ...actual,
    fetchComplianceResults: vi.fn(),
  };
});

vi.mock("@/features/monitoring/api/monitoring.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/monitoring/api/monitoring.api")>();
  return {
    ...actual,
    fetchJobs: vi.fn(),
    fetchErrorLogs: vi.fn(),
  };
});

describe("MonitoringAlertsPage", () => {
  it("renders recent alerts from errors, failed jobs, and compliance failures", async () => {
    vi.mocked(fetchErrorLogs).mockResolvedValue([
      {
        id: 1,
        created_at: "2026-04-02T12:00:00Z",
        correlation_id: "req-1",
        level: "ERROR",
        message: "Probe timed out",
        user_id: 1,
      },
    ]);
    vi.mocked(fetchJobs).mockResolvedValue({
      data: [mockJob({ id: 55, status: "failed", job_type: "device.probe" })],
      page: { cursor: "0", size: 10, total: 1, next: null, prev: null },
    });
    vi.mocked(fetchComplianceResults).mockResolvedValue([
      {
        id: 8,
        device_id: 7,
        policy_id: 3,
        status: "fail",
        evaluated_at: "2026-04-02T11:00:00Z",
        details: { summary: "SSH configuration missing" },
      },
    ]);

    renderWithProviders(<MonitoringAlertsPage />);

    expect(await screen.findByText("Probe timed out")).toBeInTheDocument();
    expect(screen.getByText("device.probe")).toBeInTheDocument();
    expect(screen.getByText("SSH configuration missing")).toBeInTheDocument();
  });
});
