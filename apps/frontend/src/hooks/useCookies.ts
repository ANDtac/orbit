import { useCallback } from "react";

import { deleteCookie, getCookie, setCookie } from "@/lib/cookies";

type CookieOptions = Parameters<typeof setCookie>[2];

type UseCookiesReturn = {
  get: typeof getCookie;
  set: (name: string, value: string, options?: CookieOptions) => void;
  remove: (name: string, options?: CookieOptions) => void;
};

export function useCookies(): UseCookiesReturn {
  const set = useCallback(
    (name: string, value: string, options?: CookieOptions) => {
      setCookie(name, value, options);
    },
    [],
  );

  const remove = useCallback((name: string, options?: CookieOptions) => {
    deleteCookie(name, options);
  }, []);

  return { get: getCookie, set, remove };
}
