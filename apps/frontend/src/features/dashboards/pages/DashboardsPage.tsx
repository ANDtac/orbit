import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
    createDashboard,
    fetchDashboards,
    pinDashboard,
    unpinDashboard,
} from "@/features/dashboards/api/dashboards.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { Dashboard, DashboardCreateInput, DashboardVisibility } from "@/lib/types";

// ─── Visibility badge ─────────────────────────────────────────────────────────

function VisibilityBadge({ visibility }: { visibility: DashboardVisibility }): JSX.Element {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                visibility === "shared"
                    ? "bg-primary/15 text-primary"
                    : "bg-primary/5 text-muted"
            }`}
        >
            {visibility}
        </span>
    );
}

// ─── Dashboard card ───────────────────────────────────────────────────────────

interface DashboardCardProps {
    dashboard: Dashboard;
    onPinToggle: (id: number, current: boolean) => void;
    isPinPending: boolean;
}

function DashboardCard({ dashboard, onPinToggle, isPinPending }: DashboardCardProps): JSX.Element {
    return (
        <article className="flex flex-col gap-3 rounded-2xl border border-primary/10 bg-surface p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="font-heading text-lg text-text truncate">{dashboard.name}</h3>
                    {dashboard.description ? (
                        <p className="mt-0.5 text-sm text-muted line-clamp-2">
                            {dashboard.description}
                        </p>
                    ) : null}
                </div>
                <VisibilityBadge visibility={dashboard.visibility} />
            </div>

            <p className="text-xs text-muted">
                {dashboard.panels.length} panel{dashboard.panels.length !== 1 ? "s" : ""}
            </p>

            <div className="flex items-center gap-2">
                <Link
                    to={`/dashboards/${dashboard.id}`}
                    className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-white transition hover:bg-primary/90"
                >
                    Open
                </Link>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPinToggle(dashboard.id, dashboard.is_pinned)}
                    disabled={isPinPending}
                    aria-label={dashboard.is_pinned ? "Unpin dashboard" : "Pin to home"}
                >
                    {dashboard.is_pinned ? "Unpin" : "Pin to Home"}
                </Button>
            </div>
        </article>
    );
}

// ─── Create dashboard modal ───────────────────────────────────────────────────

interface CreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (input: DashboardCreateInput) => void;
    isSubmitting: boolean;
}

function CreateDashboardModal({
    isOpen,
    onClose,
    onSubmit,
    isSubmitting,
}: CreateModalProps): JSX.Element {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [visibility, setVisibility] = useState<DashboardVisibility>("private");

    function handleSubmit(e: React.FormEvent): void {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit({ name: name.trim(), description: description.trim() || undefined, visibility });
    }

    function handleClose(): void {
        setName("");
        setDescription("");
        setVisibility("private");
        onClose();
    }

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Create Dashboard" size="sm">
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
                <div className="space-y-1">
                    <label htmlFor="dash-name" className="text-xs uppercase tracking-[0.18em] text-muted">
                        Name <span className="text-red-400">*</span>
                    </label>
                    <Input
                        id="dash-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="My Dashboard"
                        required
                    />
                </div>
                <div className="space-y-1">
                    <label htmlFor="dash-desc" className="text-xs uppercase tracking-[0.18em] text-muted">
                        Description
                    </label>
                    <Input
                        id="dash-desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Optional description"
                    />
                </div>
                <div className="space-y-1">
                    <label htmlFor="dash-vis" className="text-xs uppercase tracking-[0.18em] text-muted">
                        Visibility
                    </label>
                    <select
                        id="dash-vis"
                        value={visibility}
                        onChange={(e) => setVisibility(e.target.value as DashboardVisibility)}
                        className="w-full rounded-lg border border-primary/30 bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                        <option value="private">Private</option>
                        <option value="shared">Shared</option>
                    </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting || !name.trim()}>
                        {isSubmitting ? "Creating…" : "Create"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function DashboardsPage(): JSX.Element {
    const qc = useQueryClient();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<"my" | "shared">("my");

    const { data: dashboards = [], isLoading } = useQuery({
        queryKey: [QUERY_KEYS.dashboards],
        queryFn: fetchDashboards,
    });

    const createMutation = useMutation({
        mutationFn: (input: DashboardCreateInput) => createDashboard(input),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.dashboards] });
            setIsCreateOpen(false);
            toast.success("Dashboard created.");
        },
        onError: (err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Failed to create dashboard."),
    });

    const pinMutation = useMutation({
        mutationFn: ({ id, pinned }: { id: number; pinned: boolean }) =>
            pinned ? unpinDashboard(id) : pinDashboard(id),
        onSuccess: (_, { pinned }) => {
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.dashboards] });
            toast.success(pinned ? "Dashboard unpinned." : "Dashboard pinned to Home.");
        },
        onError: (err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Failed to update pin."),
    });

    const myDashboards = dashboards.filter((d) => d.visibility === "private");
    const sharedDashboards = dashboards.filter((d) => d.visibility === "shared");
    const displayed = activeTab === "my" ? myDashboards : sharedDashboards;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-end">
                <Button onClick={() => setIsCreateOpen(true)}>Create Dashboard</Button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-primary/10">
                {(["my", "shared"] as const).map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 text-sm font-medium transition ${
                            activeTab === tab
                                ? "border-b-2 border-primary text-primary"
                                : "text-muted hover:text-text"
                        }`}
                    >
                        {tab === "my" ? "My Dashboards" : "Shared"}
                    </button>
                ))}
            </div>

            {/* Dashboard grid */}
            {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((n) => (
                        <div
                            key={n}
                            className="h-40 animate-pulse rounded-2xl bg-primary/10"
                        />
                    ))}
                </div>
            ) : displayed.length === 0 ? (
                <p className="text-sm text-muted">
                    No {activeTab === "my" ? "private" : "shared"} dashboards yet.{" "}
                    <button
                        type="button"
                        className="text-primary underline-offset-2 hover:underline"
                        onClick={() => setIsCreateOpen(true)}
                    >
                        Create one
                    </button>
                    .
                </p>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {displayed.map((d) => (
                        <DashboardCard
                            key={d.id}
                            dashboard={d}
                            onPinToggle={(id, pinned) =>
                                pinMutation.mutate({ id, pinned })
                            }
                            isPinPending={pinMutation.isPending}
                        />
                    ))}
                </div>
            )}

            {/* Create modal */}
            <CreateDashboardModal
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                onSubmit={(input) => createMutation.mutate(input)}
                isSubmitting={createMutation.isPending}
            />
        </div>
    );
}
