'use client';

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';

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
  search: (query: string) => Promise<PagefindResponse>;
  destroy: () => void;
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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PagefindResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    async function loadPagefind() {
      try {
        // Bypass bundler resolution — pagefind.js only exists in the static output
        const pf = await new Function('return import("/pagefind/pagefind.js")')();
        await pf.init();
        pagefindRef.current = pf as unknown as PagefindInstance;
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
    }
  }, [open]);

  const search = useCallback(
    async (q: string) => {
      setQuery(q);
      if (!q.trim() || !pagefindRef.current) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const response = await pagefindRef.current.search(q);
        const items = await Promise.all(
          response.results.slice(0, 8).map((r) => r.data())
        );
        setResults(items);
      } catch {
        setResults([]);
      }
      setLoading(false);
    },
    []
  );

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
              className="fd-search-result"
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
