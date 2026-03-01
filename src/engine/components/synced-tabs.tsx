"use client";

import { Children, isValidElement, type ReactElement, type ReactNode, useMemo } from "react";
import { Tabs as FumaTabs } from "fumadocs-ui/components/tabs";

const SYNCED_GROUP_ID = "velu-synced-tabs";

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

interface VeluSyncedTabsProps {
  items?: string[];
  children?: ReactNode;
  sync?: boolean;
  borderBottom?: boolean;
  className?: string;
  groupId?: string;
  [key: string]: unknown;
}

export function VeluSyncedTabs({ items, children, sync = true, borderBottom, className, groupId, ...props }: VeluSyncedTabsProps) {
  const tabItems = useMemo(() => {
    if (Array.isArray(items) && items.length > 0) return items;
    const tabChildren = Children.toArray(children).filter((child) => isValidElement(child)) as ReactElement<any>[];
    return tabChildren.map((child, idx) => findTitle(child) ?? `Tab ${idx + 1}`);
  }, [children, items]);

  return (
    <FumaTabs
      {...(props as any)}
      items={tabItems}
      groupId={sync ? (groupId ?? SYNCED_GROUP_ID) : undefined}
      persist={sync}
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
  );
}
