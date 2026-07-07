import { useEffect, useRef, useState } from "react";
import type { Device, MonitorResult, MonitorResultStatus } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";

const SCROLL_SPEED_PX = 1;
const SCROLL_INTERVAL_MS = 60;
const PAUSE_AT_BOTTOM_MS = 2500;

interface TablePanelProps {
    data: MonitorResult[];
    limit?: number;
    devices?: Device[];
    deviceNames?: Record<number, string>;
}

function StatusBadge({ status }: { status: MonitorResultStatus }): JSX.Element {
    const styles: Record<string, string> = {
        passing: "bg-emerald-500/15 text-emerald-400",
        failing: "bg-red-500/15 text-red-400",
        error: "bg-amber-500/15 text-amber-400",
    };
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[status] ?? ""}`}
        >
            {status}
        </span>
    );
}

interface DeviceModalProps {
    device: Device | null;
    onClose: () => void;
}

function DeviceModal({ device, onClose }: DeviceModalProps): JSX.Element | null {
    if (!device) return null;
    return (
        <Modal isOpen title={device.name} onClose={onClose} size="sm">
            <dl className="grid grid-cols-2 gap-3 py-2 text-sm">
                <div>
                    <dt className="text-xs uppercase tracking-[0.18em] text-muted">Mgmt IP</dt>
                    <dd className="mt-0.5 font-mono text-text">{device.mgmt_ipv4 ?? "—"}</dd>
                </div>
                <div>
                    <dt className="text-xs uppercase tracking-[0.18em] text-muted">FQDN</dt>
                    <dd className="mt-0.5 text-text">{device.fqdn ?? "—"}</dd>
                </div>
                <div>
                    <dt className="text-xs uppercase tracking-[0.18em] text-muted">OS</dt>
                    <dd className="mt-0.5 text-text">
                        {[device.os_name, device.os_version].filter(Boolean).join(" ") || "—"}
                    </dd>
                </div>
                <div>
                    <dt className="text-xs uppercase tracking-[0.18em] text-muted">Active</dt>
                    <dd className="mt-0.5 text-text">{device.is_active !== false ? "Yes" : "No"}</dd>
                </div>
            </dl>
        </Modal>
    );
}

export function TablePanel({
    data,
    limit = 50,
    devices,
    deviceNames,
}: TablePanelProps): JSX.Element {
    const rows = [...data]
        .sort((a, b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime())
        .slice(0, limit);

    const scrollRef = useRef<HTMLDivElement>(null);
    const pausedRef = useRef(false);
    const [activeDevice, setActiveDevice] = useState<Device | null>(null);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el || rows.length === 0) return;

        const timer = setInterval(() => {
            if (pausedRef.current) return;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
                pausedRef.current = true;
                setTimeout(() => {
                    el.scrollTop = 0;
                    pausedRef.current = false;
                }, PAUSE_AT_BOTTOM_MS);
            } else {
                el.scrollTop += SCROLL_SPEED_PX;
            }
        }, SCROLL_INTERVAL_MS);

        return () => clearInterval(timer);
    }, [rows.length]);

    function handleDeviceClick(deviceId: number | null): void {
        if (!deviceId || !devices) return;
        const device = devices.find((d) => d.id === deviceId);
        if (device) setActiveDevice(device);
    }

    function deviceLabel(deviceId: number | null): string {
        if (deviceId == null) return "—";
        return deviceNames?.[deviceId] ?? `#${deviceId}`;
    }

    if (rows.length === 0) {
        return <p className="p-4 text-sm text-muted">No results recorded yet.</p>;
    }

    return (
        <>
            <div
                ref={scrollRef}
                className="overflow-y-auto"
                style={{ maxHeight: "100%", minHeight: 0 }}
                onMouseEnter={() => { pausedRef.current = true; }}
                onMouseLeave={() => { pausedRef.current = false; }}
            >
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface">
                        <tr className="border-b border-primary/10">
                            <th className="py-2 pr-4 text-left text-xs uppercase tracking-[0.18em] text-muted">
                                Observed
                            </th>
                            <th className="py-2 pr-4 text-left text-xs uppercase tracking-[0.18em] text-muted">
                                Device
                            </th>
                            <th className="py-2 pr-4 text-left text-xs uppercase tracking-[0.18em] text-muted">
                                Value
                            </th>
                            <th className="py-2 text-left text-xs uppercase tracking-[0.18em] text-muted">
                                Status
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.id} className="border-b border-primary/5">
                                <td className="py-1.5 pr-4 text-muted">
                                    {new Date(row.observed_at).toLocaleString()}
                                </td>
                                <td className="py-1.5 pr-4">
                                    {devices ? (
                                        <button
                                            type="button"
                                            className="font-mono text-primary underline-offset-2 hover:underline text-sm"
                                            onClick={() => handleDeviceClick(row.device_id)}
                                        >
                                            {deviceLabel(row.device_id)}
                                        </button>
                                    ) : (
                                        <span className="font-mono text-text">{deviceLabel(row.device_id)}</span>
                                    )}
                                </td>
                                <td className="py-1.5 pr-4 font-mono text-text">
                                    {row.value !== null ? String(row.value) : "—"}
                                </td>
                                <td className="py-1.5">
                                    <StatusBadge status={row.status} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <DeviceModal device={activeDevice} onClose={() => setActiveDevice(null)} />
        </>
    );
}
