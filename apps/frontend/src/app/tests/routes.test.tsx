import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Outlet } from "react-router-dom";

const authState = { isAuthenticated: true };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: () => <Outlet />,
}));

vi.mock("@/components/layout/Page", () => ({
  Page: ({ title, children }: { title?: string; children: ReactNode }) => (
    <div>
      {title ? <h1>{title}</h1> : null}
      {children}
    </div>
  ),
}));

vi.mock("@/pages/Home", () => ({ Home: () => <div>HomePage</div> }));
vi.mock("@/pages/NotFound", () => ({ NotFound: () => <div>NotFoundPage</div> }));
vi.mock("@/pages/PlaceholderPage", () => ({
  PlaceholderPage: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("@/features/auth/pages/LoginPage", () => ({ LoginPage: () => <div>LoginPage</div> }));
vi.mock("@/features/devices/pages/DevicesListPage", () => ({
  DevicesListPage: () => <div>DevicesListPage</div>,
}));
vi.mock("@/features/devices/pages/DeviceDetailPage", () => ({
  DeviceDetailPage: () => <div>DeviceDetailPage</div>,
}));
vi.mock("@/features/devices/pages/DeviceCreatePage", () => ({
  DeviceCreatePage: () => <div>DeviceCreatePage</div>,
}));
vi.mock("@/features/devices/pages/DeviceEditPage", () => ({
  DeviceEditPage: () => <div>DeviceEditPage</div>,
}));
vi.mock("@/features/monitoring/pages/MonitoringOverviewPage", () => ({
  MonitoringOverviewPage: () => <div>MonitoringOverviewPage</div>,
}));
vi.mock("@/features/monitoring/pages/MonitoringHealthPage", () => ({
  MonitoringHealthPage: () => <div>MonitoringHealthPage</div>,
}));
vi.mock("@/features/monitoring/pages/MonitoringJobsPage", () => ({
  MonitoringJobsPage: () => <div>MonitoringJobsPage</div>,
}));
vi.mock("@/features/monitoring/pages/MonitoringProbesPage", () => ({
  MonitoringProbesPage: () => <div>MonitoringProbesPage</div>,
}));
vi.mock("@/features/monitoring/pages/MonitoringPoliciesPage", () => ({
  MonitoringPoliciesPage: () => <div>MonitoringPoliciesPage</div>,
}));
vi.mock("@/features/admin/pages/MonitoringLogsPage", () => ({
  MonitoringLogsPage: () => <div>MonitoringLogsPage</div>,
}));
vi.mock("@/features/monitoring/pages/MonitoringAlertsPage", () => ({
  MonitoringAlertsPage: () => <div>MonitoringAlertsPage</div>,
}));
vi.mock("@/features/automation/pages/PasswordChangePage", () => ({
  PasswordChangePage: () => <div>PasswordChangePage</div>,
}));
vi.mock("@/features/admin/pages/OperationTemplatesPage", () => ({
  OperationTemplatesPage: () => <div>OperationTemplatesPage</div>,
}));
vi.mock("@/features/automation/pages/OperationJobsPage", () => ({
  OperationJobsPage: () => <div>OperationJobsPage</div>,
}));
vi.mock("@/features/configurations/pages/SnapshotsPage", () => ({
  SnapshotsPage: () => <div>SnapshotsPage</div>,
}));
vi.mock("@/features/compliance/pages/CompliancePoliciesPage", () => ({
  CompliancePoliciesPage: () => <div>CompliancePoliciesPage</div>,
}));
vi.mock("@/features/compliance/pages/ComplianceResultsPage", () => ({
  ComplianceResultsPage: () => <div>ComplianceResultsPage</div>,
}));
vi.mock("@/features/lifecycle/pages/HardwareEoxPage", () => ({
  HardwareEoxPage: () => <div>HardwareEoxPage</div>,
}));
vi.mock("@/features/lifecycle/pages/SoftwareEoxPage", () => ({
  SoftwareEoxPage: () => <div>SoftwareEoxPage</div>,
}));
vi.mock("@/features/admin/pages/PlatformsPage", () => ({
  PlatformsPage: () => <div>PlatformsPage</div>,
}));
vi.mock("@/features/admin/pages/CredentialsPage", () => ({
  CredentialsPage: () => <div>CredentialsPage</div>,
}));
vi.mock("@/features/admin/pages/AuditPage", () => ({
  AuditPage: () => <div>AuditPage</div>,
}));
vi.mock("@/features/monitors/pages/MonitorsPage", () => ({
  MonitorsPage: () => <div>MonitorsPage</div>,
}));
vi.mock("@/features/monitors/pages/MonitorDetailPage", () => ({
  MonitorDetailPage: () => <div>MonitorDetailPage</div>,
}));

import { AppRoutes } from "@/app/routes";

describe("AppRoutes", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
  });

  it("redirects unauthenticated users to login", async () => {
    authState.isAuthenticated = false;

    render(
      <MemoryRouter
        initialEntries={["/inventory/devices"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByText("LoginPage")).toBeInTheDocument();
  });

  it("renders protected routes for authenticated users and supports legacy redirects", async () => {
    render(
      <MemoryRouter
        initialEntries={["/devices"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByText("DevicesListPage")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Devices" })).toBeInTheDocument();
  });

  it("renders the not found route for unknown paths", async () => {
    render(
      <MemoryRouter
        initialEntries={["/does-not-exist"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByText("NotFoundPage")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Not Found" })).toBeInTheDocument();
  });
});
