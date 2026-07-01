import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import {
  fetchComplianceResults,
  fetchPolicies,
  fetchRules,
} from "@/features/compliance/api/compliance.api";
import { ComplianceResultsPage } from "@/features/compliance/pages/ComplianceResultsPage";
import { fetchDevices } from "@/features/devices/api/devices.api";

vi.mock("@/features/compliance/api/compliance.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/compliance/api/compliance.api")>();
  return {
    ...actual,
    fetchComplianceResults: vi.fn(),
    fetchPolicies: vi.fn(),
    fetchRules: vi.fn(),
  };
});

vi.mock("@/features/devices/api/devices.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/devices/api/devices.api")>();
  return {
    ...actual,
    fetchDevices: vi.fn(),
  };
});

describe("ComplianceResultsPage", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.mocked(fetchComplianceResults).mockResolvedValue([
      {
        id: 101,
        device_id: 1,
        policy_id: 2,
        rule_id: 3,
        evaluated_at: "2026-03-31T12:00:00Z",
        status: "fail",
        details: { observed: "missing ntp server" },
      },
    ]);
    vi.mocked(fetchPolicies).mockResolvedValue([
      { id: 2, name: "NTP Baseline", is_active: true },
    ]);
    vi.mocked(fetchRules).mockResolvedValue([
      {
        id: 3,
        policy_id: 2,
        name: "ntp server present",
        severity: "high",
        rule_type: "regex",
        expression: "^ntp server",
      },
    ]);
    vi.mocked(fetchDevices).mockResolvedValue({
      data: [{ id: 1, name: "core-rtr-01" }],
      page: { cursor: "0", size: 200, total: 1, next: null, prev: null },
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  function renderPage() {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ComplianceResultsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("renders mapped names and expands result details with device/policy links", async () => {
    const user = userEvent.setup();

    renderPage();

    expect(await screen.findByText("core-rtr-01")).toBeInTheDocument();
    expect(screen.getByText("NTP Baseline", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText("ntp server present", { selector: "td" })).toBeInTheDocument();

    await user.click(screen.getByText("core-rtr-01"));

    expect(await screen.findByText(/missing ntp server/i)).toBeInTheDocument();

    const deviceLink = screen.getByRole("link", { name: /View device: core-rtr-01/i });
    expect(deviceLink).toHaveAttribute("href", "/inventory/devices/1");

    const policyLink = screen.getByRole("link", { name: /View policy: NTP Baseline/i });
    expect(policyLink).toHaveAttribute("href", "/compliance/policies");
  });

  it("filters results by status when a summary card is clicked", async () => {
    const user = userEvent.setup();

    renderPage();

    expect(await screen.findByText("core-rtr-01")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Fail\s*1$/ }));

    await waitFor(() => {
      expect(
        vi.mocked(fetchComplianceResults).mock.calls.some(([opts]) => opts?.status === "fail"),
      ).toBe(true);
    });
  });
});
