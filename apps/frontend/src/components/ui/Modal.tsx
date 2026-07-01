import { useEffect, useId } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalSize = "sm" | "md" | "lg" | "xl";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Controls the max width of the dialog. Defaults to "md" (max-w-lg). */
  size?: ModalSize;
  /** Optional slot rendered in the header, left of the close button. */
  headerActions?: ReactNode;
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

// ---------------------------------------------------------------------------
// Shared body scroll lock — reference-counted so nested modals don't
// prematurely restore scrolling when an inner (or outer) modal closes.
// ---------------------------------------------------------------------------

let openModalCount = 0;
let originalBodyOverflow = "";

function lockBodyScroll(): void {
  if (openModalCount === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  openModalCount += 1;
}

function unlockBodyScroll(): void {
  openModalCount = Math.max(0, openModalCount - 1);
  if (openModalCount === 0) {
    document.body.style.overflow = originalBodyOverflow;
  }
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  headerActions,
}: ModalProps): JSX.Element | null {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    lockBodyScroll();

    return () => {
      unlockBodyScroll();
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className={`flex max-h-[calc(100vh-2rem)] w-full ${SIZE_CLASSES[size]} flex-col rounded-2xl border border-primary/20 bg-surface shadow-xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 p-6 pb-4">
          <h2 id={titleId} className="font-heading text-2xl font-semibold text-text">
            {title}
          </h2>
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-text hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Close dialog"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 text-base text-text">{children}</div>
        {footer ? (
          <div className="flex shrink-0 justify-end gap-2 p-6 pt-4">{footer}</div>
        ) : (
          <div className="pb-6" />
        )}
      </div>
    </div>,
    document.body,
  );
}
