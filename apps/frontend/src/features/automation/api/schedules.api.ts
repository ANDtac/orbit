import apiClient from "@/lib/apiClient";
import {
    demoCreateSchedule,
    demoDeleteSchedule,
    demoFetchSchedule,
    demoFetchSchedules,
    demoFireSchedule,
    demoUpdateSchedule,
    isDemoApiEnabled,
} from "@/lib/demo/api";
import type { Job, Schedule, ScheduleCreateInput, ScheduleUpdateInput } from "@/lib/types";

export type { Schedule, ScheduleCreateInput, ScheduleUpdateInput };

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchSchedules(params?: {
    target_type?: string;
    target_id?: number;
}): Promise<Schedule[]> {
    if (isDemoApiEnabled()) {
        return demoFetchSchedules(params?.target_type, params?.target_id);
    }
    const { data } = await apiClient.get<Schedule[]>("/schedules", { params });
    return data;
}

export async function fetchSchedule(id: number): Promise<Schedule> {
    if (isDemoApiEnabled()) {
        return demoFetchSchedule(id);
    }
    const { data } = await apiClient.get<Schedule>(`/schedules/${id}`);
    return data;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createSchedule(input: ScheduleCreateInput): Promise<Schedule> {
    if (isDemoApiEnabled()) {
        return demoCreateSchedule(input);
    }
    const { data } = await apiClient.post<Schedule>("/schedules", input);
    return data;
}

export async function updateSchedule(id: number, input: ScheduleUpdateInput): Promise<Schedule> {
    if (isDemoApiEnabled()) {
        return demoUpdateSchedule(id, input);
    }
    const { data } = await apiClient.patch<Schedule>(`/schedules/${id}`, input);
    return data;
}

export async function deleteSchedule(id: number): Promise<void> {
    if (isDemoApiEnabled()) {
        demoDeleteSchedule(id);
        return;
    }
    await apiClient.delete(`/schedules/${id}`);
}

/** Manually trigger a schedule immediately; returns the enqueued job. */
export async function fireSchedule(id: number): Promise<{ job: Job }> {
    if (isDemoApiEnabled()) {
        return demoFireSchedule(id);
    }
    const { data } = await apiClient.post<{ job: Job }>(`/schedules/${id}/fire-now`, {});
    return data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const PRESET_LABELS: Record<string, string> = {
    every_5m:  "Every 5 min",
    every_15m: "Every 15 min",
    every_30m: "Every 30 min",
    hourly:    "Hourly",
    daily:     "Daily",
    weekly:    "Weekly",
};

export const SCHEDULE_PRESETS = [
    { value: "every_5m",  label: "Every 5 min" },
    { value: "every_15m", label: "Every 15 min" },
    { value: "every_30m", label: "Every 30 min" },
    { value: "hourly",    label: "Hourly" },
    { value: "daily",     label: "Daily" },
    { value: "weekly",    label: "Weekly" },
] as const;

export const SCHEDULE_TIMEZONES = [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "America/Denver",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Paris",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Australia/Sydney",
] as const;
