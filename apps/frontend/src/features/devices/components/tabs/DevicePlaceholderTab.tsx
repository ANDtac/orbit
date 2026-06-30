interface DevicePlaceholderTabProps {
    title: string;
    description: string;
}

export function DevicePlaceholderTab({ title, description }: DevicePlaceholderTabProps): JSX.Element {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 rounded-full bg-primary/10 p-3">
                <svg
                    className="h-6 w-6 text-primary"
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
            <h3 className="mb-1 font-heading text-base font-semibold">{title}</h3>
            <p className="max-w-sm text-xs text-muted">{description}</p>
            <span className="mt-3 rounded-full bg-secondary/15 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-secondary">
                Coming Soon
            </span>
        </div>
    );
}
