"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* ---------------------------------------------------------------------------
 * Module-level modal stack + scroll lock, shared by every open modal.
 *
 * - Only the TOPMOST open modal reacts to Escape / Tab, so nested layers
 *   close one at a time.
 * - The single key listener sits on `window` (bubble phase), so it runs after
 *   every element/document listener: a dropdown inside a modal that consumes
 *   Escape calls `e.preventDefault()` and the modal then leaves it alone.
 * - The body scroll lock is reference-counted: the original `overflow` is
 *   restored only when the last lock is released.
 * ------------------------------------------------------------------------- */

type ModalEntry = {
  close: () => void;
  panel: () => HTMLElement | null;
};

const modalStack: ModalEntry[] = [];
let scrollLocks = 0;
let savedOverflow = "";

function lockScroll() {
  if (scrollLocks++ === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}

function unlockScroll() {
  if (scrollLocks === 0) return;
  if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
}

function focusablesIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest("[inert]") && el.getClientRects().length > 0
  );
}

function onStackKeyDown(e: KeyboardEvent) {
  const top = modalStack[modalStack.length - 1];
  if (!top || e.defaultPrevented) return;
  if (e.key === "Escape") {
    e.preventDefault();
    top.close();
    return;
  }
  if (e.key !== "Tab") return;
  const panel = top.panel();
  if (!panel) return;
  const items = focusablesIn(panel);
  const active = document.activeElement as HTMLElement | null;
  if (items.length === 0) {
    e.preventDefault();
    panel.focus({ preventScroll: true });
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const inside = !!active && panel.contains(active);
  if (e.shiftKey) {
    if (!inside || active === first || active === panel) {
      e.preventDefault();
      last.focus();
    }
  } else if (!inside || active === last) {
    e.preventDefault();
    first.focus();
  }
}

function pushModal(entry: ModalEntry) {
  if (modalStack.length === 0) window.addEventListener("keydown", onStackKeyDown);
  modalStack.push(entry);
}

function removeModal(entry: ModalEntry) {
  const i = modalStack.indexOf(entry);
  if (i !== -1) modalStack.splice(i, 1);
  if (modalStack.length === 0) window.removeEventListener("keydown", onStackKeyDown);
}

/**
 * Shared modal behaviour: while `open` the page scroll is locked (stack-safe),
 * Escape calls `onClose` (topmost modal only, skipped when something already
 * handled the key), Tab / Shift+Tab cycle inside `panelRef`, focus moves to
 * the first focusable element inside it, and the previously focused element
 * gets focus back on close.
 *
 * `onClose` is read through a ref, so parents may pass an inline arrow: the
 * effect only re-runs when `open` changes (re-running it on every parent
 * render used to bounce focus and toggle the scroll lock).
 */
export function useModalBehavior(open: boolean, onClose: () => void, panelRef: RefObject<HTMLElement | null>) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    lockScroll();
    const entry: ModalEntry = {
      close: () => onCloseRef.current(),
      panel: () => panelRef.current,
    };
    pushModal(entry);
    // Focus after paint so a transition-in panel is already in the tree.
    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = focusablesIn(panel)[0] ?? panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus({ preventScroll: true });
    }, 0);
    return () => {
      window.clearTimeout(t);
      removeModal(entry);
      unlockScroll();
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus?.({ preventScroll: true });
      }
    };
    // panelRef is a stable ref object; onClose is read through onCloseRef.
  }, [open, panelRef]);
}

/**
 * Centered modal: an overlay with `role="dialog"`. Callers keep their own
 * inner card markup as `children`; this only adds the accessibility wiring
 * (see useModalBehavior) and closes on a backdrop click.
 */
export function Modal({
  open,
  onClose,
  label,
  children,
  overlayClassName = "fixed inset-0 bg-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4",
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  overlayClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useModalBehavior(open, onClose, panelRef);
  if (!open) return null;
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className={overlayClassName}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}

/**
 * Inline replacement for `window.confirm`: a `jm-alert` with אישור / ביטול.
 * Render it next to the action that asked for confirmation.
 */
export function ConfirmInline({
  text,
  onConfirm,
  onCancel,
  confirmLabel = "אישור",
  cancelLabel = "ביטול",
  busy = false,
  danger = false,
  className = "",
}: {
  text: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      ref={ref}
      role="alertdialog"
      aria-live="assertive"
      className={`jm-alert jm-alert-info flex flex-wrap items-center justify-between gap-2 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="font-medium" dir="auto">
        {text}
      </span>
      <span className="flex gap-2 shrink-0">
        <button type="button" onClick={onConfirm} disabled={busy} className={`jm-btn jm-btn-sm ${danger ? "jm-btn-danger" : "jm-btn-primary"}`}>
          {busy ? "…" : confirmLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="jm-btn jm-btn-secondary jm-btn-sm">
          {cancelLabel}
        </button>
      </span>
    </div>
  );
}

/** Inline replacement for `window.alert`: a dismissible `jm-alert`. */
export function InlineNotice({
  kind = "info",
  children,
  onDismiss,
  className = "",
}: {
  kind?: "ok" | "err" | "info";
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  // Literal class names so Tailwind's scanner sees every variant.
  const tone = { ok: "jm-alert-ok", err: "jm-alert-err", info: "jm-alert-info" }[kind];
  return (
    <div role={kind === "err" ? "alert" : "status"} className={`jm-alert ${tone} flex items-center justify-between gap-2 ${className}`}>
      <span dir="auto">{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="jm-btn jm-btn-ghost jm-btn-sm px-2" aria-label="סגירה">
          ✕
        </button>
      )}
    </div>
  );
}
