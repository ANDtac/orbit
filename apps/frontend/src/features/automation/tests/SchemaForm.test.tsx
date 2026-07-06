import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SchemaForm, validateSchemaForm } from "@/components/ui/SchemaForm";
import type { VariablesSchema } from "@/lib/types";

// ─── validateSchemaForm unit tests ───────────────────────────────────────────

describe("validateSchemaForm", () => {
    const schema: VariablesSchema = {
        hostname: { type: "string", required: true },
        timeout: { type: "number", required: false },
        protocol: { type: "enum", required: true, enum: ["ssh", "telnet"] },
        prefix: { type: "string", required: false, pattern: "^[A-Z]+" },
        enabled: { type: "boolean", required: false },
    };

    it("returns no errors for a valid value map", () => {
        const errors = validateSchemaForm(schema, {
            hostname: "router-1",
            timeout: 30,
            protocol: "ssh",
            prefix: "RTR",
            enabled: true,
        });
        expect(errors).toEqual({});
    });

    it("flags a missing required string field", () => {
        const errors = validateSchemaForm(schema, { protocol: "ssh" });
        expect(errors.hostname).toBeTruthy();
    });

    it("flags a missing required enum field", () => {
        const errors = validateSchemaForm(schema, { hostname: "r1" });
        expect(errors.protocol).toBeTruthy();
    });

    it("flags a non-numeric value for a number field", () => {
        const errors = validateSchemaForm(schema, {
            hostname: "r1",
            protocol: "ssh",
            timeout: "notanumber",
        });
        expect(errors.timeout).toBeTruthy();
    });

    it("accepts a numeric string for a number field", () => {
        const errors = validateSchemaForm(schema, {
            hostname: "r1",
            protocol: "ssh",
            timeout: "30",
        });
        expect(errors.timeout).toBeUndefined();
    });

    it("flags an out-of-enum value", () => {
        const errors = validateSchemaForm(schema, {
            hostname: "r1",
            protocol: "ftp",
        });
        expect(errors.protocol).toBeTruthy();
    });

    it("flags a string not matching the pattern", () => {
        const errors = validateSchemaForm(schema, {
            hostname: "r1",
            protocol: "ssh",
            prefix: "lowercase",
        });
        expect(errors.prefix).toBeTruthy();
    });

    it("does not error on boolean fields (always skipped)", () => {
        const errors = validateSchemaForm(
            { flag: { type: "boolean", required: true } },
            {},
        );
        expect(errors.flag).toBeUndefined();
    });
});

// ─── SchemaForm render tests ──────────────────────────────────────────────────

describe("SchemaForm", () => {
    it("renders a text input for a string field", () => {
        const schema: VariablesSchema = {
            hostname: { type: "string", required: true },
        };
        render(
            <SchemaForm
                schema={schema}
                value={{}}
                onChange={vi.fn()}
            />,
        );
        expect(screen.getByRole("textbox")).toBeInTheDocument();
        // Required marker
        expect(screen.getByText("*", { exact: false })).toBeInTheDocument();
    });

    it("renders a number input for a number field", () => {
        const schema: VariablesSchema = {
            timeout: { type: "number" },
        };
        render(
            <SchemaForm
                schema={schema}
                value={{ timeout: 30 }}
                onChange={vi.fn()}
            />,
        );
        const input = screen.getByRole("spinbutton");
        expect(input).toBeInTheDocument();
        expect((input as HTMLInputElement).value).toBe("30");
    });

    it("renders a checkbox for a boolean field", () => {
        const schema: VariablesSchema = {
            enabled: { type: "boolean" },
        };
        render(
            <SchemaForm
                schema={schema}
                value={{ enabled: true }}
                onChange={vi.fn()}
            />,
        );
        expect(screen.getByRole("checkbox")).toBeChecked();
    });

    it("renders a select for an enum field", () => {
        const schema: VariablesSchema = {
            protocol: { type: "enum", enum: ["ssh", "telnet"], required: true },
        };
        render(
            <SchemaForm
                schema={schema}
                value={{ protocol: "ssh" }}
                onChange={vi.fn()}
            />,
        );
        const select = screen.getByRole("combobox");
        expect(select).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "ssh" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "telnet" })).toBeInTheDocument();
    });

    it("displays validation error messages", () => {
        const schema: VariablesSchema = {
            hostname: { type: "string", required: true },
        };
        render(
            <SchemaForm
                schema={schema}
                value={{}}
                onChange={vi.fn()}
                errors={{ hostname: "hostname is required." }}
            />,
        );
        expect(screen.getByText("hostname is required.")).toBeInTheDocument();
    });

    it("calls onChange when a text input changes", async () => {
        const user = userEvent.setup();
        const handleChange = vi.fn();
        const schema: VariablesSchema = {
            hostname: { type: "string" },
        };
        render(
            <SchemaForm
                schema={schema}
                value={{ hostname: "" }}
                onChange={handleChange}
            />,
        );
        await user.type(screen.getByRole("textbox"), "r");
        expect(handleChange).toHaveBeenCalled();
    });

    it("shows empty-state message when schema has no fields", () => {
        render(
            <SchemaForm
                schema={{}}
                value={{}}
                onChange={vi.fn()}
            />,
        );
        expect(
            screen.getByText(/no configurable inputs/i),
        ).toBeInTheDocument();
    });

    it("renders a label hint when field.label is set", () => {
        const schema: VariablesSchema = {
            ip: { type: "string", label: "Management IP" },
        };
        render(
            <SchemaForm schema={schema} value={{}} onChange={vi.fn()} />,
        );
        expect(screen.getByText("Management IP")).toBeInTheDocument();
    });

    it("renders help text when field.help is set", () => {
        const schema: VariablesSchema = {
            vlan: { type: "number", help: "Enter a VLAN ID between 1 and 4094" },
        };
        render(
            <SchemaForm schema={schema} value={{}} onChange={vi.fn()} />,
        );
        expect(
            screen.getByText("Enter a VLAN ID between 1 and 4094"),
        ).toBeInTheDocument();
    });
});
