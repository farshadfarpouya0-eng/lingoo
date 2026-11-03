"use client";
import { useRef } from "react";
import Icon from "./Icon";
export default function SnapRail({ children, kind, label, previous, next, hint }: { children: React.ReactNode; kind: "kids" | "tutors" | "stories"; label: string; previous: string; next: string; hint: string }) {
  const rail=useRef<HTMLDivElement>(null);
  const move=(direction:number)=>{const node=rail.current;if(!node)return;const first=node.firstElementChild as HTMLElement|null;node.scrollBy({left:direction*((first?.offsetWidth||node.clientWidth*0.8)+16),behavior:"smooth"});};
  return <div className={`snap-rail-wrap snap-rail-${kind}`}><div className="snap-rail-tools"><span>{hint}</span><div><button type="button" aria-label={previous} onClick={()=>move(-1)}><Icon name="arrow" width={16} height={16} className="rotate-180"/></button><button type="button" aria-label={next} onClick={()=>move(1)}><Icon name="arrow" width={16} height={16}/></button></div></div><div ref={rail} className="home-snap-rail" role="region" aria-label={label} tabIndex={0}>{children}</div></div>;
}
