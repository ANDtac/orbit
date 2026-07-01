import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type * as DevicesApi from "@/features/devices/api/devices.api";
import type * as ComplianceApi from "@/features/compliance/api/compliance.api";
import type * as MonitoringApi from "@/features/monitoring/api/monitoring.api";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchComplianceResults } from "@/features/compliance/api/compliance.api";
import { fetchJobs, fetchErrorLogs } from "@/features/monitoring/api/monitoring.api";
import { Home } from "@/pages/Home";
import { mockDevice, mockJob } from "@/tests/factories";
import { renderWithProviders } from "@/tests/renderWithProviders";

vi.mock("@/features/devices/api/devices.api", async (importOriginal) => {
  const actual = await importOriginal<typeof DevicesApi>();
  return { ...actual, fetchDevices: vi.fn() };
});

vi.mock("@/features/compliance/api/compliance.api", async (importOriginal) => {
  const actual = await importOriginal<typeof ComplianceApi>();
  return { ...actual, fetchComplianceResults: vi.fn() };
});

vi.mock("@/features/monitoring/api/monitoring.api", async (importOriginal) => {
  const actual = await importOriginal<typeof MonitoringApi>();
  return { ...actual, fetchJobs: vi.fn(), fetchErrorLogs: vi.fn() };
});

describe("Home dashboard", () => {
  beforeEach(() => {
    vi.mocked(fetchDevices).mockResolvedValue({
      data: [
        mockDevice({ id: 1, name: "edge-1" }),
        mockDevice({ id: 2, name: "edge-2" }),
      ],
      page: { cursor: "0", size: 25, total: 42, next: null, prev: null },
    });
    vi.mocked(fetchJobs).mockResolvedValue({
      data: [
        mockJob({ id: 10, status: "running", job_type: "device.backup" }),
        mockJob({ id: 11, status: "failed", job_type: "password_change.batch" }),
      ],
      page: { cursor: "0", size: 25, total: 2, next: null, prev: null },
    });
    vi.mocked(fetchErrorLogs).mockResolvedValue([]);
    vi.mocked(fetchComplianceResults).mockResolvedValue([
      { id: 8, device_id: 7, policy_id: 3, status: "fail", evaluated_at: "2026-04-02T11:00:00Z" },
      { id: 9, device_id: 8, policy_id: 3, status: "pass", evaluated_at: "2026-04-02T11:00:00Z" },
    ]);
  });

  it("opens a device context modal listing devices when the Managed devices card is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);

    await screen.findByText("42");
    await user.click(screen.getByRole("button", { name: /Managed devices/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Managed devices")).toBeInTheDocument();
    expect(within(dialog).getByText("edge-1")).toBeInTheDocument();
    expect(within(dialog).getByText("edge-2")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /View all devices/i })).toHaveAttribute(
      "href",
      "/inventory/devices",
    );
  });

  it("opens a failed-jobs context modal linking to Runs", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Home />);

    await user.click(await screen.findByRole("button", { name: /Failed jobs/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Failed jobs")).toBeInTheDocument();
    expect(within(dialog).getByText("password_change.batch")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /View all runs/i })).toHaveAttribute(
      "href",
      "/automation/runs",
    );
  });
});
