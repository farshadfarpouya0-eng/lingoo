"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

export type KidItem = {
  name: string; activity: string; text: string; image: string; alt: string; color: string;
};

/**
 * A playful 3D ring of the Lingorain learning crew. It drifts on its own,
 * can be grabbed and spun with the mouse or a finger (with inertia and snap),
 * and has prev/next buttons and dots. Cards always face the viewer.
 */
export default function KidsCarousel({ items, previousLabel, nextLabel, hint }: {
  items: KidItem[]; previousLabel: string; nextLabel: string; hint: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const thetaRef = useRef(0);
  const modeRef = useRef<"auto" | "drag" | "inertia" | "snap" | "wait">("auto");
  const targetRef = useRef<number | null>(null);
  const [front, setFront] = useState(0);
  const [dragging, setDragging] = useState(false);

  const n = items.length;
  const step = 360 / Math.max(1, n);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || n < 2) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let vel = 0;
    let waitUntil = 0;
    let isDown = false, moved = 0, lastX = 0, lastT = 0;
    let radius = 400;
    let raf = 0, prev = performance.now();
    let lastFront = 0;

    const measure = () => { radius = Math.max(230, Math.min(430, stage.clientWidth * 0.42)); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);

    const paint = () => {
      const theta = thetaRef.current;
      let best = 0, bestDepth = -2;
      for (let i = 0; i < n; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        let rel = (i * step + theta) % 360;
        if (rel > 180) rel -= 360;
        if (rel < -180) rel += 360;
        const rad = (rel * Math.PI) / 180;
        const depth = Math.cos(rad);              // 1 = front, -1 = back
        const x = Math.sin(rad) * radius;
        const scale = 0.72 + 0.28 * ((depth + 1) / 2);
        const opacity = 0.22 + 0.78 * ((depth + 1) / 2);
        el.style.transform = `translate(-50%, -50%) translateX(${x.toFixed(1)}px) scale(${scale.toFixed(3)}) rotateY(${(-Math.sin(rad) * 24).toFixed(1)}deg)`;
        el.style.opacity = opacity.toFixed(2);
        el.style.zIndex = String(100 + Math.round(depth * 50));
        if (depth > bestDepth) { bestDepth = depth; best = i; }
      }
      if (best !== lastFront) { lastFront = best; setFront(best); }
    };
    paint();
    if (reduced) return;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const mode = modeRef.current;
      if (mode === "auto") {
        thetaRef.current += 6.5 * dt;
      } else if (mode === "inertia") {
        thetaRef.current += vel * dt;
        vel *= Math.exp(-2.1 * dt);
        if (Math.abs(vel) < 14) modeRef.current = "snap";
      } else if (mode === "snap") {
        const target = targetRef.current ?? Math.round(thetaRef.current / step) * step;
        const diff = target - thetaRef.current;
        thetaRef.current += diff * Math.min(1, dt * 7);
        if (Math.abs(diff) < 0.05) {
          thetaRef.current = target;
          targetRef.current = null;
          modeRef.current = "wait";
          waitUntil = now + 1600;
        }
      } else if (mode === "wait") {
        if (now >= waitUntil) modeRef.current = "auto";
      }
      paint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onDown = (e: PointerEvent) => {
      isDown = true; moved = 0; lastX = e.clientX; lastT = performance.now(); vel = 0;
      modeRef.current = "drag";
    };
    const onMove = (e: PointerEvent) => {
      if (!isDown) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      if (moved > 5) {
        if (!stage.hasPointerCapture(e.pointerId)) { stage.setPointerCapture(e.pointerId); setDragging(true); }
        const now = performance.now();
        const dt = Math.max(1, now - lastT) / 1000;
        lastT = now;
        const dTheta = dx * 0.32;
        thetaRef.current += dTheta;
        vel = 0.75 * vel + 0.25 * (dTheta / dt);
        paint();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!isDown) return;
      isDown = false;
      setDragging(false);
      if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
      targetRef.current = null;
      modeRef.current = Math.abs(vel) > 14 ? "inertia" : "snap";
    };

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
    };
  }, [n, step]);

  const goTo = (index: number) => {
    const base = -index * step;
    const k = Math.round((thetaRef.current - base) / 360);
    targetRef.current = base + 360 * k;
    modeRef.current = "snap";
  };

  const btn = "grid h-10 w-10 place-items-center rounded-full border border-[#e7dcc9] bg-white text-teal-800 transition hover:border-teal-400 hover:bg-teal-50";

  return (
    <div className="kids3d">
      <div
        ref={stageRef}
        className={`kids3d-stage${dragging ? " dragging" : ""}`}
        role="region"
        aria-roledescription="carousel"
        aria-label={hint}
      >
        {items.map((item, i) => (
          <article
            key={item.name}
            ref={el => { cardRefs.current[i] = el; }}
            className="kids3d-card"
            style={{ "--friend-color": item.color } as React.CSSProperties}
          >
            <div className="learning-friend-image">
              <img src={item.image} alt={item.alt} width={520} height={650} loading="lazy" decoding="async" draggable={false} />
            </div>
            <div className="learning-friend-body">
              <p className="friend-activity">{item.activity}</p>
              <h3>{item.name}</h3>
              <p>{item.text}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="kids3d-controls">
        <button type="button" className={btn} aria-label={previousLabel} onClick={() => goTo((front - 1 + n) % n)}>
          <Icon name="chevron" width={17} height={17} className="rotate-180" />
        </button>
        <div className="flex items-center gap-2">
          {items.map((item, i) => (
            <button
              key={item.name}
              type="button"
              aria-label={item.name}
              aria-current={i === front}
              onClick={() => goTo(i)}
              className={`h-2 rounded-full transition-all ${i === front ? "w-6 bg-teal-700" : "w-2 bg-[#ddd2bd] hover:bg-teal-300"}`}
            />
          ))}
        </div>
        <button type="button" className={btn} aria-label={nextLabel} onClick={() => goTo((front + 1) % n)}>
          <Icon name="chevron" width={17} height={17} />
        </button>
      </div>
      <p className="kids3d-hint">{hint}</p>
    </div>
  );
}
