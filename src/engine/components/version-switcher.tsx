'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { VeluVersionOption } from '@/lib/velu';

function VersionIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function VersionSwitcher({ versions }: { versions: VeluVersionOption[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fallback = useMemo(() => versions.find((v) => v.isDefault) ?? versions[0], [versions]);

  const current = useMemo(() => {
    const firstSeg = pathname.split('/').filter(Boolean)[0] ?? '';
    return versions.find((version) => version.tabSlugs.includes(firstSeg)) ?? fallback;
  }, [pathname, versions, fallback]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!fallback || versions.length <= 1) return null;

  function switchTo(target: VeluVersionOption) {
    setOpen(false);

    const segments = pathname.split('/').filter(Boolean);
    const firstSeg = segments[0] ?? '';

    if (current && current.tabSlugs.includes(firstSeg)) {
      const index = current.tabSlugs.indexOf(firstSeg);
      const targetTab = target.tabSlugs[index] ?? target.tabSlugs[0];
      if (targetTab) {
        const rest = segments.slice(1);
        window.location.href = '/' + [targetTab, ...rest].join('/');
        return;
      }
    }

    window.location.href = target.defaultPath;
  }

  return (
    <div className="velu-version-switcher-wrap" ref={ref}>
      <button type="button" className="velu-version-switcher" onClick={() => setOpen((v) => !v)}>
        <VersionIcon />
        <span>{current.version}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="velu-version-menu">
          {versions.map((version) => (
            <button
              key={version.slug}
              type="button"
              className={`velu-version-option ${version.slug === current.slug ? 'active' : ''}`}
              onClick={() => switchTo(version)}
            >
              {version.version}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
