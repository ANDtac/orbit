import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchAppEvents, fetchErrorLogs, fetchRequestLogs } from "@/features/monitoring/api/monitoring.api";
import { MonitoringLogsPage } from "@/features/admin/pages/MonitoringLogsPage";
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

const SAMPLE_REQUEST = {
  id: 1,
  created_at: "2026-03-31T12:00:00Z",
  correlation_id: "req-1",
  method: "GET",
  path: "/api/v1/devices",
  status_code: 200,
  latency_ms: 18,
  user_id: 1,
};

describe("MonitoringLogsPage", () => {
  beforeEach(() => {
    vi.mocked(fetchRequestLogs).mockResolvedValue([SAMPLE_REQUEST]);
    vi.mocked(fetchErrorLogs).mockResolvedValue([]);
    vi.mocked(fetchAppEvents).mockResolvedValue([
      mockAppEventEntry({ id: 2, event: "job.state_change", message: "Job changed state" }),
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("switches to the Events tab and renders app events", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitoringLogsPage />);

    expect(await screen.findByText("Request logs")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Events" }));

    expect(await screen.findByText("Application events")).toBeInTheDocument();
    expect(screen.getByText("job.state_change")).toBeInTheDocument();
    expect(screen.getByText("Job changed state")).toBeInTheDocument();
  });

  it("sends the From/To date range to the logs API as server-side params", async () => {
    renderWithProviders(<MonitoringLogsPage />);
    expect(await screen.findByText("Request logs")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-02-01" } });

    await waitFor(() => {
      expect(vi.mocked(fetchRequestLogs)).toHaveBeenCalledWith(
        expect.objectContaining({ from: "2026-01-01", to: "2026-02-01" }),
      );
    });
  });

  it("opens a read-only log detail modal on row click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitoringLogsPage />);

    await user.click(await screen.findByText("/api/v1/devices"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("status_code")).toBeInTheDocument();
    expect(within(dialog).getByText("correlation_id")).toBeInTheDocument();
  });
});
