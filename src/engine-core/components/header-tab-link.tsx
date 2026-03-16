'use client';

import Link from 'fumadocs-core/link';
import { usePathname } from 'fumadocs-core/framework';

interface HeaderTabLinkProps {
  text: string;
  href: string;
  urls: string[];
}

function normalizePath(value: string): string {
  if (value.length > 1 && value.endsWith('/')) return value.slice(0, -1);
  return value;
}

function isActivePath(pathname: string, href: string, urls: string[]): boolean {
  const normalizedPath = normalizePath(pathname);
  for (const candidate of urls) {
    if (normalizePath(candidate) === normalizedPath) return true;
  }

  const normalizedHref = normalizePath(href);
  return normalizedPath === normalizedHref || normalizedPath.startsWith(`${normalizedHref}/`);
}

export function HeaderTabLink({ text, href, urls }: HeaderTabLinkProps) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href, urls);

  return (
    <Link
      href={href}
      className={[
        'text-sm text-fd-muted-foreground transition-colors hover:text-fd-accent-foreground',
        active ? 'text-fd-primary' : '',
      ].join(' ')}
      data-active={active}
    >
      {text}
    </Link>
  );
}
