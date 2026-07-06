import type {
    AutomationOnFailure,
    AutomationStep,
    OperationTemplate,
    SchemaField,
    SchemaFieldType,
    StepBindingRef,
    StepValue,
} from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single available output from a prior step, used for binding dropdowns. */
export interface PriorStepOutput {
    stepSeq: number;
    fieldName: string;
    type: SchemaFieldType;
}

export interface StepCardProps {
    step: AutomationStep;
    stepIndex: number;
    totalSteps: number;
    availableActions: OperationTemplate[];
    /** Pre-computed from all preceding steps' selected actions' `outputs`. */
    priorStepOutputs: PriorStepOutput[];
    onChange: (updated: AutomationStep) => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    /** Per-field binding validation errors. */
    bindingErrors?: Record<string, string>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Runtime type guard — true when a StepValue is a StepBindingRef. */
export function isStepBindingRef(value: unknown): value is StepBindingRef {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        (value as Record<string, unknown>).__ref__ === true
    );
}

function bindingKey(out: PriorStepOutput): string {
    return `${out.stepSeq}:${out.fieldName}`;
}

function parseBindingKey(key: string): { step: number; output: string } | null {
    const [stepStr, ...rest] = key.split(":");
    const step = Number(stepStr);
    const output = rest.join(":");
    if (!Number.isFinite(step) || !output) return null;
    return { step, output };
}

// ─── Shared input styles ──────────────────────────────────────────────────────

const CONTROL_CLASS =
    "w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text shadow-sm transition focus:border-primary focus:shadow-focus focus:outline-none";

const BTN_ICON_CLASS =
    "rounded px-1.5 py-0.5 text-xs text-muted hover:text-text hover:bg-primary/10 transition disabled:opacity-30 disabled:cursor-not-allowed";

// ─── Per-field row ────────────────────────────────────────────────────────────

interface StepFieldRowProps {
    fieldName: string;
    field: SchemaField;
    value: StepValue;
    priorStepOutputs: PriorStepOutput[];
    onChange: (next: StepValue) => void;
    error?: string;
}

