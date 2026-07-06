import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ScheduleForm } from "@/features/automation/components/ScheduleForm";
import { SCHEDULE_PRESETS, SCHEDULE_TIMEZONES } from "@/features/automation/api/schedules.api";
import { renderWithProviders } from "@/tests/renderWithProviders";
import type { ScheduleCreateInput } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderForm(onSubmit = vi.fn(), onCancel = vi.fn()) {
    renderWithProviders(
        <ScheduleForm
            targetType="automation"
            targetId={10}
            onSubmit={onSubmit}
            onCancel={onCancel}
        />,
    );
    return { onSubmit, onCancel };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ScheduleForm — field rendering", () => {
    it("renders the frequency select with all preset options", () => {
        renderForm();
        expect(screen.getByLabelText(/frequency/i)).toBeInTheDocument();
        for (const preset of SCHEDULE_PRESETS) {
            expect(screen.getByRole("option", { name: preset.label })).toBeInTheDocument();
        }
    });

    it("renders the timezone select with expected options", () => {
        renderForm();
        expect(screen.getByLabelText(/timezone/i)).toBeInTheDocument();
        for (const tz of SCHEDULE_TIMEZONES) {
            expect(screen.getByRole("option", { name: tz })).toBeInTheDocument();
        }
    });

    it("renders the enabled toggle defaulting to enabled", () => {
        renderForm();
        const toggle = screen.getByRole("switch", { name: /enabled/i });
        expect(toggle).toHaveAttribute("aria-checked", "true");
    });

    it("renders an optional name field", () => {
        renderForm();
        expect(screen.getByLabelText(/schedule name/i)).toBeInTheDocument();
    });

    it("renders Cancel and Save schedule buttons", () => {
        renderForm();
        expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /save schedule/i })).toBeInTheDocument();
    });
});

describe("ScheduleForm — validation", () => {
    it("shows an error and does NOT call onSubmit when preset is empty", async () => {
        const user = userEvent.setup();
        const { onSubmit } = renderForm();

        await user.click(screen.getByRole("button", { name: /save schedule/i }));

        expect(await screen.findByText(/frequency is required/i)).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("clears the error after a preset is selected", async () => {
        const user = userEvent.setup();
        renderForm();

        // Trigger validation error
        await user.click(screen.getByRole("button", { name: /save schedule/i }));
        expect(await screen.findByText(/frequency is required/i)).toBeInTheDocument();

        // Select a preset
        await user.selectOptions(screen.getByLabelText(/frequency/i), "hourly");

        // Submit successfully — the error message should be gone
        await user.click(screen.getByRole("button", { name: /save schedule/i }));
        await waitFor(() =>
            expect(screen.queryByText(/frequency is required/i)).not.toBeInTheDocument(),
        );
    });
});

describe("ScheduleForm — submission", () => {
    it("calls onSubmit with correct payload including target context", async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn<[ScheduleCreateInput], void>();
        renderWithProviders(
            <ScheduleForm
                targetType="automation"
                targetId={42}
                onSubmit={onSubmit}
                onCancel={vi.fn()}
            />,
        );

        await user.type(screen.getByLabelText(/schedule name/i), "Weekly check");
        await user.selectOptions(screen.getByLabelText(/frequency/i), "weekly");
        await user.selectOptions(screen.getByLabelText(/timezone/i), "America/New_York");

        await user.click(screen.getByRole("button", { name: /save schedule/i }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
        const payload = onSubmit.mock.calls[0][0];
        expect(payload.preset).toBe("weekly");
        expect(payload.timezone).toBe("America/New_York");
        expect(payload.target_type).toBe("automation");
        expect(payload.target_id).toBe(42);
        expect(payload.name).toBe("Weekly check");
        expect(payload.enabled).toBe(true);
    });

    it("calls onSubmit without a name when name is blank", async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn<[ScheduleCreateInput], void>();
        renderWithProviders(
            <ScheduleForm
                targetType="automation"
                targetId={5}
                onSubmit={onSubmit}
                onCancel={vi.fn()}
            />,
        );

        await user.selectOptions(screen.getByLabelText(/frequency/i), "hourly");
        await user.click(screen.getByRole("button", { name: /save schedule/i }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
        expect(onSubmit.mock.calls[0][0].name).toBeUndefined();
    });

    it("calls onCancel when Cancel is clicked", async () => {
        const user = userEvent.setup();
        const onCancel = vi.fn();
        renderWithProviders(
            <ScheduleForm
                targetType="automation"
                targetId={5}
                onSubmit={vi.fn()}
                onCancel={onCancel}
            />,
        );

        await user.click(screen.getByRole("button", { name: /cancel/i }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("toggles the enabled switch", async () => {
        const user = userEvent.setup();
        renderForm();

        const toggle = screen.getByRole("switch", { name: /enabled/i });
        expect(toggle).toHaveAttribute("aria-checked", "true");

        await user.click(toggle);
        expect(toggle).toHaveAttribute("aria-checked", "false");

        await user.click(toggle);
        expect(toggle).toHaveAttribute("aria-checked", "true");
    });

    it("shows custom submitLabel when provided", () => {
        renderWithProviders(
            <ScheduleForm
                targetType="automation"
                targetId={1}
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
                submitLabel="Create schedule"
            />,
        );
        expect(screen.getByRole("button", { name: "Create schedule" })).toBeInTheDocument();
    });

    it("disables submit button while isSubmitting", () => {
        renderWithProviders(
            <ScheduleForm
                targetType="automation"
                targetId={1}
                onSubmit={vi.fn()}
                onCancel={vi.fn()}
                isSubmitting
            />,
        );
        expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    });
});
