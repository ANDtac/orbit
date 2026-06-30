import { Outlet } from "react-router-dom";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useAppStore } from "@/app/store";

export function AppShell(): JSX.Element {
    const { isSidebarOpen, toggleSidebar, isSidebarCollapsed, toggleSidebarCollapsed } =
        useAppStore();

    return (
        <div className="flex h-screen overflow-hidden bg-background text-text transition-colors">
            {/* Skip-to-content link for keyboard/screen-reader users */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none"
            >
                Skip to main content
            </a>
            <Sidebar
                collapsed={isSidebarCollapsed}
                onToggleCollapse={toggleSidebarCollapsed}
                mobileOpen={isSidebarOpen}
                onMobileClose={toggleSidebar}
            />
            <div className="flex flex-1 flex-col overflow-hidden">
                <TopBar onMobileMenuToggle={toggleSidebar} />
                <main id="main-content" className="flex-1 overflow-y-auto" tabIndex={-1}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
