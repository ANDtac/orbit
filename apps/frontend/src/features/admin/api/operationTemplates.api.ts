import apiClient from "@/lib/apiClient";
import {
  demoCreateOperationTemplate,
  demoDeleteOperationTemplate,
  demoFetchOperationTemplates,
  demoUpdateOperationTemplate,
  isDemoApiEnabled,
} from "@/lib/demo/api";
import type { OperationTemplate, VariablesSchema } from "@/lib/types";

export interface OperationTemplateInput {
  platform_id: number;
  name: string;
  description?: string;
  op_type: string;
  template: string;
  variables?: VariablesSchema;
  outputs?: VariablesSchema;
  is_mutating?: boolean;
  is_active?: boolean;
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
