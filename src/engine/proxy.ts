import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import redirectRules from '@/generated/redirects';
import {
  compileRedirectRules,
  isExternalDestination,
  normalizeRedirectRules,
  resolveRedirect,
} from '@/lib/redirects';

const compiledRedirects = compileRedirectRules(normalizeRedirectRules(redirectRules));

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/rss-file')) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/llms-file') || pathname.startsWith('/llms-full-file')) {
    return NextResponse.next();
  }

  if (pathname.endsWith('/rss.xml')) {
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = `/rss-file${pathname.slice(0, -('/rss.xml'.length))}`;
    return NextResponse.rewrite(rewritten);
  }

  if (pathname === '/llms.txt') {
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = '/llms-file';
    return NextResponse.rewrite(rewritten);
  }

  if (pathname === '/llms-full.txt') {
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = '/llms-full-file';
    return NextResponse.rewrite(rewritten);
  }

  if (pathname.endsWith('.md')) {
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = `/md-file${pathname}`;
    return NextResponse.rewrite(rewritten);
  }

  const redirect = resolveRedirect(pathname, compiledRedirects);
  if (redirect) {
    if (isExternalDestination(redirect.destination)) {
      return NextResponse.redirect(redirect.destination, redirect.statusCode);
    }

    const target = request.nextUrl.clone();
    target.pathname = redirect.destination;
    if (!target.search && request.nextUrl.search) {
      target.search = request.nextUrl.search;
    }
    return NextResponse.redirect(target, redirect.statusCode);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|sitemap.xml|robots.txt|assets|images).*)'],
};
