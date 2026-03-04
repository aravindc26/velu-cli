'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0;
  }
  return `velu-banner-${hash}`;
}

function parseMarkdownLinks(text: string): string {
  return text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>',
  );
}

interface VeluBannerProps {
  content: string;
  dismissible: boolean;
}

function setSizeVar(el: HTMLElement | null) {
  const h = el ? el.offsetHeight : 0;
  document.documentElement.style.setProperty('--velu-announcement-h', `${h}px`);
}

export function VeluBanner({ content, dismissible }: VeluBannerProps) {
  const storageKey = useMemo(() => hashContent(content), [content]);
  const [dismissed, setDismissed] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dismissible) {
      const stored = localStorage.getItem(storageKey);
      setDismissed(stored === '1');
    } else {
      setDismissed(false);
    }
  }, [dismissible, storageKey]);

  const measuredRef = useCallback((node: HTMLDivElement | null) => {
    (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    setSizeVar(node);
  }, []);

  useEffect(() => {
    if (dismissed) {
      setSizeVar(null);
    }
  }, [dismissed]);

  if (dismissed) return null;

  const html = parseMarkdownLinks(content);

  return (
    <div className="velu-announcement" role="banner" ref={measuredRef}>
      <span
        className="velu-announcement-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {dismissible && (
        <button
          type="button"
          className="velu-announcement-dismiss"
          aria-label="Dismiss banner"
          onClick={() => {
            localStorage.setItem(storageKey, '1');
            setDismissed(true);
          }}
        >
          &#x2715;
        </button>
      )}
    </div>
  );
}
