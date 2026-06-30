import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchAppEvents, fetchErrorLogs, fetchRequestLogs } from "@/features/monitoring/api/monitoring.api";
import { MonitoringLogsPage } from "@/features/monitoring/pages/MonitoringLogsPage";
import { mockAppEventEntry } from "@/tests/factories";
import { renderWithProviders } from "@/tests/renderWithProviders";

vi.mock("@/features/monitoring/api/monitoring.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/monitoring/api/monitoring.api")>();
  return {
    ...actual,
    fetchRequestLogs: vi.fn(),
    fetchErrorLogs: vi.fn(),
    fetchAppEvents: vi.fn(),
  };
});

describe("MonitoringLogsPage", () => {
  it("switches to the Events tab and renders app events", async () => {
    vi.mocked(fetchRequestLogs).mockResolvedValue([
      {
        id: 1,
        created_at: "2026-03-31T12:00:00Z",
        correlation_id: "req-1",
        method: "GET",
        path: "/api/v1/devices",
        status_code: 200,
        latency_ms: 18,
        user_id: 1,
      },
    ]);
    vi.mocked(fetchErrorLogs).mockResolvedValue([]);
    vi.mocked(fetchAppEvents).mockResolvedValue([
      mockAppEventEntry({
        id: 2,
        event: "job.state_change",
        message: "Job changed state",
      }),
    ]);

    const user = userEvent.setup();
    renderWithProviders(<MonitoringLogsPage />);

    expect(await screen.findByText("Request logs")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Events" }));

    expect(await screen.findByText("Application events")).toBeInTheDocument();
    expect(screen.getByText("job.state_change")).toBeInTheDocument();
    expect(screen.getByText("Job changed state")).toBeInTheDocument();
  });
});
