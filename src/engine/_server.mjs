import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { watch } from 'node:fs';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { normalizeConfigNavigation } from './lib/navigation-normalize.mjs';

const require = createRequire(import.meta.url);
const nextBinPath = require.resolve('next/dist/bin/next');
const { parse: parseYaml } = require('yaml');

// â”€â”€ Docs directory (passed via env var from CLI) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const docsDir = process.env.VELU_DOCS_DIR || resolve('..');
const contentDir = resolve('content', 'docs');
const publicDir = resolve('public');
const PRIMARY_CONFIG_NAME = 'docs.json';
const LEGACY_CONFIG_NAME = 'velu.json';
const SOURCE_MIRROR_DIR = 'velu-imports';
const sourceMirrorDir = resolve(SOURCE_MIRROR_DIR);
const STATIC_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.mp4', '.webm',
  '.mp3', '.wav',
  '.json', '.yaml', '.yml',
  '.css',
  '.js',
  '.woff', '.woff2', '.ttf', '.eot',
  '.pdf', '.txt',
  '.xml', '.csv',
  '.zip',
]);
const SOURCE_MIRROR_EXTENSIONS = new Set([
  '.md', '.mdx', '.jsx', '.js', '.tsx', '.ts',
  '.json', '.yaml', '.yml', '.css',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot',
  '.mp4', '.webm', '.mp3', '.wav',
  '.pdf', '.txt', '.xml', '.csv', '.zip',
]);
const IMPORT_REWRITE_EXTENSIONS = new Set(['.md', '.mdx', '.jsx', '.js', '.tsx', '.ts']);

function resolveConfigPath() {
  const primary = join(docsDir, PRIMARY_CONFIG_NAME);
  if (existsSync(primary)) return primary;
  return join(docsDir, LEGACY_CONFIG_NAME);
}

function isStaticAsset(filename) {
  const ext = extname(filename).toLowerCase();
  return STATIC_EXTENSIONS.has(ext);
}

