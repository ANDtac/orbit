import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useMemo, type PropsWithChildren } from "react";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/contexts/ThemeContext";
import { DemoProvider, isDemoActive } from "@/contexts/DemoContext";
import { createDemoQueryClient } from "@/lib/demo/queryOverrides";

const defaultQueryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 1000 * 60,
        },
    },
});

export function AppProviders({ children }: PropsWithChildren): JSX.Element {
    const queryClient = useMemo(
        () => (isDemoActive() ? createDemoQueryClient() : defaultQueryClient),
        [],
    );

    return (
        <ThemeProvider>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter
                    future={{
                        v7_relativeSplatPath: true,
                        v7_startTransition: true,
                    }}
                >
                    <DemoProvider>{children}</DemoProvider>
                    <Toaster
                        position="bottom-right"
                        toastOptions={{
                            classNames: {
                                toast: "bg-surface border border-primary/20 text-text",
                                title: "text-text font-medium",
                                description: "text-muted",
                                actionButton: "bg-primary text-white",
                                cancelButton: "bg-primary/10 text-text",
                                closeButton: "text-muted hover:text-text",
                            },
                        }}
                    />
                </BrowserRouter>
                {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
            </QueryClientProvider>
        </ThemeProvider>
    );
}