function StepFieldRow({
    fieldName,
    field,
    value,
    priorStepOutputs,
    onChange,
    error,
}: StepFieldRowProps): JSX.Element {
    const label = field.label?.trim() || fieldName;
    const fieldId = `stepfield-${fieldName}`;
    const isRef = isStepBindingRef(value);

    // Compatible prior outputs for this field's type
    const compatible = priorStepOutputs.filter((o) => o.type === field.type);
    const hasCompatible = compatible.length > 0;

    // Source select value: "" for literal, "N:fieldName" for ref
    const sourceValue = isRef ? bindingKey({ stepSeq: value.step, fieldName: value.output, type: field.type }) : "";

    function handleSourceChange(newSourceVal: string): void {
        if (newSourceVal === "") {
            // Switch to literal — clear the binding
            onChange(undefined);
        } else {
            const parsed = parseBindingKey(newSourceVal);
            if (!parsed) return;
            const ref: StepBindingRef = { __ref__: true, step: parsed.step, output: parsed.output };
            onChange(ref);
        }
    }

    function handleLiteralChange(newVal: StepValue): void {
        onChange(newVal);
    }

    const rawLiteral = isRef ? undefined : value;

    return (
        <div className="space-y-1">
            {field.type === "boolean" ? (
                <label className="flex items-center gap-2 text-sm font-medium text-text" htmlFor={fieldId}>
                    <input
                        id={fieldId}
                        type="checkbox"
                        checked={Boolean(rawLiteral)}
                        onChange={(e) => handleLiteralChange(e.target.checked)}
                        className="rounded"
                        disabled={isRef}
                    />
                    {label}
                    {field.required ? <span className="ml-0.5 text-red-500" aria-hidden="true">*</span> : null}
                </label>
            ) : (
                <>
                    <label className="block text-sm font-medium text-text" htmlFor={fieldId}>
                        {label}
                        {field.required ? <span className="ml-0.5 text-red-500" aria-hidden="true">*</span> : null}
                    </label>

                    {hasCompatible ? (
                        <div className="mb-1">
                            <select
                                aria-label={`Source for ${label}`}
                                value={sourceValue}
                                onChange={(e) => handleSourceChange(e.target.value)}
                                className={`${CONTROL_CLASS} text-xs`}
                            >
                                <option value="">Enter value manually</option>
                                {compatible.map((o) => (
                                    <option key={bindingKey(o)} value={bindingKey(o)}>
                                        Step {o.stepSeq} → {o.fieldName} ({o.type})
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : null}

                    {!isRef ? (
                        field.type === "enum" ? (
                            <select
                                id={fieldId}
                                value={rawLiteral === undefined || rawLiteral === null ? "" : String(rawLiteral)}
                                onChange={(e) => handleLiteralChange(e.target.value)}
                                aria-invalid={Boolean(error)}
                                className={CONTROL_CLASS}
                            >
                                <option value="">Select an option</option>
                                {(field.enum ?? []).map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                id={fieldId}
                                type={field.type === "number" ? "number" : "text"}
                                value={rawLiteral === undefined || rawLiteral === null ? "" : String(rawLiteral)}
                                onChange={(e) => handleLiteralChange(e.target.value)}
                                aria-invalid={Boolean(error)}
                                className={CONTROL_CLASS}
                            />
                        )
                    ) : (
                        <p className="rounded-xl border border-primary/10 bg-background/40 px-3 py-2 text-xs text-muted italic">
                            Value bound from prior step output.
                        </p>
                    )}
                </>
            )}

            {field.help && !isRef ? <p className="text-xs text-muted">{field.help}</p> : null}
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
        </div>
    );
}

// ─── StepCard ────────────────────────────────────────────────────────────────

export function StepCard({
    step,
    stepIndex,
    totalSteps,
    availableActions,
    priorStepOutputs,
    onChange,
    onRemove,
    onMoveUp,
    onMoveDown,
    bindingErrors = {},
}: StepCardProps): JSX.Element {
    const selectedAction = availableActions.find((t) => t.id === step.action_id);
    const schema = selectedAction?.variables ?? {};
    const hasFields = Object.keys(schema).length > 0;

    function handleActionChange(newActionId: number): void {
        onChange({
            ...step,
            action_id: newActionId,
            variable_bindings: {}, // reset bindings when action changes
        });
    }

    function handleOnFailureChange(checked: boolean): void {
        onChange({ ...step, on_failure: checked ? "stop" : ("continue" as AutomationOnFailure) });
    }

    function setFieldValue(fieldName: string, val: StepValue): void {
        onChange({
            ...step,
            variable_bindings: { ...step.variable_bindings, [fieldName]: val },
        });
    }

    return (
        <div className="rounded-xl border border-primary/20 bg-surface p-4 space-y-3">
            {/* ── Header ── */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-muted">
                        Step {step.sequence}
                    </span>
                    {selectedAction?.is_mutating ? (
                        <span
                            aria-label="Mutating action"
                            className="rounded border border-amber-400/40 bg-amber-400/10 px-1 text-[10px] text-amber-300"
                        >
                            mutating
                        </span>
                    ) : null}
                </div>

                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 cursor-pointer text-xs text-muted">
                        <input
                            type="checkbox"
                            aria-label="Stop on failure"
                            checked={step.on_failure === "stop"}
                            onChange={(e) => handleOnFailureChange(e.target.checked)}
                            className="rounded"
                        />
                        Stop on failure
                    </label>

                    <button
                        type="button"
                        aria-label="Move step up"
                        onClick={onMoveUp}
                        disabled={stepIndex === 0}
                        className={BTN_ICON_CLASS}
                    >
                        ▲
                    </button>
                    <button
                        type="button"
                        aria-label="Move step down"
                        onClick={onMoveDown}
                        disabled={stepIndex === totalSteps - 1}
                        className={BTN_ICON_CLASS}
                    >
                        ▼
                    </button>
                    <button
                        type="button"
                        aria-label="Remove step"
                        onClick={onRemove}
                        className={`${BTN_ICON_CLASS} text-red-400 hover:text-red-500`}
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* ── Action picker ── */}
            <div className="space-y-1">
                <label className="block text-sm font-medium text-text" htmlFor={`step-action-${stepIndex}`}>
                    Action<span className="ml-0.5 text-red-500">*</span>
                </label>
                <select
                    id={`step-action-${stepIndex}`}
                    value={step.action_id || ""}
                    onChange={(e) => handleActionChange(Number(e.target.value))}
                    className={CONTROL_CLASS}
                    aria-label={`Action for step ${step.sequence}`}
                >
                    <option value="">Select an action…</option>
                    {availableActions.map((t) => (
                        <option key={t.id} value={t.id}>
                            {t.name}
                            {t.is_mutating ? " (mutating)" : ""}
                            {t.op_type ? ` [${t.op_type}]` : ""}
                        </option>
                    ))}
                </select>
            </div>

            {/* ── Variable fields ── */}
            {selectedAction ? (
                <div className="space-y-3 rounded-xl border border-primary/10 bg-background/40 p-3">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted">
                        Step inputs
                    </p>
                    {hasFields ? (
                        Object.entries(schema).map(([fieldName, field]) => (
                            <StepFieldRow
                                key={fieldName}
                                fieldName={fieldName}
                                field={field}
                                value={step.variable_bindings[fieldName]}
                                priorStepOutputs={priorStepOutputs}
                                onChange={(val) => setFieldValue(fieldName, val)}
                                error={bindingErrors[fieldName]}
                            />
                        ))
                    ) : (
                        <p className="text-sm text-muted">This action has no configurable inputs.</p>
                    )}
                </div>
            ) : null}
        </div>
    );
}
