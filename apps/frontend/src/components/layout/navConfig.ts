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
        label: "Dashboards",
        to: "/dashboards",
        icon: "charts",
        end: true,
    },
    {
        label: "Inventory",
        to: "/inventory/devices",
        icon: "inventory",
        children: [
            { label: "Devices", to: "/inventory/devices" },
            { label: "Configurations", to: "/inventory/configurations" },
            { label: "Hardware EoX", to: "/inventory/lifecycle/hardware" },
            { label: "Software EoX", to: "/inventory/lifecycle/software" },
        ],
    },
    {
        label: "Monitoring",
        to: "/monitoring/health",
        icon: "monitoring",
        children: [
            { label: "Health", to: "/monitoring/health" },
            { label: "Monitors", to: "/monitoring/monitors" },
        ],
    },
    {
        label: "Automation",
        to: "/automation/builder",
        icon: "operations",
        children: [
            { label: "Templates", to: "/admin/templates" },
            { label: "Builder", to: "/automation/builder" },
            { label: "Schedules", to: "/automation/schedules" },
            { label: "Password Changes", to: "/operations/password-change" },
            { label: "Runs", to: "/automation/runs" },
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
        label: "Admin",
        to: "/admin/platforms",
        icon: "admin",
        roles: ["owner", "admin"],
        children: [
            { label: "Platforms", to: "/admin/platforms" },
            { label: "Credentials", to: "/admin/credentials" },
            { label: "Templates", to: "/admin/templates" },
            { label: "System Logs", to: "/admin/system-logs" },
            { label: "Audit", to: "/admin/audit" },
        ],
    },
];
