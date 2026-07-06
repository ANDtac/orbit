import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { SchemaForm, validateSchemaForm } from "@/components/ui/SchemaForm";
import { DeviceSelectionTable } from "@/features/automation/components/DeviceSelectionTable";
import { ScheduleForm } from "@/features/automation/components/ScheduleForm";
import { StepCard, isStepBindingRef } from "@/features/automation/components/StepCard";
import type { PriorStepOutput } from "@/features/automation/components/StepCard";
import {
    fetchAutomations,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    runAutomation,
    testAutomation,
} from "@/features/automation/api/automations.api";
import {
    fetchSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    fireSchedule,
    PRESET_LABELS,
} from "@/features/automation/api/schedules.api";
import { fetchOperationTemplates } from "@/features/admin/api/operationTemplates.api";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchPlatforms } from "@/features/devices/api/platforms.api";
import { fetchCredentialProfiles } from "@/features/devices/api/credentialProfiles.api";
import { QUERY_KEYS } from "@/lib/constants";
import type {
    Automation,
    AutomationDryRunResult,
    AutomationOnFailure,
    AutomationStep,
    AutomationVisibility,
    Device,
    OperationTemplate,
    Schedule,
    ScheduleCreateInput,
    VariablesSchema,
} from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type View = "list" | "builder";
type BuilderMode = "single" | "sequence";

interface DeviceListState {
    data: Device[];
    isLoading: boolean;
}

interface FormState {
    name: string;
    description: string;
    action_id: string;
    variable_values: Record<string, unknown>;
    selectedDeviceIds: Set<string | number>;
    visibility: AutomationVisibility;
    on_failure: AutomationOnFailure;
}

function emptyForm(): FormState {
    return {
        name: "",
        description: "",
        action_id: "",
        variable_values: {},
        selectedDeviceIds: new Set(),
        visibility: "private",
        on_failure: "stop",
    };
}

function emptyStep(seq: number): AutomationStep {
    return { sequence: seq, action_id: 0, variable_bindings: {}, on_failure: "stop" };
}

function automationToForm(automation: Automation): FormState {
    return {
        name: automation.name,
        description: automation.description ?? "",
        action_id: String(automation.action_id ?? ""),
        variable_values: { ...(automation.variable_values ?? {}) },
        selectedDeviceIds: new Set(automation.target.device_ids ?? []),
        visibility: automation.visibility,
        on_failure: automation.on_failure,
    };
}

function reassignSequences(steps: AutomationStep[]): AutomationStep[] {
    return steps.map((s, i) => ({ ...s, sequence: i + 1 }));
}

// ─── Binding utilities ────────────────────────────────────────────────────────

function computePriorStepOutputs(
    stepIndex: number,
    steps: AutomationStep[],
    templates: OperationTemplate[],
): PriorStepOutput[] {
    const outputs: PriorStepOutput[] = [];
    for (let i = 0; i < stepIndex; i++) {
        const step = steps[i];
        const tmpl = templates.find((t) => t.id === step.action_id);
        if (!tmpl?.outputs) continue;
        for (const [fieldName, field] of Object.entries(tmpl.outputs)) {
            outputs.push({ stepSeq: step.sequence, fieldName, type: field.type });
        }
    }
    return outputs;
}

/** Client-side binding validation. Returns per-step per-field errors. */
export function validateBindings(
    steps: AutomationStep[],
    templates: OperationTemplate[],
): Record<number, Record<string, string>> {
    const errors: Record<number, Record<string, string>> = {};

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const tmpl = templates.find((t) => t.id === step.action_id);
        if (!tmpl) continue;

        for (const [fieldName, value] of Object.entries(step.variable_bindings)) {
            if (!isStepBindingRef(value)) continue;
            const ref = value;

            // Referenced step must precede current step
            const priorStep = steps.find((s) => s.sequence === ref.step);
            if (!priorStep || priorStep.sequence >= step.sequence) {
                errors[i] = errors[i] ?? {};
                errors[i][fieldName] = `Step ${ref.step} does not precede this step.`;
                continue;
            }

            // Output field must exist in the referenced step's action's outputs
            const priorTmpl = templates.find((t) => t.id === priorStep.action_id);
            if (!priorTmpl?.outputs?.[ref.output]) {
                errors[i] = errors[i] ?? {};
                errors[i][fieldName] = `Step ${ref.step} does not have output "${ref.output}".`;
                continue;
            }

            // Types must match
            const outField = priorTmpl.outputs[ref.output];
            const inField = tmpl.variables?.[fieldName];
            if (inField && outField.type !== inField.type) {
                errors[i] = errors[i] ?? {};
                errors[i][fieldName] =
                    `Type mismatch: step ${ref.step} output "${ref.output}" is ${outField.type}, ` +
                    `but "${fieldName}" expects ${inField.type}.`;
            }
        }
    }

    return errors;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso?: string): string {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString();
    } catch {
        return "—";
    }
}

// ─── Test result modal ───────────────────────────────────────────────────────

