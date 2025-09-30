import type { ReactNode } from "react";

import { Header } from "./Header";

interface PageProps {
  title: string;
  description?: string;
  children: ReactNode;
  showHeader?: boolean;
}

export function Page({ title, description, children, showHeader = true }: PageProps): JSX.Element {
  return (
    <div className="min-h-screen bg-background text-text transition-colors">
      {showHeader ? <Header /> : null}
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <header className="space-y-2">
            <h1 className="font-heading text-3xl font-semibold sm:text-4xl">{title}</h1>
            {description ? <p className="max-w-3xl text-base text-muted">{description}</p> : null}
          </header>
          <section className="rounded-2xl border border-primary/10 bg-surface p-6 shadow-sm">
            {children}
          </section>
        </div>
      </main>
    </div>
  );
}
