"use client";

import { type CSSProperties, type ReactNode, useState } from 'react';

type ThemeValue = { light?: string; dark?: string };
type ColorValue = string | ThemeValue;

function valueToCopy(value: ColorValue | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const light = value.light ?? '';
  const dark = value.dark ?? '';
  if (light && dark) return `${light} / ${dark}`;
  return light || dark;
}

function swatchStyle(value: ColorValue | undefined): CSSProperties {
  if (!value) return { backgroundColor: '#16A34A' };
  if (typeof value === 'string') return { backgroundColor: value };
  const light = value.light ?? value.dark ?? '#16A34A';
  const dark = value.dark ?? value.light ?? '#16A34A';
  return {
    ['--velu-color-light' as any]: light,
    ['--velu-color-dark' as any]: dark,
  };
}

function valueLabel(value: ColorValue | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const parts = [
    value.light ? `light: ${value.light}` : null,
    value.dark ? `dark: ${value.dark}` : null,
  ].filter(Boolean);
  return parts.join(' / ');
}

export function VeluColorItem({ name, value, className }: { name?: string; value?: ColorValue; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copyText = valueToCopy(value);

  return (
    <button
      type="button"
      className={['velu-color-item', className].filter(Boolean).join(' ')}
      title={copied ? 'Copied' : 'Click to copy'}
      aria-label={`Copy ${name ?? 'color'} value`}
      onClick={async () => {
        if (!copyText) return;
        try {
          await navigator.clipboard.writeText(copyText);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        } catch {
          // Ignore clipboard errors in non-secure contexts.
        }
      }}
      data-copied={copied ? 'true' : undefined}
    >
      <span className="velu-color-swatch-wrap">
        <span className="velu-color-swatch" style={swatchStyle(value)} />
        <span className={['velu-color-copied-check', copied ? 'is-visible' : ''].filter(Boolean).join(' ')}>✓</span>
      </span>
      <div className="velu-color-item-text">
        {name ? <code>{name}</code> : null}
        {value ? <span>{valueLabel(value)}</span> : null}
      </div>
    </button>
  );
}

export function VeluColorRow({ title, children, className }: { title?: string; children?: ReactNode; className?: string }) {
  return (
    <div className={['velu-color-row', className].filter(Boolean).join(' ')}>
      {title ? <div className="velu-color-row-title">{title}</div> : null}
      <div className="velu-color-row-items">{children}</div>
    </div>
  );
}

export function VeluColor({
  children,
  className,
  variant = 'compact',
  color,
  hex,
  name,
}: {
  children?: ReactNode;
  className?: string;
  variant?: 'compact' | 'table' | string;
  color?: string;
  hex?: string;
  name?: string;
}) {
  if (children == null && (color || hex || name)) {
    const value = color ?? hex ?? '#16A34A';
    return (
      <div className={['velu-color', className].filter(Boolean).join(' ')}>
        <span className="velu-color-swatch" style={{ backgroundColor: value }} />
        <code>{name ?? value}</code>
      </div>
    );
  }

  return (
    <div
      className={[
        'velu-color',
        'velu-color-group',
        variant === 'table' ? 'velu-color-table' : 'velu-color-compact',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
