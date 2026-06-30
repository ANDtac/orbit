import { useState, useCallback } from "react";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { QUERY_KEYS } from "@/lib/constants";
import { fetchDevice, updateDevice } from "../api/devices.api";
import { DeviceForm } from "../components/DeviceForm";
import type { DeviceUpdateInput } from "@/lib/types";

export function DeviceEditPage(): JSX.Element {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const deviceId = Number(id);

    const [isDirty, setIsDirty] = useState(false);

    const { data: device, isLoading, isError } = useQuery({
        queryKey: [QUERY_KEYS.deviceDetail, deviceId],
        queryFn: () => fetchDevice(deviceId),
        enabled: !isNaN(deviceId),
    });

    const mutation = useMutation({
        mutationFn: (values: DeviceUpdateInput) => updateDevice(deviceId, values),
        onSuccess: () => {
            setIsDirty(false);
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.deviceDetail, deviceId] });
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.devices] });
            toast.success("Device updated");
            navigate(`/inventory/devices/${deviceId}`);
        },
        onError: () => {
            toast.error("Failed to update device");
        },
    });

    // Warn on unsaved navigation away
    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            isDirty && currentLocation.pathname !== nextLocation.pathname,
    );

    const handleDirtyChange = useCallback((dirty: boolean) => {
        setIsDirty(dirty);
    }, []);

    if (isLoading) {
        return (
            <Page title="Edit Device">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 w-48 rounded bg-primary/10" />
                    <div className="h-64 rounded-xl bg-primary/5" />
                </div>
            </Page>
        );
    }

    if (isError || !device) {
        return (
            <Page title="Edit Device">
                <div className="text-center">
                    <p className="text-sm text-muted">Device not found.</p>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="mt-3"
                        onClick={() => navigate("/inventory/devices")}
                    >
                        Back to Devices
                    </Button>
                </div>
            </Page>
        );
    }

    const lastModified = device.updated_at
        ? `Last modified ${formatDistanceToNow(new Date(device.updated_at), { addSuffix: true })}`
        : null;

    return (
        <Page
            title={`Edit ${device.name}`}
            description="Update device properties and configuration."
        >
            <div className="mx-auto max-w-2xl">
                {lastModified && (
                    <p className="mb-4 text-xs text-muted">{lastModified}</p>
                )}
                <div className="rounded-xl border border-primary/10 bg-surface p-6">
                    <DeviceForm
                        initialValues={device}
                        onSubmit={(values) => mutation.mutate(values)}
                        onCancel={() => navigate(`/inventory/devices/${deviceId}`)}
                        isSubmitting={mutation.isPending}
                        submitLabel="Save Changes"
                        onDirtyChange={handleDirtyChange}
                    />
                    {mutation.isError && (
                        <p className="mt-3 text-sm text-red-500">
                            Failed to update device. Please check your inputs and try again.
                        </p>
                    )}
                </div>
            </div>

            {/* Unsaved changes blocker modal */}
            <Modal
                isOpen={blocker.state === "blocked"}
                title="Unsaved Changes"
                onClose={() => blocker.reset?.()}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => blocker.reset?.()}
                        >
                            Stay
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => blocker.proceed?.()}
                        >
                            Leave
                        </Button>
                    </div>
                }
            >
                <p className="text-sm text-text">
                    You have unsaved changes. Leave anyway?
                </p>
            </Modal>
        </Page>
    );
}
