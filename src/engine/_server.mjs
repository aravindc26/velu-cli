import { dev, build, preview } from 'astro';
import { watch } from 'node:fs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname, relative, extname, join } from 'node:path';

// ── Docs directory (parent of .velu-out) ────────────────────────────────────
const docsDir = resolve('..');
const contentDir = resolve('src', 'content', 'docs');

// ── Page processing (mirrors build.ts logic) ────────────────────────────────
function pageLabelFromSlug(slug) {
  const last = slug.split('/').pop() || slug;
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function processPage(srcPath, destPath, slug) {
  let content = readFileSync(srcPath, 'utf-8');
  if (!content.startsWith('---')) {
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : pageLabelFromSlug(slug);
    if (titleMatch) {
      content = content.replace(/^#\s+.+$/m, '').trimStart();
    }
    content = '---\ntitle: "' + title + '"\n---\n\n' + content;
  }
  mkdirSync(dirname(destPath), { recursive: true });
  writeFileSync(destPath, content, 'utf-8');
}

function startWatcher() {
  const debounce = new Map();

  watch(docsDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    // Ignore changes inside .velu-out itself
    if (filename.startsWith('.velu-out')) return;
    // Ignore node_modules, hidden dirs
    if (filename.includes('node_modules') || filename.startsWith('.')) return;

    // Debounce — avoid duplicate events
    if (debounce.has(filename)) clearTimeout(debounce.get(filename));
    debounce.set(filename, setTimeout(() => {
      debounce.delete(filename);
      const srcPath = join(docsDir, filename);
      if (!existsSync(srcPath)) return;

      if (filename === 'velu.json') {
        copyFileSync(srcPath, resolve('velu.json'));
        console.log('  \x1b[32m↻\x1b[0m  velu.json updated');
        return;
      }

      if (extname(filename) === '.md') {
        const slug = filename.replace(/\\/g, '/').replace(/\.md$/, '');
        const destPath = join(contentDir, slug + '.md');
        try {
          processPage(srcPath, destPath, slug);
          console.log('  \x1b[32m↻\x1b[0m  ' + slug);
        } catch (e) {
          console.error('  \x1b[31m✗\x1b[0m  Failed to sync ' + filename + ': ' + e.message);
        }
      }
    }, 100));
  });
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const command = args[0] || 'dev';
const portIdx = args.indexOf('--port');
const port = portIdx !== -1 ? parseInt(args[portIdx + 1]) : 4321;

if (command === 'dev') {
  const server = await dev({
    root: '.',
    configFile: './_config.mjs',
    server: { port },
    logLevel: 'silent',
  });
  const addr = server.address;
  console.log('');
  console.log('  \x1b[36mvelu\x1b[0m  v0.1.0  ready');
  console.log('');
  console.log('  ┃ Local    \x1b[36mhttp://localhost:' + addr.port + '/\x1b[0m');
  console.log('  ┃ Network  use --host to expose');
  console.log('');
  console.log('  watching for file changes...');
  startWatcher();
} else if (command === 'build') {
  console.log('\n  Building site...\n');
  await build({ root: '.', configFile: './_config.mjs', logLevel: 'warn' });
  console.log('\n  ✅ Site built successfully.\n');
} else if (command === 'preview') {
  const server = await preview({
    root: '.',
    configFile: './_config.mjs',
    server: { port },
    logLevel: 'silent',
  });
  const addr = server.address;
  console.log('');
  console.log('  \x1b[36mvelu\x1b[0m  preview');
  console.log('');
  console.log('  ┃ Local    \x1b[36mhttp://localhost:' + addr.port + '/\x1b[0m');
  console.log('');
}
