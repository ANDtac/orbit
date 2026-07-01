import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { QUERY_KEYS } from "@/lib/constants";
import type { CompliancePolicy, ComplianceRule } from "@/lib/types";

import {
  createPolicy,
  createRule,
  deletePolicy,
  deleteRule,
  evaluateCompliance,
  fetchPolicies,
  fetchRules,
  updatePolicy,
  updateRule,
} from "../api/compliance.api";
import { PolicyForm, type PolicyFormValues } from "../components/PolicyForm";
import { RulesPanel } from "../components/RulesPanel";

const EMPTY_POLICY_FORM: PolicyFormValues = {
  name: "",
  description: "",
  scope: "{}",
  is_active: true,
};

interface EvalSuccess {
  count: number;
  jobId: number;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed. Please try again.";
}

function statusDot(active: boolean): string {
  return active
    ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
    : "bg-slate-400";
}

function normalizePolicyForm(policy?: CompliancePolicy | null): PolicyFormValues {
  if (!policy) {
    return EMPTY_POLICY_FORM;
  }

  return {
    name: policy.name,
    description: policy.description ?? "",
    scope: JSON.stringify(policy.scope ?? {}, null, 2),
    is_active: policy.is_active,
  };
}

export function CompliancePoliciesPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<CompliancePolicy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompliancePolicy | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [formValues, setFormValues] = useState<PolicyFormValues>(EMPTY_POLICY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [evalSuccess, setEvalSuccess] = useState<EvalSuccess | null>(null);

  const policiesQuery = useQuery({
    queryKey: [QUERY_KEYS.compliancePolicies],
    queryFn: () => fetchPolicies({ per_page: 200 }),
  });

  const rulesQuery = useQuery({
    queryKey: [QUERY_KEYS.complianceRules],
    queryFn: () => fetchRules({ per_page: 200 }),
  });

  useEffect(() => {
    if (!policiesQuery.data?.length) {
      setSelectedPolicyId(null);
      return;
    }

    if (selectedPolicyId == null || !policiesQuery.data.some((policy) => policy.id === selectedPolicyId)) {
      setSelectedPolicyId(policiesQuery.data[0].id);
    }
  }, [policiesQuery.data, selectedPolicyId]);

  const createPolicyMutation = useMutation({
    mutationFn: createPolicy,
    onSuccess: (policy) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.compliancePolicies] });
      setSelectedPolicyId(policy.id);
      toast.success(`Policy "${policy.name}" created successfully.`);
      closeForm();
    },
    onError: (error) => {
      setFormError(toErrorMessage(error));
      toast.error(toErrorMessage(error));
    },
  });

  const updatePolicyMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Parameters<typeof updatePolicy>[1] }) =>
      updatePolicy(id, input),
    onSuccess: (policy) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.compliancePolicies] });
      toast.success(`Policy "${policy.name}" updated successfully.`);
      closeForm();
    },
    onError: (error) => {
      setFormError(toErrorMessage(error));
      toast.error(toErrorMessage(error));
    },
  });

  const deletePolicyMutation = useMutation({
    mutationFn: deletePolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.compliancePolicies] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.complianceRules] });
      toast.success(`Policy "${deleteTarget?.name ?? "policy"}" deleted.`);
      setDeleteTarget(null);
      setDeleteConfirmInput("");
    },
    onError: (error) => {
      toast.error(toErrorMessage(error));
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: createRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.complianceRules] });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Parameters<typeof updateRule>[1] }) =>
      updateRule(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.complianceRules] });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.complianceRules] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.complianceResults] });
    },
  });

  const evaluateMutation = useMutation({
    mutationFn: evaluateCompliance,
    onSuccess: (response, variables) => {
      const policyCount = variables.policy_ids?.length ?? 0;
      setEvalSuccess({ count: policyCount, jobId: response.job.id });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.jobs] });
    },
    onError: (error) => {
      toast.error(`Evaluation failed: ${toErrorMessage(error)}`);
    },
  });

  const selectedPolicy =
    policiesQuery.data?.find((policy) => policy.id === selectedPolicyId) ?? null;

  const rulesByPolicy = useMemo(() => {
    return (rulesQuery.data ?? []).reduce<Record<number, ComplianceRule[]>>((acc, rule) => {
      acc[rule.policy_id] = [...(acc[rule.policy_id] ?? []), rule];
      return acc;
    }, {});
  }, [rulesQuery.data]);

  function openCreateForm() {
    setEditingPolicy(null);
    setFormValues(EMPTY_POLICY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEditForm(policy: CompliancePolicy) {
    setEditingPolicy(policy);
    setFormValues(normalizePolicyForm(policy));
    setFormError(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setEditingPolicy(null);
    setFormValues(EMPTY_POLICY_FORM);
    setFormError(null);
    setIsFormOpen(false);
  }

  function handlePolicyChange(field: keyof PolicyFormValues, value: string | boolean) {
    setFormValues((current) => ({ ...current, [field]: value as never }));
  }

  function handlePolicySubmit() {
    let parsedScope: Record<string, unknown> | undefined;
    try {
      parsedScope = formValues.scope.trim()
        ? (JSON.parse(formValues.scope) as Record<string, unknown>)
        : undefined;
    } catch {
      setFormError("Scope must be valid JSON.");
      return;
    }

    if (!formValues.name.trim()) {
      setFormError("Policy name is required.");
      return;
    }

    const payload = {
      name: formValues.name.trim(),
      description: formValues.description.trim() || undefined,
      scope: parsedScope,
      is_active: formValues.is_active,
    };

    setFormError(null);
    if (editingPolicy) {
      updatePolicyMutation.mutate({ id: editingPolicy.id, input: payload });
      return;
    }

    createPolicyMutation.mutate(payload);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
      <section className="rounded-2xl border border-primary/10 bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Policy Catalog</p>
            <h2 className="mt-1 font-heading text-xl text-text">Compliance Policies</h2>
            <p className="mt-1 text-sm text-muted">
              Select a policy to view and manage its rules.
            </p>
          </div>
          <Button onClick={openCreateForm}>New policy</Button>
        </div>

        {evalSuccess ? (
          <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-primary">
            <p>
              Compliance evaluation started for {evalSuccess.count}{" "}
              {evalSuccess.count === 1 ? "policy" : "policies"}.{" "}
              <Link
                to="/automation/runs"
                className="underline text-primary hover:text-primary/80"
              >
                Track progress in Runs →
              </Link>
            </p>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {policiesQuery.isLoading ? <p className="text-sm text-muted">Loading policies…</p> : null}
          {policiesQuery.isError ? (
            <p className="text-sm text-red-500">Unable to load compliance policies.</p>
          ) : null}
          {(policiesQuery.data ?? []).map((policy) => {
            const isSelected = selectedPolicyId === policy.id;
            const ruleCount = rulesByPolicy[policy.id]?.length ?? 0;

            return (
              <article
                key={policy.id}
                aria-current={isSelected ? "true" : undefined}
                className={`cursor-pointer rounded-2xl border p-4 transition ${
                  isSelected
                    ? "border-l-4 border-primary bg-primary/10 ring-2 ring-primary/40 shadow-sm"
                    : "border-primary/10 bg-background/40 hover:bg-primary/5"
                }`}
                onClick={() => setSelectedPolicyId(policy.id)}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusDot(policy.is_active)}`} />
                      <h3 className="font-medium text-text">{policy.name}</h3>
                      {isSelected ? (
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          Selected
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted">{policy.description ?? "No description provided."}</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted">
                      <span>{policy.is_active ? "Active" : "Inactive"}</span>
                      <span>•</span>
                      <span>{ruleCount} rules</span>
                    </div>
                  </div>
                  <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => openEditForm(policy)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDeleteTarget(policy);
                        setDeleteConfirmInput("");
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
          {!policiesQuery.isLoading && !(policiesQuery.data ?? []).length ? (
            <div className="rounded-2xl border border-dashed border-primary/20 bg-background/40 px-4 py-6 text-center text-sm text-muted">
              No compliance policies exist yet.
            </div>
          ) : null}
        </div>
      </section>

      <RulesPanel
        policy={selectedPolicy}
        rules={selectedPolicy ? rulesByPolicy[selectedPolicy.id] ?? [] : []}
        isLoading={rulesQuery.isLoading}
        onEvaluate={async (policy) => {
          await evaluateMutation.mutateAsync({ policy_ids: [policy.id], async: true });
        }}
        onCreateRule={async (policy, input) => {
          await createRuleMutation.mutateAsync({
            policy_id: policy.id,
            ...input,
          });
        }}
        onUpdateRule={async (rule, input) => {
          await updateRuleMutation.mutateAsync({ id: rule.id, input });
        }}
        onDeleteRule={async (rule) => {
          await deleteRuleMutation.mutateAsync(rule.id);
        }}
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
            <Button
              onClick={handlePolicySubmit}
              disabled={createPolicyMutation.isPending || updatePolicyMutation.isPending}
            >
              {editingPolicy ? "Save policy" : "Create policy"}
            </Button>
          </>
        }
      >
        <PolicyForm values={formValues} onChange={handlePolicyChange} error={formError} />
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteConfirmInput("");
        }}
        title="Delete policy"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmInput("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => deleteTarget && deletePolicyMutation.mutate(deleteTarget.id)}
              disabled={deletePolicyMutation.isPending || deleteConfirmInput !== "DELETE"}
            >
              Delete policy
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text">
            Delete <strong>{deleteTarget?.name ?? "this policy"}</strong> and its associated rules. This action cannot be undone.
          </p>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-text" htmlFor="delete_confirm_input">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              id="delete_confirm_input"
              type="text"
              value={deleteConfirmInput}
              onChange={(event) => setDeleteConfirmInput(event.target.value)}
              placeholder="DELETE"
              className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text shadow-sm transition focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
