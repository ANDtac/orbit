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

vi.mock("@/features/operations/pages/PasswordChangePage", () => ({
  PasswordChangePage: () => <div>password change page</div>,
}));

vi.mock("@/features/operations/pages/OperationTemplatesPage", () => ({
  OperationTemplatesPage: () => <div>operation templates page</div>,
}));

vi.mock("@/features/operations/pages/OperationJobsPage", () => ({
  OperationJobsPage: () => <div>operation jobs page</div>,
}));

vi.mock("@/features/operations/pages/SnapshotsPage", () => ({
  SnapshotsPage: () => <div>snapshots page</div>,
}));

describe("Operations routes", () => {
  it("renders templates route", () => {
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

  it("renders jobs route", () => {
    render(
      <MemoryRouter
        initialEntries={["/operations/jobs"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("operation jobs page")).toBeInTheDocument();
  });

  it("renders snapshots route", () => {
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
});
