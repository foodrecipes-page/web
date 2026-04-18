"use client";

import { useEffect } from "react";

/**
 * Keeps a fixed-bottom element docked above the on-screen keyboard on mobile.
 * Uses visualViewport.height to compute keyboard inset and sets a CSS var
 * (--kb) on <html> which the sticky dock consumes as `bottom: var(--kb, 0px)`.
 */
export function KeyboardDock() {
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb", `${inset}px`);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return null;
}
