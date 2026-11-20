import Link from "next/link";
import Icon from "./Icon";
import type { LandingCopy } from "@/lib/landing-i18n";
import { getLang } from "@/lib/i18n";
import { getBranding } from "@/lib/branding";
import HeroOrbit from "./HeroOrbit";
import MobileHeroCarousel from "./MobileHeroCarousel";

const CARDS = [
  { key: "daily", src: "/hero/daily-english.jpg", alt: "A learner in an online daily English lesson with her tutor", href: "/assessment?audience=adults&goal=Conversation", main: true },
  { key: "kids", src: "/hero/kids.jpg", alt: "A happy child in a kids English class", href: "/assessment?audience=kids&goal=Kids", main: false },
  { key: "business", src: "/hero/business-english.jpg", alt: "A professional in an online business English lesson", href: "/assessment?goal=Business", main: false },
  { key: "ielts", src: "/hero/ielts-exam.jpg", alt: "A student preparing for an English exam with study books and a laptop", href: "/assessment?goal=IELTS", main: false },
  { key: "travel", src: "/hero/travel-migration.jpg", alt: "A traveler speaking English at an airport check-in desk", href: "/assessment?goal=Travel", main: false },
] as const;

export default async function LandingHero({ c }: { c: LandingCopy }) {
  const lang = await getLang();
  const branding = await getBranding();

  const title = branding.heroTitle[lang] || c.title;
  const accent = branding.heroAccent[lang] || c.titleAccent;
  const intro = branding.intro[lang] || c.intro;

  const labels: Record<(typeof CARDS)[number]["key"], string> = {
    daily: c.cardDaily, kids: c.cardKids, business: c.cardBusiness, ielts: c.cardExam, travel: c.cardTravel,
  };
  const descriptions: Record<(typeof CARDS)[number]["key"], string> = {
    daily: c.courseDailyText, kids: c.courseKidsText, business: c.courseBusinessText,
    ielts: c.courseExamText, travel: c.courseTravelText,
  };
  const cards = CARDS.map(card => ({ ...card, label: labels[card.key], description: descriptions[card.key] }));

  const benefits = [
    { icon: "messages", label: c.realTalk },
    { icon: "user", label: c.expertTeachers },
    { icon: "chart", label: c.personalized },
  ] as const;

  return (
    <section className="home-hero" aria-labelledby="hero-title" id="hero">
      <div className="hero-bg" aria-hidden="true">
        <span className="hero-glow hero-glow-a" />
        <span className="hero-glow hero-glow-b" />
        <span className="hero-glow hero-glow-c" />
        <span className="hero-floor" />
        <span className="hero-ring hero-ring-1" />
        <span className="hero-ring hero-ring-2" />
      </div>

      <div className="home-container hero-grid">
        <div className="hero-copy">
          <div className="hero-copy-main">
            <p className="hero-badge"><span className="hero-badge-icon">★</span>{c.badge}</p>
            <h1 id="hero-title">
              {title.split("\n").map((line, i) => <span key={i}>{line}</span>)}
              <span className="hero-accent">{accent}</span>
            </h1>
            <p className="hero-intro-text">{intro}</p>
          </div>

          <ul className="hero-benefits" aria-label="Why Lingorain">
            {benefits.map(b => (
              <li key={b.icon}>
                <span className="hero-benefit-icon"><Icon name={b.icon} width={18} height={18} /></span>
                <span>{b.label.split("\n").map((l, i) => <span key={i}>{l}</span>)}</span>
              </li>
            ))}
          </ul>

          <div className="hero-actions">
            <Link href="/assessment" className="hero-cta-primary" data-testid="adult-hero-cta">
              {c.startTest}<Icon name="arrow" width={18} height={18} />
            </Link>
            <a href="#how-it-works" className="hero-cta-secondary">
              <span className="hero-play" aria-hidden="true" />{c.howItWorks}
            </a>
          </div>
        </div>

        <HeroOrbit cards={cards} />
        <MobileHeroCarousel cards={cards} heading={c.coursesEyebrow} hint={c.swipe} previous={c.previous} next={c.next} />
      </div>
    </section>
  );
}
