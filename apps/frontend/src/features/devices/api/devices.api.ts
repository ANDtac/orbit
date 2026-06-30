import apiClient from "@/lib/apiClient";
import {
    demoCreateDevice,
    demoDeleteDevice,
    demoFetchDevice,
    demoFetchDevices,
    demoUpdateDevice,
    isDemoApiEnabled,
} from "@/lib/demo/api";
import type {
    Device,
    DeviceCreateInput,
    DeviceUpdateInput,
    PaginatedResponse,
} from "@/lib/types";

export interface DevicesQueryOptions {
    "page[cursor]"?: string;
    "page[size]"?: number;
    sort?: string;
    "filter[name]"?: string;
    "filter[platform_id]"?: number;
    "filter[inventory_group_id]"?: number;
    "filter[is_active]"?: string;
    "filter[os_name]"?: string;
    "filter[os_version]"?: string;
    "filter[mgmt_ipv4]"?: string;
}

export async function fetchDevices(
    options?: DevicesQueryOptions,
): Promise<PaginatedResponse<Device>> {
    if (isDemoApiEnabled()) {
        return demoFetchDevices(options);
    }
    const { data } = await apiClient.get<PaginatedResponse<Device>>("/devices", {
        params: options,
    });
    return data;
}

export async function fetchDevice(id: number): Promise<Device> {
    if (isDemoApiEnabled()) {
        return demoFetchDevice(id);
    }
    const { data } = await apiClient.get<Device>(`/devices/${id}`);
    return data;
}

export async function createDevice(input: DeviceCreateInput): Promise<Device> {
    if (isDemoApiEnabled()) {
        return demoCreateDevice(input);
    }
    const { data } = await apiClient.post<Device>("/devices", input);
    return data;
}

export async function updateDevice(id: number, input: DeviceUpdateInput): Promise<Device> {
    if (isDemoApiEnabled()) {
        return demoUpdateDevice(id, input);
    }
    const { data } = await apiClient.patch<Device>(`/devices/${id}`, input);
    return data;
}

export async function deleteDevice(id: number): Promise<void> {
    if (isDemoApiEnabled()) {
        demoDeleteDevice(id);
        return;
    }
    await apiClient.delete(`/devices/${id}`);
}
