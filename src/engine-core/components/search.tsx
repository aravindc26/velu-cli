'use client';

import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from 'react';

interface PagefindResult {
  url: string;
  excerpt: string;
  meta: { title?: string };
  sub_results?: Array<{
    url: string;
    title: string;
    excerpt: string;
  }>;
}

interface PagefindResponse {
  results: Array<{ data: () => Promise<PagefindResult> }>;
}

interface PagefindInstance {
  init: () => Promise<void>;
  search: (query: string, options?: { filters?: Record<string, string | string[]> }) => Promise<PagefindResponse>;
  destroy: () => void;
}

interface SearchFilters {
  language?: string;
  version?: string;
  product?: string;
}

function parseFilterAttribute(value: string | null): SearchFilters {
  const out: SearchFilters = {};
  if (!value) return out;

  for (const entry of value.split(',')) {
    const part = entry.trim();
    if (!part) continue;
    const index = part.indexOf(':');
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const val = part.slice(index + 1).trim();
    if (!val) continue;
    if (key === 'language') out.language = val;
    if (key === 'version') out.version = val;
    if (key === 'product') out.product = val;
  }
  return out;
}

function getActiveFiltersFromPage(): SearchFilters {
  if (typeof document === 'undefined') return {};
  const node = document.querySelector('[data-pagefind-body]');
  if (!node) return {};
  return parseFilterAttribute(node.getAttribute('data-pagefind-filter'));
}

function detectSiteBasePath(): string {
  if (typeof document === 'undefined' || typeof window === 'undefined') return '';
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[];
  for (const script of scripts) {
    const src = script.getAttribute('src');
    if (!src || !src.includes('/_next/static/')) continue;
    try {
      const parsed = new URL(src, window.location.origin);
      const marker = '/_next/static/';
      const idx = parsed.pathname.indexOf(marker);
      if (idx >= 0) return parsed.pathname.slice(0, idx);
    } catch {
      // ignore invalid script URL and continue
    }
  }
  return '';
}

async function loadPagefindRuntime(): Promise<PagefindInstance | null> {
  const basePath = detectSiteBasePath().replace(/\/+$/, '');
  const candidates = Array.from(
    new Set([
      basePath ? `${basePath}/pagefind/pagefind.js` : '',
      '/pagefind/pagefind.js',
    ].filter(Boolean)),
  );

  for (const path of candidates) {
    try {
      const moduleLoader = new Function('modulePath', 'return import(modulePath)');
      const mod = await moduleLoader(path) as unknown as PagefindInstance;
      await mod.init();
      return mod;
    } catch {
      // try next candidate
    }
  }

  return null;
}

export function PagefindSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pagefindRef = useRef<PagefindInstance | null>(null);
  const resultRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PagefindResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);
  const [activeFilters, setActiveFilters] = useState<SearchFilters>({});
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  // Extract page-level filters from rendered metadata when search opens.
  useEffect(() => {
    if (open) {
      setActiveFilters(getActiveFiltersFromPage());
    }
  }, [open]);

  useEffect(() => {
    async function loadPagefind() {
      if (process.env.NODE_ENV !== 'production') {
        setAvailable(false);
        return;
      }
      try {
        pagefindRef.current = await loadPagefindRuntime();
        if (!pagefindRef.current) setAvailable(false);
      } catch {
        setAvailable(false);
      }
    }
    loadPagefind();
  }, []);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      dialogRef.current?.close();
      setQuery('');
      setResults([]);
      setActiveIndex(-1);
    }
  }, [open]);

  useEffect(() => {
    if (!results.length) {
      setActiveIndex(-1);
      return;
    }
    if (activeIndex >= results.length) {
      setActiveIndex(results.length - 1);
    }
  }, [results, activeIndex]);

  useEffect(() => {
    if (activeIndex < 0) return;
    const node = resultRefs.current[activeIndex];
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const search = useCallback(
    async (q: string) => {
      setQuery(q);
      if (!q.trim() || !pagefindRef.current) {
        setResults([]);
        setActiveIndex(-1);
        return;
      }
      setLoading(true);
      try {
        // Build filters for pagefind
        const filters: Record<string, string> = {};
        if (activeFilters.language) filters.language = activeFilters.language;
        if (activeFilters.version) filters.version = activeFilters.version;
        if (activeFilters.product) filters.product = activeFilters.product;

        const withFilters = Object.keys(filters).length > 0;
        const response = await pagefindRef.current.search(
          q,
          withFilters ? { filters } : undefined,
        );

        // If scoped filters return nothing, fall back to global results
        // to avoid false "No results" from stale/missing filter metadata.
        const fallbackResponse = withFilters && response.results.length === 0
          ? await pagefindRef.current.search(q)
          : response;

        const items = await Promise.all(
          fallbackResponse.results.slice(0, 8).map((r) => r.data()),
        );
        setResults(items);
        setActiveIndex(items.length > 0 ? 0 : -1);
      } catch {
        setResults([]);
        setActiveIndex(-1);
      }
      setLoading(false);
    },
    [activeFilters]
  );

  const onInputKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (prev < 0 ? 0 : (prev + 1) % results.length));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => {
        if (prev < 0) return results.length - 1;
        return prev === 0 ? results.length - 1 : prev - 1;
      });
      return;
    }

    if (event.key === 'Enter' && activeIndex >= 0 && activeIndex < results.length) {
      event.preventDefault();
      const target = results[activeIndex];
      onOpenChange(false);
      window.location.href = target.url;
    }
  }, [activeIndex, onOpenChange, results]);

  return (
    <dialog
      ref={dialogRef}
      className="fd-search-dialog"
      onClick={(e) => {
        if (e.target === dialogRef.current) onOpenChange(false);
      }}
      onClose={() => onOpenChange(false)}
    >
      <div className="fd-search-content">
        <div className="fd-search-input-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search documentation..."
            value={query}
            onChange={(e) => search(e.target.value)}
            onKeyDown={onInputKeyDown}
            className="fd-search-input"
          />
          <kbd className="fd-search-kbd" onClick={() => onOpenChange(false)}>
            Esc
          </kbd>
        </div>

        <div className="fd-search-results">
          {!available && (
            <p className="fd-search-empty">
              Search is available after building the site.
            </p>
          )}
          {available && loading && (
            <p className="fd-search-empty">Searching…</p>
          )}
          {available && !loading && query && results.length === 0 && (
            <p className="fd-search-empty">No results found.</p>
          )}
          {results.map((r, i) => (
            <a
              key={i}
              href={r.url}
              ref={(node) => {
                resultRefs.current[i] = node;
              }}
              className={['fd-search-result', activeIndex === i ? 'is-active' : ''].join(' ')}
              aria-current={activeIndex === i ? 'true' : undefined}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => onOpenChange(false)}
            >
              <span className="fd-search-result-title">
                {r.meta?.title || r.url}
              </span>
              <span
                className="fd-search-result-excerpt"
                dangerouslySetInnerHTML={{ __html: r.excerpt }}
              />
            </a>
          ))}
        </div>
      </div>
    </dialog>
  );
}

export function SearchToggle({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="fd-search-trigger"
      onClick={onClick}
      aria-label="Search"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <span>Search…</span>
      <kbd>⌘K</kbd>
    </button>
  );
}
