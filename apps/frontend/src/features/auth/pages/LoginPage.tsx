import { Navigate, useLocation } from "react-router-dom";

import { LoginForm } from "../components/LoginForm";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import orbitLightAnimatedFull from "@/assets/logos/orbit_light_animated_full.svg";
import orbitDarkAnimatedFull from "@/assets/logos/orbit_dark_animated_full.svg";

export function LoginPage(): JSX.Element {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { theme } = useTheme();

  if (isAuthenticated) {
    const redirectTo = ((location.state as { from?: { pathname?: string } } | undefined)?.from?.pathname) ?? "/";
    return <Navigate to={redirectTo} replace />;
  }

  const logoSrc = theme === "dark" ? orbitDarkAnimatedFull : orbitLightAnimatedFull;

  return (
    <div className="flex min-h-screen flex-col bg-background text-text transition-colors">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="flex w-full flex-col items-center gap-10 text-center">
          <img src={logoSrc} alt="Orbit" className="w-40 sm:w-56" />
          <div className="w-full max-w-lg space-y-6 rounded-3xl border border-primary/20 bg-surface/90 p-8 shadow-xl backdrop-blur">
            <div className="space-y-2">
              <h1 className="font-heading text-3xl font-semibold text-primary sm:text-4xl">Secure access</h1>
              <p className="text-sm text-muted sm:text-base">
                Authenticate with the same credentials you use to reach the validation device. Orbit never stores
                passwords—only successful access tokens.
              </p>
            </div>
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
