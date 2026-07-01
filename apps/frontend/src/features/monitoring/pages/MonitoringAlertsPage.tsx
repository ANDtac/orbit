import { AlertsPanel } from "@/features/monitoring/components/AlertsPanel";

/**
 * Legacy standalone alerts page. Retained for direct reuse/tests; the alerts
 * surface is now folded into the global Overview (Home). The route
 * `/monitoring/alerts` redirects to `/`.
 */
export function MonitoringAlertsPage(): JSX.Element {
  return <AlertsPanel />;
}
