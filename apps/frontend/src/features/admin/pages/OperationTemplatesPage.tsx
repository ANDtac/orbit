import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef, OffsetPagination, SortingConfig } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { fetchPlatforms } from "@/features/devices/api/platforms.api";
import {
  createOperationTemplate,
  deleteOperationTemplate,
  fetchOperationTemplates,
  updateOperationTemplate,
  type OperationTemplateInput,
} from "@/features/admin/api/operationTemplates.api";
import { QUERY_KEYS } from "@/lib/constants";
import type { OperationTemplate, Platform } from "@/lib/types";

import { TemplateDetailModal } from "../components/TemplateDetailModal";
import { TemplateForm, type TemplateFormValues } from "../components/TemplateForm";

const PER_PAGE = 12;

const EMPTY_TEMPLATE_FORM: TemplateFormValues = {
  platform_id: "",
  name: "",
  description: "",
  op_type: "",
  template: "",
  variables: "{}",
  notes: "",
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed. Please try again.";
}

function truncate(value?: string, length = 72): string {
  if (!value) {
    return "—";
  }
  return value.length > length ? `${value.slice(0, length).trimEnd()}…` : value;
}

function normalizeTemplateForm(template?: OperationTemplate | null): TemplateFormValues {
  if (!template) {
    return EMPTY_TEMPLATE_FORM;
  }

  return {
    platform_id: String(template.platform_id),
    name: template.name,
    description: template.description ?? "",
    op_type: template.op_type,
    template: template.template,
    variables: JSON.stringify(template.variables ?? {}, null, 2),
    notes: template.notes ?? "",
  };
}

