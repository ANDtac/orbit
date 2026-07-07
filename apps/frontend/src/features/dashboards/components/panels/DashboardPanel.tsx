import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchPanelData } from "@/features/dashboards/api/dashboards.api";
import { fetchMonitor } from "@/features/monitors/api/monitors.api";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { DashboardPanel as DashboardPanelType } from "@/lib/types";
import { StatPanel } from "./StatPanel";
import { TimeChartPanel } from "./TimeChartPanel";
import { StatusGridPanel } from "./StatusGridPanel";
import { TablePanel } from "./TablePanel";

interface DashboardPanelProps {
    panel: DashboardPanelType;
}

function PanelSkeleton(): JSX.Element {
    return (
        <div className="h-full w-full animate-pulse rounded-lg bg-primary/10" />
    );
}

export function DashboardPanel({ panel }: DashboardPanelProps): JSX.Element {
    const monitorQuery = useQuery({
        queryKey: [QUERY_KEYS.monitors, panel.monitor_id],
        queryFn: () => fetchMonitor(panel.monitor_id),
    });

    const dataQuery = useQuery({
        queryKey: [QUERY_KEYS.panelData, panel.dashboard_id, panel.id],
        queryFn: () => fetchPanelData(panel.dashboard_id, panel.id, { limit: 50 }),
    });

    const devicesQuery = useQuery({
        queryKey: [QUERY_KEYS.devices, "panel-names"],
        queryFn: () => fetchDevices({ "page[size]": 200, sort: "name" }),
        staleTime: 5 * 60 * 1000,
    });

    const isLoading = monitorQuery.isLoading || dataQuery.isLoading;
    const monitor = monitorQuery.data;
    const results = dataQuery.data?.data ?? [];
    const devices = devicesQuery.data?.data ?? [];

    const deviceNames = useMemo(
        () =>
            devices.reduce<Record<number, string>>((acc, d) => {
                acc[d.id] = d.name;
                return acc;
            }, {}),
        [devices],
    );

    return (
        <div className="flex h-full flex-col rounded-2xl border border-primary/10 bg-surface p-4">
            {panel.title ? (
                <p className="mb-2 shrink-0 text-sm font-medium text-text">{panel.title}</p>
            ) : null}
            <div className="min-h-0 flex-1 overflow-hidden">
                {isLoading ? (
                    <PanelSkeleton />
                ) : !monitor ? (
                    <p className="text-sm text-red-400">Monitor not found.</p>
                ) : panel.viz_type === "timechart" ? (
                    <TimeChartPanel
                        data={results}
                        monitor={monitor}
                        deviceNames={deviceNames}
                    />
                ) : panel.viz_type === "stat" ? (
                    <StatPanel data={results} monitor={monitor} />
                ) : panel.viz_type === "statusgrid" ? (
                    <StatusGridPanel data={results} />
                ) : (
                    <TablePanel
                        data={results}
                        devices={devices}
                        deviceNames={deviceNames}
                    />
                )}
            </div>
        </div>
    );
}
