import { useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { QUERY_KEYS } from "@/lib/constants";
import { fetchDevice, deleteDevice } from "../api/devices.api";
import { DeviceSummaryTab } from "../components/tabs/DeviceSummaryTab";
import { DevicePlaceholderTab } from "../components/tabs/DevicePlaceholderTab";

const TABS = [
    { key: "summary", label: "Summary" },
    { key: "monitoring", label: "Monitoring" },
    { key: "operations", label: "Operations" },
    { key: "compliance", label: "Compliance" },
    { key: "lifecycle", label: "Lifecycle" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function DeviceDetailPage(): JSX.Element {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchParams, setSearchParams] = useSearchParams();

    const activeTab = (searchParams.get("tab") as TabKey) || "summary";
    const deviceId = Number(id);

    const [showDelete, setShowDelete] = useState(false);
    const [deletePhrase, setDeletePhrase] = useState("");

    const {
        data: device,
        isLoading,
        isError,
    } = useQuery({
        queryKey: [QUERY_KEYS.deviceDetail, deviceId],
        queryFn: () => fetchDevice(deviceId),
        enabled: !isNaN(deviceId),
    });

    const deleteMutation = useMutation({
        mutationFn: deleteDevice,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.devices] });
            toast.success("Device deleted");
            navigate("/inventory/devices");
        },
        onError: () => {
            toast.error("Failed to delete device");
        },
    });

    function setTab(tab: TabKey) {
        setSearchParams({ tab });
    }

    if (isLoading) {
        return (
            <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 w-64 rounded bg-primary/10" />
                    <div className="h-4 w-96 rounded bg-primary/10" />
                    <div className="h-64 rounded-xl bg-primary/5" />
                </div>
            </div>
        );
    }

    if (isError || !device) {
        return (
            <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="text-center">
                    <p className="text-sm text-muted">Device not found or unable to load.</p>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="mt-3"
                        onClick={() => navigate("/inventory/devices")}
                    >
                        Back to Devices
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {/* Breadcrumb */}
            <nav className="mb-4 text-xs text-muted">
                <button
                    onClick={() => navigate("/inventory/devices")}
                    className="transition hover:text-primary"
                >
                    Inventory
                </button>
                <span className="mx-1.5">/</span>
                <button
                    onClick={() => navigate("/inventory/devices")}
                    className="transition hover:text-primary"
                >
                    Devices
                </button>
                <span className="mx-1.5">/</span>
                <span className="text-text">{device.name}</span>
            </nav>

            {/* Header */}
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="font-heading text-2xl font-semibold">{device.name}</h1>
                        <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                device.is_active !== false
                                    ? "bg-green-500/15 text-green-600"
                                    : "bg-red-400/15 text-red-500"
                            }`}
                        >
                            <span
                                className={`inline-block h-1.5 w-1.5 rounded-full ${
                                    device.is_active !== false ? "bg-green-500" : "bg-red-400"
                                }`}
                            />
                            {device.is_active !== false ? "Active" : "Inactive"}
                        </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted">
                        {device.mgmt_ipv4 && (
                            <span className="font-mono text-xs">{device.mgmt_ipv4}</span>
                        )}
                        {device.os_name && (
                            <>
                                <span className="text-primary/30">|</span>
                                <span>
                                    {device.os_name}
                                    {device.os_version ? ` ${device.os_version}` : ""}
                                </span>
                            </>
                        )}
                        {device.serial_number && (
                            <>
                                <span className="text-primary/30">|</span>
                                <span className="font-mono text-xs">{device.serial_number}</span>
                            </>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/inventory/devices/${device.id}/edit`)}
                    >
                        Edit
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDelete(true)}
                    >
                        Delete
                    </Button>
                </div>
            </div>

            {/* Tab bar */}
            <div className="mb-6 border-b border-primary/10">
                <nav className="-mb-px flex gap-1" aria-label="Device tabs">
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setTab(tab.key)}
                            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                                activeTab === tab.key
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted hover:border-primary/30 hover:text-text"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Tab content */}
            {activeTab === "summary" && <DeviceSummaryTab device={device} />}
            {/* TODO: Implement Monitoring tab — data available via existing API endpoints */}
            {activeTab === "monitoring" && (
                <DevicePlaceholderTab
                    title="Monitoring"
                    description="Real-time health status, interface states, and probe history for this device."
                />
            )}
            {/* TODO: Implement Operations tab — data available via existing API endpoints */}
            {activeTab === "operations" && (
                <DevicePlaceholderTab
                    title="Operations"
                    description="Password change history, configuration backups, and executed command results for this device."
                />
            )}
            {/* TODO: Implement Compliance tab — data available via existing API endpoints */}
            {activeTab === "compliance" && (
                <DevicePlaceholderTab
                    title="Compliance"
                    description="Compliance rule results specific to this device across all active policies."
                />
            )}
            {/* TODO: Implement Lifecycle tab — data available via existing API endpoints */}
            {activeTab === "lifecycle" && (
                <DevicePlaceholderTab
                    title="Lifecycle"
                    description="Hardware and software end-of-life status based on this device's platform and OS version."
                />
            )}

            {/* Delete modal */}
            <Modal
                isOpen={showDelete}
                title="Delete Device"
                onClose={() => {
                    setShowDelete(false);
                    setDeletePhrase("");
                }}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setShowDelete(false);
                                setDeletePhrase("");
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={deletePhrase !== "DELETE" || deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(device.id)}
                        >
                            {deleteMutation.isPending ? "Deleting..." : "Confirm Delete"}
                        </Button>
                    </div>
                }
            >
                <p className="text-sm text-text">
                    Permanently delete <strong>{device.name}</strong>? This cannot be undone.
                    Type <strong className="font-mono">DELETE</strong> to confirm.
                </p>
                <input
                    type="text"
                    value={deletePhrase}
                    onChange={(e) => setDeletePhrase(e.target.value)}
                    placeholder="Type DELETE"
                    className="mt-3 w-full rounded-lg border border-primary/20 bg-background px-3 py-2 text-sm text-text placeholder:text-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                    autoFocus
                />
            </Modal>
        </div>
    );
}
