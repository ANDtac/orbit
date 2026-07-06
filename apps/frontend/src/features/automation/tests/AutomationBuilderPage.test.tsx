import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { AutomationBuilderPage } from "@/features/automation/pages/AutomationBuilderPage";
import { renderWithProviders } from "@/tests/renderWithProviders";

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
        every_5m:  "Every 5 min",
        every_15m: "Every 15 min",
        every_30m: "Every 30 min",
        hourly:    "Hourly",
        daily:     "Daily",
        weekly:    "Weekly",
    },
    SCHEDULE_PRESETS: [
        { value: "every_5m",  label: "Every 5 min" },
        { value: "every_15m", label: "Every 15 min" },
        { value: "every_30m", label: "Every 30 min" },
        { value: "hourly",    label: "Hourly" },
        { value: "daily",     label: "Daily" },
        { value: "weekly",    label: "Weekly" },
    ],
    SCHEDULE_TIMEZONES: [
        "UTC", "America/New_York", "America/Chicago", "America/Los_Angeles",
        "America/Denver", "Europe/London", "Europe/Berlin", "Europe/Paris",
        "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney",
    ],
}));

// Silence sonner toasts in tests
vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

import {
    fetchAutomations,
    createAutomation,
    testAutomation,
    runAutomation,
} from "@/features/automation/api/automations.api";
import { fetchOperationTemplates } from "@/features/admin/api/operationTemplates.api";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchPlatforms } from "@/features/devices/api/platforms.api";
import { fetchCredentialProfiles } from "@/features/devices/api/credentialProfiles.api";
import type {
    Automation,
    AutomationDryRunResult,
    OperationTemplate,
} from "@/lib/types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_TEMPLATE_READ_ONLY: OperationTemplate = {
    id: 1,
    platform_id: 10,
    name: "Show Version",
    op_type: "show",
    template: "show version",
    is_mutating: false,
    is_active: true,
    variables: {
        interface_name: { type: "string", required: true, label: "Interface Name" },
    },
};

const MOCK_TEMPLATE_MUTATING: OperationTemplate = {
    id: 2,
    platform_id: 10,
    name: "Configure NTP",
    op_type: "configure",
    template: "ntp server {{ ntp_server }}",
    is_mutating: true,
    is_active: true,
    variables: {
        ntp_server: { type: "string", required: true, label: "NTP Server" },
    },
};

const MOCK_AUTOMATION: Automation = {
    id: 10,
    name: "Check Versions",
    action_id: 1,
    variable_values: { interface_name: "Gi0/0" },
    target: { device_ids: [1] },
    visibility: "private",
    on_failure: "stop",
    created_at: "2026-01-01T00:00:00Z",
};

const MOCK_DRY_RUN_OK: AutomationDryRunResult = {
    ok: true,
    device_id: 1,
    host: "10.0.0.1",
    latency_ms: 42,
    fields: { version: "17.9.1" },
    field_errors: {},
};

const MOCK_DRY_RUN_WITH_DIFF: AutomationDryRunResult = {
    ok: true,
    device_id: 1,
    host: "10.0.0.1",
    latency_ms: 55,
    fields: {},
    field_errors: {},
    diff: "- ntp server 10.0.0.1\n+ ntp server 10.0.0.2",
};

const MOCK_DEVICES_PAGE = {
    data: [
        {
            id: 1,
            name: "edge-1",
            fqdn: "edge-1.local",
            mgmt_ipv4: "10.0.0.1",
            platform_id: 10,
            credential_profile_id: 100,
            is_active: true,
        },
    ],
    page: { cursor: "0", size: 25, next: null, prev: null, total: 1 },
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.mocked(fetchAutomations).mockResolvedValue([]);
    vi.mocked(fetchOperationTemplates).mockResolvedValue([
        MOCK_TEMPLATE_READ_ONLY,
        MOCK_TEMPLATE_MUTATING,
    ]);
    vi.mocked(fetchDevices).mockResolvedValue(MOCK_DEVICES_PAGE);
    vi.mocked(fetchPlatforms).mockResolvedValue([
        { id: 10, slug: "cisco_xe", display_name: "Cisco XE" },
    ]);
    vi.mocked(fetchCredentialProfiles).mockResolvedValue([
        { id: 100, name: "Default SSH" },
    ]);
    vi.mocked(createAutomation).mockResolvedValue(MOCK_AUTOMATION);
    vi.mocked(testAutomation).mockResolvedValue(MOCK_DRY_RUN_OK);
    vi.mocked(runAutomation).mockResolvedValue({ job: { id: 99, uuid: "j-99", job_type: "automation.run", status: "queued", timestamps: {}, tasks: [], events: [] }, enqueued: true });
});

