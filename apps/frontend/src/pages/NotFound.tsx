import { Link } from "react-router-dom";

const COMMON_PAGES = [
    { label: "Overview", to: "/" },
    { label: "Devices", to: "/inventory/devices" },
    { label: "Monitoring", to: "/monitoring" },
    { label: "Password Changes", to: "/operations/password-change" },
    { label: "Compliance Policies", to: "/compliance/policies" },
    { label: "Hardware EoX", to: "/lifecycle/hardware" },
];

export function NotFound(): JSX.Element {
    return (
        <div className="space-y-6 text-center">
            <h2 className="font-heading text-5xl font-semibold text-primary">404</h2>
            <p className="text-lg text-text">The page you are looking for doesn&apos;t exist or was moved.</p>
            <Link
                to="/"
                className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
            >
                Go back home
            </Link>
            <div className="mx-auto max-w-sm pt-2">
                <p className="mb-3 text-sm font-medium text-muted">Or jump to a common page:</p>
                <ul className="grid grid-cols-2 gap-2">
                    {COMMON_PAGES.map((page) => (
                        <li key={page.to}>
                            <Link
                                to={page.to}
                                className="block rounded-lg border border-primary/10 bg-surface px-3 py-2 text-sm text-text transition hover:border-primary/30 hover:text-primary"
                            >
                                {page.label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
