import apiClient from "@/lib/apiClient";
import { demoFetchSnapshots, isDemoApiEnabled } from "@/lib/demo/api";
import type { DeviceConfigSnapshot } from "@/lib/types";

export interface SnapshotQueryOptions {
  page?: number;
  per_page?: number;
  sort?: string;
  device_id?: number;
  source?: string;
  hash?: string;
}

export async function fetchSnapshots(options?: SnapshotQueryOptions): Promise<DeviceConfigSnapshot[]> {
  if (isDemoApiEnabled()) {
    return demoFetchSnapshots(options);
  }

  const { data } = await apiClient.get<DeviceConfigSnapshot[]>("/snapshots", {
    params: options,
  });
  return data;
}
