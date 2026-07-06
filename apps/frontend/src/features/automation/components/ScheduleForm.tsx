import { useState } from "react";

import { Button } from "@/components/ui/Button";
import {
    SCHEDULE_PRESETS,
    SCHEDULE_TIMEZONES,
} from "@/features/automation/api/schedules.api";
import type { ScheduleCreateInput, SchedulePreset, ScheduleTargetType } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduleFormValues {
    name: string;
    preset: SchedulePreset | "";
    timezone: string;
    enabled: boolean;
}

export interface ScheduleFormProps {
    /** Fixed target — callers set this; not editable within the form. */
    targetType: ScheduleTargetType;
    targetId: number;
    /** Pre-populate for edit flow (leave undefined for create). */
    defaultValues?: Partial<ScheduleFormValues>;
    onSubmit: (input: ScheduleCreateInput) => void;
    onCancel: () => void;
    isSubmitting?: boolean;
    submitLabel?: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

interface ScheduleFormErrors {
    preset?: string;
}

function validate(values: ScheduleFormValues): ScheduleFormErrors {
    const errors: ScheduleFormErrors = {};
    if (!values.preset) {
        errors.preset = "Frequency is required.";
    }
    return errors;
}

// ─── Component ────────────────────────────────────────────────────────────────

const INPUT_CLASS =
    "w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:shadow-focus focus:outline-none";

export function ScheduleForm({
    targetType,
    targetId,
    defaultValues,
    onSubmit,
    onCancel,
    isSubmitting = false,
    submitLabel = "Save schedule",
}: ScheduleFormProps): JSX.Element {
    const [values, setValues] = useState<ScheduleFormValues>({
        name: defaultValues?.name ?? "",
        preset: defaultValues?.preset ?? "",
        timezone: defaultValues?.timezone ?? "UTC",
        enabled: defaultValues?.enabled ?? true,
    });
    const [errors, setErrors] = useState<ScheduleFormErrors>({});

    function patch(partial: Partial<ScheduleFormValues>): void {
        setValues((prev) => ({ ...prev, ...partial }));
    }

    function handleSubmit(e: React.FormEvent): void {
        e.preventDefault();
        const errs = validate(values);
        if (Object.keys(errs).length > 0) {
            setErrors(errs);
            return;
        }
        setErrors({});
        onSubmit({
            name: values.name.trim() || undefined,
            preset: values.preset as SchedulePreset,
            timezone: values.timezone,
            enabled: values.enabled,
            target_type: targetType,
            target_id: targetId,
        });
    }

    return (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Name (optional) */}
            <div className="space-y-1">
                <label className="block text-sm font-medium text-text" htmlFor="sched-name">
                    Schedule name{" "}
                    <span className="text-xs font-normal text-muted">(optional)</span>
                </label>
                <input
                    id="sched-name"
                    value={values.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    placeholder="e.g. Nightly check"
                    className={INPUT_CLASS}
                />
            </div>

            {/* Frequency preset */}
            <div className="space-y-1">
                <label className="block text-sm font-medium text-text" htmlFor="sched-preset">
                    Frequency<span className="ml-0.5 text-red-500">*</span>
                </label>
                <select
                    id="sched-preset"
                    value={values.preset}
                    onChange={(e) => patch({ preset: e.target.value as SchedulePreset | "" })}
                    className={INPUT_CLASS}
                    aria-invalid={Boolean(errors.preset)}
                >
                    <option value="">Select frequency…</option>
                    {SCHEDULE_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>
                            {p.label}
                        </option>
                    ))}
                </select>
                {errors.preset ? (
                    <p className="text-xs text-red-500">{errors.preset}</p>
                ) : null}
            </div>

            {/* Timezone */}
            <div className="space-y-1">
                <label className="block text-sm font-medium text-text" htmlFor="sched-tz">
                    Timezone
                </label>
                <select
                    id="sched-tz"
                    value={values.timezone}
                    onChange={(e) => patch({ timezone: e.target.value })}
                    className={INPUT_CLASS}
                >
                    {SCHEDULE_TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>
                            {tz}
                        </option>
                    ))}
                </select>
            </div>

            {/* Enabled toggle */}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    role="switch"
                    aria-checked={values.enabled}
                    aria-label="Enabled"
                    onClick={() => patch({ enabled: !values.enabled })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                        values.enabled ? "bg-primary" : "bg-primary/20"
                    }`}
                >
                    <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                            values.enabled ? "translate-x-4" : "translate-x-0"
                        }`}
                    />
                </button>
                <span className="text-sm text-text">
                    {values.enabled ? "Enabled" : "Disabled"}
                </span>
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
