import { Routes, Route } from "react-router-dom";

import { Page } from "@/components/layout/Page";
import { Home } from "@/pages/Home";
import { DevicesListPage } from "@/features/devices/pages/DevicesListPage";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { NotFound } from "@/pages/NotFound";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { MonitoringOverviewPage } from "@/features/monitoring/pages/MonitoringOverviewPage";
import { MonitoringJobsPage } from "@/features/monitoring/pages/MonitoringJobsPage";
import { MonitoringPoliciesPage } from "@/features/monitoring/pages/MonitoringPoliciesPage";
import { MonitoringLogsPage } from "@/features/monitoring/pages/MonitoringLogsPage";

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route
          path="/"
          element={
            <Page
              title="Overview"
              description="Monitor the health of your network automation program at a glance."
            >
              <Home />
            </Page>
          }
        />
        <Route
          path="/devices"
          element={
            <Page
              title="Devices"
              description="Inventory of managed devices with real-time health indicators."
            >
              <DevicesListPage />
            </Page>
          }
        />
        <Route
          path="/monitoring"
          element={
            <Page
              title="Monitoring"
              description="Operator action center for live monitoring, guardrailed operations, and workflow status."
            >
              <MonitoringOverviewPage />
            </Page>
          }
        />
        <Route
          path="/monitoring/jobs"
          element={
            <Page
              title="Monitoring jobs"
              description="Track asynchronous execution across queued, running, and completed monitoring workflows."
            >
              <MonitoringJobsPage />
            </Page>
          }
        />
        <Route
          path="/monitoring/policies"
          element={
            <Page
              title="Monitoring policies"
              description="Create and manage monitoring/compliance policies using Orbit-native policy resources."
            >
              <MonitoringPoliciesPage />
            </Page>
          }
        />
        <Route
          path="/monitoring/logs"
          element={
            <Page
              title="Monitoring logs"
              description="Inspect request and error telemetry without leaving Orbit workflows."
            >
              <MonitoringLogsPage />
            </Page>
          }
        />
        <Route
          path="*"
          element={
            <Page title="Not found">
              <NotFound />
            </Page>
          }
        />
      </Route>
      <Route path="/login" element={<LoginPage />} />
    </Routes>
  );
}
