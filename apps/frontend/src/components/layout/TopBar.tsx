import { NavLink } from "react-router-dom";

import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useDemo } from "@/contexts/DemoContext";
import orbitLightStillFull from "@/assets/logos/orbit_light_still_full.svg";
import orbitDarkStillFull from "@/assets/logos/orbit_dark_still_full.svg";

interface TopBarProps {
    onMobileMenuToggle: () => void;
}

export function TopBar({ onMobileMenuToggle }: TopBarProps): JSX.Element {
    const { theme } = useTheme();
    const { isAuthenticated, logout, payload } = useAuth();
    const { isDemo, exitDemo } = useDemo();

    const logoSrc = theme === "dark" ? orbitDarkStillFull : orbitLightStillFull;

    return (
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-primary/10 bg-surface px-4">
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="sm"
                    className="md:hidden"
                    aria-label="Toggle navigation"
                    onClick={onMobileMenuToggle}
                >
                    <svg
                        className="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M3 12h18M3 6h18M3 18h18" />
                    </svg>
                </Button>
                <NavLink to="/" className="flex items-center gap-2">
                    <img src={logoSrc} alt="Orbit" className="h-8 w-auto" />
                </NavLink>
            </div>
            <div className="flex items-center gap-2">
                {isDemo && (
                    <span className="rounded-full bg-secondary/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-secondary">
                        Demo
                    </span>
                )}
                <ThemeToggle />
                {isAuthenticated ? (
                    <div className="flex items-center gap-2">
                        {payload?.username && (
                            <span className="hidden text-xs font-medium text-muted sm:block">
                                {payload.username}
                            </span>
                        )}
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-sm font-medium text-text transition hover:bg-primary/10 hover:text-primary"
                            onClick={isDemo ? exitDemo : logout}
                        >
                            {isDemo ? "Exit Demo" : "Logout"}
                        </Button>
                    </div>
                ) : null}
            </div>
        </header>
    );
}
