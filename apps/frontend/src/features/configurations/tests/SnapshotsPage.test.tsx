import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchSnapshots } from "@/features/configurations/api/snapshots.api";
import { SnapshotsPage } from "@/features/configurations/pages/SnapshotsPage";

vi.mock("@/features/devices/api/devices.api", () => ({
  fetchDevices: vi.fn(),
}));

vi.mock("@/features/configurations/api/snapshots.api", () => ({
  fetchSnapshots: vi.fn(),
}));

describe("SnapshotsPage", () => {
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

    vi.mocked(fetchSnapshots).mockResolvedValue([
      {
        id: 9,
        device_id: 1,
        captured_at: "2026-03-31T11:00:00Z",
        source: "napalm:get_config",
        config_text: "hostname edge-1\ninterface Loopback0",
        config_hash: "demo-hash-0009",
      },
    ]);
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it("renders snapshot preview for the active row", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SnapshotsPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/hostname edge-1/)).toBeInTheDocument();
    expect(screen.getAllByText("demo-hash-0009")).toHaveLength(2);
  });

  it("opens a quick-view summary modal when a snapshot row is clicked", async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <SnapshotsPage />
      </QueryClientProvider>,
    );

    // Wait for rows to render, then click the row's hash cell to open the quick view.
    // (index 0 is the table cell, which precedes the bottom preview section in the DOM.)
    const hashCells = await screen.findAllByText("demo-hash-0009");
    await user.click(hashCells[0]);

    expect(await screen.findByText("Snapshot summary")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View full config" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download config" })).toBeInTheDocument();
  });
});
