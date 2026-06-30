import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { QUERY_KEYS } from "@/lib/constants";
import { fetchPlatforms } from "../api/platforms.api";
import { fetchInventoryGroups } from "../api/groups.api";

export interface DeviceFilterValues {
    name: string;
    platformId: string;
    groupId: string;
    isActive: string;
    osName: string;
}

const EMPTY_FILTERS: DeviceFilterValues = {
    name: "",
    platformId: "",
    groupId: "",
    isActive: "",
    osName: "",
};

interface DeviceFiltersProps {
    values: DeviceFilterValues;
    onChange: (values: DeviceFilterValues) => void;
}

export function DeviceFilters({ values, onChange }: DeviceFiltersProps): JSX.Element {
    const [localName, setLocalName] = useState(values.name);

    const { data: platforms = [] } = useQuery({
        queryKey: [QUERY_KEYS.platforms],
        queryFn: fetchPlatforms,
        staleTime: 5 * 60 * 1000,
    });

    const { data: groups = [] } = useQuery({
        queryKey: [QUERY_KEYS.inventoryGroups],
        queryFn: fetchInventoryGroups,
        staleTime: 5 * 60 * 1000,
    });

    useEffect(() => {
        const timer = setTimeout(() => {
            if (localName !== values.name) {
                onChange({ ...values, name: localName });
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [localName]);

    const hasFilters = Object.values(values).some((v) => v !== "");

    return (
        <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
                <label htmlFor="filter-name" className="mb-1 block text-xs font-medium text-muted">
                    Search
                </label>
                <input
                    id="filter-name"
                    type="text"
                    placeholder="Device name or IP..."
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    className="w-full rounded-lg border border-primary/20 bg-background px-3 py-1.5 text-sm text-text placeholder:text-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
            </div>

            <div className="min-w-[140px]">
                <label htmlFor="filter-platform" className="mb-1 block text-xs font-medium text-muted">
                    Platform
                </label>
                <select
                    id="filter-platform"
                    value={values.platformId}
                    onChange={(e) => onChange({ ...values, platformId: e.target.value })}
                    className="w-full rounded-lg border border-primary/20 bg-background px-3 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                >
                    <option value="">All platforms</option>
                    {platforms.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                            {p.display_name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="min-w-[140px]">
                <label htmlFor="filter-group" className="mb-1 block text-xs font-medium text-muted">
                    Group
                </label>
                <select
                    id="filter-group"
                    value={values.groupId}
                    onChange={(e) => onChange({ ...values, groupId: e.target.value })}
                    className="w-full rounded-lg border border-primary/20 bg-background px-3 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                >
                    <option value="">All groups</option>
                    {groups.map((g) => (
                        <option key={g.id} value={String(g.id)}>
                            {g.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="min-w-[110px]">
                <label htmlFor="filter-status" className="mb-1 block text-xs font-medium text-muted">
                    Status
                </label>
                <select
                    id="filter-status"
                    value={values.isActive}
                    onChange={(e) => onChange({ ...values, isActive: e.target.value })}
                    className="w-full rounded-lg border border-primary/20 bg-background px-3 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                >
                    <option value="">All</option>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                </select>
            </div>

            {hasFilters && (
                <button
                    onClick={() => {
                        setLocalName("");
                        onChange(EMPTY_FILTERS);
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-primary/5 hover:text-text"
                >
                    Clear
                </button>
            )}
        </div>
    );
}

export { EMPTY_FILTERS };
