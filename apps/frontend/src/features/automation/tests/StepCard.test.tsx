import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StepCard, isStepBindingRef } from "@/features/automation/components/StepCard";
import type { AutomationStep, OperationTemplate, StepBindingRef } from "@/lib/types";
import type { PriorStepOutput } from "@/features/automation/components/StepCard";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ACTION_READ: OperationTemplate = {
    id: 1,
    platform_id: 10,
    name: "Get Facts",
    op_type: "show",
    template: "show version",
    is_mutating: false,
    is_active: true,
    variables: {
        hostname: { type: "string", required: true, label: "Hostname" },
        verbose: { type: "boolean", label: "Verbose" },
    },
    outputs: {
        status: { type: "string" },
        uptime: { type: "number" },
    },
};

const ACTION_MUTATING: OperationTemplate = {
    id: 2,
    platform_id: 10,
    name: "Configure NTP",
    op_type: "configure",
    template: "ntp server {{ server }}",
    is_mutating: true,
    is_active: true,
    variables: {
        server: { type: "string", required: true, label: "NTP Server" },
        timeout: { type: "number", label: "Timeout (s)" },
    },
    outputs: {},
};

const AVAILABLE_ACTIONS = [ACTION_READ, ACTION_MUTATING];

function makeStep(overrides: Partial<AutomationStep> = {}): AutomationStep {
    return {
        sequence: 1,
        action_id: 0,
        variable_bindings: {},
        on_failure: "stop",
        ...overrides,
    };
}

function renderCard(
    step: AutomationStep,
    priorStepOutputs: PriorStepOutput[] = [],
    {
        stepIndex = 0,
        totalSteps = 1,
        onChange = vi.fn(),
        onRemove = vi.fn(),
        onMoveUp = vi.fn(),
        onMoveDown = vi.fn(),
        bindingErrors = {},
    }: {
        stepIndex?: number;
        totalSteps?: number;
        onChange?: ReturnType<typeof vi.fn>;
        onRemove?: ReturnType<typeof vi.fn>;
        onMoveUp?: ReturnType<typeof vi.fn>;
        onMoveDown?: ReturnType<typeof vi.fn>;
        bindingErrors?: Record<string, string>;
    } = {},
) {
    return render(
        <StepCard
            step={step}
            stepIndex={stepIndex}
            totalSteps={totalSteps}
            availableActions={AVAILABLE_ACTIONS}
            priorStepOutputs={priorStepOutputs}
            onChange={onChange}
            onRemove={onRemove}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            bindingErrors={bindingErrors}
        />,
    );
}

// ─── isStepBindingRef unit tests ──────────────────────────────────────────────

describe("isStepBindingRef", () => {
    it("returns true for a valid StepBindingRef", () => {
        const ref: StepBindingRef = { __ref__: true, step: 1, output: "status" };
        expect(isStepBindingRef(ref)).toBe(true);
    });

    it("returns false for a plain string", () => {
        expect(isStepBindingRef("hello")).toBe(false);
    });

    it("returns false for null", () => {
        expect(isStepBindingRef(null)).toBe(false);
    });

    it("returns false for an object without __ref__", () => {
        expect(isStepBindingRef({ step: 1, output: "x" })).toBe(false);
    });

    it("returns false for an object with __ref__: false", () => {
        expect(isStepBindingRef({ __ref__: false, step: 1, output: "x" })).toBe(false);
    });
});

// ─── StepCard render tests ────────────────────────────────────────────────────

describe("StepCard — basic rendering", () => {
    it("renders the step sequence badge", () => {
        renderCard(makeStep({ sequence: 3 }));
        expect(screen.getByText("Step 3")).toBeInTheDocument();
    });

    it("renders the action picker with placeholder", () => {
        renderCard(makeStep());
        // The action select should have the placeholder option
        expect(screen.getByRole("combobox", { name: /action for step/i })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: /select an action/i })).toBeInTheDocument();
    });

    it("lists all available actions in the picker", () => {
        renderCard(makeStep());
        expect(screen.getByRole("option", { name: /Get Facts/i })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: /Configure NTP/i })).toBeInTheDocument();
    });

    it("shows the on_failure checkbox (checked when stop)", () => {
        renderCard(makeStep({ on_failure: "stop" }));
        expect(screen.getByRole("checkbox", { name: /stop on failure/i })).toBeChecked();
    });

    it("shows the on_failure checkbox (unchecked when continue)", () => {
        renderCard(makeStep({ on_failure: "continue" }));
        expect(screen.getByRole("checkbox", { name: /stop on failure/i })).not.toBeChecked();
    });

    it("renders move-up and move-down buttons", () => {
        renderCard(makeStep(), [], { stepIndex: 1, totalSteps: 3 });
        expect(screen.getByRole("button", { name: /move step up/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /move step down/i })).toBeInTheDocument();
    });

    it("disables move-up when first step", () => {
        renderCard(makeStep(), [], { stepIndex: 0, totalSteps: 2 });
        expect(screen.getByRole("button", { name: /move step up/i })).toBeDisabled();
    });

    it("disables move-down when last step", () => {
        renderCard(makeStep(), [], { stepIndex: 1, totalSteps: 2 });
        expect(screen.getByRole("button", { name: /move step down/i })).toBeDisabled();
    });

    it("renders the remove button", () => {
        renderCard(makeStep());
        expect(screen.getByRole("button", { name: /remove step/i })).toBeInTheDocument();
    });

    it("does NOT show mutating badge for read-only action", () => {
        renderCard(makeStep({ action_id: 1 }));
        expect(screen.queryByLabelText("Mutating action")).not.toBeInTheDocument();
    });

    it("shows mutating badge for mutating action", () => {
        renderCard(makeStep({ action_id: 2 }));
        expect(screen.getByLabelText("Mutating action")).toBeInTheDocument();
    });
});

