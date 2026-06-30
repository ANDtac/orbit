import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { DeviceConfigSnapshot } from "@/lib/types";

interface SnapshotDiffModalProps {
  isOpen: boolean;
  left: DeviceConfigSnapshot | null;
  right: DeviceConfigSnapshot | null;
  leftLabel: string;
  rightLabel: string;
  onClose: () => void;
}

// ─── Diff algorithm ───────────────────────────────────────────────────────────

interface DiffRow {
  left?: string;
  right?: string;
  status: "same" | "removed" | "added";
  leftLineNum?: number;
  rightLineNum?: number;
}

function diffLines(a: string, b: string): DiffRow[] {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  // Simple sequential diff — pair by line number, flag mismatches
  const result: DiffRow[] = [];
  const maxLen = Math.max(aLines.length, bLines.length);
  let leftNum = 1;
  let rightNum = 1;
  for (let i = 0; i < maxLen; i++) {
    const l = aLines[i];
    const r = bLines[i];
    if (l === r) {
      result.push({ left: l, right: r, status: "same", leftLineNum: leftNum++, rightLineNum: rightNum++ });
    } else {
      if (l !== undefined) {
        result.push({ left: l, right: undefined, status: "removed", leftLineNum: leftNum++ });
      }
      if (r !== undefined) {
        result.push({ left: undefined, right: r, status: "added", rightLineNum: rightNum++ });
      }
    }
  }
  return result;
}

// ─── Row styling helpers ──────────────────────────────────────────────────────

function leftRowClass(status: DiffRow["status"]): string {
  if (status === "removed") return "bg-red-500/10 text-red-600";
  return "text-text";
}

function rightRowClass(status: DiffRow["status"]): string {
  if (status === "added") return "bg-emerald-500/10 text-emerald-600";
  return "text-text";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SnapshotDiffModal({
  isOpen,
  left,
  right,
  leftLabel,
  rightLabel,
  onClose,
}: SnapshotDiffModalProps): JSX.Element | null {
  if (!left || !right) {
    return null;
  }

  const rows = diffLines(left.config_text, right.config_text);
  const changedCount = rows.filter((r) => r.status !== "same").length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Compare Snapshots"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-primary/10 bg-background/40 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Left Snapshot</p>
            <p className="mt-2 text-sm font-medium text-text">{leftLabel}</p>
            <p className="mt-1 font-mono text-xs text-muted">{left.config_hash ?? `Snapshot #${left.id}`}</p>
          </div>
          <div className="rounded-xl border border-primary/10 bg-background/40 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Right Snapshot</p>
            <p className="mt-2 text-sm font-medium text-text">{rightLabel}</p>
            <p className="mt-1 font-mono text-xs text-muted">{right.config_hash ?? `Snapshot #${right.id}`}</p>
          </div>
        </div>

        {changedCount > 0 ? (
          <p className="text-xs text-muted">
            <span className="font-medium text-text">{changedCount}</span> differing line{changedCount !== 1 ? "s" : ""} detected.
          </p>
        ) : (
          <p className="text-xs text-emerald-600">Snapshots are identical.</p>
        )}

        <div className="grid max-h-[60vh] gap-4 overflow-hidden md:grid-cols-2">
          {/* Left pane */}
          <div className="overflow-auto rounded-xl border border-primary/10 bg-background/60">
            <div className="sticky top-0 border-b border-primary/10 bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              {leftLabel}
            </div>
            <div className="font-mono text-xs">
              {rows.map((row, index) => {
                const hasLeft = row.left !== undefined;
                return (
                  <div
                    key={`left-${index}`}
                    className={`flex items-start ${leftRowClass(row.status)}`}
                  >
                    <span className="w-10 shrink-0 select-none border-r border-primary/10 px-2 py-1 text-right text-muted opacity-60">
                      {hasLeft ? row.leftLineNum : ""}
                    </span>
                    <span className="flex-1 px-3 py-1 whitespace-pre">
                      {hasLeft ? row.left || " " : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right pane */}
          <div className="overflow-auto rounded-xl border border-primary/10 bg-background/60">
            <div className="sticky top-0 border-b border-primary/10 bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              {rightLabel}
            </div>
            <div className="font-mono text-xs">
              {rows.map((row, index) => {
                const hasRight = row.right !== undefined;
                return (
                  <div
                    key={`right-${index}`}
                    className={`flex items-start ${rightRowClass(row.status)}`}
                  >
                    <span className="w-10 shrink-0 select-none border-r border-primary/10 px-2 py-1 text-right text-muted opacity-60">
                      {hasRight ? row.rightLineNum : ""}
                    </span>
                    <span className="flex-1 px-3 py-1 whitespace-pre">
                      {hasRight ? row.right || " " : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
