import { Link } from "react-router-dom";

export function Home(): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h2 className="font-heading text-4xl font-semibold text-primary">Unified network intelligence</h2>
        <p className="max-w-3xl text-lg text-text">
          Orbit orchestrates device inventory, compliance insights, and automated remediation workflows
          in one place. Track the health of every platform, execute operations safely, and collaborate with
          your engineering team in real time.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Link
          to="/devices"
          className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-base font-medium text-white shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
        >
          View devices
        </Link>
      </div>
      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm">
          <h3 className="font-heading text-2xl text-primary">Live compliance snapshots</h3>
          <p className="mt-2 text-sm text-text">
            Compare device state with golden templates and detect drift instantly. Orbit highlights
            remediation steps to keep your network aligned with policy.
          </p>
        </article>
        <article className="rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm">
          <h3 className="font-heading text-2xl text-primary">Operations with guardrails</h3>
          <p className="mt-2 text-sm text-text">
            Execute bulk changes safely with reusable operation templates, integrated logging, and
            automated rollbacks.
          </p>
        </article>
      </section>
    </div>
  );
}