interface TestResultModalProps {
    result: AutomationDryRunResult | null;
    onClose: () => void;
    onConfirmRun?: () => void;
    isMutating: boolean;
    isRunPending: boolean;
    stepNote?: string;
}

function TestResultModal({
    result,
    onClose,
    onConfirmRun,
    isMutating,
    isRunPending,
    stepNote,
}: TestResultModalProps): JSX.Element | null {
    if (!result) return null;

    const hasFields = result.fields && Object.keys(result.fields).length > 0;

    return (
        <Modal
            isOpen={Boolean(result)}
            onClose={onClose}
            title={result.ok ? "Test passed" : "Test failed"}
            size="lg"
            footer={
                <div className="flex gap-2">
                    <Button variant="ghost" onClick={onClose}>
                        {result.ok && isMutating ? "Cancel run" : "Close"}
                    </Button>
                    {result.ok && isMutating && onConfirmRun ? (
                        <Button onClick={onConfirmRun} disabled={isRunPending}>
                            {isRunPending ? "Running…" : "Confirm and run"}
                        </Button>
                    ) : null}
                </div>
            }
        >
            <div className="space-y-4 pb-2">
                {stepNote ? (
                    <p className="text-xs text-muted italic">{stepNote}</p>
                ) : null}

                {/* Status */}
                <div className="flex items-center gap-2 text-sm">
                    <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${
                            result.ok ? "bg-emerald-500" : "bg-red-500"
                        }`}
                    />
                    <span className="text-muted">
                        Device:{" "}
                        <span className="font-mono text-text">
                            {result.host ?? `#${result.device_id ?? "?"}`}
                        </span>
                    </span>
                    {result.latency_ms != null ? (
                        <span className="text-muted">
                            ({result.latency_ms} ms)
                        </span>
                    ) : null}
                </div>

                {/* Error */}
                {result.error ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                        {result.error}
                    </div>
                ) : null}

                {/* Fields table */}
                {hasFields ? (
                    <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                            Parsed fields
                        </p>
                        <table className="w-full text-sm">
                            <tbody>
                                {Object.entries(result.fields ?? {}).map(([key, val]) => (
                                    <tr key={key} className="border-b border-primary/10">
                                        <td className="py-1.5 pr-4 font-mono text-xs text-muted">
                                            {key}
                                        </td>
                                        <td className="py-1.5 text-text">
                                            {String(val)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : null}

                {/* Field errors */}
                {result.field_errors && Object.keys(result.field_errors).length > 0 ? (
                    <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-red-400">
                            Field errors
                        </p>
                        <table className="w-full text-sm">
                            <tbody>
                                {Object.entries(result.field_errors).map(([key, msg]) => (
                                    <tr key={key} className="border-b border-red-500/10">
                                        <td className="py-1.5 pr-4 font-mono text-xs text-muted">
                                            {key}
                                        </td>
                                        <td className="py-1.5 text-red-400">{msg}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : null}

                {/* Diff block */}
                {result.diff ? (
                    <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                            Configuration diff
                        </p>
                        <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-primary/20 bg-background px-4 py-3 font-mono text-xs text-text">
                            {result.diff.split("\n").map((line, i) => (
                                <span
                                    key={i}
                                    className={
                                        line.startsWith("+")
                                            ? "text-emerald-400"
                                            : line.startsWith("-")
                                              ? "text-red-400"
                                              : "text-muted"
                                    }
                                >
                                    {line}
                                    {"\n"}
                                </span>
                            ))}
                        </pre>
                        {isMutating ? (
                            <p className="mt-2 text-xs text-amber-400">
                                This action will modify device configuration. Review the diff above
                                before confirming.
                            </p>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </Modal>
    );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

interface DeleteConfirmModalProps {
    target: Automation | null;
    onClose: () => void;
    onConfirm: (id: number) => void;
    isPending: boolean;
}

function DeleteConfirmModal({
    target,
    onClose,
    onConfirm,
    isPending,
}: DeleteConfirmModalProps): JSX.Element | null {
    if (!target) return null;

    return (
        <Modal
            isOpen={Boolean(target)}
            onClose={onClose}
            title="Delete automation"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        className="!bg-red-600 hover:!bg-red-700"
                        onClick={() => onConfirm(target.id)}
                        disabled={isPending}
                    >
                        {isPending ? "Deleting…" : "Delete"}
                    </Button>
                </>
            }
        >
            <p className="text-sm text-text">
                Delete{" "}
                <span className="font-semibold">{target.name}</span>? This cannot be undone.
            </p>
        </Modal>
    );
}

// ─── Schedule section ────────────────────────────────────────────────────────

interface ScheduleSectionProps {
    automationId: number;
}

function ScheduleSection({ automationId }: ScheduleSectionProps): JSX.Element {
    const qc = useQueryClient();
    const navigate = useNavigate();
    const [isAddOpen, setIsAddOpen] = useState(false);

    const {
        data: schedules = [],
        isLoading: schedulesLoading,
    } = useQuery({
        queryKey: [QUERY_KEYS.schedules, "automation", automationId],
        queryFn: () => fetchSchedules({ target_type: "automation", target_id: automationId }),
    });

    const createMutation = useMutation({
        mutationFn: (input: ScheduleCreateInput) => createSchedule(input),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.schedules] });
            setIsAddOpen(false);
            toast.success("Schedule created.");
        },
        onError: (err: unknown) => {
            toast.error(err instanceof Error ? err.message : "Failed to create schedule.");
        },
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
            updateSchedule(id, { enabled }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.schedules] });
        },
        onError: (err: unknown) => {
            toast.error(err instanceof Error ? err.message : "Failed to update schedule.");
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => deleteSchedule(id),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.schedules] });
            toast.success("Schedule deleted.");
        },
        onError: (err: unknown) => {
            toast.error(err instanceof Error ? err.message : "Failed to delete schedule.");
        },
    });

    const fireMutation = useMutation({
        mutationFn: (id: number) => fireSchedule(id),
        onSuccess: () => {
            toast.success("Run queued.", {
                action: {
                    label: "View Runs",
                    onClick: () => void navigate("/automation/runs"),
                },
            });
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.schedules] });
        },
        onError: (err: unknown) => {
            toast.error(err instanceof Error ? err.message : "Failed to fire schedule.");
        },
    });

    const scheduleColumns: ColumnDef<Schedule>[] = [
        {
            key: "preset",
            header: "Frequency",
            accessor: (s) => (
                <span className="font-medium text-text">
                    {s.preset ? (PRESET_LABELS[s.preset] ?? s.preset) : s.cron_expr}
                </span>
            ),
        },
        {
            key: "next_run",
            header: "Next run",
            accessor: (s) => (
                <span className="text-sm text-muted">
                    {s.next_run ? new Date(s.next_run).toLocaleString() : "—"}
                </span>
            ),
        },
        {
            key: "timezone",
            header: "Timezone",
            accessor: (s) => <span className="text-sm text-muted">{s.timezone}</span>,
        },
        {
            key: "enabled",
            header: "Enabled",
            accessor: (s) => (
                <button
                    type="button"
                    role="switch"
                    aria-checked={s.enabled}
                    aria-label={s.enabled ? "Disable schedule" : "Enable schedule"}
                    onClick={() => toggleMutation.mutate({ id: s.id, enabled: !s.enabled })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        s.enabled ? "bg-primary" : "bg-primary/20"
                    }`}
                >
                    <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            s.enabled ? "translate-x-4" : "translate-x-0"
                        }`}
                    />
                </button>
            ),
        },
        {
            key: "actions",
            header: "",
            accessor: (s) => (
                <div
                    className="flex justify-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fireMutation.mutate(s.id)}
                        disabled={fireMutation.isPending}
                    >
                        Fire now
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-500"
                        onClick={() => deleteMutation.mutate(s.id)}
                        disabled={deleteMutation.isPending}
                    >
                        Delete
                    </Button>
                </div>
            ),
            cellClassName: "w-[180px]",
        },
    ];

    return (
        <div className="space-y-3 border-t border-primary/10 pt-6">
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-text">Schedules</p>
                <Button variant="outline" size="sm" onClick={() => setIsAddOpen(true)}>
                    Add schedule
                </Button>
            </div>

            <DataTable<Schedule>
                columns={scheduleColumns}
                data={schedules}
                keyExtractor={(s) => s.id}
                isLoading={schedulesLoading}
                dense
                emptyState={
                    <p className="text-sm text-muted">
                        No schedules yet.{" "}
                        <button
                            type="button"
                            onClick={() => setIsAddOpen(true)}
                            className="text-primary underline-offset-2 hover:underline"
                        >
                            Add one
                        </button>{" "}
                        to run this automation on a recurring schedule.
                    </p>
                }
            />

            <Modal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                title="Add schedule"
                size="md"
            >
                <ScheduleForm
                    targetType="automation"
                    targetId={automationId}
                    onSubmit={(input) => createMutation.mutate(input)}
                    onCancel={() => setIsAddOpen(false)}
                    isSubmitting={createMutation.isPending}
                    submitLabel="Create schedule"
                />
            </Modal>
        </div>
    );
}

