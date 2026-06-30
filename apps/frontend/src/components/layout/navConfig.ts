import type { ComponentType, SVGProps } from "react";

export interface NavItem {
    label: string;
    to: string;
    icon?: string;
    children?: NavItem[];
    placeholder?: boolean;
    roles?: string[];
    end?: boolean;
}

export interface NavSection {
    label: string;
    to: string;
    icon: string;
    children?: NavItem[];
    placeholder?: boolean;
    roles?: string[];
    end?: boolean;
}

export const navConfig: NavSection[] = [
    {
        label: "Overview",
        to: "/",
        icon: "dashboard",
        end: true,
    },
    {
        label: "Inventory",
        to: "/inventory/devices",
        icon: "inventory",
        children: [
            { label: "Devices", to: "/inventory/devices" },
        ],
    },
    {
        label: "Monitoring",
        to: "/monitoring",
        icon: "monitoring",
        children: [
            { label: "Overview", to: "/monitoring", end: true },
            { label: "Jobs", to: "/monitoring/jobs" },
            { label: "Policies", to: "/monitoring/policies" },
            { label: "Logs", to: "/monitoring/logs" },
            { label: "Health", to: "/monitoring/health" },
            { label: "Probes", to: "/monitoring/probes" },
            { label: "Alerts", to: "/monitoring/alerts" },
        ],
    },
    {
        label: "Operations",
        to: "/operations/password-change",
        icon: "operations",
        children: [
            { label: "Password Changes", to: "/operations/password-change" },
            { label: "Templates", to: "/operations/templates" },
            { label: "Jobs", to: "/operations/jobs" },
            { label: "Snapshots", to: "/operations/snapshots" },
        ],
    },
    {
        label: "Compliance",
        to: "/compliance/policies",
        icon: "compliance",
        children: [
            { label: "Policies", to: "/compliance/policies" },
            { label: "Results", to: "/compliance/results" },
        ],
    },
    {
        label: "Lifecycle",
        to: "/lifecycle/hardware",
        icon: "lifecycle",
        children: [
            { label: "Hardware EoX", to: "/lifecycle/hardware" },
            { label: "Software EoX", to: "/lifecycle/software" },
        ],
    },
    {
        label: "Admin",
        to: "/admin/platforms",
        icon: "admin",
        roles: ["owner", "admin"],
        children: [
            { label: "Platforms", to: "/admin/platforms" },
            { label: "Credentials", to: "/admin/credentials" },
            { label: "Audit", to: "/admin/audit" },
        ],
    },
];
