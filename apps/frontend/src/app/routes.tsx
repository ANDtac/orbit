import { Routes, Route, Navigate } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { Page } from "@/components/layout/Page";
import { Home } from "@/pages/Home";
import { NotFound } from "@/pages/NotFound";
import { LoginPage } from "@/features/auth/pages/LoginPage";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { DevicesListPage } from "@/features/devices/pages/DevicesListPage";
import { DeviceDetailPage } from "@/features/devices/pages/DeviceDetailPage";
import { DeviceCreatePage } from "@/features/devices/pages/DeviceCreatePage";
import { DeviceEditPage } from "@/features/devices/pages/DeviceEditPage";
import { MonitoringHealthPage } from "@/features/monitoring/pages/MonitoringHealthPage";
import { MonitorsPage } from "@/features/monitors/pages/MonitorsPage";
import { MonitorDetailPage } from "@/features/monitors/pages/MonitorDetailPage";
import { MonitoringLogsPage } from "@/features/admin/pages/MonitoringLogsPage";
import { PasswordChangePage } from "@/features/automation/pages/PasswordChangePage";
import { OperationTemplatesPage } from "@/features/admin/pages/OperationTemplatesPage";
import { RunsPage } from "@/features/automation/pages/RunsPage";
import { RunDetailPage } from "@/features/automation/pages/RunDetailPage";
import { AutomationBuilderPage } from "@/features/automation/pages/AutomationBuilderPage";
import { SchedulesPage } from "@/features/automation/pages/SchedulesPage";
import { SnapshotsPage } from "@/features/configurations/pages/SnapshotsPage";
import { CompliancePoliciesPage } from "@/features/compliance/pages/CompliancePoliciesPage";
import { ComplianceResultsPage } from "@/features/compliance/pages/ComplianceResultsPage";
import { HardwareEoxPage } from "@/features/lifecycle/pages/HardwareEoxPage";
import { SoftwareEoxPage } from "@/features/lifecycle/pages/SoftwareEoxPage";
import { PlatformsPage } from "@/features/admin/pages/PlatformsPage";
import { CredentialsPage } from "@/features/admin/pages/CredentialsPage";
import { AuditPage } from "@/features/admin/pages/AuditPage";
import { AuditDetailPage } from "@/features/admin/pages/AuditDetailPage";
import { DashboardsPage } from "@/features/dashboards/pages/DashboardsPage";
import { DashboardDetailPage } from "@/features/dashboards/pages/DashboardDetailPage";

