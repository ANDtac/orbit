import { formatDistanceToNow } from "date-fns";
import type { Device } from "@/lib/types";

interface DeviceSummaryTabProps {
    device: Device;
}

function Field({ label, value }: { label: string; value?: string | number | boolean | null }) {
    const display =
        value === undefined || value === null
            ? "—"
            : typeof value === "boolean"
              ? value
                  ? "Yes"
                  : "No"
              : String(value);

    return (
        <div className="flex items-baseline justify-between gap-4 border-b border-primary/5 py-2 last:border-0">
            <dt className="text-xs font-medium text-muted">{label}</dt>
            <dd className="text-right text-sm text-text">{display}</dd>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Facts tooltip
// ---------------------------------------------------------------------------

function FactsInfoTooltip(): JSX.Element {
    return (
        <span className="group relative inline-block">
            <svg
                className="ml-1 inline h-3.5 w-3.5 cursor-help text-muted"
                viewBox="0 0 20 20"
                fill="currentColor"
            >
                <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                />
            </svg>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 w-64 -translate-x-1/2 rounded-lg bg-surface border border-primary/20 px-3 py-2 text-xs text-muted opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                Device facts are raw data collected from the device during the last probe. They may
                include hardware details, interface counts, and software versions. Facts are
                read-only and updated automatically.
            </span>
        </span>
    );
}

// ---------------------------------------------------------------------------
// Facts key-value renderer
// ---------------------------------------------------------------------------

function renderFactValue(value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

interface FactsTableProps {
    facts: Record<string, unknown>;
}

function FactsTable({ facts }: FactsTableProps): JSX.Element {
    const entries = Object.entries(facts);

    return (
        <table className="w-full text-xs">
            <tbody>
                {entries.map(([key, val], i) => (
                    <tr
                        key={key}
                        className={i % 2 === 0 ? "bg-primary/5" : "bg-transparent"}
                    >
                        <td className="w-1/3 py-1.5 pl-2 pr-4 font-medium text-muted align-top">
                            {key}
                        </td>
                        <td className="py-1.5 pl-2 pr-2 font-mono text-text break-all">
                            {renderFactValue(val)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DeviceSummaryTab({ device }: DeviceSummaryTabProps): JSX.Element {
    const lastProbed = device.updated_at
        ? `Last updated ${formatDistanceToNow(new Date(device.updated_at), { addSuffix: true })}`
        : "Never probed";

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            {/* Properties */}
            <div className="rounded-xl border border-primary/10 bg-surface p-4">
                <h3 className="mb-3 text-sm font-semibold text-primary">Device Properties</h3>
                <dl>
                    <Field label="Name" value={device.name} />
                    <Field label="FQDN" value={device.fqdn} />
                    <Field label="Management IP" value={device.mgmt_ipv4} />
                    <Field label="Port" value={device.mgmt_port} />
                    <Field label="Serial Number" value={device.serial_number} />
                    <Field label="Model Number" value={device.model_number} />
                    <Field label="OS Name" value={device.os_name} />
                    <Field label="OS Version" value={device.os_version} />
                    <Field label="Active" value={device.is_active} />
                </dl>
            </div>

            {/* Metadata & Notes */}
            <div className="space-y-4">
                <div className="rounded-xl border border-primary/10 bg-surface p-4">
                    <h3 className="mb-3 text-sm font-semibold text-primary">Quick Stats</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-primary/5 p-3 text-center">
                            <p className="text-lg font-semibold text-primary">
                                {device.is_active !== false ? "Active" : "Inactive"}
                            </p>
                            <p className="text-xs text-muted">Status</p>
                        </div>
                        <div className="rounded-lg bg-primary/5 p-3 text-center">
                            <p className="text-lg font-semibold text-primary">
                                {device.updated_at
                                    ? new Date(device.updated_at).toLocaleDateString()
                                    : "—"}
                            </p>
                            <p className="text-xs text-muted">Last Updated</p>
                        </div>
                    </div>
                    {/* Last probed */}
                    <div className="mt-3 rounded-lg bg-primary/5 p-3">
                        <p className="text-xs text-muted">
                            <span className="font-medium text-text">Probe status: </span>
                            {lastProbed}
                        </p>
                    </div>
                </div>

                {device.notes && (
                    <div className="rounded-xl border border-primary/10 bg-surface p-4">
                        <h3 className="mb-2 text-sm font-semibold text-primary">Notes</h3>
                        <p className="whitespace-pre-wrap text-sm text-text">{device.notes}</p>
                    </div>
                )}

                {device.facts && Object.keys(device.facts).length > 0 && (
                    <div className="rounded-xl border border-primary/10 bg-surface p-4">
                        <h3 className="mb-3 flex items-center text-sm font-semibold text-primary">
                            Facts
                            <FactsInfoTooltip />
                        </h3>
                        <div className="max-h-72 overflow-auto rounded-lg border border-primary/10">
                            <FactsTable facts={device.facts} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
