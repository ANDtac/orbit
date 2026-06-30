import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";

import { fetchPlatforms } from "@/features/devices/api/platforms.api";
import {
  fetchHardwareLifecycle,
  fetchSoftwareLifecycle,
} from "@/features/lifecycle/api/lifecycle.api";
import { HardwareEoxPage } from "@/features/lifecycle/pages/HardwareEoxPage";
import { SoftwareEoxPage } from "@/features/lifecycle/pages/SoftwareEoxPage";

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
        last_day_of_support_date: "2026-06-01T00:00:00Z",
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
        last_day_of_support_date: "2026-07-01T00:00:00Z",
      },
    ]);
    vi.mocked(fetchPlatforms).mockResolvedValue([
      { id: 1, slug: "cisco_iosxe", display_name: "Cisco IOS-XE" },
    ]);
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it("renders hardware lifecycle rows and summary cards", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <HardwareEoxPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("1001")).toBeInTheDocument();
    expect(screen.getByText("Past EoS")).toBeInTheDocument();
    expect(screen.getByText("Due In 90 Days")).toBeInTheDocument();
  });

  it("renders software lifecycle rows with platform names", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SoftwareEoxPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Cisco IOS-XE", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("ios-xe")).toBeInTheDocument();
    expect(screen.getByText(/prefix:17\./)).toBeInTheDocument();
  });
});
