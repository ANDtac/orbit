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
import type { CredentialProfile } from "@/lib/types";

import {
  createAdminCredentialProfile,
  deleteAdminCredentialProfile,
  fetchAdminCredentialProfiles,
  updateAdminCredentialProfile,
} from "../api/admin.api";
import { CredentialForm, toCredentialPayload, type CredentialFormValues } from "../components/CredentialForm";

const PER_PAGE = 12;

const EMPTY_FORM: CredentialFormValues = {
  name: "",
  description: "",
  auth_type: "username_password",
  username: "",
  secret_ref: "",
  is_active: true,
};

function maskSecretRef(secretRef?: string): string {
  if (!secretRef) {
    return "—";
  }
  if (secretRef.length <= 10) {
    return `${secretRef.slice(0, 2)}***`;
  }
  return `${secretRef.slice(0, 6)}***${secretRef.slice(-4)}`;
}

function toFormValues(profile?: CredentialProfile | null): CredentialFormValues {
  if (!profile) {
    return EMPTY_FORM;
  }

  return {
    name: profile.name,
    description: profile.description ?? "",
    auth_type: profile.auth_type ?? "username_password",
    username: profile.username ?? "",
    secret_ref: profile.secret_ref ?? "",
    is_active: profile.is_active ?? true,
  };
}

export function CredentialsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const { isOwner } = useAuthorization();
  const [page, setPage] = useState(1);
  const [nameFilter, setNameFilter] = useState("");
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<CredentialProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CredentialProfile | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [formValues, setFormValues] = useState<CredentialFormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const queryOptions = useMemo(
    () => ({
      page,
      per_page: PER_PAGE,
      sort: sortDirection === "desc" ? `-${sortField}` : sortField,
      name: nameFilter || undefined,
    }),
    [nameFilter, page, sortDirection, sortField],
  );

  const credentialsQuery = useQuery({
    queryKey: [QUERY_KEYS.credentialProfiles, "admin", queryOptions],
    queryFn: () => fetchAdminCredentialProfiles(queryOptions),
  });

  const createMutation = useMutation({
    mutationFn: createAdminCredentialProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.credentialProfiles] });
      toast.success("Credential profile created successfully.");
      closeForm();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unable to save credential profile.";
      setFormError(message);
      toast.error(message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Parameters<typeof updateAdminCredentialProfile>[1] }) =>
      updateAdminCredentialProfile(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.credentialProfiles] });
      toast.success("Credential profile updated successfully.");
      closeForm();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unable to save credential profile.";
      setFormError(message);
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAdminCredentialProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.credentialProfiles] });
      toast.success("Credential profile deleted.");
      setDeleteTarget(null);
      setDeleteConfirmText("");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to delete credential profile.");
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
    hasMore: (credentialsQuery.data ?? []).length === PER_PAGE,
    onPageChange: setPage,
  };

  const columns: ColumnDef<CredentialProfile>[] = [
    {
      key: "name",
      header: "Name",
      accessor: (profile) => <span className="font-medium">{profile.name}</span>,
      sortable: true,
    },
    {
      key: "auth_type",
      header: "Auth Type",
      accessor: (profile) => (
        <span className="inline-flex rounded-full border border-primary/20 px-2 py-1 text-xs font-semibold text-primary">
          {profile.auth_type ?? "unknown"}
        </span>
      ),
    },
    {
      key: "username",
      header: "Username",
      accessor: (profile) => profile.username ?? "—",
    },
    {
      key: "secret_ref",
      header: "Secret Ref",
      accessor: (profile) => <span className="font-mono text-xs">{maskSecretRef(profile.secret_ref)}</span>,
    },
    {
      key: "device_count",
      header: "Devices",
      // TODO: The `credentialProfileId` filter param may not be supported by the devices list API yet — add backend support when available.
      accessor: (profile) => (
        <Link
          to={`/inventory/devices?credentialProfileId=${profile.id}`}
          className="text-primary underline hover:text-primary/80"
          onClick={(event) => event.stopPropagation()}
        >
          {profile.device_count ?? 0}
        </Link>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      accessor: (profile) =>
        isOwner ? (
          <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditingProfile(profile);
                setFormValues(toFormValues(profile));
                setFormError(null);
                setIsFormOpen(true);
              }}
            >
              Edit
            </Button>
            {/* TODO: Implement test connection — call POST /api/v1/admin/credential-profiles/{id}/test which attempts to resolve the secret ref and verify SSH connectivity to a sample device */}
            <Button
              variant="ghost"
              size="sm"
              disabled
              title="Coming soon"
            >
              Test
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDeleteTarget(profile);
                setDeleteConfirmText("");
              }}
            >
              Delete
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted">Owner only</span>
        ),
    },
  ];

  function closeForm() {
    setEditingProfile(null);
    setFormValues(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(false);
  }

  function handleSubmit() {
    const payload = toCredentialPayload(formValues);
    if (!payload.name || !payload.auth_type) {
      setFormError("Name and auth type are required.");
      return;
    }

    setFormError(null);
    if (editingProfile) {
      updateMutation.mutate({ id: editingProfile.id, input: payload });
      return;
    }
    createMutation.mutate(payload);
  }

  return (
    <div className="space-y-4">
      {!isOwner ? (
        <div className="rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3 text-sm text-primary">
          Credential profile edits are owner-only. Admin users can inspect metadata and profile usage here.
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[240px]">
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-muted">Search name</label>
          <input
            value={nameFilter}
            onChange={(event) => {
              setPage(1);
              setNameFilter(event.target.value);
            }}
            className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
            placeholder="SSH"
          />
        </div>
        {isOwner ? (
          <Button
            onClick={() => {
              setEditingProfile(null);
              setFormValues(EMPTY_FORM);
              setFormError(null);
              setIsFormOpen(true);
            }}
          >
            New credential profile
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={credentialsQuery.data ?? []}
        keyExtractor={(profile) => profile.id}
        pagination={pagination}
        sorting={sorting}
        isLoading={credentialsQuery.isLoading}
        isError={credentialsQuery.isError}
        errorMessage="Unable to load credential profiles."
        onRetry={() => credentialsQuery.refetch()}
        dense
        emptyState={<p className="text-sm text-muted">No credential profiles match the current filters.</p>}
      />

      <Modal
        isOpen={isFormOpen}
        onClose={closeForm}
        title={editingProfile ? "Edit credential profile" : "Create credential profile"}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingProfile ? "Save profile" : "Create profile"}
            </Button>
          </>
        }
      >
        <CredentialForm
          values={formValues}
          onChange={(field, value) => setFormValues((current) => ({ ...current, [field]: value as never }))}
          error={formError}
        />
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}
        title="Delete credential profile"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending || deleteConfirmText !== "DELETE"}
            >
              Delete profile
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-text">
            Delete <strong>{deleteTarget?.name ?? "this credential profile"}</strong>.
          </p>
          {(deleteTarget?.device_count ?? 0) > 0 && (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
              Warning: Deleting this credential profile may prevent Orbit from connecting to{" "}
              <strong>{deleteTarget?.device_count}</strong> device(s).
            </p>
          )}
          <div className="space-y-1">
            <label className="block text-sm text-muted" htmlFor="credential-delete-confirm">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              id="credential-delete-confirm"
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
