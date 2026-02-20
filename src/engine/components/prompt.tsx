"use client";

import { isValidElement, useMemo, useState, type ReactNode } from 'react';
import { VeluIcon } from '@/components/icon';

function flattenText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((item) => flattenText(item)).join('');
  if (isValidElement(node)) return flattenText((node.props as { children?: ReactNode })?.children);
  return '';
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={`b-${index}`}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith('*') && token.endsWith('*')) {
      return <em key={`i-${index}`}>{token.slice(1, -1)}</em>;
    }
    return <span key={`t-${index}`}>{token}</span>;
  });
}

export function VeluPrompt({
  description,
  children,
  icon,
  iconType,
  actions,
  className,
}: {
  description?: string;
  children?: ReactNode;
  icon?: string;
  iconType?: string;
  actions?: string[];
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const promptText = useMemo(() => flattenText(children).trim(), [children]);
  const label = (description && description.trim()) || 'Prompt';
  const actionSet = new Set((Array.isArray(actions) && actions.length > 0 ? actions : ['copy']).map((item) => String(item).toLowerCase()));
  const showCopy = actionSet.has('copy');
  const showCursor = actionSet.has('cursor');

  const onCopy = async () => {
    if (!promptText) return;
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // no-op
    }
  };

  const onCursor = () => {
    if (!promptText) return;
    const url = `https://cursor.com/link/prompt?text=${encodeURIComponent(promptText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={['velu-prompt', className].filter(Boolean).join(' ')}>
      <div className="velu-prompt-row">
        <div className="velu-prompt-left">
          {icon ? <VeluIcon name={icon} iconType={iconType} className="velu-prompt-icon" /> : null}
          <div className="velu-prompt-desc">{renderInlineMarkdown(label)}</div>
        </div>
        <div className="velu-prompt-actions">
          {showCopy ? (
            <button type="button" className="velu-prompt-copy" onClick={onCopy}>
              {copied ? 'Copied' : 'Copy prompt'}
            </button>
          ) : null}
          {showCursor ? (
            <button type="button" className="velu-prompt-open" onClick={onCursor}>
              <img src="/icons/cursor-dark.svg" alt="" aria-hidden="true" className="velu-prompt-open-icon velu-prompt-open-icon-on-light" />
              <img src="/icons/cursor-light.svg" alt="" aria-hidden="true" className="velu-prompt-open-icon velu-prompt-open-icon-on-dark" />
              Open in Cursor
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
