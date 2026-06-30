import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef, OffsetPagination, SortingConfig } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useAuthorization } from "@/hooks/useAuthorization";
import { QUERY_KEYS } from "@/lib/constants";
import type { Platform } from "@/lib/types";

import {
  createAdminPlatform,
  deleteAdminPlatform,
  fetchAdminPlatforms,
  updateAdminPlatform,
} from "../api/admin.api";
import { PlatformForm, toPlatformPayload, type PlatformFormValues } from "../components/PlatformForm";

const PER_PAGE = 12;

const EMPTY_FORM: PlatformFormValues = {
  slug: "",
  display_name: "",
  vendor_hint: "",
  napalm_driver: "",
  netmiko_type: "",
  handler_entrypoint: "",
  ansible_network_os: "",
  notes: "",
  is_active: true,
};

function toFormValues(platform?: Platform | null): PlatformFormValues {
  if (!platform) {
    return EMPTY_FORM;
  }

  return {
    slug: platform.slug,
    display_name: platform.display_name ?? "",
    vendor_hint: platform.vendor_hint ?? "",
    napalm_driver: platform.napalm_driver ?? "",
    netmiko_type: platform.netmiko_type ?? "",
    handler_entrypoint: platform.handler_entrypoint ?? "",
    ansible_network_os: platform.ansible_network_os ?? "",
    notes: platform.notes ?? "",
    is_active: platform.is_active ?? true,
  };
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-block">
      <svg className="ml-1 inline h-3.5 w-3.5 cursor-help text-muted" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 w-64 -translate-x-1/2 rounded-lg bg-surface border border-primary/20 px-3 py-2 text-xs text-muted opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

export function PlatformsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { isOwner } = useAuthorization();
  const [page, setPage] = useState(1);
  const [slugFilter, setSlugFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [sortField, setSortField] = useState("display_name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<Platform | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Platform | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [formValues, setFormValues] = useState<PlatformFormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const queryOptions = useMemo(
    () => ({
      page,
      per_page: PER_PAGE,
      sort: sortDirection === "desc" ? `-${sortField}` : sortField,
      slug: slugFilter || undefined,
    }),
    [page, slugFilter, sortDirection, sortField],
  );

  const platformsQuery = useQuery({
    queryKey: [QUERY_KEYS.platforms, "admin", queryOptions],
    queryFn: () => fetchAdminPlatforms(queryOptions),
  });

  // Client-side vendor filter applied on top of server results
  const filteredPlatforms = useMemo(() => {
    const data = platformsQuery.data ?? [];
    if (!vendorFilter.trim()) return data;
    const lower = vendorFilter.trim().toLowerCase();
    return data.filter((p) => p.vendor_hint?.toLowerCase().includes(lower));
  }, [platformsQuery.data, vendorFilter]);

  const createMutation = useMutation({
    mutationFn: createAdminPlatform,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.platforms] });
      toast.success("Platform created successfully.");
      closeForm();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unable to save platform.";
      setFormError(message);
      toast.error(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Parameters<typeof updateAdminPlatform>[1] }) =>
      updateAdminPlatform(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.platforms] });
      toast.success("Platform updated successfully.");
      closeForm();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unable to save platform.";
      setFormError(message);
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminPlatform,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.platforms] });
      toast.success("Platform deleted.");
      setDeleteTarget(null);
      setDeleteConfirmText("");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to delete platform.");
    },
  });

  const sorting: SortingConfig = {
    field: sortField,
    direction: sortDirection,
    onSort: (field, direction) => {
      setPage(1);
      setSortField(field);
      setSortDirection(direction);
    },
  };

  const pagination: OffsetPagination = {
    mode: "offset",
    page,
    perPage: PER_PAGE,
    hasMore: (platformsQuery.data ?? []).length === PER_PAGE,
    onPageChange: setPage,
  };

  const columns: ColumnDef<Platform>[] = [
    {
      key: "slug",
      header: (
        <span className="inline-flex items-center">
          Slug
          <InfoTooltip text="A machine-readable identifier for this platform, used in API calls and automation scripts." />
        </span>
      ),
      accessor: (platform) => (
        <span className="inline-flex rounded-full border border-primary/20 px-2 py-1 font-mono text-xs text-primary">
          {platform.slug}
        </span>
      ),
      sortable: true,
    },
    {
      key: "display_name",
      header: "Display Name",
      accessor: (platform) => <span className="font-medium">{platform.display_name ?? "—"}</span>,
      sortable: true,
    },
    {
      key: "vendor_hint",
      header: "Vendor",
      accessor: (platform) => platform.vendor_hint ?? "—",
    },
    {
      key: "napalm_driver",
      header: (
        <span className="inline-flex items-center">
          NAPALM
          <InfoTooltip text="The NAPALM automation driver used to communicate with devices of this type. NAPALM (Network Automation and Programmability Abstraction Layer) supports multi-vendor operations." />
        </span>
      ),
      accessor: (platform) => platform.napalm_driver ?? "—",
    },
    {
      key: "netmiko_type",
      header: (
        <span className="inline-flex items-center">
          Netmiko
          <InfoTooltip text="The Netmiko SSH connection driver type for CLI-based automation commands." />
        </span>
      ),
      accessor: (platform) => <span className="font-mono text-xs">{platform.netmiko_type ?? "—"}</span>,
    },
    {
      key: "device_count",
      header: "Devices",
      accessor: (platform) => (
        <Link
          to={`/inventory/devices?platformId=${platform.id}`}
          className="text-primary underline hover:text-primary/80"
          onClick={(event) => event.stopPropagation()}
        >
          {platform.device_count ?? 0}
        </Link>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      accessor: (platform) =>
        isOwner ? (
          <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditingPlatform(platform);
                setFormValues(toFormValues(platform));
                setFormError(null);
                setIsFormOpen(true);
              }}
            >
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setDeleteTarget(platform); setDeleteConfirmText(""); }}>
              Delete
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted">Owner only</span>
        ),
    },
  ];

  function closeForm() {
    setEditingPlatform(null);
    setFormValues(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(false);
  }

  function handleSubmit() {
    const payload = toPlatformPayload(formValues);
    if (!payload.slug) {
      setFormError("Platform slug is required.");
      return;
    }

    setFormError(null);
    if (editingPlatform) {
      updateMutation.mutate({ id: editingPlatform.id, input: payload });
      return;
    }
    createMutation.mutate(payload);
  }

  return (
    <div className="space-y-4">
      {!isOwner ? (
        <div className="rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm text-primary">
          Platform edits are owner-only. Admin users can review metadata and device counts here.
        </div>
      ) : null}

      <details className="mb-4 rounded-xl border border-primary/10 bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium text-text hover:text-primary">
          About platforms ▾
        </summary>
        <p className="mt-2 text-sm text-muted">
          Platforms define how Orbit connects to and automates different types of network devices.
          Each platform maps a vendor's hardware to the correct automation drivers (NAPALM, Netmiko, Ansible).
          When you add a device, you assign it a platform so Orbit knows how to communicate with it.
        </p>
      </details>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[200px]">
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-muted">Search slug</label>
            <input
              value={slugFilter}
              onChange={(event) => {
                setPage(1);
                setSlugFilter(event.target.value);
              }}
              className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
              placeholder="cisco"
            />
          </div>
          <div className="min-w-[200px]">
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-muted">Vendor</label>
            <input
              value={vendorFilter}
              onChange={(event) => {
                setPage(1);
                setVendorFilter(event.target.value);
              }}
              className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
              placeholder="Cisco"
            />
          </div>
        </div>
        {isOwner ? (
          <Button
            onClick={() => {
              setEditingPlatform(null);
              setFormValues(EMPTY_FORM);
              setFormError(null);
              setIsFormOpen(true);
            }}
          >
            New platform
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={filteredPlatforms}
        keyExtractor={(platform) => platform.id}
        pagination={pagination}
        sorting={sorting}
        isLoading={platformsQuery.isLoading}
        isError={platformsQuery.isError}
        errorMessage="Unable to load platform metadata."
        onRetry={() => platformsQuery.refetch()}
        dense
        emptyState={<p className="text-sm text-muted">No platforms match the current filters.</p>}
      />

      <Modal
        isOpen={isFormOpen}
        onClose={closeForm}
        title={editingPlatform ? "Edit platform" : "Create platform"}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingPlatform ? "Save platform" : "Create platform"}
            </Button>
          </>
        }
      >
        <PlatformForm
          values={formValues}
          onChange={(field, value) => setFormValues((current) => ({ ...current, [field]: value as never }))}
          error={formError}
        />
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}
        title="Delete platform"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending || deleteConfirmText !== "DELETE"}
            >
              Delete platform
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-text">
            Delete <strong>{deleteTarget?.display_name ?? deleteTarget?.slug ?? "this platform"}</strong>.
          </p>
          {(deleteTarget?.device_count ?? 0) > 0 && (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
              Warning: Deleting this platform may leave{" "}
              <strong>{deleteTarget?.device_count}</strong> device(s) without a platform assignment.
            </p>
          )}
          <div className="space-y-1">
            <label className="block text-sm text-muted" htmlFor="platform-delete-confirm">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              id="platform-delete-confirm"
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
              placeholder="DELETE"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
