"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, type ImgHTMLAttributes, type KeyboardEvent, type MouseEvent } from "react";

type VeluImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | { src?: string };
  noZoom?: boolean | "" | "true" | "false";
};

function toImageSrc(value: VeluImageProps["src"]): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.src === "string") return value.src;
  return undefined;
}

function isNoZoom(value: VeluImageProps["noZoom"]): boolean {
  if (value === true || value === "") return true;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

export function VeluImage({
  src,
  alt,
  className,
  noZoom,
  onClick,
  onKeyDown,
  tabIndex,
  role,
  ...props
}: VeluImageProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const resolvedSrc = useMemo(() => toImageSrc(src), [src]);
  const zoomDisabled = isNoZoom(noZoom) || !resolvedSrc;
  const isZoomable = !zoomDisabled;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onEsc = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const handleClick = (event: MouseEvent<HTMLImageElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !isZoomable) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLImageElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !isZoomable) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setOpen(true);
  };

  return (
    <>
      <img
        {...props}
        src={resolvedSrc}
        alt={alt}
        className={[className, isZoomable ? "velu-image-zoomable" : ""].filter(Boolean).join(" ")}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role={isZoomable ? "button" : role}
        tabIndex={isZoomable ? (tabIndex ?? 0) : tabIndex}
        aria-label={isZoomable ? (alt ? `Zoom image: ${alt}` : "Zoom image") : props["aria-label"]}
      />
      {mounted && open && resolvedSrc
        ? createPortal(
          <div className="velu-image-lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
            <button
              type="button"
              className="velu-image-lightbox-close"
              aria-label="Close image zoom"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <img
              src={resolvedSrc}
              alt={alt ?? ""}
              className="velu-image-lightbox-img"
              onClick={(event) => event.stopPropagation()}
            />
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
