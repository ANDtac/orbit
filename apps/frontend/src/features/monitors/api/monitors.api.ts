import apiClient from "@/lib/apiClient";
import {
    demoCreateMonitor,
    demoDeleteMonitor,
    demoFetchMonitor,
    demoFetchMonitorAlerts,
    demoFetchMonitorResults,
    demoFetchMonitors,
    demoRunMonitor,
    demoUpdateMonitor,
    isDemoApiEnabled,
    type MonitorCreateInput,
} from "@/lib/demo/api";
import type { Job, Monitor, MonitorResult } from "@/lib/types";

// ─── Re-exports ───────────────────────────────────────────────────────────────

export type { MonitorCreateInput };
export type MonitorUpdateInput = Partial<MonitorCreateInput>;

export interface MonitorResultsQueryOptions {
    device_id?: number;
    from?: string;
    to?: string;
    limit?: number;
}

export interface MonitorResultsResponse {
    data: MonitorResult[];
    page: { total: number; limit: number };
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchMonitors(): Promise<Monitor[]> {
    if (isDemoApiEnabled()) {
        return demoFetchMonitors();
    }
    const { data } = await apiClient.get<Monitor[]>("/monitors");
    return data;
}

export async function fetchMonitor(id: number): Promise<Monitor> {
    if (isDemoApiEnabled()) {
        return demoFetchMonitor(id);
    }
    const { data } = await apiClient.get<Monitor>(`/monitors/${id}`);
    return data;
}

export async function fetchMonitorAlerts(): Promise<Monitor[]> {
    if (isDemoApiEnabled()) {
        return demoFetchMonitorAlerts();
    }
    const { data } = await apiClient.get<Monitor[]>("/monitors/alerts");
    return data;
}

export async function fetchMonitorResults(
    id: number,
    options?: MonitorResultsQueryOptions,
): Promise<MonitorResultsResponse> {
    if (isDemoApiEnabled()) {
        return demoFetchMonitorResults(id, options);
    }
    const { data } = await apiClient.get<MonitorResultsResponse>(
        `/monitors/${id}/results`,
        { params: options },
    );
    return data;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createMonitor(input: MonitorCreateInput): Promise<Monitor> {
    if (isDemoApiEnabled()) {
        return demoCreateMonitor(input);
    }
    const { data } = await apiClient.post<Monitor>("/monitors", input);
    return data;
}

export async function updateMonitor(id: number, input: MonitorUpdateInput): Promise<Monitor> {
    if (isDemoApiEnabled()) {
        return demoUpdateMonitor(id, input);
    }
    const { data } = await apiClient.patch<Monitor>(`/monitors/${id}`, input);
    return data;
}

export async function deleteMonitor(id: number): Promise<void> {
    if (isDemoApiEnabled()) {
        demoDeleteMonitor(id);
        return;
    }
    await apiClient.delete(`/monitors/${id}`);
}

export async function runMonitor(id: number): Promise<{ job: Job; enqueued: boolean }> {
    if (isDemoApiEnabled()) {
        return demoRunMonitor(id);
    }
    const { data } = await apiClient.post<{ job: Job; enqueued: boolean }>(
        `/monitors/${id}/run`,
        {},
    );
    return data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const COMPARATOR_LABELS: Record<string, string> = {
    gt: "> (greater than)",
    lt: "< (less than)",
    gte: ">= (greater than or equal)",
    lte: "<= (less than or equal)",
    eq: "= (equal)",
    ne: "≠ (not equal)",
};

export const COMPARATOR_OPTIONS = [
    { value: "gt",  label: "> (greater than)" },
    { value: "lt",  label: "< (less than)" },
    { value: "gte", label: ">= (greater than or equal)" },
    { value: "lte", label: "<= (less than or equal)" },
    { value: "eq",  label: "= (equal)" },
    { value: "ne",  label: "≠ (not equal)" },
] as const;

export const VISIBILITY_OPTIONS = [
    { value: "private", label: "Private" },
    { value: "shared",  label: "Shared" },
    { value: "role",    label: "Role-based" },
] as const;
