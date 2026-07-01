import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  createAdminPlatform,
  fetchAdminCredentialProfiles,
  fetchAdminPlatforms,
  fetchAuditEntries,
} from "@/features/admin/api/admin.api";
import { AuditPage } from "@/features/admin/pages/AuditPage";
import { CredentialsPage } from "@/features/admin/pages/CredentialsPage";
import { PlatformsPage } from "@/features/admin/pages/PlatformsPage";
import { renderWithProviders } from "@/tests/renderWithProviders";

vi.mock("@/features/admin/api/admin.api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/admin/api/admin.api")>();
  return {
    ...actual,
    fetchAdminPlatforms: vi.fn(),
    createAdminPlatform: vi.fn(),
    updateAdminPlatform: vi.fn(),
    deleteAdminPlatform: vi.fn(),
    fetchAdminCredentialProfiles: vi.fn(),
    createAdminCredentialProfile: vi.fn(),
    updateAdminCredentialProfile: vi.fn(),
    deleteAdminCredentialProfile: vi.fn(),
    fetchAuditEntries: vi.fn(),
  };
});

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    isOwner: true,
    canManageAdmin: true,
    hasRole: () => true,
    canEdit: true,
    canDelete: true,
  }),
}));

describe("Admin pages", () => {
  beforeEach(() => {
    vi.mocked(fetchAdminPlatforms).mockResolvedValue([
      {
        id: 1,
        slug: "cisco_nxos",
        display_name: "Cisco NX-OS",
        vendor_hint: "cisco",
        napalm_driver: "nxos",
        netmiko_type: "cisco_nxos",
        device_count: 4,
      },
    ]);
    vi.mocked(fetchAdminCredentialProfiles).mockResolvedValue([
      {
        id: 1,
        name: "Default SSH",
        auth_type: "username_password",
        username: "admin",
        secret_ref: "vault://orbit/default-ssh",
        device_count: 9,
      },
    ]);
    vi.mocked(fetchAuditEntries).mockResolvedValue({
      data: [
        {
          id: 1,
          uuid: "abc",
          occurred_at: "2026-03-31T12:00:00Z",
          actor_display_name: "owner",
          action: "platform.create",
          target_type: "platform",
          ip_address: "10.0.0.10",
          payload: { slug: "cisco_nxos" },
        },
      ],
      page: { cursor: "0", size: 15, total: 1, next: null, prev: null },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates a platform from the modal", async () => {
    const user = userEvent.setup();
    vi.mocked(createAdminPlatform).mockResolvedValue({
      id: 2,
      slug: "juniper_junos",
      display_name: "Juniper Junos",
    });

    renderWithProviders(<PlatformsPage />);

    expect(await screen.findByText("Cisco NX-OS")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New platform" }));
    await user.type(await screen.findByLabelText(/^Slug/), "juniper_junos");
    await user.type(screen.getByLabelText("Display Name"), "Juniper Junos");
    await user.click(screen.getByRole("button", { name: "Create platform" }));

    await waitFor(() => {
      expect(vi.mocked(createAdminPlatform)).toHaveBeenCalled();
    });

    const call = vi.mocked(createAdminPlatform).mock.calls[0]?.[0];
    expect(call?.slug).toBe("juniper_junos");
    expect(call?.display_name).toBe("Juniper Junos");
  });

  it("opens a read-only platform quick-view with an Edit action on row click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlatformsPage />);

    await user.click(await screen.findByText("Cisco NX-OS"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("NAPALM driver")).toBeInTheDocument();
    expect(within(dialog).getByText("nxos")).toBeInTheDocument();
    expect(within(dialog).getByText("Netmiko type")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("button", { name: "Save platform" })).toBeInTheDocument();
  });

  it("opens a read-only credential quick-view and exposes no Test action", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CredentialsPage />);

    await user.click(await screen.findByText("Default SSH"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Secret reference")).toBeInTheDocument();
    expect(within(dialog).getByText("Auth type")).toBeInTheDocument();
    // No credential test/validate endpoint exists — the action must not appear.
    expect(screen.queryByRole("button", { name: "Test" })).not.toBeInTheDocument();
  });

  it("renders credentials and audit data", async () => {
    renderWithProviders(
      <>
        <CredentialsPage />
        <AuditPage />
      </>,
    );

    expect(await screen.findByText("Default SSH")).toBeInTheDocument();
    expect(screen.getByText("platform.create")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
  });
});
