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

vi.mock("@/features/monitoring/pages/MonitoringOverviewPage", () => ({
  MonitoringOverviewPage: () => <div>monitoring overview page</div>,
}));

vi.mock("@/features/monitoring/pages/MonitoringHealthPage", () => ({
  MonitoringHealthPage: () => <div>monitoring health page</div>,
}));

vi.mock("@/features/monitoring/pages/MonitoringJobsPage", () => ({
  MonitoringJobsPage: () => <div>monitoring jobs page</div>,
}));

vi.mock("@/features/monitoring/pages/MonitoringProbesPage", () => ({
  MonitoringProbesPage: () => <div>monitoring probes page</div>,
}));

vi.mock("@/features/monitoring/pages/MonitoringPoliciesPage", () => ({
  MonitoringPoliciesPage: () => <div>monitoring policies page</div>,
}));

vi.mock("@/features/monitoring/pages/MonitoringLogsPage", () => ({
  MonitoringLogsPage: () => <div>monitoring logs page</div>,
}));

vi.mock("@/features/monitoring/pages/MonitoringAlertsPage", () => ({
  MonitoringAlertsPage: () => <div>monitoring alerts page</div>,
}));

describe("Monitoring routes", () => {
  it("renders monitoring overview route", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("monitoring overview page")).toBeInTheDocument();
  });

  it("renders monitoring jobs route", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring/jobs"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("monitoring jobs page")).toBeInTheDocument();
  });

  it("renders monitoring health route", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring/health"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("monitoring health page")).toBeInTheDocument();
  });

  it("renders monitoring policies route", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring/policies"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("monitoring policies page")).toBeInTheDocument();
  });

  it("renders monitoring logs route", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring/logs"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("monitoring logs page")).toBeInTheDocument();
  });

  it("renders monitoring probes route", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring/probes"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("monitoring probes page")).toBeInTheDocument();
  });

  it("renders monitoring alerts route", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring/alerts"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("monitoring alerts page")).toBeInTheDocument();
  });
});
