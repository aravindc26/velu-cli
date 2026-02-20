"use client";

import { Children, isValidElement, type ReactElement, type ReactNode, useEffect, useMemo, useRef } from "react";
import { Tabs as FumaTabs } from "fumadocs-ui/components/tabs";

const VELU_TAB_SYNC_EVENT = "velu:tab-sync";
const VELU_TAB_SYNC_KEY = "__veluTabSyncLabel";

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function findTitle(node: ReactNode): string | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findTitle(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  const props = (node as ReactElement<Record<string, unknown>>).props;
  const direct = props?.title ?? props?.["data-title"];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return findTitle(props?.children as ReactNode);
}

function readSharedLabel(): string | null {
  if (typeof window === "undefined") return null;
  const value = (window as any)[VELU_TAB_SYNC_KEY];
  return typeof value === "string" && value.trim() ? value : null;
}

function writeSharedLabel(label: string) {
  if (typeof window === "undefined") return;
  (window as any)[VELU_TAB_SYNC_KEY] = label;
}

function broadcastLabel(label: string) {
  if (typeof window === "undefined") return;
  writeSharedLabel(label);
  window.dispatchEvent(new CustomEvent(VELU_TAB_SYNC_EVENT, { detail: { label } }));
}

interface VeluSyncedTabsProps {
  items?: string[];
  children?: ReactNode;
  sync?: boolean;
  borderBottom?: boolean;
  className?: string;
  [key: string]: unknown;
}

export function VeluSyncedTabs({ items, children, sync = true, borderBottom, className, ...props }: VeluSyncedTabsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tabItems = useMemo(() => {
    if (Array.isArray(items) && items.length > 0) return items;
    const tabChildren = Children.toArray(children).filter((child) => isValidElement(child)) as ReactElement<any>[];
    return tabChildren.map((child, idx) => {
      const title = findTitle(child) ?? `Tab ${idx + 1}`;
      return title;
    });
  }, [children, items]);
  const syncGroupId = useMemo(() => {
    if (!sync || tabItems.length === 0) return undefined;
    const key = [...tabItems].map((item) => normalizeLabel(item)).sort().join("|");
    return key ? `velu-tabs:${key}` : undefined;
  }, [sync, tabItems]);

  useEffect(() => {
    if (!sync) return;
    const root = rootRef.current;
    if (!root) return;

    const activateLabel = (label: string) => {
      const target = normalizeLabel(label);
      if (!target) return;
      const idx = tabItems.findIndex((item) => normalizeLabel(item) === target);
      if (idx < 0) return;
      const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
      const match = buttons[idx];
      if (match && match.getAttribute("aria-selected") !== "true") {
        match.click();
      }
    };

    const existing = readSharedLabel();
    if (existing) activateLabel(existing);

    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ label?: string }>).detail;
      if (!detail?.label) return;
      activateLabel(detail.label);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const tab = target?.closest('[role="tab"]') as HTMLElement | null;
      if (!tab) return;
      const buttons = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));
      const idx = buttons.indexOf(tab);
      const label = idx >= 0 ? tabItems[idx] : (tab.textContent ?? "").trim();
      if (label) broadcastLabel(label);
    };

    window.addEventListener(VELU_TAB_SYNC_EVENT, onSync);
    root.addEventListener("click", onClick);
    return () => {
      window.removeEventListener(VELU_TAB_SYNC_EVENT, onSync);
      root.removeEventListener("click", onClick);
    };
  }, [sync, tabItems]);

  return (
    <div ref={rootRef}>
      <FumaTabs
        {...(props as any)}
        items={tabItems}
        groupId={syncGroupId}
        className={[
          "velu-tabs-plain !border-0 !bg-transparent !rounded-none !my-2",
          className,
          borderBottom ? "velu-tabs-border-bottom" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </FumaTabs>
    </div>
  );
}
