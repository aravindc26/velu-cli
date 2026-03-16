'use client';

import { useEffect } from 'react';

const TOC_HOST_ID = 'velu-api-toc-rail-host';
const SOURCE_SELECTOR = '[data-velu-openapi-example-source="true"]';

export function OpenApiTocSync({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    let disconnected = false;
    let cleanup: (() => void) | undefined;
    const observer = new MutationObserver(() => {
      if (cleanup || disconnected) return;

      const host = document.getElementById(TOC_HOST_ID);
      const source = document.querySelector<HTMLElement>(SOURCE_SELECTOR);
      if (!host || !source) return;

      const previousParent = source.parentNode;
      const previousNextSibling = source.nextSibling;
      host.appendChild(source);
      cleanup = () => {
        if (previousParent) {
          if (previousNextSibling) previousParent.insertBefore(source, previousNextSibling);
          else previousParent.appendChild(source);
        }
      };
      observer.disconnect();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    // Try immediately in case both nodes already exist.
    observer.takeRecords();
    const host = document.getElementById(TOC_HOST_ID);
    const source = document.querySelector<HTMLElement>(SOURCE_SELECTOR);
    if (host && source) {
      const previousParent = source.parentNode;
      const previousNextSibling = source.nextSibling;
      host.appendChild(source);
      cleanup = () => {
        if (previousParent) {
          if (previousNextSibling) previousParent.insertBefore(source, previousNextSibling);
          else previousParent.appendChild(source);
        }
      };
      observer.disconnect();
    }

    return () => {
      disconnected = true;
      observer.disconnect();
      cleanup?.();
    };
  }, [enabled]);

  return null;
}