export function AppRoutes(): JSX.Element {
    return (
        <Routes>
            <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                    {/* Overview */}
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

                    {/* Inventory */}
                    <Route
                        path="/inventory/devices"
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
                        path="/inventory/devices/new"
                        element={<DeviceCreatePage />}
                    />
                    <Route
                        path="/inventory/devices/:id"
                        element={<DeviceDetailPage />}
                    />
                    <Route
                        path="/inventory/devices/:id/edit"
                        element={<DeviceEditPage />}
                    />

                    <Route
                        path="/inventory/configurations"
                        element={
                            <Page
                                title="Configurations"
                                description="Browse captured configurations, inspect the latest state, and compare drift."
                            >
                                <SnapshotsPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/inventory/lifecycle/hardware"
                        element={
                            <Page
                                title="Hardware EoX"
                                description="Track hardware end-of-life milestones, identify risk windows, and maintain vendor lifecycle records."
                            >
                                <HardwareEoxPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/inventory/lifecycle/software"
                        element={
                            <Page
                                title="Software EoX"
                                description="Monitor software lifecycle windows by OS and version matching patterns."
                            >
                                <SoftwareEoxPage />
                            </Page>
                        }
                    />

                    {/* Legacy redirect */}
                    <Route
                        path="/devices"
                        element={<Navigate to="/inventory/devices" replace />}
                    />
                    <Route
                        path="/operations/snapshots"
                        element={
                            <Navigate to="/inventory/configurations" replace />
                        }
                    />
                    <Route
                        path="/lifecycle/hardware"
                        element={
                            <Navigate
                                to="/inventory/lifecycle/hardware"
                                replace
                            />
                        }
                    />
                    <Route
                        path="/lifecycle/software"
                        element={
                            <Navigate
                                to="/inventory/lifecycle/software"
                                replace
                            />
                        }
                    />

                    {/* Monitoring */}
                    {/* Overview folded into the global Overview (/) */}
                    <Route
                        path="/monitoring"
                        element={<Navigate to="/" replace />}
                    />
                    <Route
                        path="/monitoring/jobs"
                        element={<Navigate to="/automation/runs" replace />}
                    />
                    {/* Policies consolidated into Compliance */}
                    <Route
                        path="/monitoring/policies"
                        element={<Navigate to="/compliance/policies" replace />}
                    />
                    <Route
                        path="/monitoring/logs"
                        element={<Navigate to="/admin/system-logs" replace />}
                    />
                    <Route
                        path="/monitoring/health"
                        element={
                            <Page
                                title="Health Dashboard"
                                description="Fleet-wide health status, platform rollups, and inventory group health distribution."
                            >
                                <MonitoringHealthPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/monitoring/monitors"
                        element={
                            <Page
                                title="Monitors"
                                description="Define read-only monitors that evaluate action outputs against thresholds and track results over time."
                            >
                                <MonitorsPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/monitoring/monitors/:id"
                        element={
                            <Page
                                title="Monitor detail"
                                description="Inspect configuration, review historical results, and manage schedules for this monitor."
                            >
                                <MonitorDetailPage />
                            </Page>
                        }
                    />
                    {/* Probes surface hidden; page retained on disk */}
                    <Route
                        path="/monitoring/probes"
                        element={<Navigate to="/monitoring/health" replace />}
                    />
                    {/* Alerts folded into the global Overview (/) */}
                    <Route
                        path="/monitoring/alerts"
                        element={<Navigate to="/" replace />}
                    />

                    {/* Operations */}
                    <Route
                        path="/operations/password-change"
                        element={
                            <Page
                                title="Password Changes"
                                description="Select devices, confirm credentials, and track password changes as Orbit jobs."
                            >
                                <PasswordChangePage />
                            </Page>
                        }
                    />
                    <Route
                        path="/operations/templates"
                        element={<Navigate to="/admin/templates" replace />}
                    />
                    <Route
                        path="/operations/jobs"
                        element={<Navigate to="/automation/runs" replace />}
                    />

                    {/* Automation */}
                    <Route
                        path="/automation/builder"
                        element={
                            <Page
                                title="Automation Builder"
                                description="Build no-code automations by composing vetted actions against target devices."
                            >
                                <AutomationBuilderPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/automation/runs"
                        element={
                            <Page
                                title="Runs"
                                description="Track asynchronous execution across operator runs and system jobs — queued, running, and completed."
                            >
                                <RunsPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/automation/runs/:id"
                        element={
                            <Page
                                title="Run detail"
                                description="Inspect task breakdown, parameters, timing, and events for a single run."
                            >
                                <RunDetailPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/automation/schedules"
                        element={
                            <Page
                                title="Schedules"
                                description="View and manage all recurring schedules across automations and monitors."
                            >
                                <SchedulesPage />
                            </Page>
                        }
                    />

                    {/* Dashboards */}
                    <Route
                        path="/dashboards"
                        element={
                            <Page
                                title="Dashboards"
                                description="Assemble Splunk-style panels from monitor results and share them with your team."
                            >
                                <DashboardsPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/dashboards/:id"
                        element={
                            <Page
                                title="Dashboard"
                                description="View and manage panels for this dashboard."
                            >
                                <DashboardDetailPage />
                            </Page>
                        }
                    />

                    {/* Compliance */}
                    <Route
                        path="/compliance/policies"
                        element={
                            <Page
                                title="Compliance Policies"
                                description="Author policies, maintain rules, and queue evaluations from the primary compliance workspace."
                            >
                                <CompliancePoliciesPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/compliance/results"
                        element={
                            <Page
                                title="Compliance Results"
                                description="Review rule outcomes by device, policy, and time period with expandable result detail."
                            >
                                <ComplianceResultsPage />
                            </Page>
                        }
                    />

                    {/* Admin */}
                    <Route
                        path="/admin/platforms"
                        element={
                            <Page
                                title="Platforms"
                                description="Manage platform metadata, transport identifiers, and device usage."
                            >
                                <PlatformsPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/admin/credentials"
                        element={
                            <Page
                                title="Credential Profiles"
                                description="Review credential metadata, external secret references, and profile usage."
                            >
                                <CredentialsPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/admin/templates"
                        element={
                            <Page
                                title="Operation Templates"
                                description="Manage reusable per-platform runbooks and command templates."
                            >
                                <OperationTemplatesPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/admin/system-logs"
                        element={
                            <Page
                                title="System Logs"
                                description="Inspect request and error telemetry without leaving Orbit workflows."
                            >
                                <MonitoringLogsPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/admin/audit"
                        element={
                            <Page
                                title="Audit Log"
                                description="Review the audit trail of user actions and configuration changes with payload drill-down."
                            >
                                <AuditPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/admin/audit/:id"
                        element={
                            <Page
                                title="Audit entry"
                                description="Human-readable view of a single audit event and its recorded changes."
                            >
                                <AuditDetailPage />
                            </Page>
                        }
                    />

                    {/* 404 */}
                    <Route
                        path="*"
                        element={
                            <Page title="Not Found">
                                <NotFound />
                            </Page>
                        }
                    />
                </Route>
            </Route>
            <Route path="/login" element={<LoginPage />} />
        </Routes>
    );
}
