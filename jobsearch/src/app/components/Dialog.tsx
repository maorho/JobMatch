"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared modal behaviour (the same approach SideNavbar uses): while `open`
 * the page scroll is locked, Escape calls `onClose`, focus moves to the first
 * focusable element inside `panelRef`, and the previously focused element
 * gets focus back on close.
 */
export function useModalBehavior(open: boolean, onClose: () => void, panelRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    // Focus after paint so a transition-in panel is already in the tree.
    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus({ preventScroll: true });
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, onClose, panelRef]);
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
