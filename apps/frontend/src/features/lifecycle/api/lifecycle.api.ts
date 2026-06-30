import apiClient from "@/lib/apiClient";
import {
  demoCreateHardwareLifecycle,
  demoCreateSoftwareLifecycle,
  demoDeleteHardwareLifecycle,
  demoDeleteSoftwareLifecycle,
  demoFetchHardwareLifecycle,
  demoFetchSoftwareLifecycle,
  demoUpdateHardwareLifecycle,
  demoUpdateSoftwareLifecycle,
  isDemoApiEnabled,
} from "@/lib/demo/api";
import type { HardwareLifecycle, SoftwareLifecycle } from "@/lib/types";

export interface HardwareLifecycleInput {
  product_model_id: number;
  end_of_sale_date?: string;
  end_of_software_maintenance_date?: string;
  end_of_security_fixes_date?: string;
  last_day_of_support_date?: string;
  source_url?: string;
  notes?: string;
}

export interface SoftwareLifecycleInput {
  platform_id?: number | null;
  os_name: string;
  match_operator: SoftwareLifecycle["match_operator"];
  match_value: string;
  end_of_software_maintenance_date?: string;
  end_of_security_fixes_date?: string;
  last_day_of_support_date?: string;
  end_of_sale_date?: string;
  source_url?: string;
  notes?: string;
}

export interface HardwareLifecycleQueryOptions {
  page?: number;
  per_page?: number;
  product_model_id?: number;
  past?: string;
  due_in_days?: number;
}

export interface SoftwareLifecycleQueryOptions {
  page?: number;
  per_page?: number;
  os_name?: string;
  platform_id?: number;
  match_operator?: string;
}

export async function fetchHardwareLifecycle(
  options?: HardwareLifecycleQueryOptions,
): Promise<HardwareLifecycle[]> {
  if (isDemoApiEnabled()) {
    return demoFetchHardwareLifecycle(options);
  }
  const { data } = await apiClient.get<HardwareLifecycle[]>("/eox_hardware", {
    params: options,
  });
  return data;
}

export async function createHardwareLifecycle(
  input: HardwareLifecycleInput,
): Promise<HardwareLifecycle> {
  if (isDemoApiEnabled()) {
    return demoCreateHardwareLifecycle(input);
  }
  const { data } = await apiClient.post<HardwareLifecycle>("/eox_hardware", input);
  return data;
}

export async function updateHardwareLifecycle(
  rowId: number,
  input: Partial<HardwareLifecycleInput>,
): Promise<HardwareLifecycle> {
  if (isDemoApiEnabled()) {
    return demoUpdateHardwareLifecycle(rowId, input);
  }
  const { data } = await apiClient.patch<HardwareLifecycle>(`/eox_hardware/${rowId}`, input);
  return data;
}

export async function deleteHardwareLifecycle(rowId: number): Promise<void> {
  if (isDemoApiEnabled()) {
    demoDeleteHardwareLifecycle(rowId);
    return;
  }
  await apiClient.delete(`/eox_hardware/${rowId}`);
}

export async function fetchSoftwareLifecycle(
  options?: SoftwareLifecycleQueryOptions,
): Promise<SoftwareLifecycle[]> {
  if (isDemoApiEnabled()) {
    return demoFetchSoftwareLifecycle(options);
  }
  const { data } = await apiClient.get<SoftwareLifecycle[]>("/eox_software", {
    params: options,
  });
  return data;
}

export async function createSoftwareLifecycle(
  input: SoftwareLifecycleInput,
): Promise<SoftwareLifecycle> {
  if (isDemoApiEnabled()) {
    return demoCreateSoftwareLifecycle(input);
  }
  const { data } = await apiClient.post<SoftwareLifecycle>("/eox_software", input);
  return data;
}

export async function updateSoftwareLifecycle(
  rowId: number,
  input: Partial<SoftwareLifecycleInput>,
): Promise<SoftwareLifecycle> {
  if (isDemoApiEnabled()) {
    return demoUpdateSoftwareLifecycle(rowId, input);
  }
  const { data } = await apiClient.patch<SoftwareLifecycle>(`/eox_software/${rowId}`, input);
  return data;
}

export async function deleteSoftwareLifecycle(rowId: number): Promise<void> {
  if (isDemoApiEnabled()) {
    demoDeleteSoftwareLifecycle(rowId);
    return;
  }
  await apiClient.delete(`/eox_software/${rowId}`);
}
