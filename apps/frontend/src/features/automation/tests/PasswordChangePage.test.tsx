import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PasswordChangePage } from "@/features/automation/pages/PasswordChangePage";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchInventoryGroups } from "@/features/devices/api/groups.api";
import { fetchPlatforms } from "@/features/devices/api/platforms.api";
import { fetchCredentialProfiles } from "@/features/devices/api/credentialProfiles.api";
import { fetchOperationJob, startPasswordChange } from "@/features/automation/api/automation.api";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    hasSessionPassword: true,
  }),
}));

vi.mock("@/features/devices/api/devices.api", () => ({
  fetchDevices: vi.fn(),
}));

vi.mock("@/features/devices/api/platforms.api", () => ({
  fetchPlatforms: vi.fn(),
}));

vi.mock("@/features/devices/api/groups.api", () => ({
  fetchInventoryGroups: vi.fn(),
}));

vi.mock("@/features/devices/api/credentialProfiles.api", () => ({
  fetchCredentialProfiles: vi.fn(),
}));

vi.mock("@/features/automation/api/automation.api", () => ({
  startPasswordChange: vi.fn(),
  fetchOperationJob: vi.fn(),
}));

describe("PasswordChangePage", () => {
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
          name: "edge-1",
          fqdn: "edge-1.local",
          mgmt_ipv4: "10.0.0.10",
          platform_id: 10,
          credential_profile_id: 100,
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
    vi.mocked(fetchPlatforms).mockResolvedValue([{ id: 10, slug: "cisco_xe", display_name: "Cisco XE" }]);
    vi.mocked(fetchInventoryGroups).mockResolvedValue([{ id: 50, name: "Core", slug: "core" }]);
    vi.mocked(fetchCredentialProfiles).mockResolvedValue([{ id: 100, name: "Default SSH" }]);
    vi.mocked(startPasswordChange).mockResolvedValue({
      status: "queued",
      job: {
        id: 99,
        uuid: "job-99",
        job_type: "password_change.batch",
        status: "queued",
        timestamps: {},
        tasks: [],
        events: [],
      },
    });
    vi.mocked(fetchOperationJob).mockResolvedValue({
      id: 99,
      uuid: "job-99",
      job_type: "password_change.batch",
      status: "succeeded",
      result: {
        results: [
          {
            device_id: 1,
            ok: true,
            changed: true,
            phase: "completed",
            platform: "cisco_xe",
            host: "10.0.0.10",
          },
        ],
      },
      timestamps: {},
      tasks: [],
      events: [],
    });
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it("selects devices, confirms, and completes a password change batch", async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <PasswordChangePage />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByLabelText("Select row 1"));
    await user.click(screen.getByRole("button", { name: "Next" }));

    await user.type(screen.getByLabelText("New Password"), "updated-password");
    await user.type(screen.getByLabelText("Confirm New Password"), "updated-password");
    await user.click(screen.getByRole("button", { name: "Review and start" }));
    await user.type(screen.getByLabelText("Type CHANGE to confirm"), "CHANGE");
    await user.click(screen.getByRole("button", { name: "Confirm and start" }));

    await waitFor(() => {
      expect(startPasswordChange).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("Batch complete")).toBeInTheDocument();
    expect(fetchOperationJob).toHaveBeenCalledWith(99);
  });

  it("offers a single-device retry for a failed device", async () => {
    const user = userEvent.setup();

    vi.mocked(fetchOperationJob).mockResolvedValue({
      id: 99,
      uuid: "job-99",
      job_type: "password_change.batch",
      status: "succeeded",
      result: {
        results: [
          {
            device_id: 1,
            ok: false,
            changed: false,
            phase: "completed",
            platform: "cisco_xe",
            host: "10.0.0.10",
            error: "Authentication failed",
          },
        ],
      },
      timestamps: {},
      tasks: [],
      events: [],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PasswordChangePage />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByLabelText("Select row 1"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByLabelText("New Password"), "updated-password");
    await user.type(screen.getByLabelText("Confirm New Password"), "updated-password");
    await user.click(screen.getByRole("button", { name: "Review and start" }));
    await user.type(screen.getByLabelText("Type CHANGE to confirm"), "CHANGE");
    await user.click(screen.getByRole("button", { name: "Confirm and start" }));

    expect(await screen.findByText("Batch complete")).toBeInTheDocument();

    // Per-device retry action scoped to the single failed device returns to the credentials step.
    const retryButton = await screen.findByRole("button", { name: "Retry" });
    await user.click(retryButton);

    expect(await screen.findByText("Password change details")).toBeInTheDocument();
    expect(screen.getByText("1 devices")).toBeInTheDocument();
  });
});
