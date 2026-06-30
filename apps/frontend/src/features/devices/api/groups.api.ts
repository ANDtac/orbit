import apiClient from "@/lib/apiClient";
import {
    demoAssignDevicesToGroup,
    demoFetchInventoryGroups,
    isDemoApiEnabled,
} from "@/lib/demo/api";
import type { InventoryGroup } from "@/lib/types";

export async function fetchInventoryGroups(): Promise<InventoryGroup[]> {
    if (isDemoApiEnabled()) {
        return demoFetchInventoryGroups();
    }
    const { data } = await apiClient.get<InventoryGroup[] | { data: InventoryGroup[] }>("/inventory_groups", {
        params: { "page[size]": 200 },
    });
    return Array.isArray(data) ? data : data.data ?? [];
}

export async function assignDevicesToGroup(
    groupId: number,
    deviceIds: number[],
): Promise<void> {
    if (isDemoApiEnabled()) {
        demoAssignDevicesToGroup(groupId, deviceIds);
        return;
    }
    await apiClient.post(`/inventory_groups/${groupId}/assign`, {
        device_ids: deviceIds,
    });
}
