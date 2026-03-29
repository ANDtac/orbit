import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { createPolicy, deletePolicy, fetchPolicies, updatePolicy } from "@/features/monitoring/api/monitoring.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { CompliancePolicy } from "@/lib/types";

const DELETE_CONFIRMATION = "DELETE";

export function MonitoringPoliciesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<CompliancePolicy | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompliancePolicy | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: policies = [], isLoading, isError } = useQuery({
    queryKey: [QUERY_KEYS.compliancePolicies],
    queryFn: fetchPolicies,
  });

  const createMutation = useMutation({
    mutationFn: createPolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.compliancePolicies] });
      closeForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ policyId, input }: { policyId: number; input: { name: string; description?: string } }) =>
      updatePolicy(policyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.compliancePolicies] });
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.compliancePolicies] });
      setIsDeleteOpen(false);
      setDeleteTarget(null);
      setDeleteConfirmation("");
    },
  });

  const canDelete = useMemo(
    () => deleteConfirmation.trim().toUpperCase() === DELETE_CONFIRMATION,
    [deleteConfirmation],
  );

  function closeForm() {
    setIsFormOpen(false);
    setEditingPolicy(null);
    setName("");
    setDescription("");
  }

  function onSubmit() {
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
    };

    if (!payload.name) {
      return;
    }

    if (editingPolicy) {
      updateMutation.mutate({ policyId: editingPolicy.id, input: payload });
      return;
    }

    createMutation.mutate(payload);
  }

  if (isLoading) {
    return <p className="text-muted">Loading policies…</p>;
  }

  if (isError) {
    return <p className="text-red-500">Unable to load policies right now.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Author monitoring/compliance policies in Orbit-native workflows.</p>
        <Button onClick={() => setIsFormOpen(true)}>New policy</Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-primary/10">
        <table className="min-w-full divide-y divide-primary/10">
          <thead className="bg-primary/10">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-primary">Name</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-primary">Status</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-primary">Description</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-primary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-primary/5 bg-surface">
            {policies.map((policy) => (
              <tr key={policy.id}>
                <td className="px-4 py-3 text-sm font-medium text-text">{policy.name}</td>
                <td className="px-4 py-3 text-sm uppercase text-text">{policy.is_active ? "active" : "inactive"}</td>
                <td className="px-4 py-3 text-sm text-muted">{policy.description ?? "—"}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingPolicy(policy);
                        setName(policy.name);
                        setDescription(policy.description ?? "");
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
                        setIsDeleteOpen(true);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
          <Input name="policy_name" label="Policy name" value={name} onChange={(event) => setName(event.target.value)} />
          <Input
            name="policy_description"
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setDeleteTarget(null);
          setDeleteConfirmation("");
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
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (deleteTarget) {
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
        </div>
      </Modal>
    </div>
  );
}
