"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import Icon from "./Icon";
import type { HeroCardData } from "./HeroOrbit";

export type MobileHeroCard = HeroCardData & { description: string };

type Props = {
  cards: MobileHeroCard[];
  heading: string;
  hint: string;
  previous: string;
  next: string;
};

/** A large, native-swipe course carousel for small screens. Desktop keeps the 3D orbit. */
export default function MobileHeroCarousel({ cards, heading, hint, previous, next }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const currentRef = useRef(0);
  const interacted = useRef(false);
  const pointer = useRef({ down: false, moved: false, x: 0, scrollLeft: 0 });
  const suppressClick = useRef(false);

  const goTo = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track || !cards.length) return;
    const target = (index + cards.length) % cards.length;
    const slide = track.children.item(target) as HTMLElement | null;
    if (!slide) return;
    const inset = parseFloat(window.getComputedStyle(track).scrollPaddingLeft) || 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: slide.offsetLeft - inset, behavior: reduced ? "auto" : "smooth" });
  }, [cards.length]);

  const syncCurrent = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const inset = parseFloat(window.getComputedStyle(track).scrollPaddingLeft) || 0;
    let nearest = 0;
    let distance = Infinity;
    Array.from(track.children).forEach((child, index) => {
      const candidate = Math.abs((child as HTMLElement).offsetLeft - inset - track.scrollLeft);
      if (candidate < distance) { nearest = index; distance = candidate; }
    });
    if (nearest !== currentRef.current) {
      currentRef.current = nearest;
      setCurrent(nearest);
    }
  }, []);

  // Auto-advance only while visible; any touch, click, focus or key use leaves the
  // visitor in control. The carousel remains useful without animation or JavaScript.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || cards.length < 2) return;
    const small = window.matchMedia("(max-width: 860px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; }, { threshold: 0.5 });
    observer.observe(track);
    const timer = window.setInterval(() => {
      if (small.matches && !reduced.matches && visible && !document.hidden && !interacted.current) {
        goTo(currentRef.current + 1);
      }
    }, 6500);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, [cards.length, goTo]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    interacted.current = true;
    // Touch uses the browser's native, accessible scroll-snap interaction.
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    pointer.current = { down: true, moved: false, x: event.clientX, scrollLeft: event.currentTarget.scrollLeft };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = pointer.current;
    if (!drag.down || event.pointerType !== "mouse") return;
    const delta = event.clientX - drag.x;
    if (Math.abs(delta) > 6) {
      drag.moved = true;
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.scrollLeft = drag.scrollLeft - delta;
      event.preventDefault();
    }
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointer.current.down && pointer.current.moved) {
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 350);
    }
    pointer.current.down = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      className="hero-mobile-showcase"
      role="region"
      aria-roledescription="carousel"
      aria-label={heading}
      data-testid="mobile-hero-carousel"
      onFocusCapture={() => { interacted.current = true; }}
      onMouseEnter={() => { interacted.current = true; }}
    >
      <div
        ref={trackRef}
        className="hero-mobile-track"
        data-testid="mobile-hero-track"
        onScroll={syncCurrent}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={event => {
          if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
        }}
      >
        {cards.map((card, index) => (
          <div className="hero-mobile-slide" key={card.key} role="group" aria-roledescription="slide" aria-label={`${card.label} · ${index + 1} / ${cards.length}`}>
            <Link href={card.href} className="hero-mobile-course" draggable={false} data-testid={`mobile-hero-${card.key}`}>
              <img src={card.src} alt={card.alt} width={1000} height={700} loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} decoding="async" draggable={false} />
              <span className="hero-mobile-course-shade" aria-hidden="true" />
              <span className="hero-mobile-number" aria-hidden="true">{String(index + 1).padStart(2, "0")} / {String(cards.length).padStart(2, "0")}</span>
              <span className="hero-mobile-course-content">
                <span className="hero-mobile-course-overline">{heading}</span>
                <strong>{card.label}</strong>
                <span className="hero-mobile-course-description">{card.description}</span>
              </span>
              <span className="hero-mobile-course-arrow" aria-hidden="true"><Icon name="arrow" width={19} height={19} /></span>
            </Link>
          </div>
        ))}
      </div>
      <div className="hero-mobile-nav">
        <span className="hero-mobile-hint"><span aria-hidden="true">↔</span> {hint}</span>
        <div className="hero-mobile-controls" role="group" aria-label={heading}>
          <button type="button" className="hero-mobile-nav-button" aria-label={previous} onClick={() => { interacted.current = true; goTo(currentRef.current - 1); }}><Icon name="chevron" width={15} height={15} className="hero-mobile-arrow-back" /></button>
          <div className="hero-mobile-dots">
            {cards.map((card, index) => (
              <button key={card.key} type="button" className="hero-mobile-dot" aria-label={card.label} aria-current={current === index ? "true" : undefined}
                onClick={() => { interacted.current = true; goTo(index); }} />
            ))}
          </div>
          <button type="button" className="hero-mobile-nav-button" aria-label={next} onClick={() => { interacted.current = true; goTo(currentRef.current + 1); }}><Icon name="chevron" width={15} height={15} /></button>
        </div>
      </div>
    </div>
  );
}
