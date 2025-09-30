import { useCallback, useMemo } from "react";
import { jwtDecode } from "jwt-decode";

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/constants";
import { deleteCookie, getCookie } from "@/lib/cookies";

type OrbitJwtPayload = {
  exp?: number;
  sub?: string;
  username?: string;
};

export function useAuth() {
  const accessToken = typeof document !== "undefined" ? getCookie(ACCESS_TOKEN_COOKIE) : null;

  const payload = useMemo(() => {
    if (!accessToken) {
      return null;
    }

    try {
      return jwtDecode<OrbitJwtPayload>(accessToken);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("Unable to decode access token", error);
      }
      return null;
    }
  }, [accessToken]);

  const isAuthenticated = useMemo(() => {
    if (!accessToken || !payload) {
      return false;
    }
    if (!payload.exp) {
      return true;
    }
    const expiration = payload.exp * 1000;
    return expiration > Date.now();
  }, [accessToken, payload]);

  const logout = useCallback(() => {
    deleteCookie(ACCESS_TOKEN_COOKIE);
    deleteCookie(REFRESH_TOKEN_COOKIE);
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, []);

  return {
    accessToken,
    payload,
    isAuthenticated,
    logout,
  } as const;
}
