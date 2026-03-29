import { NavLink } from "react-router-dom";
import clsx from "clsx";

import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/app/store";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import orbitLightStillFull from "@/assets/logos/orbit_light_still_full.svg";
import orbitDarkStillFull from "@/assets/logos/orbit_dark_still_full.svg";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/devices", label: "Devices" },
  { to: "/monitoring", label: "Monitoring" },
  { to: "/monitoring/jobs", label: "Jobs" },
  { to: "/monitoring/policies", label: "Policies" },
  { to: "/monitoring/logs", label: "Logs" },
];

export function Header(): JSX.Element {
  const { isSidebarOpen, toggleSidebar } = useAppStore();
  const { theme } = useTheme();
  const { isAuthenticated, logout } = useAuth();

  const logoSrc = theme === "dark" ? orbitDarkStillFull : orbitLightStillFull;

  return (
    <header className="border-b border-primary/20 bg-surface-muted backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="sm:hidden"
            aria-pressed={isSidebarOpen}
            aria-label="Toggle navigation"
            onClick={toggleSidebar}
          >
            ☰
          </Button>
          <NavLink to="/" className="flex items-center gap-2">
            <img src={logoSrc} alt="Orbit" className="h-10 w-auto" />
            <span className="sr-only">Orbit</span>
          </NavLink>
          <nav className="hidden items-center gap-2 sm:flex">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  clsx(
                    "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-text hover:bg-primary/10 hover:text-primary",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isAuthenticated ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full px-4 py-2 text-sm font-medium text-text transition hover:bg-primary/10 hover:text-primary"
              onClick={logout}
            >
              Logout
            </Button>
          ) : (
            <NavLink
              to="/login"
              className={({ isActive }) =>
                clsx(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-white" : "text-text hover:bg-primary/10 hover:text-primary",
                )
              }
            >
              Login
            </NavLink>
          )}
        </div>
      </div>
      {isSidebarOpen ? (
        <div className="sm:hidden border-t border-primary/10 bg-surface">
          <nav className="flex flex-col gap-1 px-4 py-3">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  clsx(
                    "rounded-lg px-3 py-2 text-sm font-medium",
                    isActive ? "bg-primary/10 text-primary" : "text-text hover:bg-primary/10 hover:text-primary",
                  )
                }
                onClick={toggleSidebar}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
