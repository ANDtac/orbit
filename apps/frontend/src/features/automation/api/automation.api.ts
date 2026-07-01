import apiClient from "@/lib/apiClient";
import { demoFetchJob, demoStartPasswordChange, isDemoApiEnabled } from "@/lib/demo/api";
import type { Job, PasswordChangeResult } from "@/lib/types";

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
