import apiClient from "@/lib/apiClient";
import { demoFetchCredentialProfiles, isDemoApiEnabled } from "@/lib/demo/api";
import type { CredentialProfile } from "@/lib/types";

export async function fetchCredentialProfiles(): Promise<CredentialProfile[]> {
    if (isDemoApiEnabled()) {
        return demoFetchCredentialProfiles();
    }
    const { data } = await apiClient.get<CredentialProfile[] | { data: CredentialProfile[] }>("/credential_profiles", {
        params: { "page[size]": 200 },
    });
    return Array.isArray(data) ? data : data.data ?? [];
}
