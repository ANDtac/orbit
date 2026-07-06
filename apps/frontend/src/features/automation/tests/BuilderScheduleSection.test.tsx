/**
 * Tests for the schedule section embedded in AutomationBuilderPage
 * (only visible when a saved automation is loaded into the builder).
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { AutomationBuilderPage } from "@/features/automation/pages/AutomationBuilderPage";
import { renderWithProviders } from "@/tests/renderWithProviders";
import type { Automation, OperationTemplate, Schedule } from "@/lib/types";

// ─── API mocks ────────────────────────────────────────────────────────────────

vi.mock("@/features/automation/api/automations.api", () => ({
    fetchAutomations: vi.fn(),
    createAutomation: vi.fn(),
    updateAutomation: vi.fn(),
    deleteAutomation: vi.fn(),
    runAutomation: vi.fn(),
    testAutomation: vi.fn(),
}));

vi.mock("@/features/automation/api/schedules.api", () => ({
    fetchSchedules: vi.fn(),
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

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import {
    fetchAutomations,
    createAutomation,
} from "@/features/automation/api/automations.api";
import {
    fetchSchedules,
    createSchedule,
    fireSchedule,
} from "@/features/automation/api/schedules.api";
import { fetchOperationTemplates } from "@/features/admin/api/operationTemplates.api";
import { toast } from "sonner";
import { fetchDevices } from "@/features/devices/api/devices.api";
import { fetchPlatforms } from "@/features/devices/api/platforms.api";
import { fetchCredentialProfiles } from "@/features/devices/api/credentialProfiles.api";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_TEMPLATE: OperationTemplate = {
    id: 1,
    platform_id: 10,
    name: "Show Version",
    op_type: "show",
    template: "show version",
    is_mutating: false,
    is_active: true,
    variables: {},
};

const MOCK_AUTOMATION: Automation = {
    id: 10,
    name: "Check Versions",
    action_id: 1,
    variable_values: {},
    target: { device_ids: [1] },
    visibility: "private",
    on_failure: "stop",
    created_at: "2026-01-01T00:00:00Z",
};

const MOCK_SCHEDULE: Schedule = {
    id: 1,
    name: "Nightly",
    target_type: "automation",
    target_id: 10,
    cron_expr: "0 2 * * *",
    preset: "daily",
    next_run: "2026-07-06T02:00:00Z",
    enabled: true,
    timezone: "UTC",
};

const MOCK_DEVICES_PAGE = {
    data: [{ id: 1, name: "edge-1", fqdn: "edge-1.local", mgmt_ipv4: "10.0.0.1", platform_id: 10, credential_profile_id: 100, is_active: true }],
    page: { cursor: "0", size: 25, next: null, prev: null, total: 1 },
};

const MOCK_JOB = {
    id: 55,
    uuid: "job-55",
    job_type: "automation.run",
    status: "queued" as const,
    timestamps: {},
    tasks: [],
    events: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setupDefaultMocks() {
    vi.mocked(fetchAutomations).mockResolvedValue([MOCK_AUTOMATION]);
    vi.mocked(fetchOperationTemplates).mockResolvedValue([MOCK_TEMPLATE]);
    vi.mocked(fetchDevices).mockResolvedValue(MOCK_DEVICES_PAGE);
    vi.mocked(fetchPlatforms).mockResolvedValue([{ id: 10, slug: "cisco_xe", display_name: "Cisco XE" }]);
    vi.mocked(fetchCredentialProfiles).mockResolvedValue([{ id: 100, name: "Default SSH" }]);
    vi.mocked(createAutomation).mockResolvedValue(MOCK_AUTOMATION);
    vi.mocked(fetchSchedules).mockResolvedValue([]);
    vi.mocked(createSchedule).mockResolvedValue(MOCK_SCHEDULE);
    vi.mocked(fireSchedule).mockResolvedValue({ job: MOCK_JOB });
}

/** Click the automation row to open its builder (edit mode → has a saved id). */
async function openExistingAutomationBuilder() {
    const user = userEvent.setup();
    renderWithProviders(<AutomationBuilderPage />);
    // Wait for the list to load and show the automation
    const row = await screen.findByText("Check Versions");
    await user.click(row);
    return user;
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
    setupDefaultMocks();
});

afterEach(() => {
    vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Builder — schedule section (existing automation)", () => {
    it("shows the Schedules heading when editing a saved automation", async () => {
        await openExistingAutomationBuilder();
        expect(await screen.findByText("Schedules")).toBeInTheDocument();
    });

    it("shows the Add schedule button", async () => {
        await openExistingAutomationBuilder();
        expect(await screen.findByRole("button", { name: /add schedule/i })).toBeInTheDocument();
    });

    it("renders existing schedules from the API", async () => {
        vi.mocked(fetchSchedules).mockResolvedValue([MOCK_SCHEDULE]);
        await openExistingAutomationBuilder();
        // The preset label "Daily" should appear in the schedules table
        expect(await screen.findByText("Daily")).toBeInTheDocument();
    });

    it("does NOT show the Schedules section for a new (unsaved) automation", async () => {
        const user = userEvent.setup();
        renderWithProviders(<AutomationBuilderPage />);
        await user.click(await screen.findByRole("button", { name: "New Automation" }));
        // Schedules section should not be present yet
        await waitFor(() =>
            expect(screen.queryByRole("button", { name: /add schedule/i })).not.toBeInTheDocument(),
        );
    });

    it("opens the Add Schedule modal when the button is clicked", async () => {
        const user = await openExistingAutomationBuilder();
        await user.click(await screen.findByRole("button", { name: /add schedule/i }));
        const dialog = await screen.findByRole("dialog");
        expect(dialog).toBeInTheDocument();
        // The frequency select should be visible inside the modal
        expect(screen.getByLabelText(/frequency/i)).toBeInTheDocument();
    });

    it("submits the schedule form and closes the modal", async () => {
        const user = await openExistingAutomationBuilder();

        await user.click(await screen.findByRole("button", { name: /add schedule/i }));
        await screen.findByRole("dialog");

        // Select a preset
        await user.selectOptions(screen.getByLabelText(/frequency/i), "hourly");

        await user.click(screen.getByRole("button", { name: /create schedule/i }));

        await waitFor(() => expect(createSchedule).toHaveBeenCalledTimes(1));
        const payload = vi.mocked(createSchedule).mock.calls[0][0];
        expect(payload.preset).toBe("hourly");
        expect(payload.target_type).toBe("automation");
        expect(payload.target_id).toBe(MOCK_AUTOMATION.id);

        // Modal should close
        await waitFor(() =>
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );
    });

    it("calls fireSchedule and shows a success toast when Fire now is clicked", async () => {
        vi.mocked(fetchSchedules).mockResolvedValue([MOCK_SCHEDULE]);
        const user = await openExistingAutomationBuilder();

        await user.click(await screen.findByRole("button", { name: /fire now/i }));

        await waitFor(() => expect(fireSchedule).toHaveBeenCalledWith(MOCK_SCHEDULE.id));
        expect(toast.success).toHaveBeenCalled();
    });
});
