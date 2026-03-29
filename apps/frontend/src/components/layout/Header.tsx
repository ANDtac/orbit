import { NavLink, useLocation } from "react-router-dom";
import clsx from "clsx";

import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/app/store";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import orbitLightStillFull from "@/assets/logos/orbit_light_still_full.svg";
import orbitDarkStillFull from "@/assets/logos/orbit_dark_still_full.svg";

const monitoringChildren = [
  { to: "/monitoring/jobs", label: "Jobs" },
  { to: "/monitoring/policies", label: "Policies" },
  { to: "/monitoring/logs", label: "Logs" },
] as const;

const topLinks = [
  { to: "/", label: "Home" },
  { to: "/devices", label: "Devices" },
] as const;

export function Header(): JSX.Element {
  const { pathname } = useLocation();
  const { isSidebarOpen, toggleSidebar } = useAppStore();
  const { theme } = useTheme();
  const { isAuthenticated, logout } = useAuth();

  const logoSrc = theme === "dark" ? orbitDarkStillFull : orbitLightStillFull;
  const monitoringActive = pathname.startsWith("/monitoring");

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
          <nav className="hidden items-center gap-2 sm:flex" aria-label="Primary">
            {topLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  clsx(
                    "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-primary/10 text-primary" : "text-text hover:bg-primary/10 hover:text-primary",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}

            <details className="group relative">
              <summary
                className={clsx(
                  "list-none cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  monitoringActive ? "bg-primary/10 text-primary" : "text-text hover:bg-primary/10 hover:text-primary",
                )}
                role="button"
                aria-haspopup="menu"
                aria-label="Monitoring menu"
              >
                Monitoring
              </summary>
              <div className="absolute left-0 z-20 mt-2 min-w-48 rounded-xl border border-primary/20 bg-surface p-2 shadow-lg group-open:block">
                <NavLink
                  to="/monitoring"
                  className={({ isActive }) =>
                    clsx(
                      "block rounded-lg px-3 py-2 text-sm",
                      isActive ? "bg-primary/10 text-primary" : "text-text hover:bg-primary/10 hover:text-primary",
                    )
                  }
                >
                  Overview
                </NavLink>
                {monitoringChildren.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    className={({ isActive }) =>
                      clsx(
                        "block rounded-lg px-3 py-2 text-sm",
                        isActive ? "bg-primary/10 text-primary" : "text-text hover:bg-primary/10 hover:text-primary",
                      )
                    }
                  >
                    {link.label}
                  </NavLink>
                ))}
              </div>
            </details>
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
          <nav className="flex flex-col gap-1 px-4 py-3" aria-label="Mobile">
            {topLinks.map((link) => (
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
            <NavLink
              to="/monitoring"
              className={({ isActive }) =>
                clsx(
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  isActive || monitoringActive ? "bg-primary/10 text-primary" : "text-text hover:bg-primary/10 hover:text-primary",
                )
              }
              onClick={toggleSidebar}
            >
              Monitoring
            </NavLink>
            <div className="ml-3 flex flex-col gap-1 border-l border-primary/20 pl-3">
              {monitoringChildren.map((link) => (
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
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
