import apiClient from "@/lib/apiClient";
import { demoFetchPlatforms, isDemoApiEnabled } from "@/lib/demo/api";
import type { Platform } from "@/lib/types";

export async function fetchPlatforms(): Promise<Platform[]> {
    if (isDemoApiEnabled()) {
        return demoFetchPlatforms();
    }
    const { data } = await apiClient.get<Platform[] | { data: Platform[] }>("/platforms", {
        params: { "page[size]": 200 },
    });
    return Array.isArray(data) ? data : data.data ?? [];
}
