import apiClient from "@/lib/apiClient";
import type { Device } from "@/lib/types";

export async function fetchDevices(): Promise<Device[]> {
  const { data } = await apiClient.get<Device[]>("/devices");
  return data;
}
