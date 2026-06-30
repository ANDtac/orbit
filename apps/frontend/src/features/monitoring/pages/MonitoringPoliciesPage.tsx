import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { createPolicy, deletePolicy, fetchPolicies, updatePolicy } from "@/features/monitoring/api/monitoring.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { CompliancePolicy } from "@/lib/types";

const DELETE_CONFIRMATION = "DELETE";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Request failed. Please try again.";
}

export function MonitoringPoliciesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<CompliancePolicy | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompliancePolicy | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: policies = [], isLoading, isError, refetch } = useQuery({
    queryKey: [QUERY_KEYS.compliancePolicies],
    queryFn: fetchPolicies,
  });

  const createMutation = useMutation({
    mutationFn: createPolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.compliancePolicies] });
      closeForm();
    },
    onError: (error: unknown) => {
      setFormError(toErrorMessage(error));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ policyId, input }: { policyId: number; input: { name: string; description?: string } }) =>
      updatePolicy(policyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.compliancePolicies] });
      closeForm();
    },
    onError: (error: unknown) => {
      setFormError(toErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.compliancePolicies] });
      setIsDeleteOpen(false);
      setDeleteTarget(null);
      setDeleteConfirmation("");
      setDeleteError(null);
    },
    onError: (error: unknown) => {
      setDeleteError(toErrorMessage(error));
    },
  });

  const canDelete = deleteConfirmation.trim().toUpperCase() === DELETE_CONFIRMATION;

  function closeForm() {
    setIsFormOpen(false);
    setEditingPolicy(null);
    setName("");
    setDescription("");
    setFormError(null);
  }

  function openCreateForm() {
    setEditingPolicy(null);
    setName("");
    setDescription("");
    setFormError(null);
    setIsFormOpen(true);
  }

  function onSubmit() {
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
    };

    if (!payload.name) {
      return;
    }

    setFormError(null);

    if (editingPolicy) {
      updateMutation.mutate({ policyId: editingPolicy.id, input: payload });
      return;
    }

    createMutation.mutate(payload);
  }

  const columns: ColumnDef<CompliancePolicy>[] = [
    {
      key: "name",
      header: "Name",
      accessor: (policy) => <span className="font-medium text-text">{policy.name}</span>,
    },
    {
      key: "status",
      header: "Status",
      accessor: (policy) => (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium uppercase tracking-[0.14em] ${
            policy.is_active
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-slate-500/10 text-slate-500"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${policy.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
          {policy.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      accessor: (policy) => <span className="text-muted">{policy.description ?? "—"}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      accessor: (policy) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditingPolicy(policy);
              setName(policy.name);
              setDescription(policy.description ?? "");
              setFormError(null);
              setIsFormOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDeleteTarget(policy);
              setDeleteError(null);
              setDeleteConfirmation("");
              setIsDeleteOpen(true);
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted">Monitoring keeps a contextual view of policy posture, but the primary authoring home now lives under Compliance.</p>
          <Link to="/compliance/policies" className="text-sm font-medium text-primary hover:underline">
            Open Compliance Policies
          </Link>
        </div>
        <Button onClick={openCreateForm}>New policy</Button>
      </div>

      <DataTable
        columns={columns}
        data={policies}
        keyExtractor={(policy) => policy.id}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        errorMessage="Unable to load policies right now."
        emptyState={
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted">No policies yet.</p>
            <Button size="sm" onClick={openCreateForm}>
              Create first policy
            </Button>
          </div>
        }
      />

      <Modal
        isOpen={isFormOpen}
        onClose={closeForm}
        title={editingPolicy ? "Edit policy" : "Create policy"}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>
              Cancel
            </Button>
            <Button onClick={onSubmit} disabled={!name.trim() || createMutation.isPending || updateMutation.isPending}>
              {editingPolicy ? "Save policy" : "Create policy"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="mt-1 text-xs text-muted">
            Fields marked <span className="text-red-500">*</span> are required.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-text">
              Policy name<span className="ml-0.5 text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              name="policy_name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g., NTP Configuration Check"
              className="w-full rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text">Description</label>
            <input
              name="policy_description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g., Ensures all devices have NTP servers configured per company standard."
              className="w-full rounded-xl border border-primary/30 bg-background px-3 py-2 text-sm text-text"
            />
          </div>
          {formError ? <p className="text-sm text-red-500">{formError}</p> : null}
        </div>
      </Modal>

      <Modal
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setDeleteTarget(null);
          setDeleteConfirmation("");
          setDeleteError(null);
        }}
        title="Confirm policy deletion"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setIsDeleteOpen(false);
                setDeleteTarget(null);
                setDeleteConfirmation("");
                setDeleteError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (deleteTarget) {
                  setDeleteError(null);
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
              disabled={!canDelete || deleteMutation.isPending}
            >
              Delete policy
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text">
            Delete <strong>{deleteTarget?.name ?? "this policy"}</strong>. Type <strong>{DELETE_CONFIRMATION}</strong> to
            confirm.
          </p>
          <Input
            name="delete_confirmation"
            label={`Type ${DELETE_CONFIRMATION} to confirm`}
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
          />
          {deleteError ? <p className="text-sm text-red-500">{deleteError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