function copyStaticAssets() {
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;
      const srcPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(srcPath);
        continue;
      }
      if (!isStaticAsset(srcPath)) continue;
      const rel = relative(docsDir, srcPath);
      const destPath = join(publicDir, rel);
      mkdirSync(dirname(destPath), { recursive: true });
      copyFileSync(srcPath, destPath);
    }
  }

  mkdirSync(publicDir, { recursive: true });
  walk(docsDir);
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeHexColor(value, fallback = '#10b981') {
  const text = String(value ?? '').trim();
  if (/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(text)) return text;
  return fallback;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex).replace('#', '');
  const raw = normalized.length === 3
    ? normalized.split('').map((ch) => `${ch}${ch}`).join('')
    : normalized;
  const int = Number.parseInt(raw, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgbaFromHex(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function humanizeSegment(value) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!cleaned) return 'Documentation';
  return cleaned.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function parseFrontmatterData(markdown) {
  if (!markdown || typeof markdown !== 'string') return {};
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  try {
    const parsed = parseYaml(match[1]);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function ensureLeadingSlash(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.startsWith('/') ? text : `/${text}`;
}

function resolveLogoReference(config) {
  const logo = config?.logo;
  let rawLogo = null;
  if (typeof logo === 'string') {
    rawLogo = logo.trim();
  } else if (logo && typeof logo === 'object') {
    if (typeof logo.dark === 'string' && logo.dark.trim()) rawLogo = logo.dark.trim();
    else if (typeof logo.light === 'string' && logo.light.trim()) rawLogo = logo.light.trim();
    else if (typeof logo.default === 'string' && logo.default.trim()) rawLogo = logo.default.trim();
  }

  if (!rawLogo) return null;
  if (/^https?:\/\//i.test(rawLogo)) return rawLogo;

  const localPath = join(docsDir, rawLogo.replace(/^\/+/, ''));
  if (!existsSync(localPath)) return ensureLeadingSlash(rawLogo);

  const ext = extname(localPath).toLowerCase();
  const mime = ext === '.svg'
    ? 'image/svg+xml'
    : ext === '.png'
      ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : null;
  if (!mime) return ensureLeadingSlash(rawLogo);

  const encoded = readFileSync(localPath).toString('base64');
  return `data:${mime};base64,${encoded}`;
}

function resolvePrimaryColor(config) {
  const colors = config?.colors;
  if (!colors || typeof colors !== 'object') return '#10b981';
  return normalizeHexColor(colors.primary || colors.light || colors.dark || '#10b981');
}

function resolveSiteName(config) {
  if (typeof config?.name === 'string' && config.name.trim()) return config.name.trim();
  if (typeof config?.title === 'string' && config.title.trim()) return config.title.trim();
  return 'Documentation';
}

function readMetaInfo(pathSegments) {
  const metaPath = join(contentDir, ...pathSegments, 'meta.json');
  if (!existsSync(metaPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(metaPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object') return null;
    const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : null;
    const root = parsed.root === true;
    return { title, root };
  } catch {
    return null;
  }
}

function resolveSectionLabel(routeSegments, siteName) {
  if (!Array.isArray(routeSegments) || routeSegments.length === 0) return siteName;

  const firstMeta = readMetaInfo([routeSegments[0]]);
  if (routeSegments.length > 1 && firstMeta?.root === true) {
    const secondMeta = readMetaInfo([routeSegments[0], routeSegments[1]]);
    if (secondMeta?.title) return secondMeta.title;
    return humanizeSegment(routeSegments[1]);
  }

  if (firstMeta?.title) return firstMeta.title;
  return humanizeSegment(routeSegments[0]);
}

function normalizeRoutePathFromContentFile(relativePath) {
  const normalized = toPosixPath(relativePath).replace(/\.(md|mdx)$/i, '');
  const trimmed = normalized.replace(/^\/+/, '');
  if (!trimmed || trimmed === 'index') return '/';
  if (trimmed.endsWith('/index')) return `/${trimmed.slice(0, -('/index'.length))}`;
  return `/${trimmed}`;
}

function splitTitleLines(value, maxChars = 34, maxLines = 2) {
  const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['Documentation'];
  const lines = [];
  let current = '';
  let index = 0;

  while (index < words.length) {
    const word = words[index];
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
      index += 1;
      continue;
    }
    lines.push(current);
    current = '';
    if (lines.length === maxLines - 1) break;
  }

  const tail = [...(current ? [current] : []), ...words.slice(index)].join(' ').trim();
  if (tail) lines.push(tail);

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }
  if (lines.length === maxLines && lines[maxLines - 1].length > maxChars) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(1, maxChars - 1)).trim()}…`;
  }

  return lines;
}

function collectContentMarkdownFiles() {
  const files = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(md|mdx)$/i.test(entry.name)) continue;
      files.push(fullPath);
    }
  }
  walk(contentDir);
  return files;
}

function toOgOutputPath(routePath) {
  const normalized = routePath === '/' ? 'index' : routePath.replace(/^\/+/, '');
  return join(publicDir, 'og', `${normalized}.svg`);
}

function buildOgSvg({ title, section, description, logoHref, primaryColor }) {
  const gradientAccent = rgbaFromHex(primaryColor, 0.48);
  const gradientGlow = rgbaFromHex(primaryColor, 0.14);
  const titleLines = splitTitleLines(title, 34, 2);
  const titleBaseY = 470 - ((titleLines.length - 1) * 74);
  const titleTs = titleLines
    .map((line, idx) => `<tspan x="70" y="${titleBaseY + (idx * 78)}">${escapeXml(line)}</tspan>`)
    .join('');
  const descriptionText = description ? `<text x="70" y="570" fill="#A9B3C2" font-size="34" font-family="Inter, Segoe UI, Arial, sans-serif">${escapeXml(description)}</text>` : '';
  const logoNode = logoHref
    ? `<image href="${escapeXml(logoHref)}" x="70" y="52" width="220" height="56" preserveAspectRatio="xMinYMid meet" />`
    : '';

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">',
    '  <defs>',
    '    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
    '      <stop offset="0%" stop-color="#070C11" />',
    '      <stop offset="48%" stop-color="#0A1218" />',
    `      <stop offset="100%" stop-color="${escapeXml(gradientGlow)}" />`,
    '    </linearGradient>',
    '    <radialGradient id="accent" cx="78%" cy="18%" r="70%">',
    `      <stop offset="0%" stop-color="${escapeXml(gradientAccent)}" />`,
    '      <stop offset="60%" stop-color="rgba(0,0,0,0)" />',
    '    </radialGradient>',
    '  </defs>',
    '  <rect width="1200" height="630" fill="url(#bg)" />',
    '  <rect width="1200" height="630" fill="url(#accent)" />',
    `  ${logoNode}`,
    `  <text x="70" y="365" fill="#D4DBE6" font-size="44" font-family="Inter, Segoe UI, Arial, sans-serif">${escapeXml(section)}</text>`,
    `  <text x="70" y="${titleBaseY}" fill="#FFFFFF" font-size="76" font-weight="700" font-family="Inter, Segoe UI, Arial, sans-serif">${titleTs}</text>`,
    `  ${descriptionText}`,
    '</svg>',
    '',
  ].join('\n');
}

function generateOgImages(config) {
  const ogRootDir = join(publicDir, 'og');
  rmSync(ogRootDir, { recursive: true, force: true });
  mkdirSync(ogRootDir, { recursive: true });

  const files = collectContentMarkdownFiles();
  const siteName = resolveSiteName(config);
  const logoHref = resolveLogoReference(config);
  const primaryColor = resolvePrimaryColor(config);

  for (const filePath of files) {
    const relPath = toPosixPath(relative(contentDir, filePath));
    const routePath = normalizeRoutePathFromContentFile(relPath);
    const markdown = readFileSync(filePath, 'utf-8');
    const frontmatter = parseFrontmatterData(markdown);
    const routeSegments = routePath === '/' ? [] : routePath.replace(/^\/+/, '').split('/').filter(Boolean);
    const fallbackTitle = humanizeSegment(routeSegments[routeSegments.length - 1] || 'overview');
    const title = typeof frontmatter.title === 'string' && frontmatter.title.trim()
      ? frontmatter.title.trim()
      : fallbackTitle;
    const rawDescription = typeof frontmatter.description === 'string' ? frontmatter.description.trim() : '';
    const description = rawDescription.length > 120 ? `${rawDescription.slice(0, 119).trim()}…` : rawDescription;
    const section = resolveSectionLabel(routeSegments, siteName);
    const svg = buildOgSvg({
      title,
      section,
      description,
      logoHref,
      primaryColor,
    });

    const outPath = toOgOutputPath(routePath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, svg, 'utf-8');
  }
}

function toPosixPath(value) {
  return value.replace(/\\/g, '/');
}

function isInsideDocsRoot(targetPath) {
  const relPath = relative(docsDir, targetPath);
  if (!relPath) return true;
  if (relPath.startsWith('..')) return false;
  if (/^[a-zA-Z]:/.test(relPath)) return false;
  return true;
}

function shouldMirrorSourceFile(filePath) {
  return SOURCE_MIRROR_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function shouldRewriteImports(filePath) {
  return IMPORT_REWRITE_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function rewriteImportSpecifier(specifier, sourceFilePath, outputFilePath) {
  const match = specifier.match(/^([^?#]+)([?#].*)?$/);
  if (!match) return specifier;
  const rawPath = match[1];
  const suffix = match[2] || '';

  let resolvedSourcePath = null;
  if (rawPath.startsWith('/')) {
    resolvedSourcePath = join(docsDir, rawPath.slice(1));
  } else if (rawPath.startsWith('./') || rawPath.startsWith('../')) {
    resolvedSourcePath = resolve(dirname(sourceFilePath), rawPath);
  }

  if (!resolvedSourcePath || !isInsideDocsRoot(resolvedSourcePath)) {
    return specifier;
  }

  const relToDocs = relative(docsDir, resolvedSourcePath);
  const mirrorTargetPath = join(sourceMirrorDir, relToDocs);
  const relFromOutput = relative(dirname(outputFilePath), mirrorTargetPath);
  const normalizedRel = toPosixPath(relFromOutput || '.');
  const withDotPrefix = normalizedRel.startsWith('.') ? normalizedRel : `./${normalizedRel}`;
  return `${withDotPrefix}${suffix}`;
}

function rewriteImportsInContent(content, sourceFilePath, outputFilePath) {
  const importFromPattern = /^(\s*import\s+)(.+?)(\s+from\s*["'])([^"']+)(["']\s*;?\s*)$/;
  const exportFromPattern = /^(\s*export\b[^\n]*?\bfrom\s*["'])([^"']+)(["'])/;
  const sideEffectImportPattern = /^(\s*import\s*["'])([^"']+)(["'])/;
  const fencePattern = /^\s*(```+|~~~+)/;
  const mdxOutput = (() => {
    const ext = extname(outputFilePath).toLowerCase();
    return ext === '.md' || ext === '.mdx';
  })();

  const lines = content.split(/\r?\n/);
  const out = [];
  let inFence = false;
  let fenceChar = '';
  let injectedMdxHelperImport = false;

  function importPathFromSpecifier(specifier) {
    const match = specifier.match(/^([^?#]+)/);
    return match ? match[1] : specifier;
  }

  function isLocalSpecifier(specifier) {
    return specifier.startsWith('/') || specifier.startsWith('./') || specifier.startsWith('../');
  }

  function isMdxSpecifier(specifier) {
    const base = importPathFromSpecifier(specifier).toLowerCase();
    return base.endsWith('.mdx') || base.endsWith('.md');
  }

  function parseDefaultImport(clause) {
    const trimmed = clause.trim();
    if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('*')) return {};

    const commaIdx = trimmed.indexOf(',');
    if (commaIdx === -1) {
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(trimmed)) return { defaultName: trimmed };
      return {};
    }

    const defaultName = trimmed.slice(0, commaIdx).trim();
    const remainder = trimmed.slice(commaIdx + 1).trim();
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(defaultName)) return {};
    if (!remainder.startsWith('{') && !remainder.startsWith('*')) return {};
    return { defaultName, namedPart: remainder };
  }

  for (const line of lines) {
    const fenceMatch = line.match(fencePattern);
    if (fenceMatch) {
      const currentFenceChar = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = currentFenceChar;
      } else if (fenceChar === currentFenceChar) {
        inFence = false;
        fenceChar = '';
      }
      out.push(line);
      continue;
    }

    if (inFence) {
      out.push(line);
      continue;
    }

    const importMatch = line.match(importFromPattern);
    if (importMatch) {
      const importPrefix = importMatch[1];
      const importClause = importMatch[2];
      const fromPrefix = importMatch[3];
      const specifier = importMatch[4];
      const importSuffix = importMatch[5];
      const rewritten = rewriteImportSpecifier(specifier, sourceFilePath, outputFilePath);
      const { defaultName, namedPart } = parseDefaultImport(importClause);
      const shouldWrapDefaultImport =
        mdxOutput && Boolean(defaultName) && isLocalSpecifier(specifier) && isMdxSpecifier(specifier);

      if (shouldWrapDefaultImport && defaultName) {
        if (!injectedMdxHelperImport) {
          out.push('import { getMDXComponents as __veluGetMDXComponents } from "@/mdx-components";');
          injectedMdxHelperImport = true;
        }

        const rawName = `__veluRaw_${defaultName}`;
        const wrappedClause = namedPart ? `${rawName}, ${namedPart}` : rawName;
        out.push(`${importPrefix}${wrappedClause}${fromPrefix}${rewritten}${importSuffix}`);
        out.push(`export const ${defaultName} = (props) => <${rawName} {...props} components={__veluGetMDXComponents()} />;`);
        continue;
      }

      out.push(`${importPrefix}${importClause}${fromPrefix}${rewritten}${importSuffix}`);
      continue;
    }

    let nextLine = line.replace(exportFromPattern, (_, prefix, specifier, suffix) => {
      const rewritten = rewriteImportSpecifier(specifier, sourceFilePath, outputFilePath);
      return `${prefix}${rewritten}${suffix}`;
    });

    nextLine = nextLine.replace(sideEffectImportPattern, (_, prefix, specifier, suffix) => {
      const rewritten = rewriteImportSpecifier(specifier, sourceFilePath, outputFilePath);
      return `${prefix}${rewritten}${suffix}`;
    });

    out.push(nextLine);
  }

  return out.join('\n');
}

