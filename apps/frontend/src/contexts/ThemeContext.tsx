import { createContext, useCallback, useEffect } from "react";
import type { PropsWithChildren } from "react";

import { useLocalStorage } from "@/hooks/useLocalStorage";
import { getCookie, setCookie } from "@/lib/cookies";
import { THEME_COOKIE } from "@/lib/constants";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = "orbit-theme";

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: PropsWithChildren): JSX.Element {
  const cookieTheme = getCookie(THEME_COOKIE);
  const initialTheme: Theme = cookieTheme === "dark" ? "dark" : "light";
  const [theme, setTheme] = useLocalStorage<Theme>(THEME_STORAGE_KEY, initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    setCookie(THEME_COOKIE, theme, { days: 180 });
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }, [setTheme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
