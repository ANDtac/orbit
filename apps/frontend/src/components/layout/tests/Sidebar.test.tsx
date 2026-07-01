import { screen } from "@testing-library/react";

import { Sidebar } from "@/components/layout/Sidebar";
import { renderWithProviders } from "@/tests/renderWithProviders";

const mockHasRole = vi.fn();

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    roles: [],
    hasRole: mockHasRole,
    isOwner: false,
    canEdit: false,
    canDelete: false,
    canManageAdmin: false,
  }),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRole.mockImplementation((role) => {
      const required = Array.isArray(role) ? role : [role];
      return !required.includes("admin") && !required.includes("owner");
    });
  });

  it("expands the active section and hides admin for unauthorized users", async () => {
    renderWithProviders(
      <Sidebar
        collapsed={false}
        onToggleCollapse={vi.fn()}
        mobileOpen={false}
        onMobileClose={vi.fn()}
      />,
      { route: "/automation/runs" },
    );

    expect((await screen.findAllByRole("link", { name: "Runs" })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /automation/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /admin/i })).not.toBeInTheDocument();
  });

  it("shows admin navigation for authorized users", async () => {
    mockHasRole.mockReturnValue(true);

    renderWithProviders(
      <Sidebar
        collapsed={false}
        onToggleCollapse={vi.fn()}
        mobileOpen={false}
        onMobileClose={vi.fn()}
      />,
      { route: "/admin/platforms" },
    );

    expect((await screen.findAllByRole("button", { name: /admin/i })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Platforms" }).length).toBeGreaterThan(0);
  });

  it("supports collapsed desktop mode", () => {
    renderWithProviders(
      <Sidebar
        collapsed
        onToggleCollapse={vi.fn()}
        mobileOpen={false}
        onMobileClose={vi.fn()}
      />,
      { route: "/" },
    );

    expect(screen.getAllByLabelText("Expand sidebar").length).toBeGreaterThan(0);
    expect(screen.queryByText("Inventory")).not.toBeInTheDocument();
  });
});
