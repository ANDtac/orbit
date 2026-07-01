import apiClient from "@/lib/apiClient";
import {
  demoFetchAppEvents,
  demoCreatePolicy,
  demoDeletePolicy,
  demoFetchErrorLogs,
  demoFetchHealthSummary,
  demoFetchJobs,
  demoFetchPolicies,
  demoQueueProbe,
  demoFetchRequestLogs,
  demoQueuePasswordRotation,
  demoUpdatePolicy,
  isDemoApiEnabled,
} from "@/lib/demo/api";
import type {
  AppEventEntry,
  CompliancePolicy,
  DeviceHealthSummary,
  ErrorLogEntry,
  Job,
  RequestLogEntry,
} from "@/lib/types";

export interface CursorPage {
  cursor: string;
  next?: string | null;
  prev?: string | null;
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

interface QueueProbeInput {
  device_ids: number[];
  probe_type: string;
  variables?: Record<string, unknown>;
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
  job_type?: string;
  status?: string;
  queue?: string;
  /**
   * Bucket jobs by classification: true = System (run_as_internal), false =
   * operator Runs, omit for all. Filtered server-side by GET /jobs.
   */
  run_as_internal?: boolean;
}

interface OffsetPaginationOptions {
  page?: number;
  per_page?: number;
  /** Inclusive lower bound on occurred_at (ISO date or datetime). Filtered server-side. */
  from?: string;
  /** Inclusive upper bound on occurred_at; a date-only value covers the whole day. Filtered server-side. */
  to?: string;
}

interface EventLogQueryOptions extends OffsetPaginationOptions {
  event?: string;
  level?: string;
}

async function fetchLogs<T>(
  path: string,
  options?: OffsetPaginationOptions & Record<string, string | number | undefined>,
): Promise<T[]> {
  const { data } = await apiClient.get<T[]>(path, {
    params: {
      per_page: options?.per_page ?? 25,
      page: options?.page ?? 1,
      sort: "-occurred_at",
      ...options,
    },
  });

  return data;
}

export async function fetchJobs(options?: JobsQueryOptions): Promise<JobsResponse> {
  if (isDemoApiEnabled()) {
    return demoFetchJobs(options);
  }
  const { data } = await apiClient.get<JobsResponse>("/jobs", {
    params: options,
  });

  return data;
}

export async function queuePasswordRotation(input: QueuePasswordRotationInput): Promise<QueueJobResponse> {
  if (isDemoApiEnabled()) {
    return demoQueuePasswordRotation(input.reason);
  }
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
  if (isDemoApiEnabled()) {
    return demoFetchPolicies();
  }
  const { data } = await apiClient.get<CompliancePolicy[]>("/compliance/policies");
  return data;
}

export async function fetchHealthSummary(): Promise<DeviceHealthSummary> {
  if (isDemoApiEnabled()) {
    return demoFetchHealthSummary();
  }
  const { data } = await apiClient.get<DeviceHealthSummary>("/devices/health");
  return data;
}

export async function queueProbe(input: QueueProbeInput): Promise<QueueJobResponse> {
  if (isDemoApiEnabled()) {
    return demoQueueProbe(input);
  }
  const { data } = await apiClient.post<QueueJobResponse>("/devices:probe", input);
  return data;
}

export async function createPolicy(input: CompliancePolicyInput): Promise<CompliancePolicy> {
  if (isDemoApiEnabled()) {
    return demoCreatePolicy(input);
  }
  const { data } = await apiClient.post<CompliancePolicy>("/compliance/policies", input);
  return data;
}

export async function updatePolicy(policyId: number, input: CompliancePolicyInput): Promise<CompliancePolicy> {
  if (isDemoApiEnabled()) {
    return demoUpdatePolicy(policyId, input);
  }
  const { data } = await apiClient.patch<CompliancePolicy>(`/compliance/policies/${policyId}`, input);
  return data;
}

export async function deletePolicy(policyId: number): Promise<void> {
  if (isDemoApiEnabled()) {
    demoDeletePolicy(policyId);
    return;
  }
  await apiClient.delete(`/compliance/policies/${policyId}`);
}

export function fetchRequestLogs(options?: OffsetPaginationOptions): Promise<RequestLogEntry[]> {
  if (isDemoApiEnabled()) {
    return Promise.resolve(demoFetchRequestLogs(options));
  }
  return fetchLogs<RequestLogEntry>("/logs/requests", options as OffsetPaginationOptions & Record<string, string | number | undefined>);
}

export function fetchErrorLogs(options?: OffsetPaginationOptions): Promise<ErrorLogEntry[]> {
  if (isDemoApiEnabled()) {
    return Promise.resolve(demoFetchErrorLogs(options));
  }
  return fetchLogs<ErrorLogEntry>("/logs/errors", options as OffsetPaginationOptions & Record<string, string | number | undefined>);
}

export function fetchAppEvents(options?: EventLogQueryOptions): Promise<AppEventEntry[]> {
  if (isDemoApiEnabled()) {
    return Promise.resolve(demoFetchAppEvents(options));
  }
  return fetchLogs<AppEventEntry>("/logs/events", options as EventLogQueryOptions & Record<string, string | number | undefined>);
}
