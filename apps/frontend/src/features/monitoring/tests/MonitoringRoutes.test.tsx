import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";

import { AppRoutes } from "@/app/routes";

vi.mock("@/features/auth/components/ProtectedRoute", () => ({
  ProtectedRoute: () => <Outlet />,
}));

vi.mock("@/components/layout/Page", () => ({
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/features/monitoring/pages/MonitoringOverviewPage", () => ({
  MonitoringOverviewPage: () => <div>monitoring overview page</div>,
}));

vi.mock("@/features/monitoring/pages/MonitoringJobsPage", () => ({
  MonitoringJobsPage: () => <div>monitoring jobs page</div>,
}));

vi.mock("@/features/monitoring/pages/MonitoringPoliciesPage", () => ({
  MonitoringPoliciesPage: () => <div>monitoring policies page</div>,
}));

vi.mock("@/features/monitoring/pages/MonitoringLogsPage", () => ({
  MonitoringLogsPage: () => <div>monitoring logs page</div>,
}));

describe("Monitoring routes", () => {
  it("renders monitoring overview route", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("monitoring overview page")).toBeInTheDocument();
  });

  it("renders monitoring jobs route", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring/jobs"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("monitoring jobs page")).toBeInTheDocument();
  });

  it("renders monitoring policies route", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring/policies"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("monitoring policies page")).toBeInTheDocument();
  });

  it("renders monitoring logs route", () => {
    render(
      <MemoryRouter initialEntries={["/monitoring/logs"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(screen.getByText("monitoring logs page")).toBeInTheDocument();
  });
});
