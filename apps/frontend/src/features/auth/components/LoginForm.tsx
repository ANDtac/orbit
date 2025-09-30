import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { useAppStore } from "@/app/store";
import { useCookies } from "@/hooks/useCookies";
import { useTheme } from "@/hooks/useTheme";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from "@/lib/constants";
import { login } from "../api/auth.api";
import type { LoginRequest } from "@/lib/types";
import orbitLightAnimatedIcon from "@/assets/logos/orbit_light_animated_icon.svg";
import orbitDarkAnimatedIcon from "@/assets/logos/orbit_dark_animated_icon.svg";

export function LoginForm(): JSX.Element {
  const navigate = useNavigate();
  const { savedUsername, setSavedUsername } = useAppStore();
  const cookies = useCookies();
  const { theme } = useTheme();

  const [username, setUsername] = useState(savedUsername ?? "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(Boolean(savedUsername));
  const [formError, setFormError] = useState<string | null>(null);
  const [lockoutInfo, setLockoutInfo] = useState<{ until: number; message: string } | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: LoginRequest) => login(payload),
  });

  useEffect(() => {
    if (savedUsername) {
      setUsername(savedUsername);
      setRememberMe(true);
    }
  }, [savedUsername]);

  useEffect(() => {
    if (!lockoutInfo) {
      return;
    }

    const now = Date.now();
    if (lockoutInfo.until <= now) {
      setLockoutInfo(null);
      return;
    }

    const timer = window.setTimeout(() => {
      setLockoutInfo(null);
    }, lockoutInfo.until - now);

    return () => window.clearTimeout(timer);
  }, [lockoutInfo]);

  const isLocked = Boolean(lockoutInfo && lockoutInfo.until > Date.now());

  const isSubmitDisabled = useMemo(
    () => !username || !password || mutation.isPending || isLocked,
    [isLocked, mutation.isPending, password, username],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (isLocked) {
      return;
    }

    try {
      const sanitizedUsername = username.trim();
      const response = await mutation.mutateAsync({ username: sanitizedUsername, password, rememberMe });

      const expiresDays = Math.max(1, Math.ceil(response.expires_in / 86400));
      cookies.set(ACCESS_TOKEN_COOKIE, response.access_token, {
        days: expiresDays,
        sameSite: "lax",
      });

      if (response.refresh_token) {
        const refreshDays = Math.max(
          1,
          Math.ceil((response.refresh_expires_in ?? response.expires_in) / 86400),
        );
        cookies.set(REFRESH_TOKEN_COOKIE, response.refresh_token, {
          days: refreshDays,
          sameSite: "lax",
        });
      }

      if (rememberMe) {
        setSavedUsername(sanitizedUsername);
      } else {
        setSavedUsername(null);
      }

      setPassword("");
      setLockoutInfo(null);
      navigate("/");
    } catch (error) {
      if (isAxiosError(error)) {
        if (error.response?.status === 429) {
          const data = error.response.data as { locked_until?: string; retry_after?: number; message?: string };
          const lockedUntil = data.locked_until ? Date.parse(data.locked_until) : Date.now() + (Number(data.retry_after) || 60) * 1000;
          const formattedTime = new Date(lockedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const message = data.message ?? `Too many attempts. Try again at ${formattedTime}.`;
          setLockoutInfo({
            until: lockedUntil,
            message,
          });
          setFormError(`Too many attempts. Try again at ${formattedTime}.`);
          return;
        }

        const apiMessage =
          (typeof error.response?.data === "object" && error.response?.data !== null
            ? (error.response.data as { message?: string }).message
            : undefined) ?? error.message;
        setFormError(apiMessage ?? "Unable to sign in. Please verify your credentials.");
      } else {
        setFormError("Unable to sign in. Please verify your credentials.");
      }
    }
  };

  const overlayIcon = theme === "dark" ? orbitDarkAnimatedIcon : orbitLightAnimatedIcon;

  return (
    <div className="relative">
      <form className="space-y-6" onSubmit={handleSubmit} noValidate>
        <div className="space-y-4">
          <Input
            name="username"
            label="Username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            disabled={mutation.isPending || isLocked}
          />
          <Input
            name="password"
            type="password"
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={mutation.isPending || isLocked}
          />
          <Toggle
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            label="Remember username"
            disabled={mutation.isPending || isLocked}
          />
        </div>
        {formError ? <p className="text-sm text-red-500" role="alert">{formError}</p> : null}
        {lockoutInfo && !formError ? (
          <p className="text-sm text-yellow-600" role="status">
            {lockoutInfo.message}
          </p>
        ) : null}
        <Button type="submit" disabled={isSubmitDisabled} className="w-full">
          {mutation.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <LoadingOverlay show={mutation.isPending} iconSrc={overlayIcon} label="Authenticating" />
    </div>
  );
}
