'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { VeluDropdownOption, VeluIconLibrary } from '@core/types';
import { VeluIcon } from './icon';

function ChevronDownIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function withTrailingSlashPath(path: string): string {
  if (!path.startsWith('/')) return path;
  if (path === '/' || path.endsWith('/')) return path;
  return `${path}/`;
}

function normalizeLanguageSet(languages: string[]): Set<string> {
  return new Set(languages.map((language) => language.trim().toLowerCase()).filter(Boolean));
}

function getContainerIndex(pathname: string, languages: string[]): number {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 0;
  const languageSet = normalizeLanguageSet(languages);
  const first = segments[0]?.toLowerCase();
  if (first && languageSet.has(first)) return 1;
  return 0;
}

function applyLocalePrefix(path: string, pathname: string, languages: string[]): string {
  if (/^(https?:|mailto:|tel:|#)/i.test(path)) return path;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return path;
  const languageSet = normalizeLanguageSet(languages);
  const locale = segments[0]?.toLowerCase();
  if (!locale || !languageSet.has(locale)) return path;
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return withTrailingSlashPath(`/${locale}/${normalized}`);
}

export function DropdownSwitcher({
  dropdowns,
  iconLibrary,
  languages,
}: {
  dropdowns: VeluDropdownOption[];
  iconLibrary: VeluIconLibrary;
  languages: string[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canSwitch = dropdowns.length > 1;

  const current = useMemo(() => {
    const segments = pathname.split('/').filter(Boolean);
    const index = getContainerIndex(pathname, languages);
    const activeSlug = segments[index] ?? '';
    return dropdowns.find((dropdown) => dropdown.slug === activeSlug) ?? dropdowns[0];
  }, [pathname, dropdowns, languages]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!current || dropdowns.length === 0) return null;

  function switchTo(target: VeluDropdownOption) {
    setOpen(false);

    const segments = pathname.split('/').filter(Boolean);
    const index = getContainerIndex(pathname, languages);
    const currentContainer = segments[index] ?? '';

    if (current.slug === currentContainer) {
      const nextSegments = [...segments];
      nextSegments[index] = target.slug;
      window.location.href = withTrailingSlashPath(`/${nextSegments.join('/')}`);
      return;
    }

    window.location.href = applyLocalePrefix(target.defaultPath, pathname, languages);
  }

  return (
    <div className="velu-product-switcher-wrap" ref={ref}>
      <button
        type="button"
        className="velu-product-switcher"
        onClick={canSwitch ? () => setOpen((value) => !value) : undefined}
        aria-expanded={canSwitch ? open : undefined}
        aria-haspopup={canSwitch ? 'menu' : undefined}
      >
        <span className="velu-product-switcher-label-wrap">
          <VeluIcon
            name={current.icon}
            iconType={current.iconType}
            library={iconLibrary}
            className="velu-product-icon"
          />
          <span className="velu-product-switcher-label">{current.dropdown}</span>
        </span>
        {canSwitch ? <ChevronDownIcon /> : null}
      </button>
      {canSwitch && open && (
        <div className="velu-product-menu" role="menu" aria-label="Dropdown sections">
          {dropdowns.map((dropdown) => (
            <button
              key={dropdown.slug}
              type="button"
              className={`velu-product-option ${dropdown.slug === current.slug ? 'active' : ''}`}
              onClick={() => switchTo(dropdown)}
              role="menuitem"
            >
              <span className="velu-product-option-name-wrap">
                <VeluIcon
                  name={dropdown.icon}
                  iconType={dropdown.iconType}
                  library={iconLibrary}
                  className="velu-product-option-icon"
                />
                <span className="velu-product-option-name">{dropdown.dropdown}</span>
              </span>
              {dropdown.description && (
                <span className="velu-product-option-desc">{dropdown.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
