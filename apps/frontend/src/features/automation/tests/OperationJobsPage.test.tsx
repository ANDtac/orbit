import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchJobs } from "@/features/monitoring/api/monitoring.api";
import { OperationJobsPage } from "@/features/automation/pages/OperationJobsPage";

vi.mock("@/features/devices/api/devices.api", () => ({
  fetchDevices: vi.fn(),
}));

vi.mock("@/features/monitoring/api/monitoring.api", () => ({
  fetchJobs: vi.fn(),
}));

describe("OperationJobsPage", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.mocked(fetchDevices).mockResolvedValue({
      data: [
        {
          id: 1,
          name: "edge-1",
          mgmt_ipv4: "10.0.0.10",
          platform_id: 10,
          is_active: true,
        },
      ],
      page: {
        cursor: "0",
        size: 25,
        next: null,
        prev: null,
        total: 1,
      },
    });

    vi.mocked(fetchJobs).mockResolvedValue({
      data: [
        {
          id: 44,
          uuid: "job-44",
          job_type: "operation.execute",
          status: "succeeded",
          progress: { total: 1, completed: 1 },
          timestamps: {
            created_at: "2026-03-31T12:00:00Z",
            started_at: "2026-03-31T12:00:10Z",
            finished_at: "2026-03-31T12:00:20Z",
          },
          tasks: [
            {
              id: 1,
              sequence: 0,
              task_type: "operation.device",
              status: "succeeded",
              device_id: 1,
            },
          ],
          events: [
            {
              id: 1,
              event_type: "queued",
              occurred_at: "2026-03-31T12:00:00Z",
              message: "job enqueued",
            },
          ],
        },
      ],
      page: {
        cursor: "0",
        size: 25,
        next: null,
        prev: null,
        total: 1,
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it("renders operation jobs and expands task details", async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <OperationJobsPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("operation.execute")).toBeInTheDocument();
    await user.click(screen.getByText("operation.execute"));
    expect(await screen.findByText("job enqueued")).toBeInTheDocument();
    expect(screen.getByText("edge-1")).toBeInTheDocument();
  });
});
