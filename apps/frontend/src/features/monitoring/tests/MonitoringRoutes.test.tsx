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

vi.mock("@/pages/Home", () => ({
  Home: () => <div>home page</div>,
}));

vi.mock("@/features/compliance/pages/CompliancePoliciesPage", () => ({
  CompliancePoliciesPage: () => <div>compliance policies page</div>,
}));

vi.mock("@/features/monitoring/pages/MonitoringHealthPage", () => ({
  MonitoringHealthPage: () => <div>monitoring health page</div>,
}));

vi.mock("@/features/automation/pages/RunsPage", () => ({
  RunsPage: () => <div>runs page</div>,
}));

vi.mock("@/features/monitoring/pages/MonitoringProbesPage", () => ({
  MonitoringProbesPage: () => <div>monitoring probes page</div>,
}));

vi.mock("@/features/monitoring/pages/MonitoringPoliciesPage", () => ({
  MonitoringPoliciesPage: () => <div>monitoring policies page</div>,
}));

vi.mock("@/features/admin/pages/MonitoringLogsPage", () => ({
  MonitoringLogsPage: () => <div>monitoring logs page</div>,
}));

vi.mock("@/features/monitoring/pages/MonitoringAlertsPage", () => ({
  MonitoringAlertsPage: () => <div>monitoring alerts page</div>,
}));

describe("Monitoring routes", () => {
  it("redirects the legacy monitoring overview route to the global Overview", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("home page")).toBeInTheDocument();
  });

  it("redirects the legacy monitoring jobs route to Automation runs", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring/jobs"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("runs page")).toBeInTheDocument();
  });

  it("renders monitoring health route", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring/health"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("monitoring health page")).toBeInTheDocument();
  });

  it("redirects the legacy monitoring policies route to Compliance policies", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring/policies"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("compliance policies page")).toBeInTheDocument();
  });

  it("redirects the legacy monitoring logs route to Admin system logs", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring/logs"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("monitoring logs page")).toBeInTheDocument();
  });

  it("renders the Admin system logs route", () => {
    render(
      <MemoryRouter initialEntries={["/admin/system-logs"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("monitoring logs page")).toBeInTheDocument();
  });

  it("redirects the hidden monitoring probes route to Health", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring/probes"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("monitoring health page")).toBeInTheDocument();
  });

  it("redirects the legacy monitoring alerts route to the global Overview", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring/alerts"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("home page")).toBeInTheDocument();
  });
});
