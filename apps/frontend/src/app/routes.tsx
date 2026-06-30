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
import { MonitoringOverviewPage } from "@/features/monitoring/pages/MonitoringOverviewPage";
import { MonitoringHealthPage } from "@/features/monitoring/pages/MonitoringHealthPage";
import { MonitoringJobsPage } from "@/features/monitoring/pages/MonitoringJobsPage";
import { MonitoringProbesPage } from "@/features/monitoring/pages/MonitoringProbesPage";
import { MonitoringPoliciesPage } from "@/features/monitoring/pages/MonitoringPoliciesPage";
import { MonitoringLogsPage } from "@/features/monitoring/pages/MonitoringLogsPage";
import { MonitoringAlertsPage } from "@/features/monitoring/pages/MonitoringAlertsPage";
import { PasswordChangePage } from "@/features/operations/pages/PasswordChangePage";
import { OperationTemplatesPage } from "@/features/operations/pages/OperationTemplatesPage";
import { OperationJobsPage } from "@/features/operations/pages/OperationJobsPage";
import { SnapshotsPage } from "@/features/operations/pages/SnapshotsPage";
import { CompliancePoliciesPage } from "@/features/compliance/pages/CompliancePoliciesPage";
import { ComplianceResultsPage } from "@/features/compliance/pages/ComplianceResultsPage";
import { HardwareEoxPage } from "@/features/lifecycle/pages/HardwareEoxPage";
import { SoftwareEoxPage } from "@/features/lifecycle/pages/SoftwareEoxPage";
import { PlatformsPage } from "@/features/admin/pages/PlatformsPage";
import { CredentialsPage } from "@/features/admin/pages/CredentialsPage";
import { AuditPage } from "@/features/admin/pages/AuditPage";

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

                    {/* Legacy redirect */}
                    <Route
                        path="/devices"
                        element={<Navigate to="/inventory/devices" replace />}
                    />

                    {/* Monitoring */}
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
                                title="Monitoring Jobs"
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
                                title="Monitoring Policies"
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
                                title="Monitoring Logs"
                                description="Inspect request and error telemetry without leaving Orbit workflows."
                            >
                                <MonitoringLogsPage />
                            </Page>
                        }
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
                        path="/monitoring/probes"
                        element={
                            <Page
                                title="Probes"
                                description="Queue device probe batches and review recent probe execution jobs."
                            >
                                <MonitoringProbesPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/monitoring/alerts"
                        element={
                            <Page
                                title="Alerts"
                                description="Review recent backend errors, failed jobs, and failing compliance results in one place."
                            >
                                <MonitoringAlertsPage />
                            </Page>
                        }
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
                        path="/operations/jobs"
                        element={
                            <Page
                                title="Operation Jobs"
                                description="Track queued and completed operation execution batches."
                            >
                                <OperationJobsPage />
                            </Page>
                        }
                    />
                    <Route
                        path="/operations/snapshots"
                        element={
                            <Page
                                title="Configuration Snapshots"
                                description="Browse captured configurations, inspect the latest state, and compare drift."
                            >
                                <SnapshotsPage />
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

                    {/* Lifecycle */}
                    <Route
                        path="/lifecycle/hardware"
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
                        path="/lifecycle/software"
                        element={
                            <Page
                                title="Software EoX"
                                description="Monitor software lifecycle windows by OS and version matching patterns."
                            >
                                <SoftwareEoxPage />
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
