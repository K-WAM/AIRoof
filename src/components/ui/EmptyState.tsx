"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type EmptyStateAction = { label: string; href?: string; onClick?: () => void };

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: EmptyStateAction;
  secondary?: EmptyStateAction;
  compact?: boolean;
  testId?: string;
}

function Action({ action, primary = false }: { action: EmptyStateAction; primary?: boolean }) {
  const className = `button ${primary ? "primary" : "ghost"}`;
  if (action.href) return <Link className={className} href={action.href}>{action.label}</Link>;
  return <button type="button" className={className} onClick={action.onClick}>{action.label}</button>;
}

/** A clear next step for lists and panels with no data yet. */
export function EmptyState({ icon: Icon, title, body, action, secondary, compact = false, testId }: EmptyStateProps) {
  return (
    <section className={`empty-state${compact ? " empty-state-compact" : ""}`} data-testid={testId}>
      {Icon && <Icon className="empty-state-icon" size={24} strokeWidth={1.75} aria-hidden="true" />}
      <h3 className="empty-state-title">{title}</h3>
      {body && <p className="empty-state-body">{body}</p>}
      {(action || secondary) && <div className="empty-state-actions">
        {action && <Action action={action} primary />}
        {secondary && <Action action={secondary} />}
      </div>}
    </section>
  );
}