function copyMirroredSourceFile(srcPath) {
  if (!shouldMirrorSourceFile(srcPath)) return;
  if (!isInsideDocsRoot(srcPath)) return;

  const relPath = relative(docsDir, srcPath);
  const destPath = join(sourceMirrorDir, relPath);
  mkdirSync(dirname(destPath), { recursive: true });

  if (shouldRewriteImports(srcPath)) {
    const raw = readFileSync(srcPath, 'utf-8');
    const rewritten = rewriteImportsInContent(raw, srcPath, destPath);
    writeFileSync(destPath, rewritten, 'utf-8');
    return;
  }

  copyFileSync(srcPath, destPath);
}

function rebuildSourceMirror() {
  rmSync(sourceMirrorDir, { recursive: true, force: true });
  mkdirSync(sourceMirrorDir, { recursive: true });

  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;
      const srcPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(srcPath);
        continue;
      }
      if (!shouldMirrorSourceFile(srcPath)) continue;
      copyMirroredSourceFile(srcPath);
    }
  }

  walk(docsDir);
}

function syncSourceMirrorFile(filename) {
  const srcPath = join(docsDir, filename);
  const destPath = join(sourceMirrorDir, filename);
  if (!shouldMirrorSourceFile(srcPath)) return;

  if (existsSync(srcPath)) {
    copyMirroredSourceFile(srcPath);
    return;
  }

  rmSync(destPath, { force: true });
}

function loadConfig() {
  const raw = readFileSync(resolveConfigPath(), 'utf-8');
  return normalizeConfigNavigation(JSON.parse(raw));
}

