import { screen } from "@testing-library/react";

import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchAppEvents, fetchErrorLogs, fetchJobs } from "@/features/monitoring/api/monitoring.api";
import { MonitoringOverviewPage } from "@/features/monitoring/pages/MonitoringOverviewPage";
import { mockAppEventEntry } from "@/tests/factories";
import { renderWithProviders } from "@/tests/renderWithProviders";

vi.mock("@/features/devices/api/devices.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/devices/api/devices.api")>();
  return {
    ...actual,
    fetchDevices: vi.fn(),
  };
});

vi.mock("@/features/monitoring/api/monitoring.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/monitoring/api/monitoring.api")>();
  return {
    ...actual,
    fetchJobs: vi.fn(),
    fetchErrorLogs: vi.fn(),
    fetchAppEvents: vi.fn(),
  };
});

vi.mock("@/features/monitoring/components/PasswordRotationCard", () => ({
  PasswordRotationCard: () => <div>password rotation card</div>,
  PasswordChangeCard: () => <div>password change card</div>,
}));

describe("MonitoringOverviewPage", () => {
  it("renders recent password change events and recent errors", async () => {
    vi.mocked(fetchDevices).mockResolvedValue({
      data: [],
      page: { cursor: "0", size: 1, total: 25, next: null, prev: null },
    });
    vi.mocked(fetchJobs).mockResolvedValue({
      data: [
        { id: 1, uuid: "a", job_type: "custom.job", status: "queued", timestamps: {}, tasks: [], events: [] },
        { id: 2, uuid: "b", job_type: "custom.job", status: "failed", timestamps: {}, tasks: [], events: [] },
      ],
      page: { cursor: "0", size: 25, total: 2, next: null, prev: null },
    });
    vi.mocked(fetchAppEvents).mockResolvedValue([
      mockAppEventEntry({
        id: 11,
        extra: { total: 3, succeeded: 2, failed: 1, requested_by: "owner" },
      }),
    ]);
    vi.mocked(fetchErrorLogs).mockResolvedValue([
      {
        id: 21,
        created_at: "2026-03-31T12:00:00Z",
        correlation_id: "req-21",
        level: "ERROR",
        message: "Password validation failed",
        user_id: 1,
      },
    ]);

    renderWithProviders(<MonitoringOverviewPage />);

    expect(await screen.findByText("Recent password changes")).toBeInTheDocument();
    expect(screen.getByText("2/3 succeeded, 1 failed by owner")).toBeInTheDocument();
    expect(screen.getByText("Recent errors")).toBeInTheDocument();
    expect(screen.getByText("Password validation failed")).toBeInTheDocument();
  });
});
