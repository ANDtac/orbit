import apiClient from "@/lib/apiClient";
import { isDemoApiEnabled } from "@/lib/demo/api";
import type {
    Dashboard,
    DashboardCreateInput,
    DashboardPanel,
    DashboardUpdateInput,
    MonitorResult,
    PanelCreateInput,
    PanelUpdateInput,
} from "@/lib/types";

// ─── Demo data ────────────────────────────────────────────────────────────────

let DEMO_ID_COUNTER = 3;

function nextDemoId(): number {
    return ++DEMO_ID_COUNTER;
}

function nowIso(): string {
    return new Date().toISOString();
}

const DEMO_DASHBOARDS: Dashboard[] = [
    {
        id: 1,
        name: "Network Health Overview",
        description: "High-level health view across all core routers.",
        visibility: "shared",
        panels: [
            {
                id: 1,
                dashboard_id: 1,
                monitor_id: 1,
                title: "CPU Utilisation",
                viz_type: "timechart",
                position: { col: 0, row: 0, w: 6, h: 3 },
            },
            {
                id: 2,
                dashboard_id: 1,
                monitor_id: 2,
                title: "Interface Errors",
                viz_type: "stat",
                position: { col: 6, row: 0, w: 6, h: 3 },
            },
        ],
        is_pinned: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    },
    {
        id: 2,
        name: "BGP Status Board",
        description: "Monitor BGP peer state across the backbone.",
        visibility: "private",
        panels: [
            {
                id: 3,
                dashboard_id: 2,
                monitor_id: 3,
                title: "BGP Peers",
                viz_type: "statusgrid",
                position: { col: 0, row: 0, w: 12, h: 4 },
            },
        ],
        is_pinned: false,
        created_at: "2026-02-01T00:00:00Z",
        updated_at: "2026-02-01T00:00:00Z",
    },
];

const DEMO_USER_PINS: Set<number> = new Set([1]);

// Seeded results per panel/monitor for demo
const DEMO_PANEL_RESULTS: MonitorResult[] = Array.from({ length: 30 }, (_, i) => ({
    id: i + 1,
    monitor_id: (i % 3) + 1,
    device_id: (i % 5) + 1,
    observed_at: new Date(Date.now() - i * 300_000).toISOString(),
    value: i % 5 === 2 ? 92 : i % 5 === 4 ? null : Math.floor(Math.random() * 50) + 20,
    status: (["passing", "passing", "failing", "passing", "error"] as const)[i % 5],
    payload: { raw: `output-${i + 1}` },
}));

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PanelDataQueryOptions {
    from?: string;
    to?: string;
    device_id?: number;
    limit?: number;
}

export interface PanelDataResponse {
    data: MonitorResult[];
}

// ─── Fetch functions ──────────────────────────────────────────────────────────

export async function fetchDashboards(): Promise<Dashboard[]> {
    if (isDemoApiEnabled()) {
        return DEMO_DASHBOARDS.map((d) => ({
            ...d,
            panels: d.panels.map((p) => ({ ...p })),
            is_pinned: DEMO_USER_PINS.has(d.id),
        }));
    }
    const { data } = await apiClient.get<Dashboard[]>("/dashboards");
    return data;
}

export async function fetchDashboard(id: number): Promise<Dashboard> {
    if (isDemoApiEnabled()) {
        const found = DEMO_DASHBOARDS.find((d) => d.id === id);
        if (!found) throw new Error(`Demo dashboard ${id} not found`);
        return {
            ...found,
            panels: found.panels.map((p) => ({ ...p })),
            is_pinned: DEMO_USER_PINS.has(id),
        };
    }
    const { data } = await apiClient.get<Dashboard>(`/dashboards/${id}`);
    return data;
}

export async function fetchPinnedDashboards(): Promise<Dashboard[]> {
    if (isDemoApiEnabled()) {
        return DEMO_DASHBOARDS.filter((d) => DEMO_USER_PINS.has(d.id)).map((d) => ({
            ...d,
            panels: d.panels.map((p) => ({ ...p })),
            is_pinned: true,
        }));
    }
    const { data } = await apiClient.get<Dashboard[]>("/dashboards/pinned");
    return data;
}

