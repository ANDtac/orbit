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

vi.mock("@/features/admin/pages/PlatformsPage", () => ({
  PlatformsPage: () => <div>platforms page</div>,
}));

vi.mock("@/features/admin/pages/CredentialsPage", () => ({
  CredentialsPage: () => <div>credentials page</div>,
}));

vi.mock("@/features/admin/pages/AuditPage", () => ({
  AuditPage: () => <div>audit page</div>,
}));

vi.mock("@/features/admin/pages/AuditDetailPage", () => ({
  AuditDetailPage: () => <div>audit detail page</div>,
}));

describe("Admin routes", () => {
  it("renders the platforms route", () => {
    render(
      <MemoryRouter initialEntries={["/admin/platforms"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("platforms page")).toBeInTheDocument();
  });

  it("renders the audit route", () => {
    render(
      <MemoryRouter initialEntries={["/admin/audit"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("audit page")).toBeInTheDocument();
  });

  it("renders the audit detail route", () => {
    render(
      <MemoryRouter initialEntries={["/admin/audit/42"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("audit detail page")).toBeInTheDocument();
  });
});