export function OperationTemplatesPage(): JSX.Element {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [platformFilter, setPlatformFilter] = useState("");
  const [opTypeFilter, setOpTypeFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [sortField, setSortField] = useState("updated_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [formValues, setFormValues] = useState<TemplateFormValues>(EMPTY_TEMPLATE_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<OperationTemplate | null>(null);
  const [detailTemplate, setDetailTemplate] = useState<OperationTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OperationTemplate | null>(null);
  const [deletePhrase, setDeletePhrase] = useState("");

  const queryOptions = useMemo(
    () => ({
      page,
      per_page: PER_PAGE,
      sort: sortDirection === "desc" ? `-${sortField}` : sortField,
      platform_id: platformFilter ? Number(platformFilter) : undefined,
      op_type: opTypeFilter || undefined,
      name: nameFilter || undefined,
    }),
    [page, platformFilter, opTypeFilter, nameFilter, sortDirection, sortField],
  );

  const { data: templates = [], isLoading, isError, refetch } = useQuery({
    queryKey: [QUERY_KEYS.operationTemplates, queryOptions],
    queryFn: () => fetchOperationTemplates(queryOptions),
  });

  const { data: platforms = [] } = useQuery({
    queryKey: [QUERY_KEYS.platforms],
    queryFn: fetchPlatforms,
    staleTime: 5 * 60 * 1000,
  });

  const platformNames = useMemo(
    () =>
      platforms.reduce<Record<number, string>>((acc, platform) => {
        acc[platform.id] = platform.display_name;
        return acc;
      }, {}),
    [platforms],
  );

  const createMutation = useMutation({
    mutationFn: createOperationTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.operationTemplates] });
      toast.success("Template created successfully.");
      closeForm();
    },
    onError: (error: unknown) => {
      const msg = toErrorMessage(error);
      setFormError(msg);
      toast.error(msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<OperationTemplateInput> }) =>
      updateOperationTemplate(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.operationTemplates] });
      toast.success("Template updated successfully.");
      closeForm();
    },
    onError: (error: unknown) => {
      const msg = toErrorMessage(error);
      setFormError(msg);
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOperationTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.operationTemplates] });
      toast.success("Template deleted.");
      setDeleteTarget(null);
      setDeletePhrase("");
    },
    onError: (error: unknown) => {
      toast.error(toErrorMessage(error));
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (template: OperationTemplate) => {
      const payload: OperationTemplateInput = {
        platform_id: template.platform_id,
        name: `${template.name} (copy)`,
        description: template.description ?? undefined,
        op_type: template.op_type,
        template: template.template,
        variables: template.variables ?? undefined,
        notes: template.notes ?? undefined,
      };
      return createOperationTemplate(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.operationTemplates] });
      toast.success("Template duplicated.");
    },
    onError: (error: unknown) => {
      toast.error(toErrorMessage(error));
    },
  });

  const pagination: OffsetPagination = {
    mode: "offset",
    page,
    perPage: PER_PAGE,
    hasMore: templates.length === PER_PAGE,
    onPageChange: setPage,
  };

  function closeForm() {
    setEditingTemplate(null);
    setFormValues(EMPTY_TEMPLATE_FORM);
    setFormError(null);
    setIsFormOpen(false);
  }

  function openCreateForm() {
    setEditingTemplate(null);
    setFormValues(EMPTY_TEMPLATE_FORM);
    setFormError(null);
    setIsFormOpen(true);
  }

  function openEditForm(template: OperationTemplate) {
    setEditingTemplate(template);
    setFormValues(normalizeTemplateForm(template));
    setFormError(null);
    setIsFormOpen(true);
  }

  function handleFormChange(field: keyof TemplateFormValues, value: string) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit() {
    let parsedVariables: Record<string, unknown>;

    try {
      parsedVariables = JSON.parse(formValues.variables || "{}") as Record<string, unknown>;
    } catch {
      setFormError("Variables must be valid JSON.");
      return;
    }

    if (!formValues.platform_id || !formValues.name.trim() || !formValues.op_type.trim() || !formValues.template.trim()) {
      setFormError("Platform, name, operation type, and template body are required.");
      return;
    }

    const payload: OperationTemplateInput = {
      platform_id: Number(formValues.platform_id),
      name: formValues.name.trim(),
      description: formValues.description.trim() || undefined,
      op_type: formValues.op_type.trim(),
      template: formValues.template,
      variables: parsedVariables,
      notes: formValues.notes.trim() || undefined,
    };

    setFormError(null);

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, input: payload });
      return;
    }

    createMutation.mutate(payload);
  }

  const columns: ColumnDef<OperationTemplate>[] = [
    {
      key: "name",
      header: "Name",
      accessor: (template) => <span className="font-medium">{template.name}</span>,
      sortable: true,
    },
    {
      key: "op_type",
      header: "Type",
      accessor: (template) => (
        <span className="inline-flex rounded-full border border-primary/20 px-2 py-1 font-mono text-xs text-primary">
          {template.op_type}
        </span>
      ),
    },
    {
      key: "platform_id",
      header: "Platform",
      accessor: (template) => platformNames[template.platform_id] ?? `Platform #${template.platform_id}`,
    },
    {
      key: "description",
      header: "Description",
      accessor: (template) => <span className="text-muted">{truncate(template.description)}</span>,
    },
    {
      key: "updated_at",
      header: "Last modified",
      accessor: (template) => (template.updated_at ? new Date(template.updated_at).toLocaleString() : "—"),
      sortable: true,
    },
    {
      key: "actions",
      header: "Actions",
      accessor: (template) => (
        <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => openEditForm(template)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => duplicateMutation.mutate(template)}
            disabled={duplicateMutation.isPending}
          >
            Duplicate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDeleteTarget(template);
              setDeletePhrase("");
            }}
          >
            Delete
          </Button>
        </div>
      ),
      cellClassName: "w-[260px]",
    },
  ];

  const sorting: SortingConfig = {
    field: sortField,
    direction: sortDirection,
    onSort: (field, direction) => {
      setPage(1);
      setSortField(field);
      setSortDirection(direction);
    },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <label className="mb-1 block text-xs font-medium text-muted">Search</label>
            <input
              value={nameFilter}
              onChange={(event) => {
                setPage(1);
                setNameFilter(event.target.value);
              }}
              className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
              placeholder="Template name"
            />
          </div>
          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-muted">Platform</label>
            <select
              value={platformFilter}
              onChange={(event) => {
                setPage(1);
                setPlatformFilter(event.target.value);
              }}
              className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
            >
              <option value="">All platforms</option>
              {platforms.map((platform: Platform) => (
                <option key={platform.id} value={String(platform.id)}>
                  {platform.display_name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-muted">Operation Type</label>
            <input
              value={opTypeFilter}
              onChange={(event) => {
                setPage(1);
                setOpTypeFilter(event.target.value);
              }}
              className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
              placeholder="backup"
            />
          </div>
        </div>

        <Button onClick={openCreateForm}>New template</Button>
      </div>

      <DataTable
        columns={columns}
        data={templates}
        keyExtractor={(template) => template.id}
        pagination={pagination}
        sorting={sorting}
        isLoading={isLoading}
        isError={isError}
        errorMessage="Unable to load operation templates."
        onRetry={() => refetch()}
        onRowClick={(template) => setDetailTemplate(template)}
        dense
        emptyState={
          <div className="space-y-3 py-4 text-center">
            <p className="text-sm text-muted">No operation templates match the current filters.</p>
            <Button size="sm" onClick={openCreateForm}>
              Create first template
            </Button>
          </div>
        }
      />

      <Modal
        isOpen={isFormOpen}
        onClose={closeForm}
        title={editingTemplate ? "Edit template" : "Create template"}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingTemplate ? "Save template" : "Create template"}
            </Button>
          </>
        }
      >
        <TemplateForm
          platforms={platforms}
          values={formValues}
          onChange={handleFormChange}
          error={formError}
        />
      </Modal>

      <TemplateDetailModal
        isOpen={Boolean(detailTemplate)}
        template={detailTemplate}
        platformName={detailTemplate ? platformNames[detailTemplate.platform_id] : undefined}
        onClose={() => setDetailTemplate(null)}
        onEdit={() => {
          if (!detailTemplate) {
            return;
          }
          setDetailTemplate(null);
          openEditForm(detailTemplate);
        }}
      />

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => {
          setDeleteTarget(null);
          setDeletePhrase("");
        }}
        title="Delete template"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteTarget(null);
                setDeletePhrase("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending || deletePhrase.trim() !== "DELETE"}
            >
              Delete template
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text">
            Delete <strong>{deleteTarget?.name ?? "this template"}</strong>. The rendered workflow itself is not executed,
            but this reusable template will no longer be available to operators.
          </p>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-muted">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              value={deletePhrase}
              onChange={(event) => setDeletePhrase(event.target.value)}
              className="w-full rounded-xl border border-primary/30 bg-surface px-3 py-2 text-sm text-text"
              placeholder="DELETE"
              autoComplete="off"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
