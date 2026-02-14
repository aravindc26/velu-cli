'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';

function GlobeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

function nativeLabel(code: string): string {
  try {
    const dn = new Intl.DisplayNames([code], { type: 'language' });
    const name = dn.of(code);
    if (name) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {}
  return code.toUpperCase();
}

export function LanguageSwitcher({ languages, defaultLang }: { languages: string[]; defaultLang: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  const current = useMemo(() => {
    const firstSeg = pathname.split('/').filter(Boolean)[0];
    return languages.includes(firstSeg ?? '') ? firstSeg! : defaultLang;
  }, [pathname, languages, defaultLang]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (languages.length <= 1) return null;

  function switchTo(code: string) {
    setOpen(false);
    const segments = pathname.split('/').filter(Boolean);
    const isLangPrefix = languages.includes(segments[0] ?? '');
    const rest = isLangPrefix ? segments.slice(1) : segments;
    const newPath = code === defaultLang
      ? '/' + rest.join('/')
      : '/' + code + '/' + rest.join('/');
    window.location.href = newPath;
  }

  return (
    <div ref={ref} style={{ position: 'relative', ...(mounted ? {} : { opacity: 0, pointerEvents: 'none' as const }) }}>
      <button
        type="button"
        className="velu-lang-switcher"
        onClick={() => mounted && setOpen(!open)}
      >
        <GlobeIcon />
        <span>{nativeLabel(current)}</span>
      </button>
      {open && (
        <div className="velu-lang-menu">
          {languages.map((code) => (
            <button
              key={code}
              type="button"
              className={`velu-lang-option ${code === current ? 'active' : ''}`}
              onClick={() => switchTo(code)}
            >
              {nativeLabel(code)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