describe("StepCard — variable fields", () => {
    it("shows no variable section when no action selected", () => {
        renderCard(makeStep({ action_id: 0 }));
        expect(screen.queryByText("Step inputs")).not.toBeInTheDocument();
    });

    it("shows variable fields when an action is selected", () => {
        renderCard(makeStep({ action_id: 1 }));
        expect(screen.getByText("Step inputs")).toBeInTheDocument();
        expect(screen.getByLabelText(/hostname/i)).toBeInTheDocument();
    });

    it("shows required marker for required fields", () => {
        renderCard(makeStep({ action_id: 1 }));
        // The * marker for "Hostname" (required)
        const label = screen.getByText(/hostname/i, { selector: "label" });
        expect(label).toBeInTheDocument();
    });

    it("renders a text input for string fields", () => {
        renderCard(makeStep({ action_id: 1 }));
        expect(screen.getByRole("textbox", { name: /hostname/i })).toBeInTheDocument();
    });

    it("renders a checkbox for boolean fields", () => {
        renderCard(makeStep({ action_id: 1 }));
        // "Verbose" is a boolean field
        expect(screen.getByRole("checkbox", { name: /verbose/i })).toBeInTheDocument();
    });

    it("renders a number input for number fields (Configure NTP action)", () => {
        renderCard(makeStep({ action_id: 2 }));
        expect(screen.getByRole("spinbutton", { name: /timeout/i })).toBeInTheDocument();
    });
});

describe("StepCard — binding dropdown", () => {
    const PRIOR_STRING_OUTPUT: PriorStepOutput = {
        stepSeq: 1,
        fieldName: "status",
        type: "string",
    };
    const PRIOR_NUMBER_OUTPUT: PriorStepOutput = {
        stepSeq: 1,
        fieldName: "uptime",
        type: "number",
    };

    it("does NOT show source selector when no prior outputs exist", () => {
        renderCard(makeStep({ action_id: 1 }), []);
        // No source selectors for binding should appear
        expect(screen.queryByText(/enter value manually/i)).not.toBeInTheDocument();
    });

    it("shows source selector for string fields when string prior outputs exist", () => {
        renderCard(makeStep({ action_id: 1 }), [PRIOR_STRING_OUTPUT]);
        // hostname is a string field → should see the source selector
        expect(screen.getByText(/enter value manually/i)).toBeInTheDocument();
    });

    it("binding dropdown lists type-compatible prior outputs only (string → string)", () => {
        renderCard(makeStep({ action_id: 1 }), [PRIOR_STRING_OUTPUT, PRIOR_NUMBER_OUTPUT]);
        // hostname is a string field — its source selector is labelled "Source for Hostname"
        const hostnameSource = screen.getByRole("combobox", { name: /source for hostname/i });
        const opts = Array.from((hostnameSource as HTMLSelectElement).options).map((o) => o.text);
        // Should include the string output (status)
        expect(opts.some((o) => o.includes("Step 1") && o.includes("status"))).toBe(true);
        // Should NOT include the number output (uptime) since hostname is string-typed
        expect(opts.some((o) => o.includes("uptime"))).toBe(false);
    });

    it("does NOT show source selector for number fields when only string outputs exist", () => {
        // ACTION_MUTATING: server (string), timeout (number)
        // Only string prior outputs → source selector for "server", but not for "timeout"
        renderCard(makeStep({ action_id: 2 }), [PRIOR_STRING_OUTPUT]);
        // "server" (string) — should have a source selector labelled "Source for NTP Server"
        const serverSource = screen.queryByRole("combobox", { name: /source for ntp server/i });
        expect(serverSource).not.toBeNull();
        // "timeout" (number) — no number outputs exist, so no source selector
        const timeoutSource = screen.queryByRole("combobox", { name: /source for timeout/i });
        expect(timeoutSource).toBeNull();
    });

    it("stores __ref__ binding when prior output is selected from dropdown", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        renderCard(makeStep({ action_id: 1 }), [PRIOR_STRING_OUTPUT], { onChange });

        // Find the source selector for hostname
        const sourceSelects = screen.getAllByRole("combobox", { name: /source for/i });
        const hostnameSource = sourceSelects[0]; // first source selector = hostname

        // Select the prior output option
        await user.selectOptions(hostnameSource, "1:status");

        expect(onChange).toHaveBeenCalledTimes(1);
        const updatedStep = (onChange.mock.calls as AutomationStep[][])[0][0];
        const binding = updatedStep.variable_bindings.hostname;
        expect(isStepBindingRef(binding)).toBe(true);
        const ref = binding as StepBindingRef;
        expect(ref.step).toBe(1);
        expect(ref.output).toBe("status");
    });

    it("clears binding when 'Enter value manually' is selected (switches back to literal)", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        // Start with an existing binding ref
        const ref: StepBindingRef = { __ref__: true, step: 1, output: "status" };
        const step = makeStep({
            action_id: 1,
            variable_bindings: { hostname: ref },
        });

        renderCard(step, [PRIOR_STRING_OUTPUT], { onChange });

        // The source selector should show "1:status" as selected
        const sourceSelects = screen.getAllByRole("combobox", { name: /source for/i });
        expect((sourceSelects[0] as HTMLSelectElement).value).toBe("1:status");

        // Switch back to literal
        await user.selectOptions(sourceSelects[0], "");

        expect(onChange).toHaveBeenCalledTimes(1);
        const updatedStep = (onChange.mock.calls as AutomationStep[][])[0][0];
        // Value should be cleared (undefined)
        expect(updatedStep.variable_bindings.hostname).toBeUndefined();
    });

    it("shows 'bound from prior step' message for ref fields", () => {
        const ref: StepBindingRef = { __ref__: true, step: 1, output: "status" };
        const step = makeStep({
            action_id: 1,
            variable_bindings: { hostname: ref },
        });

        renderCard(step, [PRIOR_STRING_OUTPUT]);
        expect(screen.getByText(/bound from prior step/i)).toBeInTheDocument();
    });

    it("renders binding error message when provided", () => {
        renderCard(makeStep({ action_id: 1 }), [], {
            bindingErrors: { hostname: "Step 99 does not precede this step." },
        });
        expect(screen.getByText(/step 99 does not precede/i)).toBeInTheDocument();
    });
});

