import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { SchemaForm, validateSchemaForm } from "@/components/ui/SchemaForm";
import { DeviceSelectionTable } from "@/features/automation/components/DeviceSelectionTable";
import { fetchOperationTemplates } from "@/features/admin/api/operationTemplates.api";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchPlatforms } from "@/features/devices/api/platforms.api";
import { fetchCredentialProfiles } from "@/features/devices/api/credentialProfiles.api";
import {
    COMPARATOR_OPTIONS,
    VISIBILITY_OPTIONS,
    type MonitorCreateInput,
} from "@/features/monitors/api/monitors.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { Monitor, MonitorComparator, MonitorVisibility, VariablesSchema } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
    name: string;
    description: string;
    action_id: string;
    variable_values: Record<string, unknown>;
    selectedDeviceIds: Set<string | number>;
    metric: string;
    comparator: MonitorComparator | "";
    threshold: string;
    visibility: MonitorVisibility;
}

interface FormErrors {
    name?: string;
    action_id?: string;
    metric?: string;
    comparator?: string;
    [key: string]: string | undefined;
}

export interface MonitorFormProps {
    /** Prefill values when editing an existing monitor. */
    defaultValues?: Monitor;
    onSubmit: (input: MonitorCreateInput) => void;
    onCancel: () => void;
    isSubmitting?: boolean;
    submitLabel?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyForm(): FormState {
    return {
        name: "",
        description: "",
        action_id: "",
        variable_values: {},
        selectedDeviceIds: new Set(),
        metric: "",
        comparator: "",
        threshold: "",
        visibility: "private",
    };
}

function monitorToForm(monitor: Monitor): FormState {
    return {
        name: monitor.name,
        description: monitor.description ?? "",
        action_id: String(monitor.action_id),
        variable_values: {},
        selectedDeviceIds: new Set(monitor.target.device_ids),
        metric: monitor.metric,
        comparator: monitor.comparator,
        threshold: monitor.threshold !== null ? String(monitor.threshold) : "",
        visibility: monitor.visibility,
    };
}

function validate(values: FormState): FormErrors {
    const errors: FormErrors = {};
    if (!values.name.trim()) errors.name = "Name is required.";
    if (!values.action_id) errors.action_id = "Action is required.";
    if (!values.metric) errors.metric = "Metric is required.";
    if (!values.comparator) errors.comparator = "Comparator is required.";
    return errors;
}

const INPUT_CLASS =
    "w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:outline-none";

// ─── Component ────────────────────────────────────────────────────────────────

export function MonitorForm({
    defaultValues,
    onSubmit,
    onCancel,
    isSubmitting = false,
    submitLabel = "Save monitor",
}: MonitorFormProps): JSX.Element {
    const [values, setValues] = useState<FormState>(
        defaultValues ? monitorToForm(defaultValues) : emptyForm(),
    );
    const [errors, setErrors] = useState<FormErrors>({});

    // ─── Data queries ─────────────────────────────────────────────────────────

    const templatesQuery = useQuery({
        queryKey: [QUERY_KEYS.operationTemplates, "nonMutating"],
        queryFn: () => fetchOperationTemplates(),
    });
    const nonMutatingTemplates = (templatesQuery.data ?? []).filter(
        (t) => !t.is_mutating && t.is_active !== false,
    );

    const devicesQuery = useQuery({
        queryKey: [QUERY_KEYS.devices, "all"],
        queryFn: () => fetchDevices({}),
    });
    const devices = devicesQuery.data?.data ?? [];

    const platformsQuery = useQuery({
        queryKey: [QUERY_KEYS.platforms],
        queryFn: fetchPlatforms,
    });
    const platformNames = new Map(
        (platformsQuery.data ?? []).map((p) => [p.id, p.display_name]),
    );

    const credQuery = useQuery({
        queryKey: [QUERY_KEYS.credentialProfiles],
        queryFn: fetchCredentialProfiles,
    });
    const credNames = new Map(
        (credQuery.data ?? []).map((c) => [c.id, c.name]),
    );

    // ─── Derived state ────────────────────────────────────────────────────────

    const selectedTemplate = nonMutatingTemplates.find(
        (t) => t.id === Number(values.action_id),
    );
    const variablesSchema: VariablesSchema = selectedTemplate?.variables ?? {};
    const outputFields = Object.keys(selectedTemplate?.outputs ?? {});

    // ─── Handlers ─────────────────────────────────────────────────────────────

    function patch(partial: Partial<FormState>): void {
        setValues((prev) => ({ ...prev, ...partial }));
    }

    function handleActionChange(actionId: string): void {
        patch({ action_id: actionId, variable_values: {}, metric: "" });
    }

    function handleSubmit(e: React.FormEvent): void {
        e.preventDefault();
        const formErrors = validate(values);
        const schemaErrors = validateSchemaForm(variablesSchema, values.variable_values);
        const combined: FormErrors = {
            ...formErrors,
            ...(schemaErrors as FormErrors),
        };
        if (Object.keys(combined).length > 0) {
            setErrors(combined);
            return;
        }
        setErrors({});

        const thresholdNum = values.threshold !== "" ? Number(values.threshold) : null;

        onSubmit({
            name: values.name.trim(),
            description: values.description.trim() || undefined,
            action_id: Number(values.action_id),
            target: { device_ids: Array.from(values.selectedDeviceIds).map(Number) },
            metric: values.metric,
            comparator: values.comparator as MonitorComparator,
            threshold: thresholdNum,
            visibility: values.visibility,
        });
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Name */}
            <div className="space-y-1">
                <label className="block text-sm font-medium text-text" htmlFor="monitor-name">
                    Name<span className="ml-0.5 text-red-500">*</span>
                </label>
                <input
                    id="monitor-name"
                    value={values.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    className={INPUT_CLASS}
                    aria-invalid={Boolean(errors.name)}
                />
                {errors.name ? <p className="text-xs text-red-500">{errors.name}</p> : null}
            </div>

            {/* Description */}
            <div className="space-y-1">
                <label className="block text-sm font-medium text-text" htmlFor="monitor-desc">
                    Description
                </label>
                <input
                    id="monitor-desc"
                    value={values.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    className={INPUT_CLASS}
                />
            </div>

            {/* Action picker — non-mutating only */}
            <div className="space-y-1">
                <label className="block text-sm font-medium text-text" htmlFor="monitor-action">
                    Action<span className="ml-0.5 text-red-500">*</span>
                </label>
                <p className="text-xs text-muted">Only read-only (non-mutating) actions are shown.</p>
                <select
                    id="monitor-action"
                    value={values.action_id}
                    onChange={(e) => handleActionChange(e.target.value)}
                    className={INPUT_CLASS}
                    aria-invalid={Boolean(errors.action_id)}
                >
                    <option value="">Select an action…</option>
                    {nonMutatingTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                            {t.name}
                        </option>
                    ))}
                </select>
                {errors.action_id ? (
                    <p className="text-xs text-red-500">{errors.action_id}</p>
                ) : null}
            </div>

            {/* Schema-driven variables for selected action */}
            {selectedTemplate ? (
                <div className="space-y-2">
                    <p className="text-sm font-medium text-text">Action inputs</p>
                    <SchemaForm
                        schema={variablesSchema}
                        value={values.variable_values}
                        onChange={(next) => patch({ variable_values: next })}
                        errors={errors as Record<string, string>}
                    />
                </div>
            ) : null}

            {/* Metric field from action outputs */}
            <div className="space-y-1">
                <label className="block text-sm font-medium text-text" htmlFor="monitor-metric">
                    Metric<span className="ml-0.5 text-red-500">*</span>
                </label>
                <select
                    id="monitor-metric"
                    value={values.metric}
                    onChange={(e) => patch({ metric: e.target.value })}
                    className={INPUT_CLASS}
                    disabled={outputFields.length === 0}
                    aria-invalid={Boolean(errors.metric)}
                >
                    <option value="">
                        {selectedTemplate
                            ? outputFields.length === 0
                                ? "No output fields on this action"
                                : "Select a metric…"
                            : "Select an action first"}
                    </option>
                    {outputFields.map((field) => (
                        <option key={field} value={field}>
                            {field}
                        </option>
                    ))}
                </select>
                {errors.metric ? <p className="text-xs text-red-500">{errors.metric}</p> : null}
            </div>

            {/* Comparator + threshold */}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                    <label className="block text-sm font-medium text-text" htmlFor="monitor-comparator">
                        Comparator<span className="ml-0.5 text-red-500">*</span>
                    </label>
                    <select
                        id="monitor-comparator"
                        value={values.comparator}
                        onChange={(e) => patch({ comparator: e.target.value as MonitorComparator })}
                        className={INPUT_CLASS}
                        aria-invalid={Boolean(errors.comparator)}
                    >
                        <option value="">Select…</option>
                        {COMPARATOR_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                    {errors.comparator ? (
                        <p className="text-xs text-red-500">{errors.comparator}</p>
                    ) : null}
                </div>

                <div className="space-y-1">
                    <label className="block text-sm font-medium text-text" htmlFor="monitor-threshold">
                        Threshold{" "}
                        <span className="text-xs font-normal text-muted">(optional)</span>
                    </label>
                    <input
                        id="monitor-threshold"
                        type="number"
                        value={values.threshold}
                        onChange={(e) => patch({ threshold: e.target.value })}
                        placeholder="e.g. 85"
                        className={INPUT_CLASS}
                    />
                </div>
            </div>

            {/* Visibility */}
            <div className="space-y-1">
                <label className="block text-sm font-medium text-text" htmlFor="monitor-visibility">
                    Visibility
                </label>
                <select
                    id="monitor-visibility"
                    value={values.visibility}
                    onChange={(e) => patch({ visibility: e.target.value as MonitorVisibility })}
                    className={INPUT_CLASS}
                >
                    {VISIBILITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Target device picker */}
            <div className="space-y-2">
                <p className="text-sm font-medium text-text">
                    Target devices{" "}
                    <span className="text-xs font-normal text-muted">
                        ({values.selectedDeviceIds.size} selected)
                    </span>
                </p>
                <DeviceSelectionTable
                    devices={devices}
                    platformNames={platformNames}
                    credentialProfileNames={credNames}
                    selectedIds={values.selectedDeviceIds}
                    onSelectedIdsChange={(next) => patch({ selectedDeviceIds: next })}
                    isLoading={devicesQuery.isLoading}
                />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 border-t border-primary/10 pt-4">
                <Button type="button" variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving…" : submitLabel}
                </Button>
            </div>
        </form>
    );
}