function isExternalDestination(value) {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

function normalizePath(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '/';
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
  if (collapsed !== '/' && collapsed.endsWith('/')) return collapsed.slice(0, -1);
  return collapsed;
}

function collectRedirectRules(config) {
  const redirects = Array.isArray(config?.redirects) ? config.redirects : [];
  const output = [];

  for (const redirect of redirects) {
    if (!redirect || typeof redirect.source !== 'string' || typeof redirect.destination !== 'string') continue;
    const source = redirect.source.trim();
    const destination = redirect.destination.trim();
    if (!source || !destination) continue;
    if (/[?#]/.test(source) || /[?#]/.test(destination)) continue;

    const normalizedSource = normalizePath(source);
    const normalizedDestination = isExternalDestination(destination)
      ? destination
      : normalizePath(destination);
    if (!isExternalDestination(normalizedDestination) && normalizedSource === normalizedDestination) continue;

    output.push({
      source: normalizedSource,
      destination: normalizedDestination,
      permanent: redirect.permanent !== false,
    });
  }

  return output;
}

function writeRedirectArtifacts(config) {
  const redirects = collectRedirectRules(config);
  const generatedDir = resolve('generated');
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(
    join(generatedDir, 'redirects.ts'),
    `const redirects: Array<{ source: string; destination: string; permanent: boolean }> = ${JSON.stringify(redirects, null, 2)};\n\nexport default redirects;\n`,
    'utf-8'
  );

  const redirectsFilePath = join(publicDir, '_redirects');
  if (redirects.length === 0) {
    rmSync(redirectsFilePath, { force: true });
    return;
  }

  const netlifyBody = redirects
    .map((redirect) => `${redirect.source} ${redirect.destination} ${redirect.permanent ? 301 : 307}`)
    .join('\n');
  writeFileSync(redirectsFilePath, `${netlifyBody}\n`, 'utf-8');
}

function pageBasename(page) {
  return page.split('/').pop();
}

function pageLabelFromSlug(slug) {
  const last = slug.split('/').pop() || slug;
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function isSeparator(item) {
  return typeof item === 'object' && item !== null && 'separator' in item;
}

function isLink(item) {
  return typeof item === 'object' && item !== null && 'href' in item && 'label' in item;
}

function isGroup(item) {
  return typeof item === 'object' && item !== null && 'group' in item;
}

const HTTP_METHODS = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'TRACE', 'CONNECT', 'WEBHOOK',
]);
const OPENAPI_PATH_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);
const ASYNCAPI_OPERATION_ACTIONS = new Set(['publish', 'subscribe', 'send', 'receive']);

function resolveDefaultOpenApiSpec(openapi) {
  const source = extractOpenApiSource(openapi);
  if (typeof source === 'string') {
    const trimmed = source.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(source)) {
    const first = source.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
    return typeof first === 'string' ? first.trim() : undefined;
  }
  return undefined;
}

function extractOpenApiSource(openapi) {
  if (typeof openapi === 'string' || Array.isArray(openapi)) return openapi;
  if (openapi && typeof openapi === 'object') {
    const source = openapi.source;
    if (typeof source === 'string' || Array.isArray(source)) return source;
  }
  return undefined;
}

function resolveOpenApiDirectory(openapi) {
  if (!openapi || typeof openapi !== 'object' || Array.isArray(openapi)) return undefined;
  const raw = openapi.directory;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveDefaultAsyncApiSpec(asyncapi) {
  const source = extractOpenApiSource(asyncapi);
  if (typeof source === 'string') {
    const trimmed = source.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(source)) {
    const first = source.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
    return typeof first === 'string' ? first.trim() : undefined;
  }
  return undefined;
}

function resolveAsyncApiSpecList(asyncapi) {
  const source = extractOpenApiSource(asyncapi);
  if (typeof source === 'string') {
    const trimmed = source.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(source)) {
    return source
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function resolveAsyncApiDirectory(asyncapi) {
  if (!asyncapi || typeof asyncapi !== 'object' || Array.isArray(asyncapi)) return undefined;
  const raw = asyncapi.directory;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOpenApiOperationRef(value, inheritedSpec) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  const withSpec = trimmed.match(/^(\S+)\s+([A-Za-z]+)\s+(.+)$/);
  if (withSpec) {
    const method = withSpec[2].toUpperCase();
    const endpoint = withSpec[3].trim();
    if (!HTTP_METHODS.has(method)) return null;
    if (method === 'WEBHOOK') {
      if (!endpoint) return null;
      return { spec: withSpec[1].trim(), method, endpoint, kind: 'webhook' };
    }
    if (!endpoint.startsWith('/')) return null;
    return { spec: withSpec[1].trim(), method, endpoint, kind: 'path' };
  }

  const noSpec = trimmed.match(/^([A-Za-z]+)\s+(.+)$/);
  if (!noSpec) return null;
  const method = noSpec[1].toUpperCase();
  const endpoint = noSpec[2].trim();
  if (!HTTP_METHODS.has(method)) return null;
  if (method === 'WEBHOOK') {
    if (!endpoint) return null;
    return { spec: inheritedSpec, method, endpoint, kind: 'webhook' };
  }
  if (!endpoint.startsWith('/')) return null;
  return { spec: inheritedSpec, method, endpoint, kind: 'path' };
}

function parseAsyncApiChannelRef(value, inheritedSpec) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  const withSpec = trimmed.match(/^(\S+)\s+(.+)$/);
  if (withSpec) {
    const maybeMethod = withSpec[1].toUpperCase();
    if (HTTP_METHODS.has(maybeMethod)) return null;
    const spec = withSpec[1].trim();
    const channel = withSpec[2].trim();
    if (!channel) return null;
    return { spec, channel };
  }

  if (!inheritedSpec) return null;
  return { spec: inheritedSpec, channel: trimmed };
}

function slugFromOpenApiOperation(method, endpoint) {
  const cleaned = endpoint
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[{}]/g, '')
    .replace(/[^a-z0-9/._-]+/g, '-')
    .replace(/\/+/g, '-')
    .replace(/[-_.]{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');
  const body = cleaned || 'endpoint';
  return `${method.toLowerCase()}-${body}`;
}

function resolveOpenApiSpecList(openapi) {
  const source = extractOpenApiSource(openapi);
  if (typeof source === 'string') {
    const trimmed = source.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(source)) {
    return source
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function parseOpenApiDocument(rawSource) {
  const source = String(rawSource ?? '').trim();
  if (!source) return null;
  try {
    const parsed = JSON.parse(source);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  try {
    const parsed = parseYaml(source);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return null;
}

function parseAsyncApiDocument(rawSource) {
  return parseOpenApiDocument(rawSource);
}

function resolveRef(root, ref) {
  const refText = String(ref ?? '');
  if (!refText.startsWith('#/')) return undefined;
  const parts = refText.slice(2).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = root;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function loadAsyncApiChannels(specSource) {
  if (/^https?:\/\//i.test(specSource) || specSource.startsWith('file://')) return [];

  const resolvedPath = specSource.startsWith('/')
    ? join(docsDir, specSource.replace(/^\/+/, ''))
    : resolve(docsDir, specSource);
  if (!existsSync(resolvedPath)) return [];

  const parsed = parseAsyncApiDocument(readFileSync(resolvedPath, 'utf-8'));
  if (!parsed || typeof parsed !== 'object') return [];
  const channels = parsed.channels;
  if (!channels || typeof channels !== 'object') return [];

  return Object.entries(channels)
    .map(([channelName, rawChannel]) => {
      const channel = rawChannel && typeof rawChannel === 'object' ? rawChannel : {};
      const title = typeof channel.title === 'string' ? channel.title : undefined;
      const description = typeof channel.description === 'string' ? channel.description : undefined;
      return {
        spec: specSource,
        channel: channelName,
        title: title ?? channelName,
        description,
      };
    })
    .filter((entry) => typeof entry.channel === 'string' && entry.channel.trim().length > 0);
}

function getAsyncApiChannelInfo(specSource, channelName) {
  if (/^https?:\/\//i.test(specSource) || specSource.startsWith('file://')) return null;

  const resolvedPath = specSource.startsWith('/')
    ? join(docsDir, specSource.replace(/^\/+/, ''))
    : resolve(docsDir, specSource);
  if (!existsSync(resolvedPath)) return null;

  const parsed = parseAsyncApiDocument(readFileSync(resolvedPath, 'utf-8'));
  if (!parsed || typeof parsed !== 'object') return null;

  const channels = parsed.channels;
  if (!channels || typeof channels !== 'object') return null;

  const channelObject = channels[channelName];
  if (!channelObject || typeof channelObject !== 'object') {
    const byAddress = Object.entries(channels).find(([, rawChannel]) => {
      if (!rawChannel || typeof rawChannel !== 'object') return false;
      const address = rawChannel.address;
      return typeof address === 'string' && address === channelName;
    });
    if (!byAddress) return null;
    const [, matched] = byAddress;
    return {
      channel: byAddress[0],
      title: typeof matched.title === 'string' ? matched.title : byAddress[0],
      description: typeof matched.description === 'string' ? matched.description : undefined,
    };
  }

  return {
    channel: channelName,
    title: typeof channelObject.title === 'string' ? channelObject.title : channelName,
    description: typeof channelObject.description === 'string' ? channelObject.description : undefined,
  };
}

function readMintMetadata(operation) {
  const xMint = operation['x-mint'];
  if (!xMint || typeof xMint !== 'object') return {};
  const metadata = xMint.metadata;
  const content = xMint.content;
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  return {
    title: typeof meta.title === 'string' ? meta.title : undefined,
    description: typeof meta.description === 'string' ? meta.description : undefined,
    deprecated: typeof meta.deprecated === 'boolean' ? meta.deprecated : undefined,
    version: typeof meta.version === 'string' ? meta.version : undefined,
    content: typeof content === 'string' ? content : undefined,
  };
}

function readVisibilityMetadata(operation) {
  return {
    hidden: operation['x-hidden'] === true,
    excluded: operation['x-excluded'] === true,
  };
}

function normalizeWebhookKey(name) {
  const value = String(name ?? '').trim();
  if (!value) return value;
  return value.startsWith('/') ? value : `/${value}`;
}

function readOpenApiOperationInfo(operation) {
  if (!operation || typeof operation !== 'object') return {};
  const mintMeta = readMintMetadata(operation);
  const visibility = readVisibilityMetadata(operation);
  return {
    ...visibility,
    title: mintMeta.title ?? (typeof operation.summary === 'string' ? operation.summary : undefined),
    description: mintMeta.description ?? (typeof operation.description === 'string' ? operation.description : undefined),
    deprecated: mintMeta.deprecated ?? (operation.deprecated === true),
    version: mintMeta.version,
    content: mintMeta.content,
  };
}

function resolveSpecPath(specSource) {
  if (/^https?:\/\//i.test(specSource) || specSource.startsWith('file://')) return undefined;
  const resolvedPath = specSource.startsWith('/')
    ? join(docsDir, specSource.replace(/^\/+/, ''))
    : resolve(docsDir, specSource);
  return existsSync(resolvedPath) ? resolvedPath : undefined;
}

function loadOpenApiDocument(specSource) {
  const resolvedPath = resolveSpecPath(specSource);
  if (!resolvedPath) return null;
  return parseOpenApiDocument(readFileSync(resolvedPath, 'utf-8'));
}

function getOpenApiOperationInfo(specSource, kind, method, endpoint) {
  const parsed = loadOpenApiDocument(specSource);
  if (!parsed) return null;

  if (kind === 'webhook') {
    const webhooks = parsed.webhooks;
    if (!webhooks || typeof webhooks !== 'object') return null;
    const target = normalizeWebhookKey(endpoint);
    const entries = Object.entries(webhooks);
    const resolvedEntry = entries.find(([name]) => name === endpoint || normalizeWebhookKey(name) === target);
    if (!resolvedEntry) return null;
    const pathItem = resolvedEntry[1];
    if (!pathItem || typeof pathItem !== 'object') return null;
    const methodKey = method === 'WEBHOOK' ? pickOperationMethod(pathItem)?.toLowerCase() : method.toLowerCase();
    if (!methodKey) return null;
    return readOpenApiOperationInfo(pathItem[methodKey]);
  }

  const paths = parsed.paths;
  if (!paths || typeof paths !== 'object') return null;
  const pathItem = paths[endpoint];
  if (!pathItem || typeof pathItem !== 'object') return null;
  return readOpenApiOperationInfo(pathItem[method.toLowerCase()]);
}

function pickOperationMethod(pathItem) {
  for (const method of OPENAPI_PATH_METHODS) {
    const operation = pathItem[method];
    if (operation && typeof operation === 'object') return method.toUpperCase();
  }
  return undefined;
}

function loadOpenApiOperations(specSource) {
  const parsed = loadOpenApiDocument(specSource);
  if (!parsed) return [];
  const paths = parsed.paths;
  const webhooks = parsed.webhooks;

  const output = [];
  if (paths && typeof paths === 'object') {
    for (const [endpoint, methods] of Object.entries(paths)) {
      if (!endpoint.startsWith('/') || !methods || typeof methods !== 'object') continue;
      for (const method of Object.keys(methods)) {
        const normalized = method.toLowerCase();
        if (!OPENAPI_PATH_METHODS.has(normalized)) continue;
        const operation = methods[method];
        if (!operation || typeof operation !== 'object') continue;
        const operationInfo = readOpenApiOperationInfo(operation);
        if (operationInfo.excluded) continue;
        output.push({
          kind: 'path',
          spec: specSource,
          method: normalized.toUpperCase(),
          endpoint,
          title: operationInfo.title,
          description: operationInfo.description,
          deprecated: operationInfo.deprecated,
          version: operationInfo.version,
          content: operationInfo.content,
          hidden: operationInfo.hidden,
        });
      }
    }
  }

  if (webhooks && typeof webhooks === 'object') {
    for (const [webhookName, pathItem] of Object.entries(webhooks)) {
      if (!pathItem || typeof pathItem !== 'object') continue;
      const resolvedMethod = pickOperationMethod(pathItem);
      if (!resolvedMethod) continue;
      const operation = pathItem[resolvedMethod.toLowerCase()];
      if (!operation || typeof operation !== 'object') continue;
      const operationInfo = readOpenApiOperationInfo(operation);
      if (operationInfo.excluded) continue;
      output.push({
        kind: 'webhook',
        spec: specSource,
        method: 'WEBHOOK',
        endpoint: webhookName,
        title: operationInfo.title,
        description: operationInfo.description,
        deprecated: operationInfo.deprecated,
        version: operationInfo.version,
        content: operationInfo.content,
        hidden: operationInfo.hidden,
      });
    }
  }
  return output;
}

function normalizeOpenApiSpecForFrontmatter(spec) {
  if (!spec) return undefined;
  const trimmed = String(spec).trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('file://')) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  return `/${trimmed.replace(/^\.?\/*/, '')}`;
}

function metaEntry(item) {
  if (typeof item === 'string') return item;
  if (isSeparator(item)) return `---${item.separator}---`;
  if (isLink(item)) {
    return item.icon
      ? `[${item.icon}][${item.label}](${item.href})`
      : `[${item.label}](${item.href})`;
  }
  return String(item);
}

function buildArtifacts(config) {
  const pageMap = [];
  const metaFiles = [];
  const rootTabs = (config.navigation?.tabs || []).filter((tab) => !tab.href);
  const rootPages = rootTabs.map((tab) => tab.slug);
  const defaultOpenApiSpec = resolveDefaultOpenApiSpec(config.navigation?.openapi ?? config.openapi);
  const defaultAsyncApiSpec = resolveDefaultAsyncApiSpec(config.navigation?.asyncapi ?? config.asyncapi);
  let firstPage = 'quickstart';
  let hasFirstPage = false;
  let firstHiddenPageCandidate;
  const usedDestinations = new Set();

  function trackFirstPage(dest, hidden = false) {
    if (!hidden && !hasFirstPage) {
      firstPage = dest;
      hasFirstPage = true;
      return;
    }
    if (hidden && !hasFirstPage && !firstHiddenPageCandidate) {
      firstHiddenPageCandidate = dest;
    }
  }

  function uniqueDestination(dest) {
    if (!usedDestinations.has(dest)) {
      usedDestinations.add(dest);
      return dest;
    }
    let count = 2;
    while (usedDestinations.has(`${dest}-${count}`)) count += 1;
    const candidate = `${dest}-${count}`;
    usedDestinations.add(candidate);
    return candidate;
  }

  function metaEntryForDestination(baseDir, destination) {
    const fromParts = baseDir.split('/').filter(Boolean);
    const toParts = destination.split('/').filter(Boolean);

    let index = 0;
    while (index < fromParts.length && index < toParts.length && fromParts[index] === toParts[index]) {
      index += 1;
    }

    const up = Array(fromParts.length - index).fill('..');
    const down = toParts.slice(index);
    const rel = [...up, ...down].join('/');
    return rel || pageBasename(destination);
  }

  function resolveGenerationDestination(openapi, fallback) {
    const override = resolveOpenApiDirectory(openapi) ?? resolveAsyncApiDirectory(openapi);
    if (!override) return fallback;
    if (!fallback) return override;
    if (override === fallback || override.startsWith(`${fallback}/`)) return override;
    return `${fallback}/${override}`;
  }

  function toFilePageMapping(item, destDir) {
    const basename = pageBasename(item);
    const dest = uniqueDestination(`${destDir}/${basename}`);
    return { src: item, dest, kind: 'file' };
  }

  function toPageMapping(item, destDir, inheritedSpec, mode = 'file-fallback') {
    const parsedOpenApi = parseOpenApiOperationRef(item, inheritedSpec);
    if (!parsedOpenApi) {
      if (mode === 'operation-only') return undefined;
      return toFilePageMapping(item, destDir);
    }

    const operationInfo = parsedOpenApi.spec
      ? getOpenApiOperationInfo(parsedOpenApi.spec, parsedOpenApi.kind, parsedOpenApi.method, parsedOpenApi.endpoint)
      : null;
    if (operationInfo?.excluded) return null;

    const slug = slugFromOpenApiOperation(parsedOpenApi.method, parsedOpenApi.endpoint);
    const dest = uniqueDestination(`${destDir}/${slug}`);
    return {
      src: item,
      dest,
      kind: 'openapi-operation',
      openapiSpec: parsedOpenApi.spec,
      openapiMethod: parsedOpenApi.method,
      openapiEndpoint: parsedOpenApi.endpoint,
      openapiKind: parsedOpenApi.kind,
      title: operationInfo?.title,
      description: operationInfo?.description,
      deprecated: operationInfo?.deprecated,
      version: operationInfo?.version,
      content: operationInfo?.content,
      hidden: operationInfo?.hidden === true,
    };
  }

  function toAsyncApiPageMapping(item, destDir, inheritedSpec, mode = 'channel-only') {
    const parsedAsyncApi = parseAsyncApiChannelRef(item, inheritedSpec);
    if (!parsedAsyncApi) return mode === 'channel-only' ? undefined : null;

    const channelInfo = parsedAsyncApi.spec
      ? getAsyncApiChannelInfo(parsedAsyncApi.spec, parsedAsyncApi.channel)
      : null;
    const resolvedChannel = channelInfo?.channel ?? parsedAsyncApi.channel;
    const slug = slugFromOpenApiOperation('channel', resolvedChannel);
    const dest = uniqueDestination(`${destDir}/${slug}`);
    return {
      src: item,
      dest,
      kind: 'asyncapi-channel',
      asyncapiSpec: parsedAsyncApi.spec,
      asyncapiChannel: resolvedChannel,
      title: channelInfo?.title ?? parsedAsyncApi.channel,
      description: channelInfo?.description,
    };
  }

  function resolveInheritedVersion(value, inherited) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    return inherited;
  }

  function toPageMappingWithVersion(item, destDir, inheritedSpec, inheritedVersion, mode = 'file-fallback') {
    const mapping = toPageMapping(item, destDir, inheritedSpec, mode);
    if (!mapping) return null;
    if (mapping.kind === 'openapi-operation' && mapping.version === undefined) {
      mapping.version = inheritedVersion;
    }
    return mapping;
  }

  function toAsyncApiPageMappingWithVersion(item, destDir, inheritedSpec, inheritedVersion, mode = 'channel-only') {
    const mapping = toAsyncApiPageMapping(item, destDir, inheritedSpec, mode);
    if (!mapping) return null;
    if (mapping.version === undefined) mapping.version = inheritedVersion;
    return mapping;
  }

  function toOperationMapping(ref, destDir, inheritedVersion) {
    const slug = slugFromOpenApiOperation(ref.method, ref.endpoint);
    const dest = uniqueDestination(`${destDir}/${slug}`);
    return {
      src: `${ref.spec ? `${ref.spec} ` : ''}${ref.method} ${ref.endpoint}`,
      dest,
      kind: 'openapi-operation',
      openapiSpec: ref.spec,
      openapiMethod: ref.method,
      openapiEndpoint: ref.endpoint,
      openapiKind: ref.kind,
      title: ref.title,
      description: ref.description,
      deprecated: ref.deprecated,
      version: ref.version ?? inheritedVersion,
      content: ref.content,
      hidden: ref.hidden === true,
    };
  }

  function buildOpenApiMappings(openapi, destDir, fallbackSpec, inheritedVersion) {
    const specs = resolveOpenApiSpecList(openapi);
    if (specs.length === 0 && fallbackSpec) specs.push(fallbackSpec);
    if (specs.length === 0) return [];

    const output = [];
    const seen = new Set();
    for (const spec of specs) {
      for (const operation of loadOpenApiOperations(spec)) {
        const key = `${operation.spec ?? ''}::${operation.kind ?? 'path'}::${operation.method}::${operation.endpoint}`;
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(toOperationMapping(operation, destDir, inheritedVersion));
      }
    }
    return output;
  }

  function buildAsyncApiMappings(asyncapi, destDir, fallbackSpec, inheritedVersion) {
    const specs = resolveAsyncApiSpecList(asyncapi);
    if (specs.length === 0 && fallbackSpec) specs.push(fallbackSpec);
    if (specs.length === 0) return [];

    const output = [];
    const seen = new Set();
    for (const spec of specs) {
      for (const channel of loadAsyncApiChannels(spec)) {
        const key = `${channel.spec ?? ''}::${channel.channel}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const slug = slugFromOpenApiOperation('channel', channel.channel);
        const dest = uniqueDestination(`${destDir}/${slug}`);
        output.push({
          src: `${channel.spec ? `${channel.spec} ` : ''}${channel.channel}`,
          dest,
          kind: 'asyncapi-channel',
          asyncapiSpec: channel.spec,
          asyncapiChannel: channel.channel,
          title: channel.title,
          description: channel.description,
          version: inheritedVersion,
        });
      }
    }
    return output;
  }

  function addGroup(group, parentDir, inheritedOpenApiSpec, inheritedVersion, inheritedAsyncApiSpec) {
    const groupDir = `${parentDir}/${group.slug}`;
    const pages = [];
    const groupOpenApiSpec = resolveDefaultOpenApiSpec(group.openapi) ?? inheritedOpenApiSpec;
    const groupAsyncApiSpec = resolveDefaultAsyncApiSpec(group.asyncapi) ?? inheritedAsyncApiSpec;
    const groupVersion = resolveInheritedVersion(group.version, inheritedVersion);
    const groupPageItems = Array.isArray(group.pages) ? group.pages : [];

    for (const item of groupPageItems) {
      if (typeof item === 'string') {
        const parsedOpenApiRef = parseOpenApiOperationRef(item, groupOpenApiSpec);
        if (parsedOpenApiRef) {
          const openApiMapping = toPageMappingWithVersion(item, groupDir, groupOpenApiSpec, groupVersion, 'operation-only');
          if (!openApiMapping) continue;
          pageMap.push(openApiMapping);
          const pageEntry = metaEntryForDestination(groupDir, openApiMapping.dest);
          pages.push(openApiMapping.hidden ? `!${pageEntry}` : pageEntry);
          trackFirstPage(openApiMapping.dest, openApiMapping.hidden);
          continue;
        }

        const asyncMapping = toAsyncApiPageMappingWithVersion(item, groupDir, groupAsyncApiSpec, groupVersion, 'channel-only');
        if (asyncMapping) {
          pageMap.push(asyncMapping);
          const pageEntry = metaEntryForDestination(groupDir, asyncMapping.dest);
          pages.push(asyncMapping.hidden ? `!${pageEntry}` : pageEntry);
          trackFirstPage(asyncMapping.dest, asyncMapping.hidden);
          continue;
        }

        const fileMapping = toFilePageMapping(item, groupDir);
        pageMap.push(fileMapping);
        const pageEntry = metaEntryForDestination(groupDir, fileMapping.dest);
        pages.push(pageEntry);
        trackFirstPage(fileMapping.dest, false);
      } else if (isGroup(item)) {
        addGroup(item, groupDir, groupOpenApiSpec, groupVersion, groupAsyncApiSpec);
        pages.push(item.hidden ? `!${item.slug}` : item.slug);
      } else if (isSeparator(item)) {
        pages.push(`---${item.separator}---`);
      } else if (isLink(item)) {
        pages.push(
          item.icon
            ? `[${item.icon}][${item.label}](${item.href})`
            : `[${item.label}](${item.href})`
        );
      }
    }

    if (groupPageItems.length === 0 && group.openapi !== undefined) {
      const generatedDestDir = resolveGenerationDestination(group.openapi, groupDir);
      const generatedMappings = buildOpenApiMappings(group.openapi, generatedDestDir, groupOpenApiSpec, groupVersion);
      for (const mapping of generatedMappings) {
        pageMap.push(mapping);
        const pageEntry = metaEntryForDestination(groupDir, mapping.dest);
        pages.push(mapping.hidden ? `!${pageEntry}` : pageEntry);
        trackFirstPage(mapping.dest, mapping.hidden);
      }
    }

    if (groupPageItems.length === 0 && group.asyncapi !== undefined) {
      const generatedDestDir = resolveGenerationDestination(group.asyncapi, groupDir);
      const generatedMappings = buildAsyncApiMappings(group.asyncapi, generatedDestDir, groupAsyncApiSpec, groupVersion);
      for (const mapping of generatedMappings) {
        pageMap.push(mapping);
        const pageEntry = metaEntryForDestination(groupDir, mapping.dest);
        pages.push(mapping.hidden ? `!${pageEntry}` : pageEntry);
        trackFirstPage(mapping.dest, mapping.hidden);
      }
    }

    const groupMeta = {
      title: group.group,
      pages,
      defaultOpen: group.expanded !== false,
    };

    if (group.icon) groupMeta.icon = group.icon;
    if (group.iconType) groupMeta.iconType = group.iconType;
    if (group.description) groupMeta.description = group.description;

    metaFiles.push({ dir: groupDir, data: groupMeta });
  }

  for (const tab of rootTabs) {
    const tabPages = [];
    const tabOpenApiSpec = resolveDefaultOpenApiSpec(tab.openapi) ?? defaultOpenApiSpec;
    const tabAsyncApiSpec = resolveDefaultAsyncApiSpec(tab.asyncapi) ?? defaultAsyncApiSpec;
    const tabVersion = resolveInheritedVersion(tab.version);
    const tabGroups = Array.isArray(tab.groups) ? tab.groups : [];
    const tabPageItems = Array.isArray(tab.pages) ? tab.pages : [];

    for (const group of tabGroups) {
      addGroup(group, tab.slug, tabOpenApiSpec, tabVersion, tabAsyncApiSpec);
      tabPages.push(group.hidden ? `!${group.slug}` : group.slug);
    }

    for (const item of tabPageItems) {
      if (typeof item === 'string') {
        const parsedOpenApiRef = parseOpenApiOperationRef(item, tabOpenApiSpec);
        if (parsedOpenApiRef) {
          const openApiMapping = toPageMappingWithVersion(item, tab.slug, tabOpenApiSpec, tabVersion, 'operation-only');
          if (!openApiMapping) continue;
          pageMap.push(openApiMapping);
          const pageEntry = metaEntryForDestination(tab.slug, openApiMapping.dest);
          tabPages.push(openApiMapping.hidden ? `!${pageEntry}` : pageEntry);
          trackFirstPage(openApiMapping.dest, openApiMapping.hidden);
          continue;
        }

        const asyncMapping = toAsyncApiPageMappingWithVersion(item, tab.slug, tabAsyncApiSpec, tabVersion, 'channel-only');
        if (asyncMapping) {
          pageMap.push(asyncMapping);
          const pageEntry = metaEntryForDestination(tab.slug, asyncMapping.dest);
          tabPages.push(asyncMapping.hidden ? `!${pageEntry}` : pageEntry);
          trackFirstPage(asyncMapping.dest, asyncMapping.hidden);
          continue;
        }

        const fileMapping = toFilePageMapping(item, tab.slug);
        pageMap.push(fileMapping);
        const pageEntry = metaEntryForDestination(tab.slug, fileMapping.dest);
        tabPages.push(pageEntry);
        trackFirstPage(fileMapping.dest, false);
      } else {
        tabPages.push(metaEntry(item));
      }
    }

    if (tabGroups.length === 0 && tabPageItems.length === 0 && tab.openapi !== undefined) {
      const generatedDestDir = resolveGenerationDestination(tab.openapi, tab.slug);
      const generatedMappings = buildOpenApiMappings(tab.openapi, generatedDestDir, tabOpenApiSpec, tabVersion);
      for (const mapping of generatedMappings) {
        pageMap.push(mapping);
        const pageEntry = metaEntryForDestination(tab.slug, mapping.dest);
        tabPages.push(mapping.hidden ? `!${pageEntry}` : pageEntry);
        trackFirstPage(mapping.dest, mapping.hidden);
      }
    }

    if (tabGroups.length === 0 && tabPageItems.length === 0 && tab.asyncapi !== undefined) {
      const generatedDestDir = resolveGenerationDestination(tab.asyncapi, tab.slug);
      const generatedMappings = buildAsyncApiMappings(tab.asyncapi, generatedDestDir, tabAsyncApiSpec, tabVersion);
      for (const mapping of generatedMappings) {
        pageMap.push(mapping);
        const pageEntry = metaEntryForDestination(tab.slug, mapping.dest);
        tabPages.push(mapping.hidden ? `!${pageEntry}` : pageEntry);
        trackFirstPage(mapping.dest, mapping.hidden);
      }
    }

    const tabMeta = {
      title: tab.tab,
      root: true,
      pages: tabPages,
    };

    if (tab.icon) tabMeta.icon = tab.icon;
    if (tab.iconType) tabMeta.iconType = tab.iconType;

    metaFiles.push({ dir: tab.slug, data: tabMeta });
  }

  if (rootPages.length > 0) {
    metaFiles.push({ dir: '', data: { pages: rootPages } });
  }

  if (!hasFirstPage && firstHiddenPageCandidate) {
    firstPage = firstHiddenPageCandidate;
    hasFirstPage = true;
  }

  return { pageMap, metaFiles, firstPage };
}

function processPage(srcPath, destPath, slug) {
  let content = readFileSync(srcPath, 'utf-8');
  if (!content.startsWith('---')) {
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : pageLabelFromSlug(slug);
    if (titleMatch) {
      content = content.replace(/^#\s+.+$/m, '').trimStart();
    }
    content = `---\ntitle: "${title}"\n---\n\n${content}`;
  }
  content = rewriteImportsInContent(content, srcPath, destPath);

  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, content, 'utf-8');
}

function writeMetaFiles(metaFiles) {
  for (const meta of metaFiles) {
    const metaPath = join(contentDir, meta.dir, 'meta.json');
    mkdirSync(dirname(metaPath), { recursive: true });
    writeFileSync(metaPath, JSON.stringify(meta.data, null, 2) + '\n', 'utf-8');
  }
}

function writeIndexPage(firstPage) {
  writeFileSync(
    join(contentDir, 'index.mdx'),
    `---\ntitle: "Overview"\ndescription: Documentation powered by Velu\n---\n\nimport { Card, Cards } from "fumadocs-ui/components/card"\nimport { Callout } from "fumadocs-ui/components/callout"\n\n<Callout type="info">\n  Welcome to your documentation site.\n</Callout>\n\n## Start here\n\n<Cards>\n  <Card\n    title="Read the docs"\n    href="/${firstPage}/"\n    description="Begin with the first page in your configured navigation."\n  />\n</Cards>\n`,
    'utf-8'
  );
}

function writeLangContent(langCode, artifacts, isDefault, useLangFolders = false) {
  const storagePrefix = useLangFolders ? langCode : (isDefault ? '' : langCode);
  const urlPrefix = isDefault ? '' : langCode;

  // Write meta files (prefixed for non-default)
  const metaFiles = storagePrefix
    ? artifacts.metaFiles.map((meta) => ({
        dir: meta.dir ? `${storagePrefix}/${meta.dir}` : storagePrefix,
        data: { ...meta.data },
      }))
    : artifacts.metaFiles;
  writeMetaFiles(metaFiles);

  function sanitizeFrontmatterValue(value) {
    return String(value).replace(/\r?\n+/g, ' ').replace(/"/g, '\\"').trim();
  }

  // Copy pages using explicit source paths from docs.json/velu.json
  for (const mapping of artifacts.pageMap) {
    const destPath = join(
      contentDir,
      storagePrefix ? `${storagePrefix}/${mapping.dest}.mdx` : `${mapping.dest}.mdx`,
    );

    if (mapping.kind === 'openapi-operation') {
      mkdirSync(dirname(destPath), { recursive: true });
      const operationLabel = `${mapping.openapiMethod || 'GET'} ${mapping.openapiEndpoint || '/'}`;
      const normalizedSpec = normalizeOpenApiSpecForFrontmatter(mapping.openapiSpec);
      const openapiValue = normalizedSpec
        ? `${normalizedSpec} ${operationLabel}`
        : operationLabel;
      const title = sanitizeFrontmatterValue(mapping.title ?? operationLabel);
      const description = typeof mapping.description === 'string'
        ? sanitizeFrontmatterValue(mapping.description)
        : '';
      const version = typeof mapping.version === 'string'
        ? sanitizeFrontmatterValue(mapping.version)
        : '';
      const openapi = openapiValue.replace(/"/g, '\\"');
      const warning = normalizedSpec
        ? ''
        : '\n> Warning: No OpenAPI spec source was resolved for this operation. Set `openapi` on this tab/group/navigation or at the top level.\n';
      const descriptionLine = description ? `\ndescription: "${description}"` : '';
      const deprecatedLine = mapping.deprecated === true ? `\ndeprecated: true` : '';
      const statusLine = mapping.deprecated === true ? `\nstatus: "deprecated"` : '';
      const versionLine = version ? `\nversion: "${version}"` : '';
      const content = typeof mapping.content === 'string' ? `${mapping.content.trim()}\n` : '';
      writeFileSync(
        destPath,
        `---\ntitle: "${title}"${descriptionLine}${deprecatedLine}${statusLine}${versionLine}\nopenapi: "${openapi}"\n---\n${warning}${content}`,
        'utf-8',
      );
      continue;
    }

    if (mapping.kind === 'asyncapi-channel') {
      mkdirSync(dirname(destPath), { recursive: true });
      const channelLabel = `${mapping.asyncapiChannel || 'channel'}`;
      const normalizedSpec = normalizeOpenApiSpecForFrontmatter(mapping.asyncapiSpec);
      const asyncapiValue = normalizedSpec
        ? `${normalizedSpec} ${channelLabel}`
        : channelLabel;
      const title = sanitizeFrontmatterValue(mapping.title ?? channelLabel);
      const description = typeof mapping.description === 'string'
        ? sanitizeFrontmatterValue(mapping.description)
        : '';
      const version = typeof mapping.version === 'string'
        ? sanitizeFrontmatterValue(mapping.version)
        : '';
      const asyncapi = asyncapiValue.replace(/"/g, '\\"');
      const warning = normalizedSpec
        ? ''
        : '\n> Warning: No AsyncAPI spec source was resolved for this channel. Set `asyncapi` on this tab/group/navigation or at the top level.\n';
      const descriptionLine = description ? `\ndescription: "${description}"` : '';
      const versionLine = version ? `\nversion: "${version}"` : '';
      writeFileSync(
        destPath,
        `---\ntitle: "${title}"${descriptionLine}${versionLine}\nasyncapi: "${asyncapi}"\n---\n${warning}`,
        'utf-8',
      );
      continue;
    }

    const src = mapping.src;
    let srcPath = join(docsDir, `${src}.mdx`);
    let ext = '.mdx';
    if (!existsSync(srcPath)) {
      srcPath = join(docsDir, `${src}.md`);
      ext = '.md';
    }
    if (!existsSync(srcPath)) {
      console.warn(`  \x1b[33mWarning\x1b[0m  Missing page source: ${src}${ext} (language: ${langCode})`);
      continue;
    }
    processPage(srcPath, destPath, src);
  }

  // Index page
  const href = urlPrefix ? `/${urlPrefix}/${artifacts.firstPage}/` : `/${artifacts.firstPage}/`;
  const indexPath = storagePrefix ? join(contentDir, storagePrefix, 'index.mdx') : join(contentDir, 'index.mdx');
  writeFileSync(
    indexPath,
    `---\ntitle: "Overview"\ndescription: Documentation powered by Velu\n---\n\nimport { Card, Cards } from "fumadocs-ui/components/card"\nimport { Callout } from "fumadocs-ui/components/callout"\n\n<Callout type="info">\n  Welcome to your documentation site.\n</Callout>\n\n## Start here\n\n<Cards>\n  <Card\n    title="Read the docs"\n    href="${href}"\n    description="Begin with the first page in your configured navigation."\n  />\n</Cards>\n`,
    'utf-8'
  );
}

function rebuildFromConfig() {
  const config = loadConfig();
  const navLanguages = config.navigation?.languages;
  const simpleLanguages = config.languages || [];

  rmSync(contentDir, { recursive: true, force: true });
  mkdirSync(contentDir, { recursive: true });
  writeRedirectArtifacts(config);
  rebuildSourceMirror();

  // â”€â”€ Mode 1: Per-language navigation (Mintlify-style) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (navLanguages && navLanguages.length > 0) {
    const rootPages = [];

    for (let i = 0; i < navLanguages.length; i++) {
      const langEntry = navLanguages[i];
      const langCode = langEntry.language;
      const isDefault = i === 0;

      // Build artifacts using this language's own tabs
      const langConfig = { ...config, navigation: { ...config.navigation, tabs: langEntry.tabs } };
      const artifacts = buildArtifacts(langConfig);

      writeLangContent(langCode, artifacts, isDefault, true);
      rootPages.push(`!${langCode}`);
    }

    // Write root meta with default tabs + hidden language folders
    writeFileSync(
      join(contentDir, 'meta.json'),
      JSON.stringify({ pages: rootPages }, null, 2) + '\n',
      'utf-8'
    );

    // Return the default language's page map for file watching
    const defaultConfig = { ...config, navigation: { ...config.navigation, tabs: navLanguages[0].tabs } };
    const generatedPageMap = buildArtifacts(defaultConfig).pageMap;
    generateOgImages(config);
    return generatedPageMap;
  }

  // â”€â”€ Mode 2: Simple multi-lang (same nav, content in docs/<lang>/) â”€
  const artifacts = buildArtifacts(config);

  const useLangFolders = simpleLanguages.length > 1;
  writeLangContent(simpleLanguages[0] || 'en', artifacts, true, useLangFolders);

  if (simpleLanguages.length > 1) {
    const rootMetaPath = join(contentDir, 'meta.json');
    const rootPages = [`!${simpleLanguages[0] || 'en'}`];

    for (const lang of simpleLanguages.slice(1)) {
      writeLangContent(lang, artifacts, false, true);
      rootPages.push(`!${lang}`);
    }

    writeFileSync(rootMetaPath, JSON.stringify({ pages: rootPages }, null, 2) + '\n', 'utf-8');
  }

  generateOgImages(config);
  return artifacts.pageMap;
}

let pageMap = rebuildFromConfig();
copyStaticAssets();

function syncMarkdownFile(filename) {
  syncSourceMirrorFile(filename);
  const srcSlug = filename.replace(/\\/g, '/').replace(/\.(md|mdx)$/, '');
  let srcPath = join(docsDir, `${srcSlug}.mdx`);
  if (!existsSync(srcPath)) {
    srcPath = join(docsDir, `${srcSlug}.md`);
  }

  if (!existsSync(srcPath)) {
    pageMap = rebuildFromConfig();
    return;
  }

  const matches = pageMap.filter((entry) => entry.src === srcSlug);
  if (matches.length === 0) return;

  for (const match of matches) {
    const destPath = join(contentDir, `${match.dest}.mdx`);
    processPage(srcPath, destPath, srcSlug);
  }

  generateOgImages(loadConfig());

  console.log('  \x1b[32mâ†»\x1b[0m  ' + srcSlug);
}

function syncConfig() {
  const srcPath = resolveConfigPath();
  copyFileSync(srcPath, resolve(PRIMARY_CONFIG_NAME));
  copyFileSync(srcPath, resolve(LEGACY_CONFIG_NAME));
  pageMap = rebuildFromConfig();
  copyStaticAssets();
  console.log('  \x1b[32mâ†»\x1b[0m  docs.json/velu.json updated (navigation/content synced)');
}

function startWatcher() {
  const debounce = new Map();

  watch(docsDir, { recursive: true }, (_, rawFilename) => {
    if (!rawFilename) return;
    const filename = rawFilename.replace(/\\/g, '/');

    if (filename.startsWith('.velu-out/')) return;
    if (filename.includes('node_modules')) return;
    if (filename.startsWith('.')) return;

    if (debounce.has(filename)) clearTimeout(debounce.get(filename));
    debounce.set(
      filename,
      setTimeout(() => {
        debounce.delete(filename);

        try {
          if (filename === PRIMARY_CONFIG_NAME || filename === LEGACY_CONFIG_NAME) {
            syncConfig();
            return;
          }

          syncSourceMirrorFile(filename);

          const ext = extname(filename);
          if (ext === '.md' || ext === '.mdx') {
            syncMarkdownFile(filename);
            return;
          }

          if (isStaticAsset(filename)) {
            const src = join(docsDir, filename);
            const dest = join(publicDir, filename);
            if (existsSync(src)) {
              mkdirSync(dirname(dest), { recursive: true });
              copyFileSync(src, dest);
              generateOgImages(loadConfig());
              console.log('  \x1b[32m↻\x1b[0m  ' + filename);
            } else {
              rmSync(dest, { force: true });
              generateOgImages(loadConfig());
              console.log('  \x1b[32m↻\x1b[0m  removed ' + filename);
            }
          }
        } catch (error) {
          console.error('  \x1b[31mâœ—\x1b[0m  Failed to sync ' + filename + ': ' + error.message);
        }
      }, 120)
    );
  });
}

function runNext(command, port, envOverrides = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const args = [nextBinPath, command];
    if (command === 'dev' || command === 'start') {
      args.push('--port', String(port));
    }

    const child = spawn(process.execPath, args, {
      cwd: '.',
      stdio: 'inherit',
      env: { ...process.env, ...envOverrides },
    });

    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} exited with ${code}`));
    });
  });
}

// â”€â”€ CLI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const args = process.argv.slice(2);
const command = args[0] || 'dev';
const portIdx = args.indexOf('--port');
const port = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : 4321;

if (command === 'dev') {
  console.log('');
  console.log('  \x1b[36mvelu\x1b[0m  dev server');
  console.log('');
  console.log('  watching for file changes...');
  startWatcher();
  await runNext('dev', port);
} else if (command === 'build') {
  console.log('\n  Building site...\n');
  // Static export cannot include API route handlers.
  // Keep proxy routes for dev, but remove them for production export build.
  rmSync(resolve('app', 'api'), { recursive: true, force: true });
  await runNext('build', port, { VELU_STATIC_EXPORT: '1' });

  // Run Pagefind to index the static output for search
  console.log('  Indexing for search...');
  const pagefindBin = join(dirname(require.resolve('next/package.json')), '..', 'pagefind', 'lib', 'runner', 'bin.cjs');
  await new Promise((res, rej) => {
    const pf = spawn(process.execPath, [pagefindBin, '--site', 'dist', '--output-path', 'dist/pagefind'], {
      cwd: '.',
      stdio: 'inherit',
    });
    pf.on('exit', (code) => (code === 0 ? res() : rej(new Error(`pagefind exited with ${code}`))));
  });

  console.log('\n  âœ… Site built successfully.\n');
} else {
  console.error(`Unknown server command: ${command}`);
  process.exit(1);
}

