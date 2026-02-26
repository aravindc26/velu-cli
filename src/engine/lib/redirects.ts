export interface RedirectRule {
  source: string;
  destination: string;
  permanent?: boolean;
}

interface RedirectCaptureDescriptor {
  kind: "named" | "star";
  key: string;
}

interface CompiledRedirectRule {
  source: string;
  destination: string;
  permanent: boolean;
  matcher: RegExp;
  captures: RedirectCaptureDescriptor[];
}

const INVALID_PATH_PARTS = /[?#]/;
const EXTERNAL_PROTOCOL = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const NAMED_WILDCARD = /^:([A-Za-z_][A-Za-z0-9_-]*)\*$/;
const NAMED_SEGMENT = /^:([A-Za-z_][A-Za-z0-9_-]*)$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isExternalDestination(value: string): boolean {
  return EXTERNAL_PROTOCOL.test(value);
}

function normalizePath(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) return "/";

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
  if (collapsed !== "/" && collapsed.endsWith("/")) {
    return collapsed.slice(0, -1);
  }
  return collapsed;
}

function compileSourcePattern(source: string): { matcher: RegExp; captures: RedirectCaptureDescriptor[] } {
  const normalized = normalizePath(source);
  if (normalized === "/") {
    return { matcher: /^\/$/, captures: [] };
  }

  const captures: RedirectCaptureDescriptor[] = [];
  let starIndex = 0;
  const segments = normalized.slice(1).split("/");
  let pattern = "^";

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    pattern += "/";

    const namedWildcard = segment.match(NAMED_WILDCARD);
    if (namedWildcard) {
      captures.push({ kind: "named", key: namedWildcard[1] });
      pattern += "(.*)";
      continue;
    }

    const namedSegment = segment.match(NAMED_SEGMENT);
    if (namedSegment) {
      captures.push({ kind: "named", key: namedSegment[1] });
      pattern += "([^/]+)";
      continue;
    }

    if (!segment.includes("*")) {
      pattern += escapeRegExp(segment);
      continue;
    }

    let segmentPattern = "";
    for (const char of segment) {
      if (char === "*") {
        const key = String(starIndex);
        starIndex += 1;
        captures.push({ kind: "star", key });
        segmentPattern += "([^/]*)";
      } else {
        segmentPattern += escapeRegExp(char);
      }
    }
    pattern += segmentPattern;
  }

  pattern += "/?$";
  return { matcher: new RegExp(pattern), captures };
}

function substituteDestination(
  destination: string,
  captures: RedirectCaptureDescriptor[],
  values: string[]
): string {
  const named = new Map<string, string>();
  const stars: string[] = [];

  for (let i = 0; i < captures.length; i += 1) {
    const capture = captures[i];
    const value = values[i] ?? "";
    if (capture.kind === "named") {
      named.set(capture.key, value);
    } else {
      stars.push(value);
    }
  }

  let resolved = destination;
  resolved = resolved.replace(/:([A-Za-z_][A-Za-z0-9_-]*)\*/g, (_, key: string) => named.get(key) ?? "");
  resolved = resolved.replace(/:([A-Za-z_][A-Za-z0-9_-]*)/g, (_, key: string) => named.get(key) ?? "");

  let starIndex = 0;
  resolved = resolved.replace(/\*/g, () => stars[starIndex++] ?? "");

  if (isExternalDestination(resolved)) return resolved;
  return normalizePath(resolved);
}

export function normalizeRedirectRules(value: unknown): RedirectRule[] {
  if (!Array.isArray(value)) return [];

  const redirects: RedirectRule[] = [];
  for (const entry of value) {
    if (!isObject(entry)) continue;
    if (typeof entry.source !== "string" || typeof entry.destination !== "string") continue;

    const source = entry.source.trim();
    const destination = entry.destination.trim();
    if (source.length === 0 || destination.length === 0) continue;
    if (INVALID_PATH_PARTS.test(source) || INVALID_PATH_PARTS.test(destination)) continue;

    const normalizedSource = normalizePath(source);
    const normalizedDestination = isExternalDestination(destination)
      ? destination
      : normalizePath(destination);
    const permanent = entry.permanent === false ? false : true;

    if (!isExternalDestination(normalizedDestination) && normalizedSource === normalizedDestination) continue;
    redirects.push({
      source: normalizedSource,
      destination: normalizedDestination,
      permanent,
    });
  }

  return redirects;
}

export function compileRedirectRules(rules: RedirectRule[]): CompiledRedirectRule[] {
  return rules.map((rule) => {
    const compiled = compileSourcePattern(rule.source);
    return {
      source: rule.source,
      destination: rule.destination,
      permanent: rule.permanent !== false,
      matcher: compiled.matcher,
      captures: compiled.captures,
    };
  });
}

export function resolveRedirect(
  pathname: string,
  compiledRules: CompiledRedirectRule[]
): { destination: string; statusCode: 307 | 308 } | null {
  const normalizedPath = normalizePath(pathname);

  for (const rule of compiledRules) {
    const match = normalizedPath.match(rule.matcher);
    if (!match) continue;

    const values = match.slice(1);
    const destination = substituteDestination(rule.destination, rule.captures, values);

    if (!isExternalDestination(destination) && destination === normalizedPath) continue;
    return {
      destination,
      statusCode: rule.permanent ? 308 : 307,
    };
  }

  return null;
}
