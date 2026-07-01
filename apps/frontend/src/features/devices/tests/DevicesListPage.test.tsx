import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type * as ReactRouterDom from "react-router-dom";

import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchPlatforms } from "@/features/devices/api/platforms.api";
import { fetchInventoryGroups } from "@/features/devices/api/groups.api";
import { DevicesListPage } from "@/features/devices/pages/DevicesListPage";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDom>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/features/devices/api/devices.api", () => ({
  fetchDevices: vi.fn(),
  deleteDevice: vi.fn(),
}));

vi.mock("@/features/devices/api/platforms.api", () => ({
  fetchPlatforms: vi.fn(),
}));

vi.mock("@/features/devices/api/groups.api", () => ({
  fetchInventoryGroups: vi.fn(),
}));

function renderPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DevicesListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DevicesListPage row click", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.mocked(fetchDevices).mockResolvedValue({
      data: [
        {
          id: 1,
          name: "core-sw-01",
          mgmt_ipv4: "10.0.0.1",
          os_name: "cisco-ios",
          os_version: "17.3.4",
          serial_number: "ABC123",
          model_number: "C9300",
          is_active: true,
        },
      ],
      page: { cursor: "0", size: 25, total: 1, next: null, prev: null },
    });
    vi.mocked(fetchPlatforms).mockResolvedValue([]);
    vi.mocked(fetchInventoryGroups).mockResolvedValue([]);
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it("opens a read-only quick-view modal instead of navigating on row click", async () => {
    const user = userEvent.setup();
    renderPage(queryClient);

    const cell = await screen.findByText("core-sw-01");
    await user.click(cell);

    // Modal opened with quick-view actions; no navigation yet.
    expect(
      await screen.findByRole("button", { name: /open full detail/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("navigates to the full detail page from the modal action", async () => {
    const user = userEvent.setup();
    renderPage(queryClient);

    await user.click(await screen.findByText("core-sw-01"));
    await user.click(await screen.findByRole("button", { name: /open full detail/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/inventory/devices/1");
  });

  it("navigates to the edit page from the modal Edit action", async () => {
    const user = userEvent.setup();
    renderPage(queryClient);

    await user.click(await screen.findByText("core-sw-01"));
    await user.click(await screen.findByRole("button", { name: /^edit$/i }));

    expect(mockNavigate).toHaveBeenCalledWith("/inventory/devices/1/edit");
  });

  it("selecting a row checkbox does not open the quick-view modal", async () => {
    const user = userEvent.setup();
    renderPage(queryClient);

    await screen.findByText("core-sw-01");
    await user.click(screen.getByLabelText("Select row 1"));

    expect(
      screen.queryByRole("button", { name: /open full detail/i }),
    ).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
