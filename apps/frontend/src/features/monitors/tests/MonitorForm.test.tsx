import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

import { MonitorForm } from "@/features/monitors/components/MonitorForm";
import { renderWithProviders } from "@/tests/renderWithProviders";
import type { OperationTemplate } from "@/lib/types";

// ─── API mocks ────────────────────────────────────────────────────────────────

vi.mock("@/features/monitors/api/monitors.api", () => ({
    fetchMonitors: vi.fn(),
    createMonitor: vi.fn(),
    COMPARATOR_OPTIONS: [
        { value: "gt",  label: "> (greater than)" },
        { value: "lt",  label: "< (less than)" },
        { value: "gte", label: ">= (greater than or equal)" },
        { value: "lte", label: "<= (less than or equal)" },
        { value: "eq",  label: "= (equal)" },
        { value: "ne",  label: "≠ (not equal)" },
    ],
    COMPARATOR_LABELS: {
        gt: "> (greater than)",
        lt: "< (less than)",
        gte: ">= (greater than or equal)",
        lte: "<= (less than or equal)",
        eq: "= (equal)",
        ne: "≠ (not equal)",
    },
    VISIBILITY_OPTIONS: [
        { value: "private", label: "Private" },
        { value: "shared", label: "Shared" },
        { value: "role", label: "Role-based" },
    ],
}));

vi.mock("@/features/devices/api/devices.api", () => ({
    fetchDevices: vi.fn().mockResolvedValue({
        data: [],
        page: { cursor: "0", size: 25, total: 0, next: null, prev: null },
    }),
}));

vi.mock("@/features/devices/api/platforms.api", () => ({
    fetchPlatforms: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/devices/api/credentialProfiles.api", () => ({
    fetchCredentialProfiles: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/admin/api/operationTemplates.api", () => ({
    fetchOperationTemplates: vi.fn(),
}));

import { fetchOperationTemplates } from "@/features/admin/api/operationTemplates.api";

const READ_ONLY_TEMPLATE: OperationTemplate = {
    id: 10,
    platform_id: 1,
    name: "Show Version",
    op_type: "show",
    template: "show version",
    is_mutating: false,
    is_active: true,
    variables: { hostname: { type: "string", required: true, label: "Hostname" } },
    outputs: { cpu_pct: { type: "number" }, uptime: { type: "string" } },
};

const MUTATING_TEMPLATE: OperationTemplate = {
    id: 99,
    platform_id: 1,
    name: "Change Password",
    op_type: "change",
    template: "set password",
    is_mutating: true,
    is_active: true,
    variables: {},
    outputs: {},
};

describe("MonitorForm", () => {
    it("shows only non-mutating templates in the action picker", async () => {
        vi.mocked(fetchOperationTemplates).mockResolvedValue([
            READ_ONLY_TEMPLATE,
            MUTATING_TEMPLATE,
        ]);

        renderWithProviders(
            <MonitorForm
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
            />,
        );

        expect(await screen.findByText("Show Version")).toBeInTheDocument();
        expect(screen.queryByText("Change Password")).not.toBeInTheDocument();
    });

    it("populates metric dropdown from selected action outputs", async () => {
        vi.mocked(fetchOperationTemplates).mockResolvedValue([READ_ONLY_TEMPLATE]);

        renderWithProviders(
            <MonitorForm
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
            />,
        );

        const user = userEvent.setup();

        const actionSelect = await screen.findByRole("combobox", { name: /^action/i });

        // Wait for the async query to populate options before selecting
        await screen.findByRole("option", { name: "Show Version" });
        await user.selectOptions(actionSelect, "10");

        // Metric dropdown should now show the outputs from the selected action
        const metricSelect = await screen.findByRole("combobox", { name: /metric/i });
        await waitFor(() => {
            const options = Array.from(metricSelect.querySelectorAll("option")).map((o) => o.value);
            expect(options).toContain("cpu_pct");
            expect(options).toContain("uptime");
        });
    });

    it("calls onSubmit with correct payload when form is valid", async () => {
        vi.mocked(fetchOperationTemplates).mockResolvedValue([READ_ONLY_TEMPLATE]);

        const onSubmit = vi.fn();
        renderWithProviders(
            <MonitorForm
                onSubmit={onSubmit}
                onCancel={vi.fn()}
            />,
        );

        const user = userEvent.setup();

        await user.type(screen.getByLabelText(/^name/i), "My Monitor");

        // Select action — wait for the async query to populate options first
        const actionSelect = await screen.findByRole("combobox", { name: /^action/i });
        await screen.findByRole("option", { name: "Show Version" });
        await user.selectOptions(actionSelect, "10");

        // Fill schema field (hostname)
        const hostnameInput = await screen.findByLabelText(/hostname/i);
        await user.type(hostnameInput, "router-01");

        // Select metric - wait for outputs to populate
        const metricSelect = await screen.findByRole("combobox", { name: /metric/i });
        await waitFor(() => {
            const options = Array.from(metricSelect.querySelectorAll("option")).map((o) => o.value);
            expect(options).toContain("cpu_pct");
        });
        await user.selectOptions(metricSelect, "cpu_pct");

        // Select comparator
        const comparatorSelect = screen.getByRole("combobox", { name: /comparator/i });
        await user.selectOptions(comparatorSelect, "gt");

        // Submit
        await user.click(screen.getByRole("button", { name: /save monitor/i }));

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: "My Monitor",
                    action_id: 10,
                    metric: "cpu_pct",
                    comparator: "gt",
                }),
            );
        });
    });

    it("shows validation error when name is missing", async () => {
        vi.mocked(fetchOperationTemplates).mockResolvedValue([READ_ONLY_TEMPLATE]);

        renderWithProviders(
            <MonitorForm
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
            />,
        );

        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: /save monitor/i }));

        expect(await screen.findByText("Name is required.")).toBeInTheDocument();
    });
});
