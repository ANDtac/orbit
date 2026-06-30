import apiClient from "@/lib/apiClient";
import {
    demoAddTagToDevice,
    demoFetchDeviceTags,
    demoRemoveTagFromDevice,
    isDemoApiEnabled,
} from "@/lib/demo/api";
import type { DeviceTag } from "@/lib/types";

export async function fetchDeviceTags(): Promise<DeviceTag[]> {
    if (isDemoApiEnabled()) {
        return demoFetchDeviceTags();
    }
    const { data } = await apiClient.get<{ data: DeviceTag[] }>("/device_tags", {
        params: { "page[size]": 200 },
    });
    return data.data;
}

export async function addTagToDevice(deviceId: number, tagSlug: string): Promise<void> {
    if (isDemoApiEnabled()) {
        demoAddTagToDevice(deviceId, tagSlug);
        return;
    }
    await apiClient.post(`/devices/${deviceId}/tags`, { slug: tagSlug });
}

export async function removeTagFromDevice(deviceId: number, tagSlug: string): Promise<void> {
    if (isDemoApiEnabled()) {
        demoRemoveTagFromDevice(deviceId, tagSlug);
        return;
    }
    await apiClient.delete(`/devices/${deviceId}/tags/${tagSlug}`);
}