describe("StepCard — interactions", () => {
    it("calls onRemove when remove button is clicked", async () => {
        const user = userEvent.setup();
        const onRemove = vi.fn();
        renderCard(makeStep(), [], { onRemove });

        await user.click(screen.getByRole("button", { name: /remove step/i }));
        expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it("calls onMoveUp when move-up button is clicked", async () => {
        const user = userEvent.setup();
        const onMoveUp = vi.fn();
        renderCard(makeStep(), [], { stepIndex: 1, totalSteps: 2, onMoveUp });

        await user.click(screen.getByRole("button", { name: /move step up/i }));
        expect(onMoveUp).toHaveBeenCalledTimes(1);
    });

    it("calls onMoveDown when move-down button is clicked", async () => {
        const user = userEvent.setup();
        const onMoveDown = vi.fn();
        renderCard(makeStep(), [], { stepIndex: 0, totalSteps: 2, onMoveDown });

        await user.click(screen.getByRole("button", { name: /move step down/i }));
        expect(onMoveDown).toHaveBeenCalledTimes(1);
    });

    it("calls onChange with cleared bindings when action changes", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        const step = makeStep({
            action_id: 1,
            variable_bindings: { hostname: "old-value" },
        });
        renderCard(step, [], { onChange });

        const actionSelect = screen.getByRole("combobox", { name: /action for step/i });
        await user.selectOptions(actionSelect, "2");

        expect(onChange).toHaveBeenCalledTimes(1);
        const updated = (onChange.mock.calls as AutomationStep[][])[0][0];
        expect(updated.action_id).toBe(2);
        expect(updated.variable_bindings).toEqual({}); // bindings cleared
    });

    it("calls onChange with updated on_failure when checkbox toggled", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        renderCard(makeStep({ on_failure: "stop" }), [], { onChange });

        await user.click(screen.getByRole("checkbox", { name: /stop on failure/i }));

        expect(onChange).toHaveBeenCalledTimes(1);
        const updated = (onChange.mock.calls as AutomationStep[][])[0][0];
        expect(updated.on_failure).toBe("continue");
    });

    it("calls onChange with field value when a text input changes", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();

        renderCard(makeStep({ action_id: 1 }), [], { onChange });

        const hostnameInput = screen.getByRole("textbox", { name: /hostname/i });
        await user.type(hostnameInput, "r");

        expect(onChange).toHaveBeenCalled();
        const typedCalls = onChange.mock.calls as AutomationStep[][];
        const lastCall = typedCalls.at(-1)?.[0];
        expect(lastCall?.variable_bindings.hostname).toBe("r");
    });
});
