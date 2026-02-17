'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { VeluProductOption } from '@/lib/velu';
import type { VeluIconLibrary } from '@/lib/velu';
import { VeluIcon } from '@/components/icon';

function ChevronDownIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ProductSwitcher({
  products,
  iconLibrary,
}: {
  products: VeluProductOption[];
  iconLibrary: VeluIconLibrary;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = useMemo(() => {
    const firstSeg = pathname.split('/').filter(Boolean)[0] ?? '';
    return products.find((p) => p.slug === firstSeg) ?? products[0];
  }, [pathname, products]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!current || products.length <= 1) return null;

  function switchTo(target: VeluProductOption) {
    setOpen(false);

    const segments = pathname.split('/').filter(Boolean);
    const firstSeg = segments[0] ?? '';

    if (current && current.slug === firstSeg) {
      // Replace the product segment, keep tab/group/page segments
      const rest = segments.slice(1);
      if (rest.length > 0) {
        window.location.href = '/' + [target.slug, ...rest].join('/');
        return;
      }
    }

    window.location.href = target.defaultPath;
  }

  return (
    <div className="velu-product-switcher-wrap" ref={ref}>
      <button type="button" className="velu-product-switcher" onClick={() => setOpen((v) => !v)}>
        <span className="velu-product-switcher-label-wrap">
          <VeluIcon
            name={current.icon}
            iconType={current.iconType}
            library={iconLibrary}
            className="velu-product-icon"
          />
          <span className="velu-product-switcher-label">{current.product}</span>
        </span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="velu-product-menu">
          {products.map((product) => (
            <button
              key={product.slug}
              type="button"
              className={`velu-product-option ${product.slug === current.slug ? 'active' : ''}`}
              onClick={() => switchTo(product)}
            >
              <span className="velu-product-option-name-wrap">
                <VeluIcon
                  name={product.icon}
                  iconType={product.iconType}
                  library={iconLibrary}
                  className="velu-product-option-icon"
                />
                <span className="velu-product-option-name">{product.product}</span>
              </span>
              {product.description && (
                <span className="velu-product-option-desc">{product.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
