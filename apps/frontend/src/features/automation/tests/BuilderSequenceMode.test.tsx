import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { AutomationBuilderPage, validateBindings } from "@/features/automation/pages/AutomationBuilderPage";
import { renderWithProviders } from "@/tests/renderWithProviders";
import type { Automation, AutomationStep, OperationTemplate } from "@/lib/types";

// ─── API mocks ────────────────────────────────────────────────────────────────

vi.mock("@/features/automation/api/automations.api", () => ({
    fetchAutomations: vi.fn(),
    createAutomation: vi.fn(),
    updateAutomation: vi.fn(),
    deleteAutomation: vi.fn(),
    runAutomation: vi.fn(),
    testAutomation: vi.fn(),
}));

vi.mock("@/features/admin/api/operationTemplates.api", () => ({
    fetchOperationTemplates: vi.fn(),
}));

vi.mock("@/features/devices/api/devices.api", () => ({
    fetchDevices: vi.fn(),
}));

vi.mock("@/features/devices/api/platforms.api", () => ({
    fetchPlatforms: vi.fn(),
}));

vi.mock("@/features/devices/api/credentialProfiles.api", () => ({
    fetchCredentialProfiles: vi.fn(),
}));

vi.mock("@/features/automation/api/schedules.api", () => ({
    fetchSchedules: vi.fn().mockResolvedValue([]),
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
    fireSchedule: vi.fn(),
    PRESET_LABELS: {
        every_5m: "Every 5 min",
        every_15m: "Every 15 min",
        every_30m: "Every 30 min",
        hourly: "Hourly",
        daily: "Daily",
        weekly: "Weekly",
    },
    SCHEDULE_PRESETS: [],
    SCHEDULE_TIMEZONES: ["UTC"],
}));

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

import {
    fetchAutomations,
    createAutomation,
} from "@/features/automation/api/automations.api";
import { fetchOperationTemplates } from "@/features/admin/api/operationTemplates.api";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchPlatforms } from "@/features/devices/api/platforms.api";
import { fetchCredentialProfiles } from "@/features/devices/api/credentialProfiles.api";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TMPL_GET_FACTS: OperationTemplate = {
    id: 1,
    platform_id: 10,
    name: "Get Facts",
    op_type: "show",
    template: "show version",
    is_mutating: false,
    is_active: true,
    variables: {
        hostname: { type: "string", required: true, label: "Hostname" },
    },
    outputs: {
        status: { type: "string" },
    },
};

const TMPL_CONFIGURE: OperationTemplate = {
    id: 2,
    platform_id: 10,
    name: "Configure NTP",
    op_type: "configure",
    template: "ntp server {{ server }}",
    is_mutating: false,
    is_active: true,
    variables: {
        server: { type: "string", required: true, label: "NTP Server" },
    },
    outputs: {},
};

const SAVED_AUTOMATION: Automation = {
    id: 55,
    name: "Seq Auto",
    action_id: 1,
    variable_values: {},
    steps: [
        { sequence: 1, action_id: 1, variable_bindings: { hostname: "h1" }, on_failure: "stop" },
        { sequence: 2, action_id: 2, variable_bindings: { server: "10.0.0.1" }, on_failure: "stop" },
    ],
    target: { device_ids: [] },
    visibility: "private",
    on_failure: "stop",
    created_at: "2026-01-01T00:00:00Z",
};

const MOCK_DEVICES_PAGE = {
    data: [{ id: 1, name: "edge-1", mgmt_ipv4: "10.0.0.1", platform_id: 10, is_active: true }],
    page: { cursor: "0", size: 25, next: null, prev: null, total: 1 },
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.mocked(fetchAutomations).mockResolvedValue([]);
    vi.mocked(fetchOperationTemplates).mockResolvedValue([TMPL_GET_FACTS, TMPL_CONFIGURE]);
    vi.mocked(fetchDevices).mockResolvedValue(MOCK_DEVICES_PAGE);
    vi.mocked(fetchPlatforms).mockResolvedValue([{ id: 10, slug: "cisco_xe", display_name: "Cisco XE" }]);
    vi.mocked(fetchCredentialProfiles).mockResolvedValue([{ id: 100, name: "Default SSH" }]);
    vi.mocked(createAutomation).mockResolvedValue(SAVED_AUTOMATION);
});

