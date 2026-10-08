import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Small shared layout pieces. Styling lives in globals.css (`jm-*`); these
 * only fix the structure so every page reads the same.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 sm:mb-8">
      <div className="min-w-0">
        {eyebrow && <div className="text-xs font-semibold uppercase tracking-wider text-teal mb-2">{eyebrow}</div>}
        <h1 className="jm-title">{title}</h1>
        {subtitle && <p className="jm-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "form" | "article" }) {
  return <Tag className={`jm-card p-5 sm:p-6 ${className}`}>{children}</Tag>;
}

export function EmptyState({
  icon = "✨",
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="jm-card p-8 sm:p-12 text-center flex flex-col items-center gap-3">
      <div className="h-14 w-14 rounded-2xl bg-sky-50 text-2xl flex items-center justify-center">{icon}</div>
      <h3 className="jm-h2">{title}</h3>
      {text && <p className="text-ink-600 max-w-md">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-600" role="status">
      <span className="h-6 w-6 rounded-full border-2 border-teal border-t-transparent animate-spin" />
      {label && <span>{label}</span>}
    </div>
  );
}

/** Centered "you need to sign in" block used by every account page. */
export function SignInGate({ text, next }: { text: ReactNode; next?: string }) {
  const href = next ? `/Login?next=${encodeURIComponent(next)}` : "/Login";
  return (
    <div className="jm-page">
      <EmptyState icon="🔒" title={text} action={<Link href={href} className="jm-btn jm-btn-primary">Sign in</Link>} />
    </div>
  );
}
