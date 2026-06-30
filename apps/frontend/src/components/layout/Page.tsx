import type { ReactNode } from "react";

interface PageProps {
    title: string;
    description?: string;
    children: ReactNode;
}

export function Page({ title, description, children }: PageProps): JSX.Element {
    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="space-y-6">
                <header className="space-y-1">
                    <h1 className="font-heading text-2xl font-semibold sm:text-3xl">{title}</h1>
                    {description ? (
                        <p className="max-w-3xl text-sm text-muted">{description}</p>
                    ) : null}
                </header>
                <section>{children}</section>
            </div>
        </div>
    );
}
