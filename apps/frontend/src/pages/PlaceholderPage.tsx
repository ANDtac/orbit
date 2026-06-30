import { Page } from "@/components/layout/Page";

interface PlaceholderPageProps {
    title: string;
    section: string;
    description?: string;
}

export function PlaceholderPage({
    title,
    section,
    description,
}: PlaceholderPageProps): JSX.Element {
    return (
        <Page title={title}>
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 rounded-full bg-primary/10 p-4">
                    <svg
                        className="h-8 w-8 text-primary"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                        <path d="M3.27 6.96 12 12.01l8.73-5.05" />
                        <path d="M12 22.08V12" />
                    </svg>
                </div>
                <h2 className="mb-2 font-heading text-xl font-semibold">{section}</h2>
                <p className="max-w-md text-sm text-muted">
                    {description ?? "This section is under development and will be available soon."}
                </p>
                <span className="mt-4 rounded-full bg-secondary/15 px-3 py-1 text-xs font-medium uppercase tracking-wider text-secondary">
                    Coming Soon
                </span>
            </div>
        </Page>
    );
}
