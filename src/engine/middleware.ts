import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.endsWith('.md')) {
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = `/md-file${pathname}`;
    return NextResponse.rewrite(rewritten);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|sitemap.xml|robots.txt|assets|images).*)'],
};
