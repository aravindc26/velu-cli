import { createOpenAPI } from 'fumadocs-openapi/server';

const proxy = createOpenAPI().createProxy({
  filterRequest(request) {
    const target = new URL(request.url).searchParams.get('url');
    if (!target) return false;

    try {
      const parsed = new URL(target);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  },
});

export const GET = proxy.GET;
export const POST = proxy.POST;
export const PUT = proxy.PUT;
export const PATCH = proxy.PATCH;
export const DELETE = proxy.DELETE;
export const HEAD = proxy.HEAD;