export async function fetchPanelData(
    dashboardId: number,
    panelId: number,
    options?: PanelDataQueryOptions,
): Promise<PanelDataResponse> {
    if (isDemoApiEnabled()) {
        const panel = DEMO_DASHBOARDS.flatMap((d) => d.panels).find((p) => p.id === panelId);
        const monitorId = panel?.monitor_id;
        let results = monitorId
            ? DEMO_PANEL_RESULTS.filter((r) => r.monitor_id === monitorId)
            : DEMO_PANEL_RESULTS.slice(0, 10);
        if (options?.device_id != null) {
            results = results.filter((r) => r.device_id === options.device_id);
        }
        const limit = options?.limit ?? 20;
        return { data: results.slice(0, limit) };
    }
    const { data } = await apiClient.get<PanelDataResponse>(
        `/dashboards/${dashboardId}/panels/${panelId}/data`,
        { params: options },
    );
    return data;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createDashboard(input: DashboardCreateInput): Promise<Dashboard> {
    if (isDemoApiEnabled()) {
        const created: Dashboard = {
            id: nextDemoId(),
            name: input.name,
            description: input.description,
            visibility: input.visibility,
            panels: [],
            is_pinned: false,
            created_at: nowIso(),
            updated_at: nowIso(),
        };
        DEMO_DASHBOARDS.unshift(created);
        return { ...created };
    }
    const { data } = await apiClient.post<Dashboard>("/dashboards", input);
    return data;
}

export async function updateDashboard(id: number, input: DashboardUpdateInput): Promise<Dashboard> {
    if (isDemoApiEnabled()) {
        const index = DEMO_DASHBOARDS.findIndex((d) => d.id === id);
        if (index === -1) throw new Error(`Demo dashboard ${id} not found`);
        DEMO_DASHBOARDS[index] = { ...DEMO_DASHBOARDS[index], ...input, updated_at: nowIso() };
        return { ...DEMO_DASHBOARDS[index], panels: [...DEMO_DASHBOARDS[index].panels] };
    }
    const { data } = await apiClient.patch<Dashboard>(`/dashboards/${id}`, input);
    return data;
}

export async function deleteDashboard(id: number): Promise<void> {
    if (isDemoApiEnabled()) {
        const index = DEMO_DASHBOARDS.findIndex((d) => d.id === id);
        if (index >= 0) DEMO_DASHBOARDS.splice(index, 1);
        DEMO_USER_PINS.delete(id);
        return;
    }
    await apiClient.delete(`/dashboards/${id}`);
}

export async function pinDashboard(id: number): Promise<void> {
    if (isDemoApiEnabled()) {
        DEMO_USER_PINS.add(id);
        return;
    }
    await apiClient.post(`/dashboards/${id}/pin`, {});
}

export async function unpinDashboard(id: number): Promise<void> {
    if (isDemoApiEnabled()) {
        DEMO_USER_PINS.delete(id);
        return;
    }
    await apiClient.delete(`/dashboards/${id}/pin`);
}

export async function createPanel(
    dashboardId: number,
    input: PanelCreateInput,
): Promise<DashboardPanel> {
    if (isDemoApiEnabled()) {
        const dashboard = DEMO_DASHBOARDS.find((d) => d.id === dashboardId);
        if (!dashboard) throw new Error(`Demo dashboard ${dashboardId} not found`);
        const panel: DashboardPanel = {
            id: nextDemoId(),
            dashboard_id: dashboardId,
            monitor_id: input.monitor_id,
            title: input.title,
            viz_type: input.viz_type,
            position: input.position ?? { col: 0, row: 0, w: 6, h: 3 },
            config: input.config,
        };
        dashboard.panels.push(panel);
        return { ...panel };
    }
    const { data } = await apiClient.post<DashboardPanel>(
        `/dashboards/${dashboardId}/panels`,
        input,
    );
    return data;
}

export async function updatePanel(
    dashboardId: number,
    panelId: number,
    input: PanelUpdateInput,
): Promise<DashboardPanel> {
    if (isDemoApiEnabled()) {
        const dashboard = DEMO_DASHBOARDS.find((d) => d.id === dashboardId);
        if (!dashboard) throw new Error(`Demo dashboard ${dashboardId} not found`);
        const index = dashboard.panels.findIndex((p) => p.id === panelId);
        if (index === -1) throw new Error(`Demo panel ${panelId} not found`);
        dashboard.panels[index] = { ...dashboard.panels[index], ...input };
        return { ...dashboard.panels[index] };
    }
    const { data } = await apiClient.patch<DashboardPanel>(
        `/dashboards/${dashboardId}/panels/${panelId}`,
        input,
    );
    return data;
}

export async function deletePanel(dashboardId: number, panelId: number): Promise<void> {
    if (isDemoApiEnabled()) {
        const dashboard = DEMO_DASHBOARDS.find((d) => d.id === dashboardId);
        if (dashboard) {
            dashboard.panels = dashboard.panels.filter((p) => p.id !== panelId);
        }
        return;
    }
    await apiClient.delete(`/dashboards/${dashboardId}/panels/${panelId}`);
}
