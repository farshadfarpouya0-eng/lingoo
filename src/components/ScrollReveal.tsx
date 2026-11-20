"use client";

import { useEffect } from "react";

const SELECTORS = [
  ".home-goal-card", ".home-step", ".home-promise", ".home-why-grid article",
  ".home-story", ".learning-friend", ".home-detail-row", ".home-course-card",
  ".match-mode-card", ".home-teach-card", ".home-trust-stats li",
].join(", ");

/** Fades homepage cards up as they scroll into view. No-op without JS or with reduced motion. */
export default function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>(SELECTORS));
    if (!els.length) return;
    const io = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.classList.add("rv-in");
        window.setTimeout(() => { el.style.transitionDelay = ""; }, 700);
        io.unobserve(el);
      }
    }, { threshold: 0.1, rootMargin: "0px 0px -6% 0px" });
    els.forEach((el, i) => {
      el.classList.add("rv");
      el.style.transitionDelay = `${(i % 4) * 70}ms`;
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);
  return null;
}
