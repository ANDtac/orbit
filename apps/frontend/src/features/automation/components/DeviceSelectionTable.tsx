import { useMemo, useState } from "react";
import type { Device } from "@/lib/types";

interface DeviceSelectionTableProps {
    devices: Device[];
    platformNames?: Map<number, string>;
    credentialProfileNames?: Map<number, string>;
    selectedIds: Set<string | number>;
    onSelectedIdsChange: (next: Set<string | number>) => void;
    isLoading?: boolean;
}

export function DeviceSelectionTable({
    devices,
    platformNames,
    selectedIds,
    onSelectedIdsChange,
    isLoading = false,
}: DeviceSelectionTableProps): JSX.Element {
    const [isExpanded, setIsExpanded] = useState(true);
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return devices;
        return devices.filter(
            (d) =>
                d.name?.toLowerCase().includes(q) ||
                d.mgmt_ipv4?.includes(q) ||
                d.fqdn?.toLowerCase().includes(q) ||
                d.os_name?.toLowerCase().includes(q),
        );
    }, [devices, search]);

    const selectedDevices = useMemo(
        () => devices.filter((d) => selectedIds.has(d.id)),
        [devices, selectedIds],
    );

    function toggleDevice(id: number): void {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        onSelectedIdsChange(next);
    }

    function removeDevice(id: number): void {
        const next = new Set(selectedIds);
        next.delete(id);
        onSelectedIdsChange(next);
    }

    function toggleAll(): void {
        if (selectedIds.size === devices.length) {
            onSelectedIdsChange(new Set());
        } else {
            onSelectedIdsChange(new Set(devices.map((d) => d.id)));
        }
    }

    const platformLabel = (d: Device): string =>
        platformNames?.get(d.platform_id ?? -1) ?? d.os_name ?? "Unknown";

    return (
        <div className="rounded-xl border border-primary/20 bg-surface">
            {/* Collapsible header */}
            <button
                type="button"
                onClick={() => setIsExpanded((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm"
            >
                <span className="font-medium text-text">
                    Target devices
                    <span className="ml-2 text-xs font-normal text-muted">
                        {selectedIds.size === 0
                            ? "none selected"
                            : `${selectedIds.size} of ${devices.length} selected`}
                    </span>
                </span>
                <svg
                    className={`h-4 w-4 shrink-0 text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </button>

            {isExpanded && (
                <div className="border-t border-primary/10 px-4 pb-4 pt-3 space-y-4">
                    {/* Search */}
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name, IP, OS, FQDN…"
                        className="w-full rounded-lg border border-primary/30 bg-background/60 px-3 py-1.5 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none"
                    />

                    {/* Device search table */}
                    {isLoading ? (
                        <div className="space-y-2 py-2">
                            {[1, 2, 3].map((n) => (
                                <div key={n} className="h-8 animate-pulse rounded bg-primary/10" />
                            ))}
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="py-3 text-center text-xs text-muted">
                            No devices match your search.
                        </p>
                    ) : (
                        <div className="overflow-y-auto rounded-lg border border-primary/10" style={{ maxHeight: "14rem" }}>
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-surface">
                                    <tr className="border-b border-primary/10">
                                        <th className="py-1.5 pl-3 pr-2 text-left">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.size === devices.length && devices.length > 0}
                                                onChange={toggleAll}
                                                className="rounded"
                                                title="Select all"
                                            />
                                        </th>
                                        <th className="py-1.5 pr-3 text-left text-xs font-semibold uppercase tracking-[0.15em] text-muted">
                                            Name
                                        </th>
                                        <th className="py-1.5 pr-3 text-left text-xs font-semibold uppercase tracking-[0.15em] text-muted">
                                            Mgmt IP
                                        </th>
                                        <th className="py-1.5 pr-3 text-left text-xs font-semibold uppercase tracking-[0.15em] text-muted">
                                            Platform
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((device) => {
                                        const isSelected = selectedIds.has(device.id);
                                        return (
                                            <tr
                                                key={device.id}
                                                onClick={() => toggleDevice(device.id)}
                                                className={`cursor-pointer border-b border-primary/5 transition-colors last:border-0 ${
                                                    isSelected
                                                        ? "bg-primary/5 opacity-50"
                                                        : "hover:bg-primary/5"
                                                }`}
                                            >
                                                <td className="py-1.5 pl-3 pr-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleDevice(device.id)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="rounded"
                                                    />
                                                </td>
                                                <td className="py-1.5 pr-3">
                                                    <div className="font-medium text-text">{device.name}</div>
                                                    {device.fqdn ? (
                                                        <div className="text-xs text-muted">{device.fqdn}</div>
                                                    ) : null}
                                                </td>
                                                <td className="py-1.5 pr-3 font-mono text-xs text-muted">
                                                    {device.mgmt_ipv4 ?? "—"}
                                                </td>
                                                <td className="py-1.5 pr-3 text-xs text-muted">
                                                    {platformLabel(device)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Selected devices panel */}
                    {selectedDevices.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
                                Selected ({selectedDevices.length})
                            </p>
                            <div className="overflow-y-auto rounded-lg border border-primary/20 bg-primary/5" style={{ maxHeight: "10rem" }}>
                                <table className="w-full text-sm">
                                    <tbody>
                                        {selectedDevices.map((device) => (
                                            <tr
                                                key={device.id}
                                                className="border-b border-primary/10 last:border-0"
                                            >
                                                <td className="py-1.5 pl-3 pr-3">
                                                    <span className="font-medium text-text">{device.name}</span>
                                                    <span className="ml-2 font-mono text-xs text-muted">
                                                        {device.mgmt_ipv4 ?? ""}
                                                    </span>
                                                </td>
                                                <td className="py-1.5 pr-2 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => removeDevice(device.id)}
                                                        className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-red-500/10 hover:text-red-400"
                                                        aria-label={`Remove ${device.name}`}
                                                    >
                                                        ✕
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
