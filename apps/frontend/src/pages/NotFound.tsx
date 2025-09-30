import { Link } from "react-router-dom";

export function NotFound(): JSX.Element {
  return (
    <div className="space-y-4 text-center">
      <h2 className="font-heading text-5xl font-semibold text-primary">404</h2>
      <p className="text-lg text-text">The page you are looking for doesn&apos;t exist or was moved.</p>
      <Link
        to="/"
        className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
      >
        Go back home
      </Link>
    </div>
  );
}
