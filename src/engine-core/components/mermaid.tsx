"use client";

import mermaid from 'mermaid';
import { useEffect, useMemo, useRef, useState } from 'react';

type MermaidPlacement = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

let mermaidInitialized = false;

function ensureMermaid() {
  if (mermaidInitialized) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    suppressErrorRendering: true,
  });
  mermaidInitialized = true;
}

function buildSvgThemeCss() {
  return [
    ':root{--m-fg:#0f172a;--m-bg:#ffffff;--m-border:#cbd5e1;--m-edge-bg:#e2e8f0;}',
    ':root[data-theme="dark"],.dark{--m-fg:#e5e7eb;--m-bg:#0b1220;--m-border:#334155;--m-edge-bg:#1f2937;}',
    '.velu-mermaid-svg svg{font-family:inherit!important;}',
    '.velu-mermaid-svg .label,.velu-mermaid-svg .label text,.velu-mermaid-svg .nodeLabel,.velu-mermaid-svg .nodeLabel p,.velu-mermaid-svg .edgeLabel,.velu-mermaid-svg .edgeLabel text,.velu-mermaid-svg .cluster-label text,.velu-mermaid-svg text{color:var(--m-fg)!important;fill:var(--m-fg)!important;}',
    '.velu-mermaid-svg .node rect,.velu-mermaid-svg .node circle,.velu-mermaid-svg .node ellipse,.velu-mermaid-svg .node polygon,.velu-mermaid-svg .node path{stroke:var(--m-border)!important;fill:color-mix(in oklab,var(--m-bg) 92%,var(--m-fg) 8%)!important;}',
    '.velu-mermaid-svg .edgePath .path,.velu-mermaid-svg .flowchart-link{stroke:var(--m-fg)!important;stroke-opacity:.95!important;}',
    '.velu-mermaid-svg .edgeLabel rect,.velu-mermaid-svg .labelBkg{fill:var(--m-edge-bg)!important;stroke:var(--m-border)!important;opacity:1!important;}',
    '.velu-mermaid-svg g.edgeLabel,.velu-mermaid-svg .edgeLabel{opacity:1!important;}',
    '.velu-mermaid-svg .edgeLabel text{fill:var(--m-fg)!important;}',
    '.velu-mermaid-svg .edgeLabel .label,.velu-mermaid-svg .edgeLabel .label *{color:var(--m-fg)!important;background:transparent!important;padding:0!important;border:0!important;box-shadow:none!important;}',
    '.velu-mermaid-svg .edgeLabel foreignObject,.velu-mermaid-svg .edgeLabel foreignObject *{overflow:visible!important;}',
    '.velu-mermaid-svg .cluster rect{fill:color-mix(in oklab,var(--m-bg) 88%,var(--m-fg) 12%)!important;stroke:var(--m-border)!important;}',
    '.velu-mermaid-svg .marker,.velu-mermaid-svg marker path{fill:var(--m-fg)!important;stroke:var(--m-fg)!important;}',
  ].join('');
}

export function VeluMermaid({
  chart,
  children,
  className,
  actions,
  placement = 'bottom-right',
}: {
  chart?: string;
  children?: unknown;
  className?: string;
  actions?: boolean;
  placement?: MermaidPlacement;
}) {
  const source = useMemo(() => {
    if (typeof chart === 'string' && chart.trim()) return chart;
    if (typeof children === 'string' && children.trim()) return children;
    return '';
  }, [chart, children]);

  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [scale, setScale] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [autoActions, setAutoActions] = useState<boolean>(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const uid = useMemo(() => `velu-mermaid-${Math.random().toString(36).slice(2, 10)}`, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!source) {
        setSvg('');
        setError('');
        return;
      }

      try {
        ensureMermaid();
        const { svg: rendered } = await mermaid.render(uid, source);
        if (cancelled) return;
        setSvg(rendered);
        setError('');
      } catch {
        if (cancelled) return;
        setSvg('');
        setError('Failed to render Mermaid diagram.');
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [source, uid]);

  useEffect(() => {
    if (!hostRef.current || !svg) {
      setAutoActions(false);
      return;
    }
    const svgEl = hostRef.current.querySelector('svg');
    const h = svgEl?.getBoundingClientRect().height ?? 0;
    setAutoActions(h > 220);
  }, [svg]);

  const showActions = Boolean(actions ?? autoActions);

  const controlsClass = `velu-mermaid-controls velu-mermaid-controls-${placement}`;
  const transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`;

  return (
    <div className={['velu-mermaid', className].filter(Boolean).join(' ')}>
      <div
        className="velu-mermaid-stage"
        ref={hostRef}
        style={{ transform }}
      >
        {error ? (
          <pre className="velu-mermaid-error"><code>{source}</code></pre>
        ) : (
          <div
            className="velu-mermaid-svg"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: buildSvgThemeCss() }} />

      {showActions ? (
        <div className={controlsClass}>
          <button className="velu-mermaid-btn-up" type="button" onClick={() => setOffset((p) => ({ ...p, y: p.y - 18 }))} aria-label="Pan up">↑</button>
          <button className="velu-mermaid-btn-zoom-in" type="button" onClick={() => setScale((v) => Math.min(2.4, +(v + 0.1).toFixed(2)))} aria-label="Zoom in">+</button>
          <button className="velu-mermaid-btn-left" type="button" onClick={() => setOffset((p) => ({ ...p, x: p.x - 18 }))} aria-label="Pan left">←</button>
          <button className="velu-mermaid-btn-reset" type="button" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} aria-label="Reset">↻</button>
          <button className="velu-mermaid-btn-right" type="button" onClick={() => setOffset((p) => ({ ...p, x: p.x + 18 }))} aria-label="Pan right">→</button>
          <button className="velu-mermaid-btn-down" type="button" onClick={() => setOffset((p) => ({ ...p, y: p.y + 18 }))} aria-label="Pan down">↓</button>
          <button className="velu-mermaid-btn-zoom-out" type="button" onClick={() => setScale((v) => Math.max(0.6, +(v - 0.1).toFixed(2)))} aria-label="Zoom out">−</button>
        </div>
      ) : null}
    </div>
  );
}
