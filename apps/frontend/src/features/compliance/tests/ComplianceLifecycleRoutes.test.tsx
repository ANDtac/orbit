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

vi.mock("@/features/compliance/pages/CompliancePoliciesPage", () => ({
  CompliancePoliciesPage: () => <div>compliance policies page</div>,
}));

vi.mock("@/features/compliance/pages/ComplianceResultsPage", () => ({
  ComplianceResultsPage: () => <div>compliance results page</div>,
}));

vi.mock("@/features/lifecycle/pages/HardwareEoxPage", () => ({
  HardwareEoxPage: () => <div>hardware eox page</div>,
}));

vi.mock("@/features/lifecycle/pages/SoftwareEoxPage", () => ({
  SoftwareEoxPage: () => <div>software eox page</div>,
}));

describe("Compliance and lifecycle routes", () => {
  it("renders the compliance policies route", () => {
    render(
      <MemoryRouter
        initialEntries={["/compliance/policies"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("compliance policies page")).toBeInTheDocument();
  });

  it("renders the hardware lifecycle route", () => {
    render(
      <MemoryRouter
        initialEntries={["/lifecycle/hardware"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("hardware eox page")).toBeInTheDocument();
  });
});
