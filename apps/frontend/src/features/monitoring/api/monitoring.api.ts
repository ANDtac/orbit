import apiClient from "@/lib/apiClient";
import type { CompliancePolicy, ErrorLogEntry, Job, RequestLogEntry } from "@/lib/types";

interface JobsResponse {
  data: Job[];
  page: {
    cursor: string;
    next?: string;
    prev?: string;
    size: number;
    total: number;
  };
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

export async function fetchJobs(): Promise<Job[]> {
  const { data } = await apiClient.get<JobsResponse>("/jobs");
  return data.data;
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

export async function fetchRequestLogs(): Promise<RequestLogEntry[]> {
  const { data } = await apiClient.get<RequestLogEntry[]>("/logs/requests", {
    params: {
      per_page: 25,
      sort: "-occurred_at",
    },
  });
  return data;
}

export async function fetchErrorLogs(): Promise<ErrorLogEntry[]> {
  const { data } = await apiClient.get<ErrorLogEntry[]>("/logs/errors", {
    params: {
      per_page: 25,
      sort: "-occurred_at",
    },
  });
  return data;
}
