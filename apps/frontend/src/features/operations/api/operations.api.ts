import apiClient from "@/lib/apiClient";
import {
  demoCreateOperationTemplate,
  demoDeleteOperationTemplate,
  demoFetchJob,
  demoFetchOperationTemplates,
  demoFetchSnapshots,
  demoStartPasswordChange,
  demoUpdateOperationTemplate,
  isDemoApiEnabled,
} from "@/lib/demo/api";
import type { DeviceConfigSnapshot, Job, OperationTemplate, PasswordChangeResult } from "@/lib/types";

export interface StartPasswordChangeInput {
  device_ids: number[];
  current_password?: string;
  new_password: string;
  enable_secret?: string;
  async?: boolean;
  validate_after?: boolean;
}

export interface StartPasswordChangeResponse {
  status: string;
  job?: Job;
  summary?: Record<string, unknown>;
  results?: PasswordChangeResult[];
}

export interface OperationTemplateInput {
  platform_id: number;
  name: string;
  description?: string;
  op_type: string;
  template: string;
  variables?: Record<string, unknown>;
  notes?: string;
}

export interface OperationTemplateQueryOptions {
  page?: number;
  per_page?: number;
  sort?: string;
  platform_id?: number;
  op_type?: string;
  name?: string;
}

export interface SnapshotQueryOptions {
  page?: number;
  per_page?: number;
  sort?: string;
  device_id?: number;
  source?: string;
  hash?: string;
}

export async function startPasswordChange(
  input: StartPasswordChangeInput,
): Promise<StartPasswordChangeResponse> {
  if (isDemoApiEnabled()) {
    return demoStartPasswordChange(input);
  }

  const { data } = await apiClient.post<StartPasswordChangeResponse>("/operations/password-change", input);
  return data;
}

export async function fetchOperationJob(jobId: number): Promise<Job> {
  if (isDemoApiEnabled()) {
    return demoFetchJob(jobId);
  }

  const { data } = await apiClient.get<Job>(`/jobs/${jobId}`);
  return data;
}

export async function fetchOperationTemplates(
  options?: OperationTemplateQueryOptions,
): Promise<OperationTemplate[]> {
  if (isDemoApiEnabled()) {
    return demoFetchOperationTemplates(options);
  }

  const { data } = await apiClient.get<OperationTemplate[]>("/platform_operation_templates", {
    params: options,
  });
  return data;
}

export async function createOperationTemplate(
  input: OperationTemplateInput,
): Promise<OperationTemplate> {
  if (isDemoApiEnabled()) {
    return demoCreateOperationTemplate(input);
  }

  const { data } = await apiClient.post<OperationTemplate>("/platform_operation_templates", input);
  return data;
}

export async function updateOperationTemplate(
  templateId: number,
  input: Partial<OperationTemplateInput>,
): Promise<OperationTemplate> {
  if (isDemoApiEnabled()) {
    return demoUpdateOperationTemplate(templateId, input);
  }

  const { data } = await apiClient.patch<OperationTemplate>(
    `/platform_operation_templates/${templateId}`,
    input,
  );
  return data;
}

export async function deleteOperationTemplate(templateId: number): Promise<void> {
  if (isDemoApiEnabled()) {
    demoDeleteOperationTemplate(templateId);
    return;
  }

  await apiClient.delete(`/platform_operation_templates/${templateId}`);
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
