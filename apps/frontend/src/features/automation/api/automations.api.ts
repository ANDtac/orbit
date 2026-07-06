import apiClient from "@/lib/apiClient";
import {
  demoCreateAutomation,
  demoDeleteAutomation,
  demoFetchAutomation,
  demoFetchAutomations,
  demoRunAutomation,
  demoTestAutomation,
  demoUpdateAutomation,
  isDemoApiEnabled,
} from "@/lib/demo/api";
import type {
  Automation,
  AutomationDryRunResult,
  AutomationOnFailure,
  AutomationStep,
  AutomationVisibility,
  Job,
} from "@/lib/types";

/** Input for creating or updating a single-action automation (legacy shape). */
export interface AutomationInput {
  name: string;
  description?: string;
  action_id: number;
  variable_values: Record<string, unknown>;
  target: { device_ids?: number[] };
  visibility?: AutomationVisibility;
  on_failure?: AutomationOnFailure;
}

/**
 * Input for creating an automation — supports both single-action and sequence modes.
 * In sequence mode, populate `steps` and omit or set `action_id`/`variable_values`.
 */
export interface AutomationCreateInput {
  name: string;
  description?: string;
  /** For single-action mode. */
  action_id?: number;
  /** For single-action mode. */
  variable_values?: Record<string, unknown>;
  /** For sequence mode. When present, takes precedence over action_id/variable_values. */
  steps?: AutomationStep[];
  target: { device_ids?: number[] };
  visibility?: AutomationVisibility;
  on_failure?: AutomationOnFailure;
}

export type AutomationUpdateInput = Partial<AutomationCreateInput>;

export interface AutomationTestInput {
  device_id?: number;
}

export interface RunAutomationResponse {
  job: Job;
  enqueued?: boolean;
}

export async function fetchAutomations(): Promise<Automation[]> {
  if (isDemoApiEnabled()) {
    return demoFetchAutomations();
  }
  const { data } = await apiClient.get<Automation[]>("/automations");
  return data;
}

export async function fetchAutomation(id: number): Promise<Automation> {
  if (isDemoApiEnabled()) {
    return demoFetchAutomation(id);
  }
  const { data } = await apiClient.get<Automation>(`/automations/${id}`);
  return data;
}

export async function createAutomation(input: AutomationCreateInput): Promise<Automation> {
  if (isDemoApiEnabled()) {
    return demoCreateAutomation(input);
  }
  const { data } = await apiClient.post<Automation>("/automations", input);
  return data;
}

export async function updateAutomation(
  id: number,
  input: AutomationUpdateInput,
): Promise<Automation> {
  if (isDemoApiEnabled()) {
    return demoUpdateAutomation(id, input);
  }
  const { data } = await apiClient.patch<Automation>(`/automations/${id}`, input);
  return data;
}

export async function deleteAutomation(id: number): Promise<void> {
  if (isDemoApiEnabled()) {
    demoDeleteAutomation(id);
    return;
  }
  await apiClient.delete(`/automations/${id}`);
}

/** Enqueue a job that runs the saved automation against its target devices. */
export async function runAutomation(id: number): Promise<RunAutomationResponse> {
  if (isDemoApiEnabled()) {
    return demoRunAutomation(id);
  }
  const { data } = await apiClient.post<RunAutomationResponse>(`/automations/${id}/run`, {});
  return data;
}

/** Synchronous single-device dry-run — returns parsed fields and a diff. */
export async function testAutomation(
  id: number,
  input: AutomationTestInput = {},
): Promise<AutomationDryRunResult> {
  if (isDemoApiEnabled()) {
    return demoTestAutomation(id, input);
  }
  const { data } = await apiClient.post<AutomationDryRunResult>(`/automations/${id}/test`, input);
  return data;
}