// ─── Shared input style ───────────────────────────────────────────────────────

const INPUT_CLASS =
    "w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-base text-text shadow-sm transition focus:border-primary focus:shadow-focus focus:outline-none";

// ─── Shared metadata fields (name / description / devices / settings) ─────────

interface MetaFieldsProps {
    form: FormState;
    setForm: (patch: Partial<FormState>) => void;
    devices: DeviceListState;
    platformNames: Map<number, string>;
    credentialProfileNames: Map<number, string>;
}

function MetaFields({
    form,
    setForm,
    devices,
    platformNames,
    credentialProfileNames,
}: MetaFieldsProps): JSX.Element {
    const { data: deviceList, isLoading: isDevicesLoading } = devices;

    return (
        <>
            {/* Name + description */}
            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                    <label className="block text-sm font-medium text-text" htmlFor="builder-name">
                        Name<span className="ml-0.5 text-red-500">*</span>
                    </label>
                    <input
                        id="builder-name"
                        value={form.name}
                        onChange={(e) => setForm({ name: e.target.value })}
                        placeholder="My automation"
                        className={INPUT_CLASS}
                    />
                </div>
                <div className="space-y-1">
                    <label className="block text-sm font-medium text-text" htmlFor="builder-desc">
                        Description
                    </label>
                    <input
                        id="builder-desc"
                        value={form.description}
                        onChange={(e) => setForm({ description: e.target.value })}
                        placeholder="Optional description"
                        className={INPUT_CLASS}
                    />
                </div>
            </div>

            {/* Target device picker */}
            <div className="space-y-2">
                <p className="text-sm font-medium text-text">
                    Target devices
                    <span className="ml-1 text-xs font-normal text-muted">
                        ({form.selectedDeviceIds.size} selected)
                    </span>
                </p>
                <DeviceSelectionTable
                    devices={deviceList}
                    platformNames={platformNames}
                    credentialProfileNames={credentialProfileNames}
                    selectedIds={form.selectedDeviceIds}
                    onSelectedIdsChange={(next) => setForm({ selectedDeviceIds: next })}
                    isLoading={isDevicesLoading}
                />
            </div>

            {/* Settings row */}
            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                    <label className="block text-sm font-medium text-text" htmlFor="builder-vis">
                        Visibility
                    </label>
                    <select
                        id="builder-vis"
                        value={form.visibility}
                        onChange={(e) =>
                            setForm({ visibility: e.target.value as AutomationVisibility })
                        }
                        className={INPUT_CLASS}
                    >
                        <option value="private">Private</option>
                        <option value="shared">Shared</option>
                        <option value="role">Role</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="block text-sm font-medium text-text" htmlFor="builder-failure">
                        On failure
                    </label>
                    <select
                        id="builder-failure"
                        value={form.on_failure}
                        onChange={(e) =>
                            setForm({ on_failure: e.target.value as AutomationOnFailure })
                        }
                        className={INPUT_CLASS}
                    >
                        <option value="stop">Stop</option>
                        <option value="continue">Continue</option>
                    </select>
                </div>
            </div>
        </>
    );
}

