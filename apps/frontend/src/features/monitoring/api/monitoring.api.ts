import apiClient from "@/lib/apiClient";
import type { CompliancePolicy, ErrorLogEntry, Job, RequestLogEntry } from "@/lib/types";

export interface CursorPage {
  cursor: string;
  next?: string;
  prev?: string;
  size: number;
  total: number;
}

export interface JobsResponse {
  data: Job[];
  page: CursorPage;
}

interface QueueJobResponse {
  job: Job;
  enqueued: boolean;
}

interface QueuePasswordRotationInput {
  reason: string;
}

interface CompliancePolicyInput {
  name: string;
  description?: string;
  scope?: Record<string, unknown>;
  is_active?: boolean;
}

interface JobsQueryOptions {
  cursor?: string;
  "page[size]"?: number;
  status?: string;
  queue?: string;
}

interface OffsetPaginationOptions {
  page?: number;
  per_page?: number;
}

async function fetchLogs<T>(path: string, options?: OffsetPaginationOptions): Promise<T[]> {
  const { data } = await apiClient.get<T[]>(path, {
    params: {
      per_page: options?.per_page ?? 25,
      page: options?.page ?? 1,
      sort: "-occurred_at",
    },
  });

  return data;
}

export async function fetchJobs(options?: JobsQueryOptions): Promise<JobsResponse> {
  const { data } = await apiClient.get<JobsResponse>("/jobs", {
    params: options,
  });

  return data;
}

export async function queuePasswordRotation(input: QueuePasswordRotationInput): Promise<QueueJobResponse> {
  const { data } = await apiClient.post<QueueJobResponse>("/jobs", {
    job_type: "password_change",
    parameters: {
      reason: input.reason,
      source: "monitoring-overview",
    },
  });

  return data;
}

export async function fetchPolicies(): Promise<CompliancePolicy[]> {
  const { data } = await apiClient.get<CompliancePolicy[]>("/compliance/policies");
  return data;
}

export async function createPolicy(input: CompliancePolicyInput): Promise<CompliancePolicy> {
  const { data } = await apiClient.post<CompliancePolicy>("/compliance/policies", input);
  return data;
}

export async function updatePolicy(policyId: number, input: CompliancePolicyInput): Promise<CompliancePolicy> {
  const { data } = await apiClient.patch<CompliancePolicy>(`/compliance/policies/${policyId}`, input);
  return data;
}

export async function deletePolicy(policyId: number): Promise<void> {
  await apiClient.delete(`/compliance/policies/${policyId}`);
}

export function fetchRequestLogs(options?: OffsetPaginationOptions): Promise<RequestLogEntry[]> {
  return fetchLogs<RequestLogEntry>("/logs/requests", options);
}

export function fetchErrorLogs(options?: OffsetPaginationOptions): Promise<ErrorLogEntry[]> {
  return fetchLogs<ErrorLogEntry>("/logs/errors", options);
}
