'use client';

import { useState, useRef, useEffect } from 'react';
import type { VeluContextualOption } from '@core/types';

interface CopyPageButtonProps {
  options: VeluContextualOption[];
  mcpUrl: string;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  copy: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
  ),
  view: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
  ),
  chatgpt: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>
  ),
  claude: (
    <svg width="18" height="18" viewBox="0 0 200 200" style={{ overflow: 'visible' }} fill="currentColor"><path d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"/></svg>
  ),
  perplexity: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M22.3977 7.0896h-2.3106V.0676l-7.5094 6.3542V.1577h-1.1554v6.1966L4.4904 0v7.0896H1.6023v10.3976h2.8882V24l6.932-6.3591v6.2005h1.1554v-6.0469l6.9318 6.1807v-6.4879h2.8882V7.0896zm-3.4657-4.531v4.531h-5.355l5.355-4.531zm-13.2862.0676 4.8691 4.4634H5.6458V2.6262zM2.7576 16.332V8.245h7.8476l-6.1149 6.1147v1.9723H2.7576zm2.8882 5.0404v-3.8852h.0001v-2.6488l5.7763-5.7764v7.0111l-5.7764 5.2993zm12.7086.0248-5.7766-5.1509V9.0618l5.7766 5.7766v6.5588zm2.8882-5.0652h-1.733v-1.9723L13.3948 8.245h7.8478v8.087z"/></svg>
  ),
  grok: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3l8.5 12.5L3 21h1.9l7.1-4.6L18.1 21H21l-8.5-12.5L21 3h-1.9l-7.1 4.6L5.9 3H3z"/></svg>
  ),
  mcp: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
  ),
  'add-mcp': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
  ),
  cursor: (
    <svg width="18" height="18" viewBox="0 0 466.73 532.09" fill="currentColor"><path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z"/></svg>
  ),
  vscode: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.583 2.286L9.23 9.98 4.553 6.196 2 7.403v9.193l2.553 1.208 4.677-3.784L17.583 21.714 22 19.6V4.4l-4.417-2.114zM4.553 13.7V10.3L6.8 12l-2.247 1.7zM17.583 17.4l-6.06-5.4 6.06-5.4v10.8z"/></svg>
  ),
};

function getDefaultIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
  );
}

const EXTERNAL_IDS = new Set(['chatgpt', 'claude', 'perplexity', 'grok', 'cursor', 'vscode']);

function buildPromptUrl(baseUrl: string, paramName: string, pageUrl: string): string {
  return `${baseUrl}${paramName}=Read+from+${encodeURIComponent(pageUrl)}+so+I+can+ask+questions+about+it.`;
}

export function CopyPageButton({ options, mcpUrl }: CopyPageButtonProps) {
  const [label, setLabel] = useState('Copy page');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  if (options.length === 0) return null;

  function getPageText(): string {
    const titleEl = document.querySelector('h1');
    const article = document.querySelector('[data-pagefind-body]') || document.querySelector('main');
    let text = '';
    if (titleEl) text = '# ' + titleEl.textContent + '\n\n';
    if (article) text += (article as HTMLElement).innerText;
    return text;
  }

  function doCopy() {
    setLabel('Copying...');
    const text = getPageText();
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        setLabel('Copied!');
        setTimeout(() => setLabel('Copy page'), 1500);
      });
    }
    setDropdownOpen(false);
  }

  function flashLabel(msg: string) {
    setLabel(msg);
    setTimeout(() => setLabel('Copy page'), 1500);
    setDropdownOpen(false);
  }

  function handleBuiltinAction(id: string) {
    const currentUrl = window.location.href;
    const currentPath = window.location.pathname;

    switch (id) {
      case 'copy':
        doCopy();
        return;
      case 'view': {
        const text = getPageText();
        if (text) {
          const blob = new Blob([text], { type: 'text/plain' });
          window.open(URL.createObjectURL(blob), '_blank');
        }
        setDropdownOpen(false);
        return;
      }
      case 'chatgpt':
        window.open(buildPromptUrl('https://chatgpt.com/?', 'prompt', currentUrl), '_blank');
        setDropdownOpen(false);
        return;
      case 'claude':
        window.open(buildPromptUrl('https://claude.ai/new?', 'q', currentUrl), '_blank');
        setDropdownOpen(false);
        return;
      case 'perplexity':
        window.open(buildPromptUrl('https://www.perplexity.ai/?', 'q', currentUrl), '_blank');
        setDropdownOpen(false);
        return;
      case 'grok':
        window.open(buildPromptUrl('https://grok.com/?', 'q', currentUrl), '_blank');
        setDropdownOpen(false);
        return;
      case 'mcp':
        navigator.clipboard.writeText(mcpUrl).then(() => flashLabel('Copied MCP URL!'));
        return;
      case 'add-mcp':
        navigator.clipboard.writeText(`npx @anthropic-ai/claude-code --mcp-server-uri=${mcpUrl}`).then(() => flashLabel('Copied!'));
        return;
      case 'cursor':
        window.open(`cursor://anysphere.cursor.mcp/install?url=${encodeURIComponent(mcpUrl)}`, '_self');
        setDropdownOpen(false);
        return;
      case 'vscode':
        window.open(`vscode://anthropic.claude-code/mcp/install?url=${encodeURIComponent(mcpUrl)}`, '_self');
        setDropdownOpen(false);
        return;
    }
  }

  function resolveCustomHref(href: string): string {
    const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
    return href.replace(/\$page/g, encodeURIComponent(currentUrl)).replace(/\$path/g, encodeURIComponent(currentPath));
  }

  function renderOption(opt: typeof options[number]) {
    const icon = ICON_MAP[opt.id] ?? getDefaultIcon();
    const isExternal = EXTERNAL_IDS.has(opt.id) || opt.type === 'custom';
    const arrow = isExternal ? <span className="velu-external-arrow">↗</span> : null;

    if (opt.type === 'custom' && opt.href) {
      return (
        <a
          key={opt.id}
          className="velu-copy-option"
          href={resolveCustomHref(opt.href)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setDropdownOpen(false)}
        >
          <span className="velu-copy-option-icon">{icon}</span>
          <div>
            <div className="velu-copy-option-title">{opt.title} {arrow}</div>
            {opt.description ? <div className="velu-copy-option-desc">{opt.description}</div> : null}
          </div>
        </a>
      );
    }

    return (
      <button
        key={opt.id}
        className="velu-copy-option"
        onClick={() => handleBuiltinAction(opt.id)}
      >
        <span className="velu-copy-option-icon">{icon}</span>
        <div>
          <div className="velu-copy-option-title">{opt.title} {arrow}</div>
          {opt.description ? <div className="velu-copy-option-desc">{opt.description}</div> : null}
        </div>
      </button>
    );
  }

  return (
    <div className="velu-copy-page-container" ref={containerRef}>
      <div className="velu-copy-split-btn">
        <button
          className="velu-copy-main-btn"
          onClick={(e) => { e.stopPropagation(); doCopy(); }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span className="velu-copy-label">{label}</span>
        </button>
        <span className="velu-copy-sep" />
        <button
          className="velu-copy-caret-btn"
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
          onClick={(e) => { e.stopPropagation(); setDropdownOpen(!dropdownOpen); }}
        >
          <svg className="velu-copy-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>

      {dropdownOpen && (
        <div className="velu-copy-dropdown" onClick={(e) => e.stopPropagation()}>
          {options.map(renderOption)}
        </div>
      )}
    </div>
  );
}
