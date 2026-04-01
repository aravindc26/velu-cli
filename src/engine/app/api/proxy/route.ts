import { createOpenAPI } from 'fumadocs-openapi/server';

const proxy = createOpenAPI().createProxy({
  filterRequest(request) {
    try {
      const parsed = new URL(request.url);
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

