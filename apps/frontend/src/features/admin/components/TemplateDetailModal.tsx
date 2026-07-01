import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { OperationTemplate } from "@/lib/types";

interface TemplateDetailModalProps {
  isOpen: boolean;
  template: OperationTemplate | null;
  platformName?: string;
  onClose: () => void;
  onEdit: () => void;
}

// ─── Relative date helper ────────────────────────────────────────────────────

function relativeDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (!Number.isFinite(diff)) return "—";
  const seconds = Math.round(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

// ─── Template preview helpers ─────────────────────────────────────────────────

interface VariableDef {
  type?: string;
  required?: boolean;
  default?: string;
}

function buildPreview(
  templateBody: string,
  variables: Record<string, unknown>,
): Array<{ text: string; amber: boolean }> {
  const result: Array<{ text: string; amber: boolean }> = [];
  let remaining = templateBody;

  const regex = /\{\{\s*(\w+)\s*\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  regex.lastIndex = 0;
  while ((match = regex.exec(templateBody)) !== null) {
    const before = templateBody.slice(lastIndex, match.index);
    if (before) result.push({ text: before, amber: false });

    const varName = match[1];
    const varDef = (variables[varName] ?? {}) as VariableDef;
    if (varDef.default != null && varDef.default !== "") {
      result.push({ text: varDef.default, amber: false });
    } else {
      result.push({ text: `{{ ${varName} }}`, amber: true });
    }

    lastIndex = match.index + match[0].length;
  }

  remaining = templateBody.slice(lastIndex);
  if (remaining) result.push({ text: remaining, amber: false });

  return result;
}

// ─── Preview modal ────────────────────────────────────────────────────────────

interface PreviewModalProps {
  isOpen: boolean;
  template: OperationTemplate;
  onClose: () => void;
}

function TemplatePreviewModal({ isOpen, template, onClose }: PreviewModalProps): JSX.Element {
  // TODO: Add a 'Test on device' option that actually executes on a selected test device after backend execution endpoint is available
  const vars = (template.variables ?? {}) as Record<string, unknown>;
  const segments = buildPreview(template.template, vars);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Template Preview"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-sm font-medium text-amber-600">Preview only</p>
          <p className="mt-0.5 text-xs text-muted">
            This is a preview only. No commands are sent to any device.
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Rendered output</p>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-primary/10 bg-background/60 p-4 font-mono text-xs text-text">
            {segments.map((seg, i) =>
              seg.amber ? (
                <span key={i} className="rounded bg-amber-500/20 px-0.5 text-amber-600">
                  {seg.text}
                </span>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </pre>
          {segments.some((s) => s.amber) ? (
            <p className="mt-2 text-xs text-muted">
              <span className="rounded bg-amber-500/20 px-0.5 text-amber-600">Highlighted</span>{" "}
              variables have no default value — they will be filled in at execution time.
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

// ─── Main detail modal ────────────────────────────────────────────────────────

export function TemplateDetailModal({
  isOpen,
  template,
  platformName,
  onClose,
  onEdit,
}: TemplateDetailModalProps): JSX.Element | null {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  if (!template) {
    return null;
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={template.name}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="outline" onClick={() => setIsPreviewOpen(true)}>
              Preview template
            </Button>
            <Button onClick={onEdit}>Edit Template</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-primary/10 bg-background/40 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Platform</p>
              <p className="mt-2 text-sm font-medium text-text">{platformName ?? `Platform #${template.platform_id}`}</p>
            </div>
            <div className="rounded-xl border border-primary/10 bg-background/40 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Operation Type</p>
              <p className="mt-2 inline-flex rounded-full border border-primary/20 px-2 py-1 font-mono text-xs text-primary">
                {template.op_type}
              </p>
            </div>
            <div className="rounded-xl border border-primary/10 bg-background/40 p-4">
              {/* Backend template serialization exposes no usage/execution count, so we
                  surface the truthful last-modified time rather than an invented usage metric. */}
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Last modified</p>
              <p className="mt-2 text-sm font-medium text-text">{relativeDate(template.updated_at)}</p>
            </div>
          </div>

          {template.description ? (
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Description</p>
              <p className="mt-2 text-sm text-text">{template.description}</p>
            </div>
          ) : null}

          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Template</p>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-primary/10 bg-background/60 p-4 font-mono text-xs text-text">
              {template.template}
            </pre>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Variables</p>
              <pre className="mt-2 overflow-x-auto rounded-xl border border-primary/10 bg-background/60 p-4 font-mono text-xs text-text">
                {JSON.stringify(template.variables ?? {}, null, 2)}
              </pre>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Notes</p>
              <div className="mt-2 rounded-xl border border-primary/10 bg-background/60 p-4 text-sm text-text">
                {template.notes || "No notes recorded."}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {isPreviewOpen ? (
        <TemplatePreviewModal
          isOpen={isPreviewOpen}
          template={template}
          onClose={() => setIsPreviewOpen(false)}
        />
      ) : null}
    </>
  );
}
