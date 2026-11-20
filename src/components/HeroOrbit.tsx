"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type HeroCardData = {
  key: string; src: string; alt: string; href: string; label: string; main: boolean;
};

/**
 * The hero's 3D course orbit, driven by JS so it can play with the mouse:
 * it slowly auto-rotates, tilts and sways toward the cursor (parallax),
 * and can be grabbed and spun with inertia. Cards always face the viewer.
 */
export default function HeroOrbit({ cards }: { cards: HeroCardData[] }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const scene = sceneRef.current;
    const orbit = orbitRef.current;
    if (!scene || !orbit) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let theta = 0;          // orbit rotation (deg)
    let vel = 0;            // drag inertia (deg/s)
    let sway = 0, tilt = 8; // eased mouse parallax
    let swayTarget = 0, tiltTarget = 8;
    let isDown = false, moved = 0, startX = 0, lastX = 0, lastT = 0;
    let raf = 0, prev = performance.now();

    const compact = () => window.matchMedia("(max-width: 860px)").matches;
    const apply = () => {
      const ry = theta + sway;
      // On phones the ring is shallower and calmer so cards never overlap the copy.
      const tiltNow = compact() ? tilt * 0.55 : tilt;
      orbit.style.transform = `rotateX(${tiltNow.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      orbit.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
    };
    apply();
    if (reduced) return;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (!isDown) {
        theta += (compact() ? 5.5 : 9) * dt + vel * dt;  // gentle auto-rotation + inertia
        vel *= Math.exp(-2.4 * dt);
        if (Math.abs(vel) < 0.5) vel = 0;
      }
      const ease = Math.min(1, dt * 5);
      sway += (swayTarget - sway) * ease;
      tilt += (tiltTarget - tilt) * ease;
      apply();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const setTargets = (e: PointerEvent) => {
      const r = scene.getBoundingClientRect();
      const mx = (e.clientX - r.left) / Math.max(1, r.width) - 0.5;
      const my = (e.clientY - r.top) / Math.max(1, r.height) - 0.5;
      const strength = compact() ? 12 : 26;
      swayTarget = mx * strength;
      tiltTarget = 8 - my * (compact() ? 5 : 12);
      scene.style.setProperty("--px", mx.toFixed(3));
      scene.style.setProperty("--py", my.toFixed(3));
    };

    const onDown = (e: PointerEvent) => {
      isDown = true; moved = 0; startX = lastX = e.clientX; lastT = performance.now(); vel = 0;
      setTargets(e);
    };
    const onMove = (e: PointerEvent) => {
      setTargets(e);
      if (!isDown) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      if (moved > 6 && !scene.hasPointerCapture(e.pointerId)) {
        scene.setPointerCapture(e.pointerId);
        setDragging(true);
      }
      if (moved > 6) {
        const now = performance.now();
        const dt = Math.max(1, now - lastT) / 1000;
        lastT = now;
        const dTheta = dx * 0.42;
        theta += dTheta;
        vel = 0.75 * vel + 0.25 * (dTheta / dt);
        apply();
      }
    };
    const onUp = (e: PointerEvent) => {
      isDown = false;
      setDragging(false);
      if (scene.hasPointerCapture(e.pointerId)) scene.releasePointerCapture(e.pointerId);
      // A real drag should not also trigger the card link underneath.
      if (moved > 8) {
        const swallow = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
        scene.addEventListener("click", swallow, { capture: true, once: true });
        window.setTimeout(() => scene.removeEventListener("click", swallow, { capture: true }), 350);
      }
    };
    const onLeave = () => { swayTarget = 0; tiltTarget = 8; };

    scene.addEventListener("pointerdown", onDown);
    scene.addEventListener("pointermove", onMove);
    scene.addEventListener("pointerup", onUp);
    scene.addEventListener("pointercancel", onUp);
    scene.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      scene.removeEventListener("pointerdown", onDown);
      scene.removeEventListener("pointermove", onMove);
      scene.removeEventListener("pointerup", onUp);
      scene.removeEventListener("pointercancel", onUp);
      scene.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={sceneRef}
      className="hero-scene"
      aria-label="Learning paths"
      data-dragging={dragging || undefined}
    >
      <div ref={orbitRef} className="hero-orbit">
        {cards.map((card, i) => (
          <div key={card.key} className={`hero-card-slot slot-${i + 1}`}>
            <Link
              href={card.href}
              className={`hero-card${card.main ? " hero-card-main" : ""}`}
              data-testid={card.key === "kids" ? "kids-hero-cta" : undefined}
              draggable={false}
            >
              <img
                data-hero-image={card.key}
                src={card.src}
                alt={card.alt}
                width={card.main ? 460 : 240}
                height={card.main ? 345 : 180}
                loading={i < 2 ? "eager" : "lazy"}
                fetchPriority={card.main ? "high" : "auto"}
                decoding="async"
                draggable={false}
              />
              <span className="hero-card-shine" aria-hidden="true" />
              <span className="hero-card-label">{card.label}</span>
            </Link>
          </div>
        ))}
      </div>
      <span className="hero-orb orb-1" aria-hidden="true" />
      <span className="hero-orb orb-2" aria-hidden="true" />
      <span className="hero-orb orb-3" aria-hidden="true" />
      <span className="hero-orb orb-4" aria-hidden="true" />
      <span className="hero-orb orb-5" aria-hidden="true" />
    </div>
  );
}
