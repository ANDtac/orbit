import apiClient from "@/lib/apiClient";
import {
  demoCreateComplianceRule,
  demoCreatePolicy,
  demoDeleteComplianceRule,
  demoDeletePolicy,
  demoEvaluateCompliance,
  demoFetchComplianceResults,
  demoFetchComplianceRules,
  demoFetchPolicies,
  demoUpdateComplianceRule,
  demoUpdatePolicy,
  isDemoApiEnabled,
} from "@/lib/demo/api";
import type {
  CompliancePolicy,
  ComplianceResult,
  ComplianceRule,
  Job,
} from "@/lib/types";

export interface CompliancePolicyInput {
  name: string;
  description?: string;
  scope?: Record<string, unknown>;
  is_active?: boolean;
}

export interface ComplianceRuleInput {
  policy_id: number;
  name: string;
  description?: string;
  severity: ComplianceRule["severity"];
  rule_type: string;
  expression: string;
  params?: Record<string, unknown>;
}

export interface ComplianceRulesQueryOptions {
  page?: number;
  per_page?: number;
  policy_id?: number;
  severity?: string;
  rule_type?: string;
  name?: string;
}

export interface ComplianceResultsQueryOptions {
  page?: number;
  per_page?: number;
  sort?: string;
  device_id?: number;
  policy_id?: number;
  rule_id?: number;
  status?: string;
}

export interface EvaluateComplianceInput {
  device_ids?: number[];
  policy_ids?: number[];
  async?: boolean;
}

export interface EvaluateComplianceResponse {
  status: string;
  enqueued_at: string;
  job: Job;
}

export async function fetchPolicies(options?: {
  page?: number;
  per_page?: number;
  name?: string;
  is_active?: boolean;
}): Promise<CompliancePolicy[]> {
  if (isDemoApiEnabled()) {
    const policies = demoFetchPolicies();
    if (!options?.name && options?.is_active == null) {
      return policies;
    }
    return policies.filter((policy) => {
      const nameMatch = options?.name
        ? policy.name.toLowerCase().includes(options.name.toLowerCase())
        : true;
      const activeMatch =
        options?.is_active == null ? true : policy.is_active === options.is_active;
      return nameMatch && activeMatch;
    });
  }

  const { data } = await apiClient.get<CompliancePolicy[]>("/compliance/policies", {
    params: options,
  });
  return data;
}

export async function createPolicy(input: CompliancePolicyInput): Promise<CompliancePolicy> {
  if (isDemoApiEnabled()) {
    return demoCreatePolicy(input);
  }
  const { data } = await apiClient.post<CompliancePolicy>("/compliance/policies", input);
  return data;
}

export async function updatePolicy(
  policyId: number,
  input: CompliancePolicyInput,
): Promise<CompliancePolicy> {
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

export async function fetchRules(
  options?: ComplianceRulesQueryOptions,
): Promise<ComplianceRule[]> {
  if (isDemoApiEnabled()) {
    return demoFetchComplianceRules(options);
  }
  const { data } = await apiClient.get<ComplianceRule[]>("/compliance/rules", {
    params: options,
  });
  return data;
}

export async function createRule(input: ComplianceRuleInput): Promise<ComplianceRule> {
  if (isDemoApiEnabled()) {
    return demoCreateComplianceRule(input);
  }
  const { data } = await apiClient.post<ComplianceRule>("/compliance/rules", input);
  return data;
}

export async function updateRule(
  ruleId: number,
  input: Partial<ComplianceRuleInput>,
): Promise<ComplianceRule> {
  if (isDemoApiEnabled()) {
    return demoUpdateComplianceRule(ruleId, input);
  }
  const { data } = await apiClient.patch<ComplianceRule>(`/compliance/rules/${ruleId}`, input);
  return data;
}

export async function deleteRule(ruleId: number): Promise<void> {
  if (isDemoApiEnabled()) {
    demoDeleteComplianceRule(ruleId);
    return;
  }
  await apiClient.delete(`/compliance/rules/${ruleId}`);
}

export async function fetchComplianceResults(
  options?: ComplianceResultsQueryOptions,
): Promise<ComplianceResult[]> {
  if (isDemoApiEnabled()) {
    return demoFetchComplianceResults(options);
  }
  const { data } = await apiClient.get<ComplianceResult[]>("/compliance/results", {
    params: options,
  });
  return data;
}

export async function evaluateCompliance(
  input: EvaluateComplianceInput,
): Promise<EvaluateComplianceResponse> {
  if (isDemoApiEnabled()) {
    return demoEvaluateCompliance(input);
  }
  const { data } = await apiClient.post<EvaluateComplianceResponse>("/compliance/evaluate", input);
  return data;
}
