"use client";

import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

const VELU_TAB_SYNC_EVENT = 'velu:tab-sync';
const VELU_TAB_SYNC_KEY = '__veluTabSyncLabel';

function normalizeSyncLabel(value: string): string {
  return value.trim().toLowerCase();
}

function readSharedSyncLabel(): string | null {
  if (typeof window === 'undefined') return null;
  const value = (window as any)[VELU_TAB_SYNC_KEY];
  return typeof value === 'string' && value.trim() ? value : null;
}

function broadcastSyncLabel(label: string) {
  if (typeof window === 'undefined') return;
  (window as any)[VELU_TAB_SYNC_KEY] = label;
  window.dispatchEvent(new CustomEvent(VELU_TAB_SYNC_EVENT, { detail: { label } }));
}

function findNestedProp(node: any, key: string): string | undefined {
  if (!node) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findNestedProp(item, key);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  const props = (node as ReactElement<Record<string, unknown>>).props;
  const direct = props?.[key];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  return findNestedProp(props?.children, key);
}

function findNestedClassName(node: any): string | undefined {
  if (!node) return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findNestedClassName(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  const props = (node as ReactElement<Record<string, unknown>>).props;
  if (typeof props?.className === 'string' && props.className) {
    return props.className;
  }
  return findNestedClassName(props?.children);
}

function stripTitleProps(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map((item) => stripTitleProps(item));
  if (!isValidElement(node)) return node;
  const props = (node as ReactElement<Record<string, unknown>>).props;

  const nextProps: Record<string, unknown> = {};
  if (props?.children !== undefined) {
    nextProps.children = stripTitleProps(props.children as ReactNode);
  }
  if ('title' in (props ?? {})) {
    nextProps.title = undefined;
  }
  if ('data-title' in (props ?? {})) {
    nextProps['data-title'] = undefined;
  }

  return cloneElement(node as ReactElement, nextProps);
}

function languageFromClassName(className: string | undefined): string | undefined {
  const langMatch = typeof className === 'string' ? className.match(/language-([a-z0-9_-]+)/i) : null;
  if (!langMatch) return undefined;
  return langMatch[1].toLowerCase();
}

function languageName(language: string | undefined): string | undefined {
  if (!language) return undefined;
  const map: Record<string, string> = {
    js: 'JavaScript',
    javascript: 'JavaScript',
    jsx: 'JavaScript',
    ts: 'TypeScript',
    typescript: 'TypeScript',
    tsx: 'TypeScript',
    py: 'Python',
    python: 'Python',
    java: 'Java',
    rb: 'Ruby',
    sh: 'Shell',
    bash: 'Bash',
    zsh: 'Zsh',
    yml: 'YAML',
    md: 'Markdown',
  };
  return map[language] ?? language.charAt(0).toUpperCase() + language.slice(1);
}

function languageFromLabel(label: string): string | undefined {
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    javascript: 'javascript',
    node: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    typescript: 'typescript',
    py: 'python',
    python: 'python',
    java: 'java',
    ruby: 'ruby',
    rb: 'ruby',
    shell: 'shell',
    bash: 'shell',
    sh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    mdx: 'markdown',
    md: 'markdown',
  };
  const trimmed = label.trim().toLowerCase();
  if (!trimmed) return undefined;

  if (map[trimmed]) return map[trimmed];

  const baseNoExt = trimmed.replace(/\.[a-z0-9_+-]+$/, '');
  if (map[baseNoExt]) return map[baseNoExt];

  const ext = trimmed.match(/\.([a-z0-9_+-]+)$/)?.[1];
  if (ext && map[ext]) return map[ext];

  return undefined;
}

function languageAbbr(language: string | undefined): string {
  if (!language) return 'TXT';
  const map: Record<string, string> = {
    javascript: 'JS',
    typescript: 'TS',
    python: 'PY',
    java: 'JV',
    ruby: 'RB',
    shell: 'SH',
    bash: 'SH',
    yaml: 'YM',
    markdown: 'MD',
  };
  return map[language] ?? language.slice(0, 2).toUpperCase();
}

const LANGUAGE_ICON_URL: Record<string, string> = {
  javascript: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg',
  typescript: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg',
  python: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg',
  java: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg',
  ruby: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/ruby/ruby-original.svg',
  shell: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg',
  bash: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg',
  yaml: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/yaml/yaml-original.svg',
  markdown: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/markdown/markdown-original.svg',
};

function normalizeLanguage(language: string | undefined): string {
  if (!language) return 'text';
  const lower = language.toLowerCase();
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    sh: 'shell',
    yml: 'yaml',
  };
  return map[lower] ?? lower;
}

function LanguageIcon({ language, label, abbr }: { language: string; label: string; abbr: string }) {
  const src = LANGUAGE_ICON_URL[language];
  if (src) {
    return <img src={src} alt={`${label} icon`} className="velu-lang-icon-img" loading="lazy" decoding="async" />;
  }

  return <span className={['velu-lang-icon', `velu-lang-${language}`].join(' ')}>{abbr}</span>;
}

function getCodeLabel(block: any, index: number): string {
  const title = block?.props?.title
    || block?.props?.['data-title']
    || findNestedProp(block, 'title')
    || findNestedProp(block, 'data-title');
  if (typeof title === 'string' && title.trim()) return title.trim();

  const cls = findNestedClassName(block) || block?.props?.className || '';
  const language = languageFromClassName(cls);
  if (language) return languageName(normalizeLanguage(language)) ?? language;

  return `Code ${index + 1}`;
}