// ─── Sequence builder content ─────────────────────────────────────────────────

interface SequenceBuilderContentProps {
    steps: AutomationStep[];
    onStepsChange: (steps: AutomationStep[]) => void;
    availableActions: OperationTemplate[];
    stepBindingErrors: Record<number, Record<string, string>>;
}

function SequenceBuilderContent({
    steps,
    onStepsChange,
    availableActions,
    stepBindingErrors,
}: SequenceBuilderContentProps): JSX.Element {
    function addStep(): void {
        onStepsChange(
            reassignSequences([...steps, emptyStep(steps.length + 1)]),
        );
    }

    function updateStep(index: number, updated: AutomationStep): void {
        const next = [...steps];
        next[index] = updated;
        onStepsChange(reassignSequences(next));
    }

    function removeStep(index: number): void {
        onStepsChange(reassignSequences(steps.filter((_, i) => i !== index)));
    }

    function moveStep(from: number, to: number): void {
        if (to < 0 || to >= steps.length) return;
        const next = [...steps];
        [next[from], next[to]] = [next[to], next[from]];
        onStepsChange(reassignSequences(next));
    }

    return (
        <div className="space-y-3">
            {steps.length === 0 ? (
                <div className="rounded-xl border border-dashed border-primary/20 p-6 text-center">
                    <p className="text-sm text-muted">
                        No steps yet. Add steps to build a multi-step sequence.
                    </p>
                </div>
            ) : (
                steps.map((step, i) => {
                    const priorOutputs = computePriorStepOutputs(i, steps, availableActions);
                    return (
                        <StepCard
                            key={i}
                            step={step}
                            stepIndex={i}
                            totalSteps={steps.length}
                            availableActions={availableActions}
                            priorStepOutputs={priorOutputs}
                            onChange={(updated) => updateStep(i, updated)}
                            onRemove={() => removeStep(i)}
                            onMoveUp={() => moveStep(i, i - 1)}
                            onMoveDown={() => moveStep(i, i + 1)}
                            bindingErrors={stepBindingErrors[i]}
                        />
                    );
                })
            )}
            <Button variant="outline" onClick={addStep} size="sm">
                + Add Step
            </Button>
        </div>
    );
}

// ─── Builder form ─────────────────────────────────────────────────────────────