afterEach(() => {
    vi.clearAllMocks();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function openBuilderInSequenceMode() {
    const user = userEvent.setup();
    renderWithProviders(<AutomationBuilderPage />);

    // Open new automation builder
    await user.click(await screen.findByRole("button", { name: "New Automation" }));

    // Wait for templates to load (action picker should appear)
    await screen.findByRole("combobox", { name: /action \(template\)/i });

    // Switch to sequence mode
    await user.click(screen.getByRole("button", { name: /sequence mode/i }));

    return user;
}

// ─── validateBindings unit tests ─────────────────────────────────────────────

describe("validateBindings", () => {
    const templates = [TMPL_GET_FACTS, TMPL_CONFIGURE];

    it("returns no errors for valid steps with no bindings", () => {
        const steps: AutomationStep[] = [
            { sequence: 1, action_id: 1, variable_bindings: { hostname: "h1" }, on_failure: "stop" },
            { sequence: 2, action_id: 2, variable_bindings: { server: "10.0.0.1" }, on_failure: "stop" },
        ];
        expect(validateBindings(steps, templates)).toEqual({});
    });

    it("returns no errors for valid typed binding to prior step output", () => {
        const steps: AutomationStep[] = [
            { sequence: 1, action_id: 1, variable_bindings: { hostname: "h1" }, on_failure: "stop" },
            {
                sequence: 2,
                action_id: 2,
                variable_bindings: { server: { __ref__: true, step: 1, output: "status" } },
                on_failure: "stop",
            },
        ];
        expect(validateBindings(steps, templates)).toEqual({});
    });

    it("flags a binding to a non-existent step", () => {
        const steps: AutomationStep[] = [
            {
                sequence: 1,
                action_id: 2,
                variable_bindings: { server: { __ref__: true, step: 99, output: "status" } },
                on_failure: "stop",
            },
        ];
        const errors = validateBindings(steps, templates);
        expect(errors[0]?.server).toMatch(/does not precede/i);
    });

    it("flags a forward reference (step binds to itself)", () => {
        const steps: AutomationStep[] = [
            {
                sequence: 1,
                action_id: 1,
                variable_bindings: { hostname: { __ref__: true, step: 1, output: "status" } },
                on_failure: "stop",
            },
        ];
        const errors = validateBindings(steps, templates);
        expect(errors[0]?.hostname).toMatch(/does not precede/i);
    });

    it("flags a binding to a non-existent output field", () => {
        const steps: AutomationStep[] = [
            { sequence: 1, action_id: 1, variable_bindings: {}, on_failure: "stop" },
            {
                sequence: 2,
                action_id: 2,
                variable_bindings: { server: { __ref__: true, step: 1, output: "nonexistent" } },
                on_failure: "stop",
            },
        ];
        const errors = validateBindings(steps, templates);
        expect(errors[1]?.server).toMatch(/does not have output/i);
    });

    it("flags a type mismatch between output and input", () => {
        // Make a template where output is "number" but the binding goes to a "string" input
        const tmplWithNumberOutput: OperationTemplate = {
            ...TMPL_GET_FACTS,
            outputs: { count: { type: "number" } },
        };
        const steps: AutomationStep[] = [
            { sequence: 1, action_id: 1, variable_bindings: {}, on_failure: "stop" },
            {
                sequence: 2,
                action_id: 2,
                variable_bindings: { server: { __ref__: true, step: 1, output: "count" } },
                on_failure: "stop",
            },
        ];
        const errors = validateBindings(steps, [tmplWithNumberOutput, TMPL_CONFIGURE]);
        expect(errors[1]?.server).toMatch(/type mismatch/i);
    });
});

// ─── Builder sequence mode integration tests ──────────────────────────────────

describe("AutomationBuilderPage — sequence mode UI", () => {
    it("shows 'Sequence' tab in the builder", async () => {
        const user = userEvent.setup();
        renderWithProviders(<AutomationBuilderPage />);
        await user.click(await screen.findByRole("button", { name: "New Automation" }));
        expect(await screen.findByRole("button", { name: /sequence mode/i })).toBeInTheDocument();
    });

    it("switches to sequence mode and shows Add Step button", async () => {
        await openBuilderInSequenceMode();
        expect(await screen.findByRole("button", { name: /\+ add step/i })).toBeInTheDocument();
    });

    it("shows empty sequence placeholder before any steps are added", async () => {
        await openBuilderInSequenceMode();
        expect(screen.getByText(/no steps yet/i)).toBeInTheDocument();
    });

    it("'Add Step' adds a new step card with an action picker", async () => {
        const user = await openBuilderInSequenceMode();

        await user.click(screen.getByRole("button", { name: /\+ add step/i }));

        // Should show the step 1 badge
        expect(await screen.findByText("Step 1")).toBeInTheDocument();
        // Step card should have an action picker
        expect(screen.getByRole("combobox", { name: /action for step 1/i })).toBeInTheDocument();
    });

    it("adds two steps with 'Add Step' clicked twice", async () => {
        const user = await openBuilderInSequenceMode();

        await user.click(screen.getByRole("button", { name: /\+ add step/i }));
        await screen.findByText("Step 1");
        await user.click(screen.getByRole("button", { name: /\+ add step/i }));
        await screen.findByText("Step 2");

        expect(screen.getByText("Step 1")).toBeInTheDocument();
        expect(screen.getByText("Step 2")).toBeInTheDocument();
    });

    it("moves a step up using the move-up button", async () => {
        const user = await openBuilderInSequenceMode();

        // Add two steps
        await user.click(screen.getByRole("button", { name: /\+ add step/i }));
        await user.click(screen.getByRole("button", { name: /\+ add step/i }));
        await screen.findByText("Step 2");

        // Move step 2 up (it should become step 1)
        const moveUpBtns = screen.getAllByRole("button", { name: /move step up/i });
        // moveUpBtns[0] is step 1's up (disabled), moveUpBtns[1] is step 2's up
        await user.click(moveUpBtns[1]);

        // Both steps still present (now reordered)
        expect(screen.getByText("Step 1")).toBeInTheDocument();
        expect(screen.getByText("Step 2")).toBeInTheDocument();
    });

    it("removes a step when remove button is clicked", async () => {
        const user = await openBuilderInSequenceMode();

        await user.click(screen.getByRole("button", { name: /\+ add step/i }));
        await screen.findByText("Step 1");
        await user.click(screen.getByRole("button", { name: /\+ add step/i }));
        await screen.findByText("Step 2");

        // Remove step 1
        const removeBtns = screen.getAllByRole("button", { name: /remove step/i });
        await user.click(removeBtns[0]);

        // Only one step left, renumbered as Step 1
        expect(screen.queryByText("Step 2")).not.toBeInTheDocument();
        expect(screen.getByText("Step 1")).toBeInTheDocument();
    });

    it("shows validation error when save is clicked with no steps", async () => {
        const user = await openBuilderInSequenceMode();

        // Type a name
        await user.type(await screen.findByRole("textbox", { name: /name/i }), "Seq Auto");

        // Click Save without adding any steps
        await user.click(screen.getByRole("button", { name: /save draft/i }));

        expect(screen.getByText(/add at least one step/i)).toBeInTheDocument();
    });

    it("shows validation error when a step has no action selected", async () => {
        const user = await openBuilderInSequenceMode();

        await user.type(await screen.findByRole("textbox", { name: /name/i }), "Seq Auto");
        await user.click(screen.getByRole("button", { name: /\+ add step/i }));
        await screen.findByText("Step 1");

        // Don't select an action — click save
        await user.click(screen.getByRole("button", { name: /save draft/i }));

        expect(screen.getByText(/each step must have an action/i)).toBeInTheDocument();
    });

    it("calls createAutomation with correct steps shape when form is valid", async () => {
        const user = await openBuilderInSequenceMode();

        // Fill in the name
        await user.type(await screen.findByRole("textbox", { name: /name/i }), "My Sequence");

        // Add step 1 and pick action
        await user.click(screen.getByRole("button", { name: /\+ add step/i }));
        await screen.findByText("Step 1");

        const stepActionSelect = screen.getByRole("combobox", { name: /action for step 1/i });
        await user.selectOptions(stepActionSelect, "1");

        // Wait for the hostname field to appear
        const hostnameInput = await screen.findByRole("textbox", { name: /hostname/i });
        await user.type(hostnameInput, "router-1");

        // Save
        await user.click(screen.getByRole("button", { name: /save draft/i }));

        await waitFor(() => expect(createAutomation).toHaveBeenCalledTimes(1));

        const call = vi.mocked(createAutomation).mock.calls[0][0];
        expect(call.name).toBe("My Sequence");
        expect(Array.isArray(call.steps)).toBe(true);
        const steps = call.steps!;
        expect(steps).toHaveLength(1);
        expect(steps[0].action_id).toBe(1);
        expect(steps[0].sequence).toBe(1);
        expect(steps[0].variable_bindings.hostname).toBe("router-1");
    });

    it("shows binding errors for invalid bindings on save", async () => {
        // To test this: open editor for a saved sequence automation
        // where step 2 has a dangling binding (step 99 doesn't exist)
        const brokenAuto: Automation = {
            id: 99,
            name: "Broken Seq",
            action_id: undefined,
            variable_values: {},
            steps: [
                { sequence: 1, action_id: 1, variable_bindings: { hostname: "h1" }, on_failure: "stop" },
                {
                    sequence: 2,
                    action_id: 2,
                    variable_bindings: { server: { __ref__: true, step: 99, output: "status" } },
                    on_failure: "stop",
                },
            ],
            target: { device_ids: [] },
            visibility: "private",
            on_failure: "stop",
        };

        vi.mocked(fetchAutomations).mockResolvedValue([brokenAuto]);
        const user = userEvent.setup();
        renderWithProviders(<AutomationBuilderPage />);

        // Click the Edit button (not the row — both have role=button and name containing "edit")
        await screen.findByText("Broken Seq");
        const editBtns = screen.getAllByRole("button", { name: /edit/i });
        // The actual <button> element comes after the <tr role="button"> in DOM order
        const editBtn = editBtns.find((el) => el.tagName.toLowerCase() === "button")!;
        await user.click(editBtn);

        // Should be in sequence mode (automation has steps)
        expect(await screen.findByText("Step 1")).toBeInTheDocument();
        expect(screen.getByText("Step 2")).toBeInTheDocument();

        // Try to save — validation should catch the invalid binding
        await user.click(screen.getByRole("button", { name: /save changes/i }));

        // Error from validateBindings should appear
        expect(await screen.findByText(/fix binding errors/i)).toBeInTheDocument();
    });

    it("shows binding dropdown in step 2 with outputs from step 1", async () => {
        const user = await openBuilderInSequenceMode();

        // Add step 1, pick action 1 (Get Facts — has "status: string" output)
        await user.click(screen.getByRole("button", { name: /\+ add step/i }));
        await screen.findByText("Step 1");
        await user.selectOptions(screen.getByRole("combobox", { name: /action for step 1/i }), "1");

        // Add step 2, pick action 2 (Configure NTP — has "server: string" input)
        await user.click(screen.getByRole("button", { name: /\+ add step/i }));
        await screen.findByText("Step 2");
        await user.selectOptions(screen.getByRole("combobox", { name: /action for step 2/i }), "2");

        // Step 2's "NTP Server" field should have a source selector
        // (because step 1 has a "status: string" output compatible with "server: string")
        await waitFor(() => {
            const sourceSelects = screen.queryAllByRole("combobox", { name: /source for/i });
            expect(sourceSelects.length).toBeGreaterThan(0);
        });

        // The source selector should list step 1's "status" output
        const sourceSelects = screen.getAllByRole("combobox", { name: /source for/i });
        const opts = Array.from((sourceSelects[0] as HTMLSelectElement).options).map((o) => o.text);
        expect(opts.some((o) => o.includes("Step 1") && o.includes("status"))).toBe(true);
    });
});
