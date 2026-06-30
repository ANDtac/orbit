import { QueryClient } from "@tanstack/react-query";

import { getDemoData } from "./generators";
import { QUERY_KEYS } from "@/lib/constants";

function demoQueryFn({ queryKey }: { queryKey: readonly unknown[] }): unknown {
    const key = queryKey[0] as string;
    const data = getDemoData();

    switch (key) {
        case QUERY_KEYS.devices:
            return {
                data: data.devices,
                page: {
                    cursor: "0",
                    next: null,
                    prev: null,
                    size: 50,
                    total: data.devices.length,
                },
            };
        case QUERY_KEYS.deviceDetail: {
            const id = queryKey[1] as number;
            return data.devices.find((d) => d.id === id) ?? data.devices[0];
        }
        case QUERY_KEYS.jobs:
            return {
                data: data.jobs,
                page: {
                    cursor: "0",
                    next: null,
                    prev: null,
                    size: 25,
                    total: data.jobs.length,
                },
            };
        case QUERY_KEYS.compliancePolicies:
            return data.policies;
        case QUERY_KEYS.requestLogs:
            return data.requestLogs;
        case QUERY_KEYS.errorLogs:
            return data.errorLogs;
        case QUERY_KEYS.platforms:
            return [
                { id: 1, slug: "cisco_ios", display_name: "Cisco IOS" },
                { id: 2, slug: "cisco_nxos", display_name: "Cisco NX-OS" },
                { id: 3, slug: "cisco_iosxe", display_name: "Cisco IOS-XE" },
                { id: 4, slug: "juniper_junos", display_name: "Juniper Junos" },
                { id: 5, slug: "arista_eos", display_name: "Arista EOS" },
            ];
        case QUERY_KEYS.credentialProfiles:
            return [
                { id: 1, name: "Default SSH", auth_type: "ssh", is_active: true },
                { id: 2, name: "SNMP Read-Only", auth_type: "snmp", is_active: true },
            ];
        case QUERY_KEYS.inventoryGroups:
            return [
                { id: 1, name: "Core Routers", slug: "core-routers", cached_device_count: 8 },
                { id: 2, name: "Distribution Switches", slug: "dist-switches", cached_device_count: 12 },
                { id: 3, name: "Access Layer", slug: "access-layer", cached_device_count: 10 },
            ];
        case QUERY_KEYS.deviceTags:
            return [
                { id: 1, slug: "production", name: "Production", color: "#3fb950" },
                { id: 2, slug: "staging", name: "Staging", color: "#d29922" },
                { id: 3, slug: "critical", name: "Critical", color: "#f85149" },
            ];
        default:
            return [];
    }
}

export function createDemoQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                queryFn: demoQueryFn,
                refetchOnWindowFocus: false,
                retry: false,
                staleTime: Infinity,
            },
            mutations: {
                onSuccess: () => {
                    // In demo mode, mutations are no-ops that succeed silently
                },
            },
        },
    });
}
