import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import clsx from "clsx";

import { navConfig } from "./navConfig";
import { navIcons } from "./navIcons";
import type { NavSection } from "./navConfig";
import { useAuthorization } from "@/hooks/useAuthorization";
import type { Role } from "@/lib/roles";

interface SidebarProps {
    collapsed: boolean;
    onToggleCollapse: () => void;
    mobileOpen: boolean;
    onMobileClose: () => void;
}

export function Sidebar({
    collapsed,
    onToggleCollapse,
    mobileOpen,
    onMobileClose,
}: SidebarProps): JSX.Element {
    const { pathname } = useLocation();
    const { hasRole } = useAuthorization();
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    const visibleNavConfig = useMemo(
        () =>
            navConfig
                .filter((section) => !section.roles || hasRole(section.roles as Role[]))
                .map((section) => ({
                    ...section,
                    children: section.children?.filter((child) => !child.roles || hasRole(child.roles as Role[])),
                }))
                .filter((section) => !section.children || section.children.length > 0),
        [hasRole],
    );

    useEffect(() => {
        const active = visibleNavConfig.find(
            (section) =>
                pathname === section.to ||
                section.children?.some((child) => pathname.startsWith(child.to)),
        );
        if (active?.children) {
            setExpandedSections((prev) => {
                const next = new Set(prev);
                next.add(active.label);
                return next;
            });
        }
    }, [pathname, visibleNavConfig]);

    function toggleSection(label: string) {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(label)) {
                next.delete(label);
            } else {
                next.add(label);
            }
            return next;
        });
    }

    function isSectionActive(section: NavSection): boolean {
        if (section.end) return pathname === section.to;
        if (section.children) {
            return section.children.some((child) =>
                child.end ? pathname === child.to : pathname.startsWith(child.to),
            );
        }
        return pathname.startsWith(section.to);
    }

    const sidebarContent = (
        <nav className="flex h-full flex-col" aria-label="Main navigation">
            <div className="flex-1 overflow-y-auto px-2 py-3">
                <ul className="space-y-0.5">
                    {visibleNavConfig.map((section) => {
                        const IconComponent = navIcons[section.icon];
                        const isActive = isSectionActive(section);
                        const isExpanded = expandedSections.has(section.label);
                        const hasChildren = section.children && section.children.length > 0;

                        return (
                            <li key={section.label}>
                                {hasChildren ? (
                                    <>
                                        <button
                                            onClick={() => toggleSection(section.label)}
                                            className={clsx(
                                                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                                isActive
                                                    ? "bg-primary/10 text-primary"
                                                    : "text-text hover:bg-primary/5 hover:text-primary",
                                                collapsed && "justify-center px-2",
                                            )}
                                            title={collapsed ? section.label : undefined}
                                        >
                                            {IconComponent ? (
                                                <IconComponent className="h-5 w-5 shrink-0" />
                                            ) : null}
                                            {!collapsed && (
                                                <>
                                                    <span className="flex-1 text-left">
                                                        {section.label}
                                                    </span>
                                                    <svg
                                                        className={clsx(
                                                            "h-4 w-4 shrink-0 transition-transform",
                                                            isExpanded && "rotate-180",
                                                        )}
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth={2}
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    >
                                                        <path d="M6 9l6 6 6-6" />
                                                    </svg>
                                                </>
                                            )}
                                        </button>
                                        {!collapsed && isExpanded && (
                                            <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-primary/10 pl-3">
                                                {section.children!.map((child) => (
                                                    <li key={child.to}>
                                                        <NavLink
                                                            to={child.to}
                                                            end={child.end}
                                                            onClick={onMobileClose}
                                                            className={({ isActive: linkActive }) =>
                                                                clsx(
                                                                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                                                                    linkActive
                                                                        ? "bg-primary/10 font-medium text-primary"
                                                                        : "text-muted hover:bg-primary/5 hover:text-text",
                                                                    child.placeholder &&
                                                                        "opacity-60",
                                                                )
                                                            }
                                                        >
                                                            {child.label}
                                                            {child.placeholder && (
                                                                <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">
                                                                    Soon
                                                                </span>
                                                            )}
                                                        </NavLink>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </>
                                ) : (
                                    <NavLink
                                        to={section.to}
                                        end={section.end}
                                        onClick={onMobileClose}
                                        className={({ isActive: linkActive }) =>
                                            clsx(
                                                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                                linkActive
                                                    ? "bg-primary/10 text-primary"
                                                    : "text-text hover:bg-primary/5 hover:text-primary",
                                                collapsed && "justify-center px-2",
                                            )
                                        }
                                        title={collapsed ? section.label : undefined}
                                    >
                                        {IconComponent ? (
                                            <IconComponent className="h-5 w-5 shrink-0" />
                                        ) : null}
                                        {!collapsed && <span>{section.label}</span>}
                                    </NavLink>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div className="border-t border-primary/10 px-2 py-2">
                <button
                    onClick={onToggleCollapse}
                    className="hidden w-full items-center justify-center rounded-lg p-2 text-muted transition-colors hover:bg-primary/5 hover:text-text md:flex"
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    <svg
                        className={clsx(
                            "h-4 w-4 transition-transform",
                            collapsed && "rotate-180",
                        )}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </button>
            </div>
        </nav>
    );

    // Close mobile sidebar when Escape is pressed
    useEffect(() => {
        if (!mobileOpen) return;
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") onMobileClose();
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [mobileOpen, onMobileClose]);

    return (
        <>
            {/* Mobile overlay */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                    onClick={onMobileClose}
                    aria-hidden="true"
                />
            )}

            {/* Mobile sidebar */}
            <aside
                className={clsx(
                    "fixed inset-y-0 left-0 z-50 w-60 border-r border-primary/10 bg-surface transition-transform md:hidden",
                    mobileOpen ? "translate-x-0" : "-translate-x-full",
                )}
            >
                {sidebarContent}
            </aside>

            {/* Desktop sidebar */}
            <aside
                className={clsx(
                    "hidden h-screen flex-col border-r border-primary/10 bg-surface transition-[width] md:flex",
                    collapsed ? "w-16" : "w-60",
                )}
            >
                {sidebarContent}
            </aside>
        </>
    );
}
