import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import {
    createPanel,
    deletePanel,
    fetchDashboard,
    pinDashboard,
    unpinDashboard,
    updatePanel,
} from "@/features/dashboards/api/dashboards.api";
import { fetchMonitors } from "@/features/monitors/api/monitors.api";
import { DashboardPanel } from "@/features/dashboards/components/panels/DashboardPanel";
import { QUERY_KEYS } from "@/lib/constants";
import type {
    DashboardPanel as DashboardPanelType,
    DashboardVisibility,
    PanelCreateInput,
    PanelVizType,
} from "@/lib/types";

// ─── Visibility badge ─────────────────────────────────────────────────────────

function VisibilityBadge({ visibility }: { visibility: DashboardVisibility }): JSX.Element {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                visibility === "shared"
                    ? "bg-primary/15 text-primary"
                    : "bg-primary/5 text-muted"
            }`}
        >
            {visibility}
        </span>
    );
}

// ─── Add panel modal ──────────────────────────────────────────────────────────

interface AddPanelModalProps {
    dashboardId: number;
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (input: PanelCreateInput) => void;
    isSubmitting: boolean;
}

const VIZ_OPTIONS: { value: PanelVizType; label: string }[] = [
    { value: "timechart", label: "Time Chart" },
    { value: "stat", label: "Stat" },
    { value: "statusgrid", label: "Status Grid" },
    { value: "table", label: "Table" },
];

function AddPanelModal({
    isOpen,
    onClose,
    onSubmit,
    isSubmitting,
}: AddPanelModalProps): JSX.Element {
    const [monitorId, setMonitorId] = useState("");
    const [vizType, setVizType] = useState<PanelVizType>("timechart");
    const [title, setTitle] = useState("");

    const monitorsQuery = useQuery({
        queryKey: [QUERY_KEYS.monitors],
        queryFn: fetchMonitors,
        enabled: isOpen,
    });
    const monitors = monitorsQuery.data ?? [];

    function handleSubmit(e: React.FormEvent): void {
        e.preventDefault();
        if (!monitorId) return;
        onSubmit({
            monitor_id: Number(monitorId),
            viz_type: vizType,
            title: title.trim() || undefined,
        });
    }

    function handleClose(): void {
        setMonitorId("");
        setVizType("timechart");
        setTitle("");
        onClose();
    }

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Add Panel" size="sm">
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
                <div className="space-y-1">
                    <label
                        htmlFor="panel-monitor"
                        className="text-xs uppercase tracking-[0.18em] text-muted"
                    >
                        Monitor <span className="text-red-400">*</span>
                    </label>
                    <select
                        id="panel-monitor"
                        value={monitorId}
                        onChange={(e) => setMonitorId(e.target.value)}
                        required
                        className="w-full rounded-lg border border-primary/30 bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                        <option value="">Select a monitor…</option>
                        {monitors.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1">
                    <label
                        htmlFor="panel-viz"
                        className="text-xs uppercase tracking-[0.18em] text-muted"
                    >
                        Visualization
                    </label>
                    <select
                        id="panel-viz"
                        value={vizType}
                        onChange={(e) => setVizType(e.target.value as PanelVizType)}
                        className="w-full rounded-lg border border-primary/30 bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                        {VIZ_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1">
                    <label
                        htmlFor="panel-title"
                        className="text-xs uppercase tracking-[0.18em] text-muted"
                    >
                        Panel title (optional)
                    </label>
                    <Input
                        id="panel-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="CPU over time"
                    />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting || !monitorId}>
                        {isSubmitting ? "Adding…" : "Add Panel"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

// ─── Panel cell ───────────────────────────────────────────────────────────────

interface PanelCellProps {
    panel: DashboardPanelType;
    onRemove: (id: number) => void;
    onChangeViz: (panel: DashboardPanelType) => void;
    isRemoving: boolean;
}

function PanelCell({ panel, onRemove, onChangeViz, isRemoving }: PanelCellProps): JSX.Element {
    return (
        <div
            style={{
                gridColumn: `${panel.position.col + 1} / span ${panel.position.w}`,
                gridRow: `${panel.position.row + 1} / span ${panel.position.h}`,
                minHeight: "12rem",
            }}
            className="relative"
        >
            <DashboardPanel panel={panel} />
            {/* Panel actions overlay */}
            <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100">
                <button
                    type="button"
                    onClick={() => onChangeViz(panel)}
                    className="rounded bg-surface/80 px-2 py-0.5 text-xs text-muted hover:text-text"
                    aria-label="Change visualization"
                >
                    ⬡ viz
                </button>
                <button
                    type="button"
                    onClick={() => onRemove(panel.id)}
                    disabled={isRemoving}
                    className="rounded bg-surface/80 px-2 py-0.5 text-xs text-red-400 hover:text-red-500"
                    aria-label="Remove panel"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

// ─── Change viz modal ─────────────────────────────────────────────────────────

interface ChangeVizModalProps {
    panel: DashboardPanelType | null;
    onClose: () => void;
    onSubmit: (panel: DashboardPanelType, vizType: PanelVizType) => void;
    isSubmitting: boolean;
}

function ChangeVizModal({
    panel,
    onClose,
    onSubmit,
    isSubmitting,
}: ChangeVizModalProps): JSX.Element {
    const [vizType, setVizType] = useState<PanelVizType>(panel?.viz_type ?? "timechart");

    if (!panel) return <></>;

    return (
        <Modal isOpen={!!panel} onClose={onClose} title="Change Visualization" size="sm">
            <div className="space-y-4 py-2">
                <select
                    value={vizType}
                    onChange={(e) => setVizType(e.target.value as PanelVizType)}
                    className="w-full rounded-lg border border-primary/30 bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                    {VIZ_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => onSubmit(panel, vizType)}
                        disabled={isSubmitting}
                    >
                        Apply
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function DashboardDetailPage(): JSX.Element {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const dashboardId = Number(id);

    const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
    const [changeVizPanel, setChangeVizPanel] = useState<DashboardPanelType | null>(null);

    const dashboardQuery = useQuery({
        queryKey: [QUERY_KEYS.dashboards, dashboardId],
        queryFn: () => fetchDashboard(dashboardId),
        enabled: !Number.isNaN(dashboardId),
    });
    const dashboard = dashboardQuery.data;

    const pinMutation = useMutation({
        mutationFn: () =>
            dashboard?.is_pinned ? unpinDashboard(dashboardId) : pinDashboard(dashboardId),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.dashboards] });
            toast.success(dashboard?.is_pinned ? "Dashboard unpinned." : "Dashboard pinned to Home.");
        },
        onError: (err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Failed to update pin."),
    });

    const addPanelMutation = useMutation({
        mutationFn: (input: PanelCreateInput) => createPanel(dashboardId, input),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.dashboards, dashboardId] });
            setIsAddPanelOpen(false);
            toast.success("Panel added.");
        },
        onError: (err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Failed to add panel."),
    });

    const removePanelMutation = useMutation({
        mutationFn: (panelId: number) => deletePanel(dashboardId, panelId),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.dashboards, dashboardId] });
            toast.success("Panel removed.");
        },
        onError: (err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Failed to remove panel."),
    });

    const changeVizMutation = useMutation({
        mutationFn: ({ panel, vizType }: { panel: DashboardPanelType; vizType: PanelVizType }) =>
            updatePanel(dashboardId, panel.id, { viz_type: vizType }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: [QUERY_KEYS.dashboards, dashboardId] });
            setChangeVizPanel(null);
            toast.success("Visualization updated.");
        },
        onError: (err: unknown) =>
            toast.error(err instanceof Error ? err.message : "Failed to update visualization."),
    });

    if (dashboardQuery.isError) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-red-400">Unable to load dashboard.</p>
                <Button variant="ghost" onClick={() => navigate("/dashboards")}>
                    Back to Dashboards
                </Button>
            </div>
        );
    }

    const panels = dashboard?.panels ?? [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                    {dashboardQuery.isLoading ? (
                        <div className="h-8 w-56 animate-pulse rounded-lg bg-primary/10" />
                    ) : (
                        <>
                            <div className="flex items-center gap-3">
                                <h1 className="font-heading text-2xl text-text">
                                    {dashboard?.name}
                                </h1>
                                {dashboard ? (
                                    <VisibilityBadge visibility={dashboard.visibility} />
                                ) : null}
                            </div>
                            {dashboard?.description ? (
                                <p className="text-sm text-muted">{dashboard.description}</p>
                            ) : null}
                        </>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => pinMutation.mutate()}
                        disabled={pinMutation.isPending || !dashboard}
                    >
                        {dashboard?.is_pinned ? "Unpin" : "Pin to Home"}
                    </Button>
                    <Button size="sm" onClick={() => setIsAddPanelOpen(true)}>
                        Add Panel
                    </Button>
                </div>
            </div>

            {/* Panel grid */}
            {panels.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-primary/20 p-12 text-center">
                    <p className="text-sm text-muted">
                        No panels yet.{" "}
                        <button
                            type="button"
                            className="text-primary underline-offset-2 hover:underline"
                            onClick={() => setIsAddPanelOpen(true)}
                        >
                            Add your first panel
                        </button>
                        .
                    </p>
                </div>
            ) : (
                <div
                    className="group grid gap-4"
                    style={{
                        gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
                        gridAutoRows: "4rem",
                    }}
                >
                    {panels.map((panel) => (
                        <PanelCell
                            key={panel.id}
                            panel={panel}
                            onRemove={(panelId) => removePanelMutation.mutate(panelId)}
                            onChangeViz={(p) => setChangeVizPanel(p)}
                            isRemoving={removePanelMutation.isPending}
                        />
                    ))}
                </div>
            )}

            {/* Modals */}
            <AddPanelModal
                dashboardId={dashboardId}
                isOpen={isAddPanelOpen}
                onClose={() => setIsAddPanelOpen(false)}
                onSubmit={(input) => addPanelMutation.mutate(input)}
                isSubmitting={addPanelMutation.isPending}
            />
            <ChangeVizModal
                panel={changeVizPanel}
                onClose={() => setChangeVizPanel(null)}
                onSubmit={(panel, vizType) => changeVizMutation.mutate({ panel, vizType })}
                isSubmitting={changeVizMutation.isPending}
            />
        </div>
    );
}
