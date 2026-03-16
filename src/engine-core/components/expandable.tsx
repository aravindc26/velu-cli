"use client";

import { type ReactNode, useMemo, useState } from 'react';

function normalizeBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    return trimmed === '' || trimmed === 'true' || trimmed === '1' || trimmed === 'yes';
  }
  if (typeof value === 'number') return value === 1;
  return false;
}

function lcFirst(input: string): string {
  if (!input) return input;
  return input.charAt(0).toLowerCase() + input.slice(1);
}

function deriveClosedLabel(baseLabel: string): string {
  return `Show ${lcFirst(baseLabel)}`;
}

function deriveOpenLabel(closedLabel: string): string {
  if (/^show\s+/i.test(closedLabel)) {
    return closedLabel.replace(/^show/i, 'Hide');
  }
  return `Hide ${closedLabel}`;
}

export function VeluExpandable({
  title,
  summary,
  defaultOpen,
  defaultopen,
  openTitle,
  opentitle,
  closeTitle,
  closetitle,
  children,
  className,
}: {
  title?: string;
  summary?: string;
  defaultOpen?: boolean | string | number;
  defaultopen?: boolean | string | number;
  openTitle?: string;
  opentitle?: string;
  closeTitle?: string;
  closetitle?: string;
  children?: ReactNode;
  className?: string;
}) {
  const baseLabel = (title ?? summary ?? 'Expand').trim();
  const closedLabel = closeTitle ?? closetitle ?? deriveClosedLabel(baseLabel);
  const expandedLabel = openTitle ?? opentitle ?? deriveOpenLabel(closedLabel);
  const startsOpen = normalizeBool(defaultOpen ?? defaultopen);
  const [isOpen, setIsOpen] = useState(startsOpen);

  const summaryText = useMemo(
    () => (isOpen ? expandedLabel : closedLabel),
    [isOpen, expandedLabel, closedLabel],
  );

  return (
    <details
      className={['velu-expandable', className].filter(Boolean).join(' ')}
      open={isOpen}
      onToggle={(event) => {
        setIsOpen((event.currentTarget as HTMLDetailsElement).open);
      }}
    >
      <summary>{summaryText}</summary>
      <div className="velu-expandable-content">{children}</div>
    </details>
  );
}
