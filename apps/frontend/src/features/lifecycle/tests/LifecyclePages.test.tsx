import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchPlatforms } from "@/features/devices/api/platforms.api";
import {
  fetchHardwareLifecycle,
  fetchSoftwareLifecycle,
} from "@/features/lifecycle/api/lifecycle.api";
import { HardwareEoxPage } from "@/features/lifecycle/pages/HardwareEoxPage";
import { SoftwareEoxPage } from "@/features/lifecycle/pages/SoftwareEoxPage";
import type { Device, PaginatedResponse } from "@/lib/types";

vi.mock("@/features/lifecycle/api/lifecycle.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/lifecycle/api/lifecycle.api")>();
  return {
    ...actual,
    fetchHardwareLifecycle: vi.fn(),
    fetchSoftwareLifecycle: vi.fn(),
    createHardwareLifecycle: vi.fn(),
    updateHardwareLifecycle: vi.fn(),
    deleteHardwareLifecycle: vi.fn(),
    createSoftwareLifecycle: vi.fn(),
    updateSoftwareLifecycle: vi.fn(),
    deleteSoftwareLifecycle: vi.fn(),
  };
});

vi.mock("@/features/devices/api/platforms.api", () => ({
  fetchPlatforms: vi.fn(),
}));

vi.mock("@/features/devices/api/devices.api", () => ({
  fetchDevices: vi.fn(),
}));

function renderPage(ui: ReactElement, queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Lifecycle pages", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.mocked(fetchHardwareLifecycle).mockResolvedValue([
      {
        id: 1,
        product_model_id: 1001,
        end_of_sale_date: "2025-01-01T00:00:00Z",
        last_day_of_support_date: "2020-06-01T00:00:00Z",
      },
    ]);
    vi.mocked(fetchSoftwareLifecycle).mockResolvedValue([
      {
        id: 10,
        platform_id: 1,
        os_name: "ios-xe",
        match_operator: "prefix",
        match_value: "17.",
        end_of_sale_date: "2025-01-01T00:00:00Z",
        last_day_of_support_date: "2020-07-01T00:00:00Z",
      },
    ]);
    vi.mocked(fetchPlatforms).mockResolvedValue([
      { id: 1, slug: "cisco_iosxe", display_name: "Cisco IOS-XE" },
    ]);
    const devices: Device[] = [
      {
        id: 5,
        name: "edge-01",
        model_number: "1001",
        os_name: "ios-xe",
        os_version: "17.3.1",
      },
    ];
    const devicesResponse: PaginatedResponse<Device> = {
      data: devices,
      page: { cursor: "", size: 25, total: devices.length },
    };
    vi.mocked(fetchDevices).mockResolvedValue(devicesResponse);
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it("renders hardware rows with status summary cards and a row status badge", async () => {
    renderPage(<HardwareEoxPage />, queryClient);

    expect(await screen.findByText("1001")).toBeInTheDocument();
    // Clickable status summary cards ("Due Soon"/"Active" appear only as cards).
    expect(screen.getByText("Due Soon")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    // "Past EoL" appears both as a card label and as the per-row status badge.
    expect(screen.getAllByText("Past EoL").length).toBeGreaterThanOrEqual(2);
  });

  it("opens a read-only view modal on row click with an explicit Edit action", async () => {
    const user = userEvent.setup();
    renderPage(<HardwareEoxPage />, queryClient);

    await user.click(await screen.findByText("1001"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Hardware lifecycle record")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Edit" })).toBeInTheDocument();

    // Clicking Edit switches to the edit form modal.
    await user.click(within(dialog).getByRole("button", { name: "Edit" }));
    expect(await screen.findByText("Edit hardware lifecycle row")).toBeInTheDocument();
  });

  it("drills into affected devices from the hardware device count", async () => {
    const user = userEvent.setup();
    renderPage(<HardwareEoxPage />, queryClient);

    // Device count button (one matching device) opens the device list modal.
    const countButton = await screen.findByRole("button", { name: "1" });
    await user.click(countButton);

    expect(await screen.findByText("edge-01")).toBeInTheDocument();
  });

  it("filters the hardware table by clicking a status summary card", async () => {
    const user = userEvent.setup();
    renderPage(<HardwareEoxPage />, queryClient);

    expect(await screen.findByText("1001")).toBeInTheDocument();

    // The only record is Past EoL, so filtering to Active empties the table.
    await user.click(screen.getByRole("button", { name: /Active/ }));
    expect(
      await screen.findByText(/No hardware lifecycle rows match/),
    ).toBeInTheDocument();
  });

  it("renders software lifecycle rows with platform names and status", async () => {
    renderPage(<SoftwareEoxPage />, queryClient);

    expect(await screen.findByText("Cisco IOS-XE", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("ios-xe")).toBeInTheDocument();
    expect(screen.getByText(/prefix:17\./)).toBeInTheDocument();
    expect(screen.getAllByText("Past EoL").length).toBeGreaterThan(0);
  });
});
