"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { VeluIcon } from "@/components/icon";

const VELU_VIEW_OPTIONS_KEY = "__veluViewOptions";
const VELU_VIEW_OPTIONS_EVENT = "velu:view-options";
const VELU_VIEW_TOC_HOST_ID = "velu-view-toc-host";
const VELU_TAB_SYNC_KEY = "__veluTabSyncLabel";
const VELU_TAB_SYNC_EVENT = "velu:tab-sync";

type ViewOption = {
  title: string;
  icon?: string;
  iconType?: string;
};

const VIEW_ICON_URL: Record<string, string> = {
  javascript: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg",
  typescript: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg",
  python: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg",
  java: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg",
  ruby: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/ruby/ruby-original.svg",
  shell: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg",
  bash: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg",
  yaml: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/yaml/yaml-original.svg",
  markdown: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/markdown/markdown-original.svg",
};

const VIEW_ICON_ALIAS: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  javascript: "javascript",
  ts: "typescript",
  tsx: "typescript",
  typescript: "typescript",
  py: "python",
  python: "python",
  java: "java",
  rb: "ruby",
  ruby: "ruby",
  sh: "shell",
  shell: "shell",
  bash: "bash",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  markdown: "markdown",
};

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeIconKey(value: string | undefined): string | undefined {
  if (!value || !value.trim()) return undefined;
  const key = value.trim().toLowerCase();
  return VIEW_ICON_ALIAS[key] ?? key;
}

function resolveViewIconUrl(icon: string | undefined, title: string): string | undefined {
  const iconKey = normalizeIconKey(icon);
  if (iconKey && VIEW_ICON_URL[iconKey]) return VIEW_ICON_URL[iconKey];

  const titleKey = normalizeIconKey(title);
  if (titleKey && VIEW_ICON_URL[titleKey]) return VIEW_ICON_URL[titleKey];
  return undefined;
}

function ViewOptionIcon({ title, icon, iconType }: { title: string; icon?: string; iconType?: string }) {
  const src = resolveViewIconUrl(icon, title);
  if (src) {
    return <img src={src} alt="" aria-hidden="true" className="velu-view-option-icon velu-view-option-icon-img" loading="lazy" decoding="async" />;
  }
  if (!icon) return null;
  return <VeluIcon name={icon} iconType={iconType} className="velu-view-option-icon" />;
}

function readSharedOptions(): ViewOption[] {
  if (typeof window === "undefined") return [];
  const value = (window as any)[VELU_VIEW_OPTIONS_KEY];
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item.title === "string" && item.title.trim());
}

function writeSharedOptions(options: ViewOption[]) {
  if (typeof window === "undefined") return;
  (window as any)[VELU_VIEW_OPTIONS_KEY] = options;
}

function upsertSharedOption(option: ViewOption): ViewOption[] {
  const existing = readSharedOptions();
  const key = normalizeTitle(option.title);
  const next = [...existing];
  const index = next.findIndex((item) => normalizeTitle(item.title) === key);
  if (index >= 0) {
    next[index] = { ...next[index], ...option };
  } else {
    next.push(option);
  }
  writeSharedOptions(next);
  return next;
}

function broadcastOptions(options: ViewOption[]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(VELU_VIEW_OPTIONS_EVENT, { detail: { options } }));
}

function readSharedSelected(): string | null {
  if (typeof window === "undefined") return null;
  const value = (window as any)[VELU_TAB_SYNC_KEY];
  return typeof value === "string" && value.trim() ? value : null;
}

function writeSharedSelected(title: string) {
  if (typeof window === "undefined") return;
  (window as any)[VELU_TAB_SYNC_KEY] = title;
}

function broadcastSelected(title: string) {
  if (typeof window === "undefined") return;
  writeSharedSelected(title);
  window.dispatchEvent(new CustomEvent(VELU_TAB_SYNC_EVENT, { detail: { label: title } }));
}

