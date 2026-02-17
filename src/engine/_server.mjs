import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { watch } from 'node:fs';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { normalizeConfigNavigation } from './lib/navigation-normalize.mjs';

const require = createRequire(import.meta.url);
const nextBinPath = require.resolve('next/dist/bin/next');

// ── Docs directory (passed via env var from CLI) ────────────────────────────
const docsDir = process.env.VELU_DOCS_DIR || resolve('..');
const contentDir = resolve('content', 'docs');
const publicDir = resolve('public');
const PRIMARY_CONFIG_NAME = 'docs.json';
const LEGACY_CONFIG_NAME = 'velu.json';
const STATIC_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.avif',
  '.mp4', '.webm', '.ogg', '.mp3', '.wav', '.pdf', '.txt',
]);

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

function loadConfig() {
  const raw = readFileSync(resolveConfigPath(), 'utf-8');
  return normalizeConfigNavigation(JSON.parse(raw));
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
  let firstPage = 'quickstart';
  let hasFirstPage = false;

  function trackFirstPage(dest) {
    if (!hasFirstPage) {
      firstPage = dest;
      hasFirstPage = true;
    }
  }

  function addGroup(group, parentDir) {
    const groupDir = `${parentDir}/${group.slug}`;
    const pages = [];

    for (const item of group.pages || []) {
      if (typeof item === 'string') {
        const basename = pageBasename(item);
        const dest = `${groupDir}/${basename}`;
        pageMap.push({ src: item, dest });
        pages.push(basename);
        trackFirstPage(dest);
      } else if (isGroup(item)) {
        addGroup(item, groupDir);
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

    for (const group of tab.groups || []) {
      addGroup(group, tab.slug);
      tabPages.push(group.hidden ? `!${group.slug}` : group.slug);
    }

    for (const item of tab.pages || []) {
      if (typeof item === 'string') {
        const basename = pageBasename(item);
        const dest = `${tab.slug}/${basename}`;
        pageMap.push({ src: item, dest });
        tabPages.push(basename);
        trackFirstPage(dest);
      } else {
        tabPages.push(metaEntry(item));
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

  // Copy pages using explicit source paths from docs.json/velu.json
  for (const { src, dest } of artifacts.pageMap) {
    let srcPath = join(docsDir, `${src}.mdx`);
    let ext = '.mdx';
    if (!existsSync(srcPath)) {
      srcPath = join(docsDir, `${src}.md`);
      ext = '.md';
    }
    if (!existsSync(srcPath)) {
      console.warn(`  \x1b[33m⚠\x1b[0m  Missing page source: ${src}${ext} (language: ${langCode})`);
      continue;
    }
    const destPath = join(contentDir, storagePrefix ? `${storagePrefix}/${dest}.mdx` : `${dest}.mdx`);
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

  // ── Mode 1: Per-language navigation (Mintlify-style) ──────────────
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
    return buildArtifacts(defaultConfig).pageMap;
  }

  // ── Mode 2: Simple multi-lang (same nav, content in docs/<lang>/) ─
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

  return artifacts.pageMap;
}

let pageMap = rebuildFromConfig();
copyStaticAssets();

function syncMarkdownFile(filename) {
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

  console.log('  \x1b[32m↻\x1b[0m  ' + srcSlug);
}

function syncConfig() {
  const srcPath = resolveConfigPath();
  copyFileSync(srcPath, resolve(PRIMARY_CONFIG_NAME));
  copyFileSync(srcPath, resolve(LEGACY_CONFIG_NAME));
  pageMap = rebuildFromConfig();
  copyStaticAssets();
  console.log('  \x1b[32m↻\x1b[0m  docs.json/velu.json updated (navigation/content synced)');
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
              console.log('  \x1b[32m↻\x1b[0m  ' + filename);
            }
          }
        } catch (error) {
          console.error('  \x1b[31m✗\x1b[0m  Failed to sync ' + filename + ': ' + error.message);
        }
      }, 120)
    );
  });
}

function runNext(command, port) {
  return new Promise((resolvePromise, rejectPromise) => {
    const args = [nextBinPath, command];
    if (command === 'dev' || command === 'start') {
      args.push('--port', String(port));
    }

    const child = spawn(process.execPath, args, {
      cwd: '.',
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} exited with ${code}`));
    });
  });
}

// ── CLI ──────────────────────────────────────────────────────────────────────
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
  await runNext('build', port);

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

  console.log('\n  ✅ Site built successfully.\n');
} else {
  console.error(`Unknown server command: ${command}`);
  process.exit(1);
}
