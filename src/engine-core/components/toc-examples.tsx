"use client";

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export function TocExamples() {
  const pathname = usePathname();

  useEffect(() => {
    const page = document.getElementById('nd-page');
    const toc = document.getElementById('nd-toc');
    const layout = document.getElementById('nd-docs-layout');
    if (!page || !toc) return;

    let wrapper: HTMLDivElement | null = null;
    let placeholders: Array<{ node: HTMLElement; marker: Comment }> = [];
    const media = window.matchMedia('(min-width: 1024px)');

    const isTocVisible = () => {
      if (!media.matches) return false;
      const styles = window.getComputedStyle(toc);
      return styles.display !== 'none' && styles.visibility !== 'hidden';
    };

    const mountIntoToc = () => {
      if (wrapper) return;
      const examples = Array.from(
        page.querySelectorAll<HTMLElement>('.velu-request-example, .velu-response-example, .velu-panel'),
      );
      if (examples.length === 0) return;

      wrapper = document.createElement('div');
      wrapper.className = 'velu-toc-examples';
      placeholders = [];

      for (const node of examples) {
        const marker = document.createComment('velu-example-placeholder');
        node.parentNode?.insertBefore(marker, node);
        placeholders.push({ node, marker });
        node.classList.add('velu-in-toc-example');
        wrapper.appendChild(node);
      }

      toc.classList.add('velu-toc-replaced');
      page.classList.add('velu-page-with-toc-examples');
      if (layout) layout.style.setProperty('--fd-toc-width', '420px');
      toc.appendChild(wrapper);
    };

    const restoreToPage = () => {
      if (wrapper) {
        for (const { node, marker } of placeholders) {
          if (marker.parentNode) {
            marker.parentNode.insertBefore(node, marker);
            marker.parentNode.removeChild(marker);
          }
          node.classList.remove('velu-in-toc-example');
        }
        wrapper.remove();
        wrapper = null;
        placeholders = [];
      }

      // Defensive cleanup in case of interrupted transitions.
      toc.querySelectorAll('.velu-toc-examples').forEach((node) => node.remove());
      document.querySelectorAll('.velu-in-toc-example').forEach((node) => {
        node.classList.remove('velu-in-toc-example');
      });

      toc.classList.remove('velu-toc-replaced');
      page.classList.remove('velu-page-with-toc-examples');
      if (layout) layout.style.removeProperty('--fd-toc-width');
    };

    const syncPlacement = () => {
      if (isTocVisible()) {
        mountIntoToc();
      } else {
        restoreToPage();
      }
    };

    syncPlacement();
    if (media.addEventListener) {
      media.addEventListener('change', syncPlacement);
    } else {
      // Fallback for older MediaQueryList implementations.
      (media as any).addListener(syncPlacement);
    }
    window.addEventListener('resize', syncPlacement);
    window.addEventListener('orientationchange', syncPlacement);
    document.addEventListener('visibilitychange', syncPlacement);
    const intervalId = window.setInterval(syncPlacement, 600);

    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', syncPlacement);
      } else {
        (media as any).removeListener(syncPlacement);
      }
      window.removeEventListener('resize', syncPlacement);
      window.removeEventListener('orientationchange', syncPlacement);
      document.removeEventListener('visibilitychange', syncPlacement);
      window.clearInterval(intervalId);
      restoreToPage();
    };
  }, [pathname]);

  return null;
}
