import Link from "next/link";
import Icon from "./Icon";
import type { LandingCopy } from "@/lib/landing-i18n";
export default function LandingHero({ c }: { c: LandingCopy }) {
  return <section className="home-hero" aria-labelledby="hero-title" id="hero">
    <div className="home-container">
      <div className="hero-introduction"><div><p className="home-eyebrow"><span className="eyebrow-dot"/>{c.eyebrow}</p><h1 id="hero-title">{c.title}<span>{c.titleAccent}</span></h1></div><p className="hero-intro-text">{c.intro}</p></div>
      <div className="hero-paths">
        <article className="hero-path hero-path-adult" data-testid="adult-hero" aria-labelledby="adult-title">
          <img data-hero-image="adult" src="/images/hero-adults.webp" srcSet="/images/hero-adults-400.webp 400w, /images/hero-adults.webp 800w" sizes="(max-width: 640px) 180px, (max-width: 1024px) 40vw, 380px" alt="An adult learner taking notes during an online English lesson" width={800} height={1000} fetchPriority="high" decoding="async" className="adult-hero-image"/>
          <div className="adult-hero-shade" aria-hidden="true"/>
          <div className="hero-path-content"><p className="hero-path-label"><span className="path-label-line"/>{c.adults}</p><h2 id="adult-title">{c.adultTitle.split("\n").map((line,i)=><span key={i}>{line}</span>)}</h2><p className="hero-path-description">{c.adultText}</p><div className="hero-topic-list">{c.adultTopics.map(topic=><span key={topic}>{topic}</span>)}</div><Link href="/teachers?audience=adults" className="hero-path-button adult-path-button" data-testid="adult-hero-cta">{c.adultCta}<Icon name="arrow" width={18} height={18}/></Link></div>
          <span className="hero-corner-note" aria-hidden="true">01 / ENGLISH FOR LIFE</span>
        </article>
        <article className="hero-path hero-path-kids" data-testid="kids-hero" aria-labelledby="kids-title">
          <div className="kids-hero-orbit" aria-hidden="true"/>
          <img data-hero-image="kids" src="/images/hero-kids.webp" alt="Birdie, Teddy and Lulu practicing English with books and a microphone" width={700} height={780} fetchPriority="high" decoding="async" className="kids-hero-image"/>
          <div className="hero-path-content"><p className="hero-path-label"><span className="path-label-line"/>{c.kids}</p><h2 id="kids-title">{c.kidsTitle.split("\n").map((line,i)=><span key={i}>{line}</span>)}</h2><p className="hero-path-description">{c.kidsText}</p><div className="hero-topic-list">{c.kidsTopics.map(topic=><span key={topic}>{topic}</span>)}</div><Link href="/teachers?audience=kids&tag=Kids" className="hero-path-button kids-path-button" data-testid="kids-hero-cta">{c.kidsCta}<Icon name="arrow" width={18} height={18}/></Link><a href="#kids-learning" className="kids-hero-more">{c.kidsMore}<span aria-hidden="true">↗</span></a></div>
          <span className="hero-corner-note kids-corner-note" aria-hidden="true">{c.kidsBadge}</span>
        </article>
      </div>
      <div className="hero-benefits">{([{icon:"video",label:c.online},{icon:"clock",label:c.flexible},{icon:"messages",label:c.languages}] as const).map(item=><span key={item.label}><Icon name={item.icon} width={17} height={17}/>{item.label}</span>)}</div>
    </div>
  </section>;
}
