import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { QUERY_KEYS } from "@/lib/constants";
import { fetchPlatforms } from "../api/platforms.api";
import { fetchCredentialProfiles } from "../api/credentialProfiles.api";
import { fetchInventoryGroups } from "../api/groups.api";
import type { DeviceCreateInput, Device } from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared tooltip component
// ---------------------------------------------------------------------------

function InfoTooltip({ text }: { text: string }) {
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
                {text}
            </span>
        </span>
    );
}

// ---------------------------------------------------------------------------
// Labeled section wrapper — purely structural grouping for readability
// ---------------------------------------------------------------------------

function FormSection({ title, children }: { title: string; children: ReactNode }): JSX.Element {
    return (
        <fieldset className="rounded-xl border border-primary/10 p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {title}
            </legend>
            <div className="space-y-4">{children}</div>
        </fieldset>
    );
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$|^$/;

function validateIpv4(value: string): string {
    if (!value) return "";
    if (!IPV4_REGEX.test(value)) return "Enter a valid IPv4 address (e.g. 10.0.0.1)";
    return "";
}

function validatePort(value: string): string {
    if (!value) return "";
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return "Port must be between 1 and 65535";
    return "";
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DeviceFormProps {
    initialValues?: Partial<Device>;
    onSubmit: (values: DeviceCreateInput) => void;
    onCancel: () => void;
    isSubmitting?: boolean;
    submitLabel?: string;
    onDirtyChange?: (isDirty: boolean) => void;
}

export function DeviceForm({
    initialValues,
    onSubmit,
    onCancel,
    isSubmitting = false,
    submitLabel = "Save",
    onDirtyChange,
}: DeviceFormProps): JSX.Element {
    const [name, setName] = useState(initialValues?.name ?? "");
    const [fqdn, setFqdn] = useState(initialValues?.fqdn ?? "");
    const [mgmtIpv4, setMgmtIpv4] = useState(initialValues?.mgmt_ipv4 ?? "");
    const [mgmtPort, setMgmtPort] = useState(String(initialValues?.mgmt_port ?? ""));
    const [platformId, setPlatformId] = useState(String(initialValues?.platform_id ?? ""));
    const [credentialProfileId, setCredentialProfileId] = useState(
        String(initialValues?.credential_profile_id ?? ""),
    );
    const [inventoryGroupId, setInventoryGroupId] = useState(
        String(initialValues?.inventory_group_id ?? ""),
    );
    const [osName, setOsName] = useState(initialValues?.os_name ?? "");
    const [osVersion, setOsVersion] = useState(initialValues?.os_version ?? "");
    const [serialNumber, setSerialNumber] = useState(initialValues?.serial_number ?? "");
    const [modelNumber, setModelNumber] = useState(initialValues?.model_number ?? "");
    const [notes, setNotes] = useState(initialValues?.notes ?? "");

    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [submitAttempted, setSubmitAttempted] = useState(false);

    // Track dirty state for unsaved-changes warning
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        if (!initialValues) return;
        const dirty =
            name !== (initialValues.name ?? "") ||
            fqdn !== (initialValues.fqdn ?? "") ||
            mgmtIpv4 !== (initialValues.mgmt_ipv4 ?? "") ||
            mgmtPort !== String(initialValues.mgmt_port ?? "") ||
            platformId !== String(initialValues.platform_id ?? "") ||
            credentialProfileId !== String(initialValues.credential_profile_id ?? "") ||
            inventoryGroupId !== String(initialValues.inventory_group_id ?? "") ||
            osName !== (initialValues.os_name ?? "") ||
            osVersion !== (initialValues.os_version ?? "") ||
            serialNumber !== (initialValues.serial_number ?? "") ||
            modelNumber !== (initialValues.model_number ?? "") ||
            notes !== (initialValues.notes ?? "");
        setIsDirty(dirty);
        onDirtyChange?.(dirty);
    }, [
        name, fqdn, mgmtIpv4, mgmtPort, platformId, credentialProfileId,
        inventoryGroupId, osName, osVersion, serialNumber, modelNumber, notes,
        initialValues, onDirtyChange,
    ]);

    const { data: platforms = [] } = useQuery({
        queryKey: [QUERY_KEYS.platforms],
        queryFn: fetchPlatforms,
        staleTime: 5 * 60 * 1000,
    });

    const { data: credentialProfiles = [] } = useQuery({
        queryKey: [QUERY_KEYS.credentialProfiles],
        queryFn: fetchCredentialProfiles,
        staleTime: 5 * 60 * 1000,
    });

    const { data: groups = [] } = useQuery({
        queryKey: [QUERY_KEYS.inventoryGroups],
        queryFn: fetchInventoryGroups,
        staleTime: 5 * 60 * 1000,
    });

    function validateAll(): Record<string, string> {
        const errors: Record<string, string> = {};
        const ipErr = validateIpv4(mgmtIpv4);
        if (ipErr) errors.mgmt_ipv4 = ipErr;
        const portErr = validatePort(mgmtPort);
        if (portErr) errors.mgmt_port = portErr;
        return errors;
    }

    function handleIpChange(value: string) {
        setMgmtIpv4(value);
        setFieldErrors((prev) => ({ ...prev, mgmt_ipv4: validateIpv4(value) }));
    }

    function handlePortChange(value: string) {
        setMgmtPort(value);
        setFieldErrors((prev) => ({ ...prev, mgmt_port: validatePort(value) }));
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitAttempted(true);

        const errors = validateAll();
        setFieldErrors(errors);

        if (Object.values(errors).some(Boolean)) return;

        const values: DeviceCreateInput = { name };
        if (fqdn) values.fqdn = fqdn;
        if (mgmtIpv4) values.mgmt_ipv4 = mgmtIpv4;
        if (mgmtPort) values.mgmt_port = Number(mgmtPort);
        if (platformId) values.platform_id = Number(platformId);
        if (credentialProfileId) values.credential_profile_id = Number(credentialProfileId);
        if (inventoryGroupId) values.inventory_group_id = Number(inventoryGroupId);
        if (osName) values.os_name = osName;
        if (osVersion) values.os_version = osVersion;
        if (serialNumber) values.serial_number = serialNumber;
        if (modelNumber) values.model_number = modelNumber;
        if (notes) values.notes = notes;
        onSubmit(values);
    }

    const hasErrors = Object.values(fieldErrors).some(Boolean);

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Required field note */}
            <p className="text-xs text-muted">
                Fields marked <span className="text-red-500">*</span> are required.
            </p>

            <FormSection title="Identity">
                <div className="grid gap-4 sm:grid-cols-2">
                {/* Name — required */}
                <div className="space-y-1">
                    <label htmlFor="device-name" className="block text-sm font-medium text-text">
                        Name
                        <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
                    </label>
                    <input
                        id="device-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:shadow-focus focus:outline-none"
                    />
                </div>

                {/* FQDN */}
                <div className="space-y-1">
                    <label htmlFor="device-fqdn" className="block text-sm font-medium text-text">
                        FQDN
                        <InfoTooltip text="Fully Qualified Domain Name — the complete hostname including domain, e.g. switch01.corp.example.com" />
                    </label>
                    <input
                        id="device-fqdn"
                        type="text"
                        value={fqdn}
                        onChange={(e) => setFqdn(e.target.value)}
                        className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:shadow-focus focus:outline-none"
                    />
                </div>
                </div>
            </FormSection>

            <FormSection title="Network / Transport">
                <div className="grid gap-4 sm:grid-cols-2">
                {/* Management IP */}
                <div className="space-y-1">
                    <label htmlFor="device-ip" className="block text-sm font-medium text-text">
                        Management IP
                        <InfoTooltip text="The IP address Orbit uses to connect to this device for automation tasks (e.g., SSH or NETCONF). This is typically the device's out-of-band management or loopback interface." />
                    </label>
                    <input
                        id="device-ip"
                        type="text"
                        value={mgmtIpv4}
                        onChange={(e) => handleIpChange(e.target.value)}
                        placeholder="10.0.0.1"
                        className={`w-full rounded-xl border bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:outline-none ${
                            fieldErrors.mgmt_ipv4
                                ? "border-red-400 focus:border-red-500"
                                : "border-primary/30 focus:border-primary focus:shadow-focus"
                        }`}
                    />
                    {fieldErrors.mgmt_ipv4 && (
                        <p className="mt-1 text-xs text-red-500">{fieldErrors.mgmt_ipv4}</p>
                    )}
                </div>

                {/* Management Port */}
                <div className="space-y-1">
                    <label htmlFor="device-port" className="block text-sm font-medium text-text">
                        Management Port
                    </label>
                    <input
                        id="device-port"
                        type="number"
                        value={mgmtPort}
                        onChange={(e) => handlePortChange(e.target.value)}
                        placeholder="22"
                        min={1}
                        max={65535}
                        className={`w-full rounded-xl border bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:outline-none ${
                            fieldErrors.mgmt_port
                                ? "border-red-400 focus:border-red-500"
                                : "border-primary/30 focus:border-primary focus:shadow-focus"
                        }`}
                    />
                    {fieldErrors.mgmt_port && (
                        <p className="mt-1 text-xs text-red-500">{fieldErrors.mgmt_port}</p>
                    )}
                </div>
                </div>
            </FormSection>

            <FormSection title="Platform & Credentials">
                <div className="grid gap-4 sm:grid-cols-2">
                {/* Platform */}
                <div>
                    <label htmlFor="device-platform" className="mb-1 block text-sm font-medium text-text">
                        Platform
                        <InfoTooltip text="The vendor and device type — determines which automation drivers Orbit uses to communicate with this device." />
                    </label>
                    <select
                        id="device-platform"
                        value={platformId}
                        onChange={(e) => setPlatformId(e.target.value)}
                        className="w-full rounded-lg border border-primary/20 bg-background px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                    >
                        <option value="">Select platform...</option>
                        {platforms.map((p) => (
                            <option key={p.id} value={String(p.id)}>
                                {p.display_name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Credential Profile */}
                <div>
                    <label htmlFor="device-credential" className="mb-1 block text-sm font-medium text-text">
                        Credential Profile
                        <InfoTooltip text="The saved credentials Orbit uses to authenticate when connecting to this device." />
                    </label>
                    <select
                        id="device-credential"
                        value={credentialProfileId}
                        onChange={(e) => setCredentialProfileId(e.target.value)}
                        className="w-full rounded-lg border border-primary/20 bg-background px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                    >
                        <option value="">Select profile...</option>
                        {credentialProfiles.map((cp) => (
                            <option key={cp.id} value={String(cp.id)}>
                                {cp.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Inventory Group */}
                <div>
                    <label htmlFor="device-group" className="mb-1 block text-sm font-medium text-text">
                        Inventory Group
                    </label>
                    <select
                        id="device-group"
                        value={inventoryGroupId}
                        onChange={(e) => setInventoryGroupId(e.target.value)}
                        className="w-full rounded-lg border border-primary/20 bg-background px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                    >
                        <option value="">No group</option>
                        {groups.map((g) => (
                            <option key={g.id} value={String(g.id)}>
                                {g.name}
                            </option>
                        ))}
                    </select>
                </div>
                </div>
            </FormSection>

            <FormSection title="Metadata & Notes">
                <div className="grid gap-4 sm:grid-cols-2">
                {/* OS Name */}
                <div className="space-y-1">
                    <label htmlFor="device-os" className="block text-sm font-medium text-text">
                        OS Name
                        <InfoTooltip text="The operating system identifier as recognized by Orbit's automation drivers, e.g. ios-xe, eos, junos, nxos" />
                    </label>
                    <input
                        id="device-os"
                        type="text"
                        value={osName}
                        onChange={(e) => setOsName(e.target.value)}
                        placeholder="cisco-ios"
                        className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:shadow-focus focus:outline-none"
                    />
                </div>

                <Input
                    label="OS Version"
                    value={osVersion}
                    onChange={(e) => setOsVersion(e.target.value)}
                    placeholder="17.3.4"
                    id="device-os-version"
                />
                <Input
                    label="Serial Number"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    id="device-serial"
                />
                <Input
                    label="Model Number"
                    value={modelNumber}
                    onChange={(e) => setModelNumber(e.target.value)}
                    id="device-model"
                />
            </div>

            <div>
                <label htmlFor="device-notes" className="mb-1 block text-sm font-medium text-text">
                    Notes
                </label>
                <textarea
                    id="device-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-primary/20 bg-background px-3 py-2 text-sm text-text placeholder:text-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                    placeholder="Optional notes about this device..."
                />
            </div>
            </FormSection>

            <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    size="sm"
                    type="submit"
                    disabled={!name || isSubmitting || (submitAttempted && hasErrors)}
                >
                    {isSubmitting ? "Saving..." : submitLabel}
                </Button>
            </div>
        </form>
    );
}
