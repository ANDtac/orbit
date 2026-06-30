import apiClient from "@/lib/apiClient";
import {
  demoCreateCredentialProfile,
  demoCreatePlatform,
  demoDeleteCredentialProfile,
  demoDeletePlatform,
  demoFetchAuditEntries,
  demoFetchCredentialProfiles,
  demoFetchPlatforms,
  demoUpdateCredentialProfile,
  demoUpdatePlatform,
  isDemoApiEnabled,
} from "@/lib/demo/api";
import type { AuditLogEntry, CredentialProfile, Platform } from "@/lib/types";

export interface OffsetQueryOptions {
  page?: number;
  per_page?: number;
  sort?: string;
}

export interface AuditQueryOptions {
  cursor?: string;
  "page[size]"?: number;
  "filter[action]"?: string;
  "filter[target_type]"?: string;
  "filter[actor]"?: string;
  from_date?: string;
  to_date?: string;
}

export interface AuditResponse {
  data: AuditLogEntry[];
  page: {
    cursor: string;
    next?: string | null;
    prev?: string | null;
    size: number;
    total: number;
  };
}

export interface PlatformInput {
  slug: string;
  display_name: string;
  vendor_hint?: string;
  napalm_driver?: string;
  netmiko_type?: string;
  handler_entrypoint?: string;
  ansible_network_os?: string;
  notes?: string;
  is_active?: boolean;
}

export interface CredentialProfileInput {
  name: string;
  description?: string;
  auth_type: string;
  username?: string;
  secret_ref?: string;
  is_active?: boolean;
}

export async function fetchAdminPlatforms(options?: OffsetQueryOptions): Promise<Platform[]> {
  if (isDemoApiEnabled()) {
    return demoFetchPlatforms();
  }
  const { data } = await apiClient.get<Platform[]>("/platforms", {
    params: options,
  });
  return data;
}

export async function createAdminPlatform(input: PlatformInput): Promise<Platform> {
  if (isDemoApiEnabled()) {
    return demoCreatePlatform(input);
  }
  const { data } = await apiClient.post<Platform>("/platforms", input);
  return data;
}

export async function updateAdminPlatform(
  platformId: number,
  input: Partial<PlatformInput>,
): Promise<Platform> {
  if (isDemoApiEnabled()) {
    return demoUpdatePlatform(platformId, input);
  }
  const { data } = await apiClient.patch<Platform>(`/platforms/${platformId}`, input);
  return data;
}

export async function deleteAdminPlatform(platformId: number): Promise<void> {
  if (isDemoApiEnabled()) {
    demoDeletePlatform(platformId);
    return;
  }
  await apiClient.delete(`/platforms/${platformId}`);
}

export async function fetchAdminCredentialProfiles(options?: OffsetQueryOptions): Promise<CredentialProfile[]> {
  if (isDemoApiEnabled()) {
    return demoFetchCredentialProfiles();
  }
  const { data } = await apiClient.get<CredentialProfile[]>("/credential_profiles", {
    params: options,
  });
  return data;
}

export async function createAdminCredentialProfile(
  input: CredentialProfileInput,
): Promise<CredentialProfile> {
  if (isDemoApiEnabled()) {
    return demoCreateCredentialProfile(input);
  }
  const { data } = await apiClient.post<CredentialProfile>("/credential_profiles", input);
  return data;
}

export async function updateAdminCredentialProfile(
  profileId: number,
  input: Partial<CredentialProfileInput>,
): Promise<CredentialProfile> {
  if (isDemoApiEnabled()) {
    return demoUpdateCredentialProfile(profileId, input);
  }
  const { data } = await apiClient.patch<CredentialProfile>(`/credential_profiles/${profileId}`, input);
  return data;
}

export async function deleteAdminCredentialProfile(profileId: number): Promise<void> {
  if (isDemoApiEnabled()) {
    demoDeleteCredentialProfile(profileId);
    return;
  }
  await apiClient.delete(`/credential_profiles/${profileId}`);
}

export async function fetchAuditEntries(options?: AuditQueryOptions): Promise<AuditResponse> {
  if (isDemoApiEnabled()) {
    return demoFetchAuditEntries(options);
  }
  const { data } = await apiClient.get<AuditResponse>("/audit", {
    params: options,
  });
  return data;
}