afterEach(() => {
    vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AutomationBuilderPage — list view", () => {
    it("renders the New Automation button", async () => {
        renderWithProviders(<AutomationBuilderPage />);
        expect(await screen.findByRole("button", { name: "New Automation" })).toBeInTheDocument();
    });

    it("opens the builder when New Automation is clicked", async () => {
        const user = userEvent.setup();
        renderWithProviders(<AutomationBuilderPage />);
        await user.click(await screen.findByRole("button", { name: "New Automation" }));
        expect(screen.getByText("New Automation", { selector: "h2" })).toBeInTheDocument();
    });

    it("shows existing automations in the table", async () => {
        vi.mocked(fetchAutomations).mockResolvedValue([MOCK_AUTOMATION]);
        renderWithProviders(<AutomationBuilderPage />);
        expect(await screen.findByText("Check Versions")).toBeInTheDocument();
    });
});

describe("AutomationBuilderPage — builder form", () => {
    async function openBuilder() {
        const user = userEvent.setup();
        renderWithProviders(<AutomationBuilderPage />);
        await user.click(await screen.findByRole("button", { name: "New Automation" }));
        // Wait for template options to load: the action select starts with only
        // a placeholder; once the query resolves it gains "Show Version" etc.
        // We wait for a specific option value to be present in the select element.
        const actionSelect = await screen.findByLabelText(/action \(template\)/i);
        await waitFor(() => {
            // The select should have > 1 option once templates have loaded
            const opts = Array.from((actionSelect as HTMLSelectElement).options);
            expect(opts.length).toBeGreaterThan(1);
        });
        return user;
    }

    /** Selects an action by its value id in the action combobox. */
    async function pickAction(user: ReturnType<typeof userEvent.setup>, value: string) {
        const actionSelect = screen.getByLabelText(/action \(template\)/i);
        await user.selectOptions(actionSelect, value);
    }

    it("shows variable fields when an action is selected", async () => {
        const user = await openBuilder();

        // Select action "1" (Show Version) by value
        await pickAction(user, "1");

        // The SchemaForm should now render the interface_name field —
        // use findByRole since findByLabelText with aria-hidden * is unreliable in jsdom
        expect(await screen.findByText("Interface Name")).toBeInTheDocument();
        // The corresponding text input should also appear
        expect(await screen.findByRole("textbox", { name: /interface name/i })).toBeInTheDocument();
    });

    it("shows validation error if name is empty on save", async () => {
        const user = await openBuilder();

        // Click save without filling name
        await user.click(screen.getByRole("button", { name: "Save draft" }));

        expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    });

    it("saves and then calls testAutomation when Test button is clicked", async () => {
        const user = await openBuilder();

        // Fill in name
        await user.type(
            await screen.findByRole("textbox", { name: /name/i }),
            "My Test Auto",
        );
        // Pick action 1 (Show Version)
        await pickAction(user, "1");

        // Fill in the required variable via its text input (find by id directly)
        const interfaceInput = await screen.findByRole("textbox", { name: /interface name/i });
        await user.type(interfaceInput, "Gi0/0");

        // Click Save draft — creates the automation
        await user.click(screen.getByRole("button", { name: "Save draft" }));
        await waitFor(() => expect(createAutomation).toHaveBeenCalledTimes(1));

        // Test button should now be enabled
        const testBtn = screen.getByRole("button", { name: "Test on one device" });
        await user.click(testBtn);

        await waitFor(() => expect(testAutomation).toHaveBeenCalledTimes(1));

        // Test result modal should appear
        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("Test passed")).toBeInTheDocument();
    });

    it("shows diff block for mutating action test result", async () => {
        vi.mocked(testAutomation).mockResolvedValue(MOCK_DRY_RUN_WITH_DIFF);
        const user = await openBuilder();

        await user.type(
            await screen.findByRole("textbox", { name: /name/i }),
            "NTP Config",
        );
        // Select mutating action (id=2) by value
        await pickAction(user, "2");

        // Fill the ntp_server field
        const ntpInput = await screen.findByRole("textbox", { name: /ntp server/i });
        await user.type(ntpInput, "10.0.0.2");

        await user.click(screen.getByRole("button", { name: "Save draft" }));
        await waitFor(() => expect(createAutomation).toHaveBeenCalledTimes(1));

        await user.click(screen.getByRole("button", { name: "Test on one device" }));
        await waitFor(() => expect(testAutomation).toHaveBeenCalledTimes(1));

        // Diff block should appear in the modal
        expect(await screen.findByText(/Configuration diff/i)).toBeInTheDocument();
        // The diff contains "ntp server" lines — check at least one appears
        expect(screen.getAllByText(/ntp server/).length).toBeGreaterThan(0);
    });

    it("enables Run after a successful test for a non-mutating action", async () => {
        const user = await openBuilder();

        await user.type(
            await screen.findByRole("textbox", { name: /name/i }),
            "Show Ver",
        );
        await pickAction(user, "1");

        const interfaceInput = await screen.findByRole("textbox", { name: /interface name/i });
        await user.type(interfaceInput, "Gi0/1");

        await user.click(screen.getByRole("button", { name: "Save draft" }));
        await waitFor(() => expect(createAutomation).toHaveBeenCalledTimes(1));

        // Run should already be enabled for non-mutating actions
        expect(screen.getByRole("button", { name: "Run" })).not.toBeDisabled();
    });

    it("calls runAutomation when Run is clicked (non-mutating)", async () => {
        const user = await openBuilder();

        await user.type(
            await screen.findByRole("textbox", { name: /name/i }),
            "Show Ver",
        );
        await pickAction(user, "1");

        const interfaceInput = await screen.findByRole("textbox", { name: /interface name/i });
        await user.type(interfaceInput, "Gi0/1");

        await user.click(screen.getByRole("button", { name: "Save draft" }));
        await waitFor(() => expect(createAutomation).toHaveBeenCalledTimes(1));

        await user.click(screen.getByRole("button", { name: "Run" }));
        await waitFor(() => expect(runAutomation).toHaveBeenCalledWith(MOCK_AUTOMATION.id));
    });

    it("disables Run for mutating action until test passes", async () => {
        const user = await openBuilder();

        await user.type(
            await screen.findByRole("textbox", { name: /name/i }),
            "NTP Config",
        );
        await pickAction(user, "2");

        const ntpInput = await screen.findByRole("textbox", { name: /ntp server/i });
        await user.type(ntpInput, "10.0.0.2");

        await user.click(screen.getByRole("button", { name: "Save draft" }));
        await waitFor(() => expect(createAutomation).toHaveBeenCalledTimes(1));

        // Run should be disabled before test (mutating action)
        expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();

        // Run the dry-run test
        await user.click(screen.getByRole("button", { name: "Test on one device" }));
        await waitFor(() => expect(testAutomation).toHaveBeenCalledTimes(1));

        // Close the test result modal
        await user.click(await screen.findByRole("button", { name: "Cancel run" }));

        // Run should now be enabled
        expect(screen.getByRole("button", { name: "Run" })).not.toBeDisabled();
    });

    it("calls runAutomation from the test modal confirm button for a mutating action", async () => {
        vi.mocked(testAutomation).mockResolvedValue(MOCK_DRY_RUN_WITH_DIFF);
        const user = await openBuilder();

        await user.type(
            await screen.findByRole("textbox", { name: /name/i }),
            "NTP Config",
        );
        await pickAction(user, "2");

        const ntpInput = await screen.findByRole("textbox", { name: /ntp server/i });
        await user.type(ntpInput, "10.0.0.2");

        await user.click(screen.getByRole("button", { name: "Save draft" }));
        await waitFor(() => expect(createAutomation).toHaveBeenCalledTimes(1));

        await user.click(screen.getByRole("button", { name: "Test on one device" }));
        await waitFor(() => expect(testAutomation).toHaveBeenCalledTimes(1));

        // Click "Confirm and run" inside the diff modal
        await user.click(await screen.findByRole("button", { name: "Confirm and run" }));
        await waitFor(() => expect(runAutomation).toHaveBeenCalledTimes(1));
    });
});
