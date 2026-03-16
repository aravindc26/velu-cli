"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

type LightboxImage = {
  src: string;
  alt: string;
};

function hasNoZoom(img: HTMLImageElement): boolean {
  return img.hasAttribute("noZoom")
    || img.hasAttribute("nozoom")
    || img.getAttribute("data-no-zoom") === "true";
}

function shouldSkipImage(img: HTMLImageElement): boolean {
  if (!img.src) return true;
  if (img.classList.contains("velu-image-zoomable")) return true; // handled by VeluImage
  if (hasNoZoom(img)) return true;
  if (img.closest("pre, code, .shiki")) return true;
  if (img.closest(".velu-image-lightbox")) return true;
  if (img.classList.contains("velu-view-option-icon-img") || img.classList.contains("velu-lang-icon-img")) return true;

  const rect = img.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0 && (rect.width < 96 || rect.height < 56)) return true;
  return false;
}

function applyZoomableMarkers(root: ParentNode) {
  const images = root.querySelectorAll<HTMLImageElement>("#nd-page img");
  for (const img of images) {
    if (shouldSkipImage(img)) {
      img.classList.remove("velu-image-zoomable-fallback");
      if (img.getAttribute("data-velu-zoom-fallback") === "1") {
        img.removeAttribute("data-velu-zoom-fallback");
        if (img.getAttribute("role") === "button") img.removeAttribute("role");
      }
      continue;
    }

    img.classList.add("velu-image-zoomable-fallback");
    if (!img.hasAttribute("tabindex")) img.tabIndex = 0;
    if (!img.hasAttribute("role")) img.setAttribute("role", "button");
    img.setAttribute("data-velu-zoom-fallback", "1");
  }
}

export function VeluImageZoomFallback() {
  const [mounted, setMounted] = useState(false);
  const [activeImage, setActiveImage] = useState<LightboxImage | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const pageRoot = document.getElementById("nd-page");
    if (!pageRoot) return;

    const tryOpen = (img: HTMLImageElement) => {
      if (shouldSkipImage(img)) return;
      setActiveImage({
        src: img.currentSrc || img.src,
        alt: img.alt ?? "",
      });
    };

    applyZoomableMarkers(document);

    const observerOptions: MutationObserverInit = { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "src", "noZoom", "nozoom"] };
    const observer = new MutationObserver(() => {
      observer.disconnect();
      applyZoomableMarkers(document);
      observer.observe(pageRoot, observerOptions);
    });
    observer.observe(pageRoot, observerOptions);

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const img = target?.closest("img") as HTMLImageElement | null;
      if (!img || !pageRoot.contains(img)) return;
      if (!img.classList.contains("velu-image-zoomable-fallback")) return;

      event.preventDefault();
      event.stopPropagation();
      tryOpen(img);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const active = document.activeElement as HTMLImageElement | null;
      if (!active || !pageRoot.contains(active)) return;
      if (!(active instanceof HTMLImageElement)) return;
      if (!active.classList.contains("velu-image-zoomable-fallback")) return;

      event.preventDefault();
      tryOpen(active);
    };

    pageRoot.addEventListener("click", onClickCapture, true);
    pageRoot.addEventListener("keydown", onKeyDown);

    return () => {
      observer.disconnect();
      pageRoot.removeEventListener("click", onClickCapture, true);
      pageRoot.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!activeImage) return;
    const prevOverflow = document.body.style.overflow;
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveImage(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onEsc);
    };
  }, [activeImage]);

  if (!mounted || !activeImage) return null;

  return createPortal(
    <div className="velu-image-lightbox" role="dialog" aria-modal="true" onClick={() => setActiveImage(null)}>
      <button
        type="button"
        className="velu-image-lightbox-close"
        aria-label="Close image zoom"
        onClick={() => setActiveImage(null)}
      >
        ×
      </button>
      <img
        src={activeImage.src}
        alt={activeImage.alt}
        className="velu-image-lightbox-img"
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
