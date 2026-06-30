import { createContext, useContext, useMemo, useCallback, type PropsWithChildren } from "react";
import { useNavigate } from "react-router-dom";

import { ACCESS_TOKEN_COOKIE } from "@/lib/constants";
import { setCookie, deleteCookie } from "@/lib/cookies";
import { resetDemoData } from "@/lib/demo/generators";

const DEMO_STORAGE_KEY = "orbit.demo_mode";

interface DemoContextValue {
    isDemo: boolean;
    enterDemo: () => void;
    exitDemo: () => void;
}

const DemoContext = createContext<DemoContextValue>({
    isDemo: false,
    enterDemo: () => {},
    exitDemo: () => {},
});

function createDemoToken(): string {
    const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
    const payload = btoa(
        JSON.stringify({
            sub: "demo-user",
            username: "demo",
            roles: ["owner"],
            exp: Math.floor(Date.now() / 1000) + 86400 * 365,
        }),
    );
    return `${header}.${payload}.demo-signature`;
}

export function isDemoActive(): boolean {
    if (typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem(DEMO_STORAGE_KEY) === "true";
}

export function DemoProvider({ children }: PropsWithChildren): JSX.Element {
    const isDemo = isDemoActive();

    // NOTE: window.location.href is intentional here — enterDemo/exitDemo must trigger
    // a full page reload so AppProviders re-evaluates isDemoActive() and creates the
    // correct QueryClient (demo vs. real). React Router navigate() would not cause this
    // re-initialization. TODO: Make QueryClient selection reactive to demo state to
    // allow SPA-style transitions without a full reload.
    const enterDemo = useCallback(() => {
        sessionStorage.setItem(DEMO_STORAGE_KEY, "true");
        setCookie(ACCESS_TOKEN_COOKIE, createDemoToken(), { days: 1 });
        window.location.href = "/";
    }, []);

    const exitDemo = useCallback(() => {
        sessionStorage.removeItem(DEMO_STORAGE_KEY);
        deleteCookie(ACCESS_TOKEN_COOKIE);
        resetDemoData();
        window.location.href = "/login";
    }, []);

    const value = useMemo(
        () => ({ isDemo, enterDemo, exitDemo }),
        [isDemo, enterDemo, exitDemo],
    );

    return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
    return useContext(DemoContext);
}
