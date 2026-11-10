import Link from "next/link";
import Icon from "./Icon";
import type { LandingCopy } from "@/lib/landing-i18n";
import { getLang } from "@/lib/i18n";
import { getBranding } from "@/lib/branding";
import { HOME_ASSETS } from "@/lib/home-assets";

export default async function LandingHero({ c }: { c: LandingCopy }) {
  const lang = await getLang();
  const branding = await getBranding();

  const hero = {
    ...c,
    title: branding.heroTitle[lang] || c.title,
    titleAccent: branding.heroAccent[lang] || c.titleAccent,
    intro: branding.intro[lang] || c.intro,
  };

  return (
    <section className="home-hero" aria-labelledby="hero-title" id="hero">
      <div className="home-container">
        <div className="hero-introduction">
          <div>
            <p className="home-eyebrow"><span className="eyebrow-dot" />{hero.eyebrow}</p>
            <h1 id="hero-title">
              {hero.title}
              <span>{hero.titleAccent}</span>
            </h1>
          </div>
          <p className="hero-intro-text">{hero.intro}</p>
        </div>

        <div className="hero-paths">
          <article className="hero-path hero-path-adult" data-testid="adult-hero" aria-labelledby="adult-title">
            <img
              data-hero-image="adult"
              src={HOME_ASSETS.heroAdults}
              srcSet={`${HOME_ASSETS.heroAdults400} 400w, ${HOME_ASSETS.heroAdults} 800w`}
              sizes="(max-width: 640px) 180px, (max-width: 1024px) 40vw, 380px"
              alt="An adult learner taking notes during an online English lesson"
              width={800} height={1000} fetchPriority="high" decoding="async"
              className="adult-hero-image"
            />
            <div className="adult-hero-shade" aria-hidden="true" />
            <div className="hero-path-content">
              <p className="hero-path-label"><span className="path-label-line" />{hero.adults}</p>
              <h2 id="adult-title">
                {hero.adultTitle.split("\n").map((line, i) => <span key={i}>{line}</span>)}
              </h2>
              <p className="hero-path-description">{hero.adultText}</p>
              <div className="hero-topic-list">
                {hero.adultTopics.map(topic => <span key={topic}>{topic}</span>)}
              </div>
              <Link href="/teachers?audience=adults" className="hero-path-button adult-path-button" data-testid="adult-hero-cta">
                {hero.adultCta}<Icon name="arrow" width={18} height={18} />
              </Link>
            </div>
            <span className="hero-corner-note" aria-hidden="true">01 / ENGLISH FOR LIFE</span>
          </article>

          <article className="hero-path hero-path-kids" data-testid="kids-hero" aria-labelledby="kids-title">
            <div className="kids-hero-orbit" aria-hidden="true" />
            <img
              data-hero-image="kids"
              src={HOME_ASSETS.heroKids}
              alt="Birdie, Teddy and Lulu practicing English with books and a microphone"
              width={700} height={780} fetchPriority="high" decoding="async"
              className="kids-hero-image"
            />
            <div className="hero-path-content">
              <p className="hero-path-label"><span className="path-label-line" />{hero.kids}</p>
              <h2 id="kids-title">
                {hero.kidsTitle.split("\n").map((line, i) => <span key={i}>{line}</span>)}
              </h2>
              <p className="hero-path-description">{hero.kidsText}</p>
              <div className="hero-topic-list">
                {hero.kidsTopics.map(topic => <span key={topic}>{topic}</span>)}
              </div>
              <Link href="/teachers?audience=kids&tag=Kids" className="hero-path-button kids-path-button" data-testid="kids-hero-cta">
                {hero.kidsCta}<Icon name="arrow" width={18} height={18} />
              </Link>
              <a href="#kids-learning" className="kids-hero-more">{hero.kidsMore}<span aria-hidden="true">↗</span></a>
            </div>
            <span className="hero-corner-note kids-corner-note" aria-hidden="true">{hero.kidsBadge}</span>
          </article>
        </div>

        <div className="hero-benefits">
          {([
            { icon: "video", label: hero.online },
            { icon: "clock", label: hero.flexible },
            { icon: "messages", label: hero.languages },
          ] as const).map(item => (
            <span key={item.label}><Icon name={item.icon} width={17} height={17} />{item.label}</span>
          ))}
        </div>
      </div>
    </section>
  );
}