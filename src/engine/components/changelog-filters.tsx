'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';

interface ChangelogFiltersProps {
  tags: string[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function parseNodeTags(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split('|')
    .map((tag) => normalize(tag))
    .filter(Boolean);
}

const VELU_CHANGELOG_FILTER_HOST_ID = 'velu-changelog-filter-host';

function ensureTocHost(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  const toc = document.getElementById('nd-toc');
  if (!toc) return null;
  toc.classList.add('velu-changelog-filters-only');

  let host = document.getElementById(VELU_CHANGELOG_FILTER_HOST_ID) as HTMLDivElement | null;
  if (!host) {
    host = document.createElement('div');
    host.id = VELU_CHANGELOG_FILTER_HOST_ID;
    host.className = 'velu-changelog-filter-host';
    toc.prepend(host);
  }

  return host;
}

export function ChangelogFilters({ tags }: ChangelogFiltersProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [tocHost, setTocHost] = useState<HTMLDivElement | null>(null);
  const uniqueTags = useMemo(
    () => Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))),
    [tags],
  );

  useEffect(() => {
    let frame = 0;
    const attach = () => {
      const host = ensureTocHost();
      if (host) {
        setTocHost(host);
        return;
      }
      frame = window.requestAnimationFrame(attach);
    };
    attach();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      const toc = document.getElementById('nd-toc');
      toc?.classList.remove('velu-changelog-filters-only');
      const host = document.getElementById(VELU_CHANGELOG_FILTER_HOST_ID);
      host?.remove();
    };
  }, []);

  useEffect(() => {
    const updates = Array.from(document.querySelectorAll<HTMLElement>('.velu-update'));
    const normalizedSelected = selected.map((tag) => normalize(tag));

    for (const update of updates) {
      const updateTags = parseNodeTags(update.dataset.updateTags);
      const visible = normalizedSelected.length === 0
        || normalizedSelected.some((tag) => updateTags.includes(tag));
      update.hidden = !visible;
    }
  }, [selected]);

  if (uniqueTags.length === 0) return null;

  const content = (
    <div className="velu-changelog-filter-block">
      <div className="velu-changelog-filter-heading">Filters</div>
      <div className="velu-changelog-filters" role="group" aria-label="Filter updates by tag">
        {uniqueTags.map((tag) => {
          const active = selected.some((entry) => normalize(entry) === normalize(tag));
          return (
            <button
              key={tag}
              type="button"
              className={['velu-changelog-filter', active ? 'active' : ''].filter(Boolean).join(' ')}
              onClick={() => {
                setSelected((prev) => {
                  const hasTag = prev.some((entry) => normalize(entry) === normalize(tag));
                  return hasTag
                    ? prev.filter((entry) => normalize(entry) !== normalize(tag))
                    : [...prev, tag];
                });
              }}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );

  if (!tocHost) return null;
  return createPortal(content, tocHost);
}