interface BuilderFormProps {
    form: FormState;
    setForm: (patch: Partial<FormState>) => void;
    builderMode: BuilderMode;
    onBuilderModeChange: (mode: BuilderMode) => void;
    sequenceSteps: AutomationStep[];
    onSequenceStepsChange: (steps: AutomationStep[]) => void;
    stepBindingErrors: Record<number, Record<string, string>>;
    templates: OperationTemplate[];
    selectedAction: OperationTemplate | undefined;
    devices: DeviceListState;
    platformNames: Map<number, string>;
    credentialProfileNames: Map<number, string>;
    schemaErrors: Record<string, string>;
    formError: string | null;
    savedAutomation: Automation | null;
    testResult: AutomationDryRunResult | null;
    isSavePending: boolean;
    isTestPending: boolean;
    isRunPending: boolean;
    hasTestedSuccessfully: boolean;
    onSave: () => void;
    onTest: () => void;
    onRun: () => void;
    onTestResultClose: () => void;
    onTestConfirmRun: () => void;
    onCancel: () => void;
}

function BuilderForm({
    form,
    setForm,
    builderMode,
    onBuilderModeChange,
    sequenceSteps,
    onSequenceStepsChange,
    stepBindingErrors,
    templates,
    selectedAction,
    devices,
    platformNames,
    credentialProfileNames,
    schemaErrors,
    formError,
    savedAutomation,
    testResult,
    isSavePending,
    isTestPending,
    isRunPending,
    hasTestedSuccessfully,
    onSave,
    onTest,
    onRun,
    onTestResultClose,
    onTestConfirmRun,
    onCancel,
}: BuilderFormProps): JSX.Element {
    const isMutating = selectedAction?.is_mutating ?? false;
    const canRun = !isMutating || hasTestedSuccessfully;

    // For sequence mode: check if any step uses a mutating action
    const hasSequenceMutatingStep = useMemo(
        () =>
            builderMode === "sequence" &&
            sequenceSteps.some((step) =>
                templates.find((t) => t.id === step.action_id)?.is_mutating === true,
            ),
        [builderMode, sequenceSteps, templates],
    );

    const activeSchema: VariablesSchema = selectedAction?.variables ?? {};

    // Test note for sequence mode: clarify step 1 is being tested
    const testStepNote =
        builderMode === "sequence" && sequenceSteps.length > 1
            ? `Testing Step 1 of ${sequenceSteps.length}.`
            : undefined;

    const TAB_BASE = "px-4 py-1.5 text-sm font-medium rounded-lg transition-colors";
    const TAB_ACTIVE = `${TAB_BASE} bg-primary text-white`;
    const TAB_INACTIVE = `${TAB_BASE} text-muted hover:text-text hover:bg-primary/10`;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="font-heading text-xl font-semibold text-text">
                    {savedAutomation ? `Edit: ${savedAutomation.name}` : "New Automation"}
                </h2>
                <Button variant="ghost" size="sm" onClick={onCancel}>
                    Back to list
                </Button>
            </div>

            {/* Mode toggle */}
            <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-surface p-1 w-fit">
                <button
                    type="button"
                    aria-label="Single action mode"
                    className={builderMode === "single" ? TAB_ACTIVE : TAB_INACTIVE}
                    onClick={() => onBuilderModeChange("single")}
                >
                    Single Action
                </button>
                <button
                    type="button"
                    aria-label="Sequence mode"
                    className={builderMode === "sequence" ? TAB_ACTIVE : TAB_INACTIVE}
                    onClick={() => onBuilderModeChange("sequence")}
                >
                    Sequence
                </button>
            </div>

            {/* Shared metadata */}
            <MetaFields
                form={form}
                setForm={setForm}
                devices={devices}
                platformNames={platformNames}
                credentialProfileNames={credentialProfileNames}
            />

            {/* Mode-specific content */}
            {builderMode === "single" ? (
                <>
                    {/* Action picker */}
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-text" htmlFor="builder-action">
                            Action (template)<span className="ml-0.5 text-red-500">*</span>
                        </label>
                        <select
                            id="builder-action"
                            value={form.action_id}
                            onChange={(e) => {
                                setForm({
                                    action_id: e.target.value,
                                    variable_values: {},
                                });
                            }}
                            className={INPUT_CLASS}
                        >
                            <option value="">Select an action…</option>
                            {templates.map((t) => (
                                <option key={t.id} value={String(t.id)}>
                                    {t.name}
                                    {t.is_mutating ? " (mutating)" : ""}
                                    {t.op_type ? ` [${t.op_type}]` : ""}
                                </option>
                            ))}
                        </select>
                        {selectedAction?.is_mutating ? (
                            <p className="text-xs text-amber-400">
                                This action modifies device configuration. A successful dry-run test is
                                required before running.
                            </p>
                        ) : null}
                    </div>

                    {/* Schema form */}
                    {selectedAction ? (
                        <div className="rounded-xl border border-primary/10 bg-background/40 p-4">
                            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
                                Action inputs
                            </p>
                            <SchemaForm
                                schema={activeSchema}
                                value={form.variable_values}
                                onChange={(next) => setForm({ variable_values: next })}
                                errors={schemaErrors}
                            />
                        </div>
                    ) : null}
                </>
            ) : (
                /* Sequence mode */
                <div className="space-y-2">
                    <p className="text-sm font-medium text-text">Steps</p>
                    {hasSequenceMutatingStep ? (
                        <p className="text-xs text-amber-400">
                            One or more steps modify device configuration. Review each mutating step
                            carefully before running.
                        </p>
                    ) : null}
                    <SequenceBuilderContent
                        steps={sequenceSteps}
                        onStepsChange={onSequenceStepsChange}
                        availableActions={templates}
                        stepBindingErrors={stepBindingErrors}
                    />
                </div>
            )}

            {formError ? (
                <p className="text-sm text-red-500">{formError}</p>
            ) : null}

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3 border-t border-primary/10 pt-4">
                <Button onClick={onSave} disabled={isSavePending}>
                    {isSavePending ? "Saving…" : savedAutomation ? "Save changes" : "Save draft"}
                </Button>

                <Button
                    variant="outline"
                    onClick={onTest}
                    disabled={isTestPending || !savedAutomation}
                    title={!savedAutomation ? "Save first to enable testing" : undefined}
                >
                    {isTestPending
                        ? "Testing…"
                        : builderMode === "sequence" && sequenceSteps.length > 1
                          ? "Test step 1"
                          : "Test on one device"}
                </Button>

                {isMutating && builderMode === "single" ? (
                    <Button
                        variant={canRun ? "primary" : "ghost"}
                        onClick={onRun}
                        disabled={!canRun || isRunPending || !savedAutomation}
                        title={
                            !canRun
                                ? "A successful dry-run test is required before running a mutating action"
                                : !savedAutomation
                                  ? "Save first"
                                  : undefined
                        }
                    >
                        {isRunPending ? "Running…" : "Run"}
                    </Button>
                ) : (
                    <Button
                        variant="primary"
                        onClick={onRun}
                        disabled={isRunPending || !savedAutomation}
                        title={!savedAutomation ? "Save first" : undefined}
                    >
                        {isRunPending ? "Running…" : "Run"}
                    </Button>
                )}

                {isMutating && !hasTestedSuccessfully && builderMode === "single" ? (
                    <span className="text-xs text-muted">
                        Test required before running a mutating action.
                    </span>
                ) : null}
            </div>

            {/* Test result modal */}
            <TestResultModal
                result={testResult}
                onClose={onTestResultClose}
                onConfirmRun={onTestConfirmRun}
                isMutating={isMutating || hasSequenceMutatingStep}
                isRunPending={isRunPending}
                stepNote={testStepNote}
            />

            {/* Schedule section — only shown for saved automations */}
            {savedAutomation ? (
                <ScheduleSection automationId={savedAutomation.id} />
            ) : null}
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AutomationBuilderPage(): JSX.Element {
    const navigate = useNavigate();
    const qc = useQueryClient();

    const [view, setView] = useState<View>("list");
    const [builderMode, setBuilderMode] = useState<BuilderMode>("single");
    const [savedAutomation, setSavedAutomation] = useState<Automation | null>(null);
    const [form, setFormState] = useState<FormState>(emptyForm());
    const [sequenceSteps, setSequenceSteps] = useState<AutomationStep[]>([]);
    const [schemaErrors, setSchemaErrors] = useState<Record<string, string>>({});
    const [stepBindingErrors, setStepBindingErrors] = useState<Record<number, Record<string, string>>>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<AutomationDryRunResult | null>(null);
    const [hasTestedSuccessfully, setHasTestedSuccessfully] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);

    function setForm(patch: Partial<FormState>): void {
        setFormState((prev) => ({ ...prev, ...patch }));
    }

    // ── Data queries ──────────────────────────────────────────────────────────

    const { data: automations = [], isLoading: automationsLoading, isError: automationsError, refetch: refetchAutomations } = useQuery({
        queryKey: [QUERY_KEYS.automations],
        queryFn: fetchAutomations,
    });

    const { data: templates = [] } = useQuery({
        queryKey: [QUERY_KEYS.operationTemplates, "active"],
        queryFn: () => fetchOperationTemplates({ per_page: 200 }),
    });

    const activeTemplates = useMemo(
        () => templates.filter((t) => t.is_active !== false),
        [templates],
    );

    const { data: devicesPage, isLoading: devicesLoading } = useQuery({
        queryKey: [QUERY_KEYS.devices, "builder"],
        queryFn: () => fetchDevices({ "page[size]": 200 }),
    });

    const { data: platforms = [] } = useQuery({
        queryKey: [QUERY_KEYS.platforms],
        queryFn: fetchPlatforms,
    });

    const { data: credentialProfiles = [] } = useQuery({
        queryKey: [QUERY_KEYS.credentialProfiles],
        queryFn: fetchCredentialProfiles,
    });

    const platformNames = useMemo(
        () => new Map(platforms.map((p) => [p.id, p.display_name])),
        [platforms],
    );

    const credentialProfileNames = useMemo(
        () => new Map(credentialProfiles.map((c) => [c.id, c.name])),
        [credentialProfiles],
    );

    const selectedAction = useMemo(
        () => activeTemplates.find((t) => String(t.id) === form.action_id),
        [activeTemplates, form.action_id],
    );

    // ── Mutations ─────────────────────────────────────────────────────────────

    const saveMutation = useMutation({
        mutationFn: async (): Promise<Automation> => {
            if (builderMode === "sequence") {
                const payload = {
                    name: form.name.trim(),
                    description: form.description.trim() || undefined,
                    steps: sequenceSteps.map((s, i) => ({ ...s, sequence: i + 1 })),
                    action_id: sequenceSteps[0]?.action_id || undefined,
                    variable_values: {},
                    target: { device_ids: [...form.selectedDeviceIds].map(Number) },
                    visibility: form.visibility,
                    on_failure: form.on_failure,
                };
                if (savedAutomation) {
                    return updateAutomation(savedAutomation.id, payload);
                }
                return createAutomation(payload);
            }

            // Single-action mode
            const payload = {
                name: form.name.trim(),
                description: form.description.trim() || undefined,
                action_id: Number(form.action_id),
                variable_values: form.variable_values,
                target: { device_ids: [...form.selectedDeviceIds].map(Number) },
                visibility: form.visibility,
                on_failure: form.on_failure,
            };
            if (savedAutomation) {
                return updateAutomation(savedAutomation.id, payload);
            }
            return createAutomation(payload);
        },
        onSuccess: (automation) => {
            setSavedAutomation(automation);
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.automations] });
            toast.success(savedAutomation ? "Automation updated." : "Automation saved as draft.");
        },
        onError: (err: unknown) => {
            const msg = err instanceof Error ? err.message : "Failed to save automation.";
            toast.error(msg);
        },
    });

    const testMutation = useMutation({
        mutationFn: async (): Promise<AutomationDryRunResult> => {
            let targetId = savedAutomation?.id;
            if (!targetId) {
                const saved = await saveMutation.mutateAsync();
                targetId = saved.id;
            }
            const deviceId = [...form.selectedDeviceIds][0];
            return testAutomation(targetId, { device_id: deviceId != null ? Number(deviceId) : undefined });
        },
        onSuccess: (result) => {
            setTestResult(result);
            if (result.ok) {
                setHasTestedSuccessfully(true);
            }
        },
        onError: (err: unknown) => {
            const msg = err instanceof Error ? err.message : "Test failed.";
            toast.error(msg);
        },
    });

    const runMutation = useMutation({
        mutationFn: async (): Promise<void> => {
            if (!savedAutomation) {
                throw new Error("Save the automation before running.");
            }
            await runAutomation(savedAutomation.id);
        },
        onSuccess: () => {
            toast.success("Run queued. Track progress in Runs.", {
                action: {
                    label: "View Runs",
                    onClick: () => void navigate("/automation/runs"),
                },
            });
            setTestResult(null);
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.automations] });
        },
        onError: (err: unknown) => {
            const msg = err instanceof Error ? err.message : "Failed to start run.";
            toast.error(msg);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => deleteAutomation(id),
        onSuccess: () => {
            setDeleteTarget(null);
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.automations] });
            toast.success("Automation deleted.");
        },
        onError: (err: unknown) => {
            const msg = err instanceof Error ? err.message : "Failed to delete automation.";
            toast.error(msg);
        },
    });

    // ── Handlers ──────────────────────────────────────────────────────────────

    function openNew(): void {
        setSavedAutomation(null);
        setFormState(emptyForm());
        setBuilderMode("single");
        setSequenceSteps([]);
        setSchemaErrors({});
        setStepBindingErrors({});
        setFormError(null);
        setTestResult(null);
        setHasTestedSuccessfully(false);
        setView("builder");
    }

    function openEdit(automation: Automation): void {
        setSavedAutomation(automation);
        setFormState(automationToForm(automation));
        const isSequence = Array.isArray(automation.steps) && automation.steps.length > 0;
        setBuilderMode(isSequence ? "sequence" : "single");
        setSequenceSteps(isSequence ? automation.steps! : []);
        setSchemaErrors({});
        setStepBindingErrors({});
        setFormError(null);
        setTestResult(null);
        setHasTestedSuccessfully(false);
        setView("builder");
    }

    function handleBuilderModeChange(mode: BuilderMode): void {
        setBuilderMode(mode);
        setSchemaErrors({});
        setStepBindingErrors({});
        setFormError(null);
    }

    function handleSave(): void {
        const nameError = !form.name.trim() ? "Name is required." : null;

        if (builderMode === "sequence") {
            if (nameError) {
                setFormError(nameError);
                return;
            }
            if (sequenceSteps.length === 0) {
                setFormError("Add at least one step.");
                return;
            }
            const stepsWithoutAction = sequenceSteps.some((s) => !s.action_id);
            if (stepsWithoutAction) {
                setFormError("Each step must have an action selected.");
                return;
            }
            const bindingErrs = validateBindings(sequenceSteps, activeTemplates);
            if (Object.keys(bindingErrs).length > 0) {
                setStepBindingErrors(bindingErrs);
                setFormError("Fix binding errors before saving.");
                return;
            }
            setStepBindingErrors({});
            setFormError(null);
            saveMutation.mutate();
            return;
        }

        // Single mode
        const actionError = !form.action_id ? "Action is required." : null;
        if (nameError || actionError) {
            setFormError(nameError ?? actionError ?? null);
            return;
        }
        if (selectedAction?.variables) {
            const errs = validateSchemaForm(selectedAction.variables, form.variable_values);
            if (Object.keys(errs).length > 0) {
                setSchemaErrors(errs);
                setFormError("Fix variable errors before saving.");
                return;
            }
        }
        setSchemaErrors({});
        setFormError(null);
        saveMutation.mutate();
    }

    function handleTest(): void {
        if (!savedAutomation) {
            handleSave();
            return;
        }
        testMutation.mutate();
    }

    function handleRun(): void {
        runMutation.mutate();
    }

    function handleTestConfirmRun(): void {
        setTestResult(null);
        runMutation.mutate();
    }

    // ── List columns ──────────────────────────────────────────────────────────

    const columns: ColumnDef<Automation>[] = [
        {
            key: "name",
            header: "Name",
            accessor: (a) => (
                <div>
                    <div className="font-medium text-text">{a.name}</div>
                    {a.description ? (
                        <div className="text-xs text-muted">{a.description}</div>
                    ) : null}
                </div>
            ),
        },
        {
            key: "action_id",
            header: "Action",
            accessor: (a) => {
                if (a.steps && a.steps.length > 0) {
                    return (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-primary">
                            Sequence ({a.steps.length} steps)
                        </span>
                    );
                }
                const t = templates.find((tmpl) => tmpl.id === a.action_id);
                return t ? (
                    <span className="inline-flex items-center gap-1 font-mono text-xs text-primary">
                        {t.name}
                        {t.is_mutating ? (
                            <span className="rounded border border-amber-400/40 bg-amber-400/10 px-1 text-[10px] text-amber-300">
                                mutating
                            </span>
                        ) : null}
                    </span>
                ) : (
                    <span className="font-mono text-xs text-muted">
                        {a.action_id ? `#${a.action_id}` : "—"}
                    </span>
                );
            },
        },
        {
            key: "visibility",
            header: "Visibility",
            accessor: (a) => (
                <span className="capitalize text-sm text-muted">{a.visibility}</span>
            ),
        },
        {
            key: "devices",
            header: "Devices",
            accessor: (a) => String(a.target.device_ids?.length ?? 0),
        },
        {
            key: "created_at",
            header: "Created",
            accessor: (a) => formatDate(a.created_at),
        },
        {
            key: "actions",
            header: "",
            accessor: (a) => (
                <div
                    className="flex justify-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                        Edit
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-500"
                        onClick={() => setDeleteTarget(a)}
                    >
                        Delete
                    </Button>
                </div>
            ),
            cellClassName: "w-[160px]",
        },
    ];

    // ── Render ────────────────────────────────────────────────────────────────

    if (view === "builder") {
        return (
            <BuilderForm
                form={form}
                setForm={setForm}
                builderMode={builderMode}
                onBuilderModeChange={handleBuilderModeChange}
                sequenceSteps={sequenceSteps}
                onSequenceStepsChange={setSequenceSteps}
                stepBindingErrors={stepBindingErrors}
                templates={activeTemplates}
                selectedAction={selectedAction}
                devices={{ data: devicesPage?.data ?? [], isLoading: devicesLoading }}
                platformNames={platformNames}
                credentialProfileNames={credentialProfileNames}
                schemaErrors={schemaErrors}
                formError={formError}
                savedAutomation={savedAutomation}
                testResult={testResult}
                isSavePending={saveMutation.isPending}
                isTestPending={testMutation.isPending}
                isRunPending={runMutation.isPending}
                hasTestedSuccessfully={hasTestedSuccessfully}
                onSave={handleSave}
                onTest={handleTest}
                onRun={handleRun}
                onTestResultClose={() => setTestResult(null)}
                onTestConfirmRun={handleTestConfirmRun}
                onCancel={() => setView("list")}
            />
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="max-w-2xl text-sm text-muted">
                    Build no-code automations by composing vetted actions against target devices.
                    Save a draft, test on one device, then run across your fleet.
                </p>
                <Button onClick={openNew}>New Automation</Button>
            </div>

            <DataTable<Automation>
                columns={columns}
                data={automations}
                keyExtractor={(a) => a.id}
                onRowClick={openEdit}
                isLoading={automationsLoading}
                isError={automationsError}
                errorMessage="Unable to load automations."
                onRetry={() => void refetchAutomations()}
                dense
                emptyState={
                    <p className="text-sm text-muted">
                        No automations yet.{" "}
                        <button
                            type="button"
                            onClick={openNew}
                            className="text-primary underline-offset-2 hover:underline"
                        >
                            Create one
                        </button>{" "}
                        to get started.
                    </p>
                }
            />

            <DeleteConfirmModal
                target={deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={(id) => deleteMutation.mutate(id)}
                isPending={deleteMutation.isPending}
            />
        </div>
    );
}