function getCodeLanguage(block: any): string | undefined {
  const cls = findNestedClassName(block) || block?.props?.className || '';
  return languageFromClassName(cls);
}

export function VeluCodeGroup({ children, className, dropdown, items, labels: labelItems }: any) {
  const blocks = useMemo(
    () => Children.toArray(children).filter((child) => isValidElement(child) && child.type !== 'br') as any[],
    [children],
  );
  const explicitLabels = useMemo(() => {
    const source = Array.isArray(items) ? items : Array.isArray(labelItems) ? labelItems : [];
    return source.map((value) => String(value));
  }, [items, labelItems]);

  const blockLabels = useMemo(
    () => blocks.map((block, index) => explicitLabels[index] ?? getCodeLabel(block, index)),
    [blocks, explicitLabels],
  );
  const cleanedBlocks = useMemo(() => blocks.map((block) => stripTitleProps(block)), [blocks]);
  const codeMeta = useMemo(
    () => blocks.map((block, index) => {
      const label = explicitLabels[index] ?? getCodeLabel(block, index);
      const resolvedLanguage = getCodeLanguage(block) ?? languageFromLabel(label);
      const language = normalizeLanguage(resolvedLanguage);
      return {
        label,
        language,
        languageLabel: resolvedLanguage ? (languageName(language) ?? label) : label,
        abbr: languageAbbr(language),
      };
    }),
    [blocks, explicitLabels],
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const clampedIndex = Math.min(activeIndex, Math.max(0, cleanedBlocks.length - 1));

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    const syncLabels = codeMeta.map((item) => item.languageLabel);
    if (syncLabels.length === 0) return;

    const applyLabel = (label: string) => {
      const target = normalizeSyncLabel(label);
      const idx = syncLabels.findIndex((item) => normalizeSyncLabel(item) === target);
      if (idx >= 0) setActiveIndex(idx);
    };

    const existing = readSharedSyncLabel();
    if (existing) applyLabel(existing);

    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ label?: string }>).detail;
      if (!detail?.label) return;
      applyLabel(detail.label);
    };

    window.addEventListener(VELU_TAB_SYNC_EVENT, onSync);
    return () => window.removeEventListener(VELU_TAB_SYNC_EVENT, onSync);
  }, [codeMeta]);

  if (blocks.length <= 1) {
    return <div className={['velu-code-group', className].filter(Boolean).join(' ')}>{children}</div>;
  }

  if (!dropdown) {
    return (
      <div className={['velu-code-group', 'velu-code-group-tabs', className].filter(Boolean).join(' ')}>
        <div className="velu-code-group-tabs-head" role="tablist" aria-label="Code variants">
          {codeMeta.map((item, index) => (
            <button
              key={item.label + index}
              type="button"
              role="tab"
              aria-selected={clampedIndex === index}
              className={['velu-code-group-tab-btn', clampedIndex === index ? 'is-active' : ''].filter(Boolean).join(' ')}
              onClick={() => {
                setActiveIndex(index);
                if (item.languageLabel) broadcastSyncLabel(item.languageLabel);
              }}
            >
              <LanguageIcon language={item.language} label={item.languageLabel} abbr={item.abbr} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="velu-code-group-dropdown-body">{cleanedBlocks[clampedIndex]}</div>
      </div>
    );
  }

  if (dropdown) {
    return (
      <div className={['velu-code-group', 'velu-code-group-dropdown', className].filter(Boolean).join(' ')}>
        <div className="velu-code-group-dropdown-head">
          <span className="velu-code-group-file">
            <LanguageIcon
              language={codeMeta[clampedIndex]?.language ?? 'text'}
              label={codeMeta[clampedIndex]?.languageLabel ?? 'Text'}
              abbr={codeMeta[clampedIndex]?.abbr ?? 'TX'}
            />
            <span>{codeMeta[clampedIndex]?.label ?? blockLabels[clampedIndex]}</span>
          </span>
          <div className="velu-code-group-select-wrap" ref={menuRef}>
            <button
              type="button"
              className="velu-code-group-select-btn"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
            >
              <LanguageIcon
                language={codeMeta[clampedIndex]?.language ?? 'text'}
                label={codeMeta[clampedIndex]?.languageLabel ?? 'Text'}
                abbr={codeMeta[clampedIndex]?.abbr ?? 'TX'}
              />
              <span>{codeMeta[clampedIndex]?.languageLabel}</span>
              <span className="velu-code-group-caret">⌄</span>
            </button>
            {menuOpen ? (
              <div className="velu-code-group-select-menu" role="listbox" aria-label="Select language">
                {codeMeta.map((item, index) => (
                  <button
                    key={item.label + index}
                    type="button"
                    role="option"
                    aria-selected={clampedIndex === index}
                    className={['velu-code-group-select-item', clampedIndex === index ? 'is-active' : ''].filter(Boolean).join(' ')}
                    onClick={() => {
                      setActiveIndex(index);
                      if (item.languageLabel) broadcastSyncLabel(item.languageLabel);
                      setMenuOpen(false);
                    }}
                  >
                    <LanguageIcon language={item.language} label={item.languageLabel} abbr={item.abbr} />
                    <span>{item.languageLabel}</span>
                    {clampedIndex === index ? <span className="velu-code-group-check">✓</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="velu-code-group-dropdown-body">
          {cleanedBlocks[clampedIndex]}
        </div>
      </div>
    );
  }
}
