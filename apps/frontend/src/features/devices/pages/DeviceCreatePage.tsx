import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Page } from "@/components/layout/Page";
import { QUERY_KEYS } from "@/lib/constants";
import { createDevice } from "../api/devices.api";
import { DeviceForm } from "../components/DeviceForm";
import type { DeviceCreateInput } from "@/lib/types";

export function DeviceCreatePage(): JSX.Element {
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const mutation = useMutation({
        mutationFn: createDevice,
        onSuccess: (device) => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.devices] });
            toast.success("Device created");
            navigate(`/inventory/devices/${device.id}`);
        },
        onError: () => {
            toast.error("Failed to create device");
        },
    });

    return (
        <Page title="Add Device" description="Register a new device in the inventory.">
            <div className="mx-auto max-w-2xl rounded-xl border border-primary/10 bg-surface p-6">
                <DeviceForm
                    onSubmit={(values: DeviceCreateInput) => mutation.mutate(values)}
                    onCancel={() => navigate("/inventory/devices")}
                    isSubmitting={mutation.isPending}
                    submitLabel="Create Device"
                />
                {mutation.isError && (
                    <p className="mt-3 text-sm text-red-500">
                        Failed to create device. Please check your inputs and try again.
                    </p>
                )}
            </div>
        </Page>
    );
}
