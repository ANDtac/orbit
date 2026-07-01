import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";

import { AppRoutes } from "@/app/routes";

vi.mock("@/features/auth/components/ProtectedRoute", () => ({
  ProtectedRoute: () => <Outlet />,
}));

vi.mock("@/components/layout/Page", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: () => <Outlet />,
}));

vi.mock("@/features/automation/pages/PasswordChangePage", () => ({
  PasswordChangePage: () => <div>password change page</div>,
}));

vi.mock("@/features/admin/pages/OperationTemplatesPage", () => ({
  OperationTemplatesPage: () => <div>operation templates page</div>,
}));

vi.mock("@/features/automation/pages/RunsPage", () => ({
  RunsPage: () => <div>runs page</div>,
}));

vi.mock("@/features/automation/pages/RunDetailPage", () => ({
  RunDetailPage: () => <div>run detail page</div>,
}));

vi.mock("@/features/configurations/pages/SnapshotsPage", () => ({
  SnapshotsPage: () => <div>snapshots page</div>,
}));

describe("Operations routes", () => {
  it("redirects the legacy templates route to Admin templates", () => {
    render(
      <MemoryRouter
        initialEntries={["/operations/templates"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("operation templates page")).toBeInTheDocument();
  });

  it("renders the Admin templates route", () => {
    render(
      <MemoryRouter
        initialEntries={["/admin/templates"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("operation templates page")).toBeInTheDocument();
  });

  it("redirects the legacy operations jobs route to Automation runs", () => {
    render(
      <MemoryRouter
        initialEntries={["/operations/jobs"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("runs page")).toBeInTheDocument();
  });

  it("renders the Automation runs route", () => {
    render(
      <MemoryRouter
        initialEntries={["/automation/runs"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("runs page")).toBeInTheDocument();
  });

  it("renders the Automation run detail route", () => {
    render(
      <MemoryRouter
        initialEntries={["/automation/runs/44"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("run detail page")).toBeInTheDocument();
  });

  it("redirects the legacy snapshots route to Inventory configurations", () => {
    render(
      <MemoryRouter
        initialEntries={["/operations/snapshots"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("snapshots page")).toBeInTheDocument();
  });

  it("renders the Inventory configurations route", () => {
    render(
      <MemoryRouter
        initialEntries={["/inventory/configurations"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("snapshots page")).toBeInTheDocument();
  });
});