function syncTocForVisibleHeadings() {
  if (typeof document === "undefined") return;
  const toc = document.getElementById("nd-toc");
  if (!toc) return;

  const links = Array.from(toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
  for (const link of links) {
    const href = link.getAttribute("href");
    if (!href || href === "#") continue;
    const id = decodeURIComponent(href.slice(1));
    const target = document.getElementById(id);
    const row = link.closest("li") ?? link.parentElement;
    if (!row) continue;
    row.style.display = target ? "" : "none";
  }
}

function ensureTocHost(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  const toc = document.getElementById("nd-toc");
  if (!toc) return null;

  let host = document.getElementById(VELU_VIEW_TOC_HOST_ID) as HTMLDivElement | null;
  if (!host) {
    host = document.createElement("div");
    host.id = VELU_VIEW_TOC_HOST_ID;
    host.className = "velu-view-toc-host";
    toc.prepend(host);
  }
  return host;
}

export function VeluView({
  title,
  icon,
  iconType,
  children,
  className,
}: {
  title?: string;
  icon?: string;
  iconType?: string;
  children?: ReactNode;
  className?: string;
}) {
  const resolvedTitle = (typeof title === "string" && title.trim()) ? title.trim() : "View";
  const normalizedResolvedTitle = useMemo(() => normalizeTitle(resolvedTitle), [resolvedTitle]);
  const [selectedTitle, setSelectedTitle] = useState<string>(resolvedTitle);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tocHost, setTocHost] = useState<HTMLDivElement | null>(null);
  const [options, setOptions] = useState<ViewOption[]>(() => {
    const initial = readSharedOptions();
    return initial.length ? initial : [{ title: resolvedTitle, icon, iconType }];
  });

  useEffect(() => {
    const nextOptions = upsertSharedOption({ title: resolvedTitle, icon, iconType });
    setOptions(nextOptions);
    broadcastOptions(nextOptions);

    const existingSelected = readSharedSelected();
    const hasExistingSelection = Boolean(
      existingSelected && nextOptions.some((option) => normalizeTitle(option.title) === normalizeTitle(existingSelected)),
    );

    if (existingSelected && hasExistingSelection) {
      setSelectedTitle(existingSelected);
    } else {
      setSelectedTitle(resolvedTitle);
      broadcastSelected(resolvedTitle);
    }
    queueMicrotask(syncTocForVisibleHeadings);

    const onSelected = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: string; label?: string }>).detail;
      const next = detail?.label ?? detail?.title;
      if (!next || !next.trim()) return;
      setSelectedTitle(next);
      queueMicrotask(syncTocForVisibleHeadings);
    };

    const onOptions = (event: Event) => {
      const incoming = (event as CustomEvent<{ options?: ViewOption[] }>).detail?.options;
      const next = Array.isArray(incoming) ? incoming : readSharedOptions();
      setOptions(next.length ? next : [{ title: resolvedTitle, icon, iconType }]);
    };

    window.addEventListener(VELU_TAB_SYNC_EVENT, onSelected);
    window.addEventListener(VELU_VIEW_OPTIONS_EVENT, onOptions);
    return () => {
      window.removeEventListener(VELU_TAB_SYNC_EVENT, onSelected);
      window.removeEventListener(VELU_VIEW_OPTIONS_EVENT, onOptions);
    };
  }, [resolvedTitle, icon, iconType]);

  useEffect(() => {
    let frame = 0;
    const attachHost = () => {
      const host = ensureTocHost();
      if (host) {
        setTocHost(host);
        return;
      }
      frame = window.requestAnimationFrame(attachHost);
    };
    attachHost();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(`#${VELU_VIEW_TOC_HOST_ID}`)) return;
      setMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!options.length) return;
    const hasCurrent = options.some((option) => normalizeTitle(option.title) === normalizeTitle(selectedTitle));
    if (hasCurrent) return;
    const fallback = options[0]?.title;
    if (!fallback) return;
    setSelectedTitle(fallback);
    broadcastSelected(fallback);
    queueMicrotask(syncTocForVisibleHeadings);
  }, [options, selectedTitle]);

  const effectiveOptions = options.length ? options : [{ title: resolvedTitle, icon, iconType }];
  const isActive = normalizeTitle(selectedTitle) === normalizedResolvedTitle;
  const selectedOption = effectiveOptions.find((option) => normalizeTitle(option.title) === normalizeTitle(selectedTitle))
    ?? effectiveOptions[0];

  const selectView = (nextTitle: string) => {
    if (!nextTitle || normalizeTitle(nextTitle) === normalizeTitle(selectedTitle)) return;
    setSelectedTitle(nextTitle);
    setMenuOpen(false);
    broadcastSelected(nextTitle);
    queueMicrotask(syncTocForVisibleHeadings);
  };

  const viewSwitcher = (
    tocHost && isActive && effectiveOptions.length > 1
      ? createPortal(
        <div className="velu-view-toc-switcher">
          <button
            type="button"
            className="velu-view-toc-trigger"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            {selectedOption ? <ViewOptionIcon title={selectedOption.title} icon={selectedOption.icon} iconType={selectedOption.iconType} /> : null}
            <span>{selectedOption?.title ?? "View"}</span>
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={["velu-view-toc-chevron", menuOpen ? "open" : ""].join(" ")}>
              <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {menuOpen ? (
            <div className="velu-view-toc-menu" role="listbox" aria-label="Select view">
              {effectiveOptions.map((option) => {
                const key = normalizeTitle(option.title);
                const selected = normalizeTitle(selectedTitle) === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={["velu-view-toc-option", selected ? "active" : ""].filter(Boolean).join(" ")}
                    onClick={() => selectView(option.title)}
                  >
                    <span className="velu-view-toc-option-main">
                      <ViewOptionIcon title={option.title} icon={option.icon} iconType={option.iconType} />
                      <span>{option.title}</span>
                    </span>
                    {selected ? (
                      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="velu-view-check">
                        <path d="m4.5 10.5 3.2 3.2 7.8-7.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>,
        tocHost,
      )
      : null
  );

  if (!isActive) {
    return viewSwitcher;
  }

  return (
    <section className={["velu-view", className].filter(Boolean).join(" ")} data-velu-view={resolvedTitle}>
      {viewSwitcher}
      <div className="velu-view-content">{children}</div>
    </section>
  );
}
