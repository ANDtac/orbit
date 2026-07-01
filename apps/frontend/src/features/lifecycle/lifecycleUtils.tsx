import { Link } from "react-router-dom";

import { Modal } from "@/components/ui/Modal";
import type { Device } from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared date helpers for the lifecycle (EoX) pages.
// ---------------------------------------------------------------------------

export function isPast(value?: string): boolean {
    return value ? new Date(value) < new Date() : false;
}

export function isDueSoon(value?: string, days = 90): boolean {
    if (!value) return false;
    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + days);
    const date = new Date(value);
    return date >= now && date <= future;
}

export function formatDate(value?: string): string {
    return value ? new Date(value).toLocaleDateString() : "—";
}

export function dateClass(value?: string): string {
    if (!value) return "text-muted";
    if (isPast(value)) return "text-red-500";
    if (isDueSoon(value)) return "text-amber-500";
    return "text-text";
}

// ---------------------------------------------------------------------------
// Overall lifecycle status derived from the tracked milestone dates.
// ---------------------------------------------------------------------------

export type LifecycleStatus = "past" | "dueSoon" | "active";

/**
 * Compute an overall status for a lifecycle record.
 * - "past": end of support (last day of support) has already passed.
 * - "dueSoon": an earlier milestone has passed, or any milestone falls within 90 days.
 * - "active": every tracked date is still comfortably in the future (or none tracked).
 */
export function getLifecycleStatus(
    lastDayOfSupport?: string,
    otherDates: Array<string | undefined> = [],
): LifecycleStatus {
    if (isPast(lastDayOfSupport)) return "past";
    const all = [lastDayOfSupport, ...otherDates];
    if (all.some((value) => isPast(value) || isDueSoon(value))) return "dueSoon";
    return "active";
}

const STATUS_META: Record<LifecycleStatus, { label: string; className: string }> = {
    past: { label: "Past EoL", className: "border-red-500/30 bg-red-500/10 text-red-500" },
    dueSoon: { label: "Due soon", className: "border-amber-500/30 bg-amber-500/10 text-amber-500" },
    active: { label: "Active", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" },
};

export function statusLabel(status: LifecycleStatus): string {
    return STATUS_META[status].label;
}

export function LifecycleStatusBadge({ status }: { status: LifecycleStatus }): JSX.Element {
    const meta = STATUS_META[status];
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}
        >
            {meta.label}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Drill-in modal that lists the devices affected by a lifecycle record.
// Reuses already-fetched device data — no additional backend calls.
// ---------------------------------------------------------------------------

export function LifecycleDeviceModal({
    isOpen,
    onClose,
    title,
    devices,
}: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    devices: Device[];
}): JSX.Element {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
            {devices.length === 0 ? (
                <p className="pb-2 text-sm text-muted">No matching devices found in inventory.</p>
            ) : (
                <ul className="divide-y divide-primary/10 pb-2">
                    {devices.map((device) => (
                        <li key={device.id}>
                            <Link
                                to={`/inventory/devices/${device.id}`}
                                onClick={onClose}
                                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-primary/5"
                            >
                                <span className="font-medium text-text">{device.name}</span>
                                <span className="font-mono text-xs text-muted">
                                    {device.model_number ?? device.os_name ?? "—"}
                                    {device.os_version ? ` · ${device.os_version}` : ""}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </Modal>
    );
}
