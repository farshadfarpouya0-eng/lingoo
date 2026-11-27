import Link from "next/link";
import { getT } from "@/lib/i18n";
import { HOME } from "@/lib/home-i18n";
import { LANDING } from "@/lib/landing-i18n";
import { ASSESS } from "@/lib/assessment-i18n";
import LandingHero from "@/components/LandingHero";
import ScrollReveal from "@/components/ScrollReveal";
import KidsCarousel from "@/components/KidsCarousel";
import SnapRail from "@/components/SnapRail";
import Icon, { type IconName } from "@/components/Icon";
import { HOME_ASSETS } from "@/lib/home-assets";

export const dynamic = "force-dynamic";

const goalIcons: IconName[] = ["messages", "book", "book", "chart", "user", "book", "video", "messages"];
const kidColors = ["#c9867e", "#b85e47", "#8b74a9", "#629074", "#c48297", "#b88851"];

export default async function Home() {
  const { t, lang } = await getT();
  const h = HOME[lang], c = LANDING[lang], a = ASSESS[lang];

  return (
    <div className="lingorain-home">
      <ScrollReveal />
      <style>{`
        .home-trust-strip{background:#f5f7f2;padding:4px 0 26px;}
        .home-trust-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0;padding:16px 0 0;list-style:none;border-top:1px solid #e4ebe6;}
        .home-trust-stats li{text-align:center;padding:8px 6px;}
        .home-trust-stats b{display:block;font-size:28px;letter-spacing:-1.2px;font-weight:750;color:#143e37;line-height:1;}
        .home-trust-stats span{display:block;margin-top:8px;font-size:12px;line-height:1.45;color:#7d8d82;}
        .home-trust-line{margin:12px 0 0;text-align:center;font-size:12px;letter-spacing:.2px;color:#8a9a8e;}
        @media(max-width:640px){
          .home-trust-stats{grid-template-columns:1fr 1fr;}
          .home-trust-stats b{font-size:22px;}
          .home-trust-stats span{font-size:11px;}
        }
      `}</style>

      <LandingHero c={c} />

      <section className="home-trust-strip" aria-label="Lingorain in numbers">
        <div className="home-container">
          <ul className="home-trust-stats">
            {h.stats.map(([value, label]) => (
              <li key={label}>
                <b>{value}</b>
                <span>{label}</span>
              </li>
            ))}
          </ul>
          <p className="home-trust-line">{h.trust}</p>
        </div>
      </section>

      <div className="home-marquee" aria-hidden="true">
        <div className="home-marquee-track">
          {[0, 1].map(dup => (
            <div key={dup} className="home-marquee-group">
              {["IELTS", "TOEFL", "TOEIC", "Business English", "Kids English", "Conversation", "Travel"].map(w => <span key={w}>{w}</span>)}
            </div>
          ))}
        </div>
      </div>

      <section className="home-match-section" aria-labelledby="lesson-search-title">
        <div className="home-container">
          <div className="home-match-shell">
            <div className="match-intro">
              <p className="home-eyebrow"><span className="eyebrow-dot" />{a.nav}</p>
              <h2 id="lesson-search-title">{a.heroTitle}</h2>
              <p className="match-sub">{a.heroText}</p>
              <ol className="match-steps">
                <li><b>01</b><span>{a.step1}</span></li>
                <li><b>02</b><span>{a.step2}</span></li>
                <li><b>03</b><span>{a.step3}</span></li>
              </ol>
            </div>
            <div className="match-modes">
              <Link href="/assessment/test" className="match-mode-card match-mode-written">
                <div className="match-mode-top">
                  <span className="match-mode-icon"><Icon name="book" width={22} height={22} /></span>
                  <span className="match-mode-badge">{a.writtenMeta}</span>
                </div>
                <h3>{a.writtenTitle}</h3>
                <p>{a.writtenText}</p>
                <span className="match-mode-cta">{a.startWritten}<Icon name="arrow" width={16} height={16} /></span>
              </Link>
              <Link href="/register?role=student" className="match-mode-card match-mode-secondary">
                <div className="match-mode-top">
                  <span className="match-mode-icon"><Icon name="user" width={22} height={22} /></span>
                  <span className="match-mode-badge">{a.skipTestMeta}</span>
                </div>
                <h3>{a.skipTestTitle}</h3>
                <p>{a.skipTestText}</p>
                <span className="match-mode-cta">{a.registerWithoutTest}<Icon name="arrow" width={16} height={16} /></span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="home-courses-section home-section" aria-labelledby="courses-title">
        <div className="home-container">
          <div className="home-section-heading">
            <div>
              <p className="home-eyebrow">{c.coursesEyebrow}</p>
              <h2 id="courses-title">{c.coursesTitle}</h2>
            </div>
            <p className="section-heading-description">{c.coursesSub}</p>
          </div>
          <div className="home-course-grid">
            {[
              { key: "daily", img: "/hero/daily-english.jpg", label: c.cardDaily, text: c.courseDailyText, href: "/assessment?audience=adults&goal=Conversation" },
              { key: "kids", img: "/hero/kids.jpg", label: c.cardKids, text: c.courseKidsText, href: "/assessment?audience=kids&goal=Kids" },
              { key: "business", img: "/hero/business-english.jpg", label: c.cardBusiness, text: c.courseBusinessText, href: "/assessment?goal=Business" },
              { key: "ielts", img: "/hero/ielts-exam.jpg", label: c.cardExam, text: c.courseExamText, href: "/assessment?goal=IELTS" },
              { key: "travel", img: "/hero/travel-migration.jpg", label: c.cardTravel, text: c.courseTravelText, href: "/assessment?goal=Travel" },
            ].map(course => (
              <Link key={course.key} href={course.href} className={`home-course-card course-${course.key}`}>
                <img src={course.img} alt="" loading="lazy" decoding="async" />
                <span className="home-course-shade" aria-hidden="true" />
                <span className="home-course-body">
                  <b>{course.label}</b>
                  <span>{course.text}</span>
                </span>
                <span className="home-course-arrow" aria-hidden="true"><Icon name="arrow" width={15} height={15} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="home-kids-section home-section" id="kids-learning" aria-labelledby="kids-learning-title">
        <div className="home-container">
          <div className="home-section-heading kids-section-heading">
            <div>
              <p className="home-eyebrow">{c.kidsEyebrow}</p>
              <h2 id="kids-learning-title">{c.kidsShort}</h2>
              <p>{c.kidsHint}</p>
            </div>
            <Link href="/assessment?audience=kids&goal=Kids" className="home-text-link">
              {c.kidsCta}<Icon name="arrow" width={17} height={17} />
            </Link>
          </div>
          <KidsCarousel
            items={h.characters.map((character, i) => ({ ...character, color: kidColors[i] }))}
            previousLabel={c.previous}
            nextLabel={c.next}
            hint={c.swipe}
          />
          <p className="kids-section-note">{h.kidsSub}</p>
        </div>
      </section>

      <section className="home-goals-section home-section" id="learning-goals" aria-labelledby="learning-goals-title">
        <div className="home-container">
          <div className="home-section-heading">
            <div>
              <p className="home-eyebrow">{c.focus}</p>
              <h2 id="learning-goals-title">{h.goalsTitle}</h2>
            </div>
            <p className="section-heading-description">{h.goalsSub}</p>
          </div>
          <div className="home-goal-grid">
            {h.goals.map((g, i) => (
              <Link
                key={g.tag}
                href={g.tag === "Kids" ? "/assessment?audience=kids&goal=Kids" : `/assessment?goal=${encodeURIComponent(g.tag)}`}
                className="home-goal-card"
              >
                <span className="goal-card-icon"><Icon name={goalIcons[i] || "book"} width={22} height={22} /></span>
                <div>
                  <h3>{g.title}</h3>
                  <p>{g.text}</p>
                </div>
                <Icon name="arrow" width={17} height={17} className="goal-card-arrow" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="home-details-section home-section" aria-labelledby="lesson-details-title">
        <div className="home-container">
          <div className="home-centered-heading">
            <p className="home-eyebrow">{c.detailsEyebrow}</p>
            <h2 id="lesson-details-title">{h.detailTitle}</h2>
            <p>{h.detailSub}</p>
          </div>
          <div className="home-detail-rows">
            {h.details.map((d, i) => (
              <article className={`home-detail-row ${i % 2 ? "detail-row-reverse" : ""}`} key={d.title}>
                <div className="home-detail-image">
                  <img src={d.image} alt={d.alt} width={1000} height={800} loading="lazy" decoding="async" />
                  <span className="detail-image-shade" aria-hidden="true" />
                  <span className="detail-image-label">
                    <Icon name={i === 0 ? "user" : i === 1 ? "calendar" : "chart"} width={15} height={15} />{d.kicker}
                  </span>
                  <span className="detail-image-stat">
                    <b>{d.stat}</b>
                    <span>{d.statLabel}</span>
                  </span>
                </div>
                <div className="home-detail-content">
                  <span className="detail-index" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{d.title}</h3>
                  <p>{d.text}</p>
                  <ul>{d.bullets.map(b => <li key={b}><Icon name="check" width={14} height={14} />{b}</li>)}</ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-how-section home-section" id="how-it-works" aria-labelledby="how-title">
        <div className="home-container">
          <div className="home-centered-heading">
            <p className="home-eyebrow">{c.howEyebrow}</p>
            <h2 id="how-title">{h.howTitle}</h2>
            <p>{h.howSub}</p>
          </div>
          <div className="home-step-grid">
            {h.steps.map((step, i) => (
              <article className="home-step" key={step.title}>
                <span className="step-number">0{i + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
                {i < 2 && <span className="step-connector" aria-hidden="true" />}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-promise-section home-section" aria-labelledby="promise-title">
        <div className="home-container">
          <div className="home-centered-heading">
            <p className="home-eyebrow">{c.promiseEyebrow}</p>
            <h2 id="promise-title">{h.promiseTitle}</h2>
            <p>{h.promiseSub}</p>
          </div>
          <div className="home-promise-grid">
            {h.promises.map((promise, i) => (
              <article key={promise.title} className="home-promise">
                <Icon name={(["book", "shield", "clock", "user"] as const)[i]} width={23} height={23} />
                <p className="promise-value">{promise.value}</p>
                <h3>{promise.title}</h3>
                <p>{promise.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-why-section home-section" aria-labelledby="why-title">
        <div className="home-container">
          <div className="home-section-heading">
            <div>
              <p className="home-eyebrow">{c.whyEyebrow}</p>
              <h2 id="why-title">{h.whyTitle}</h2>
            </div>
            <p className="section-heading-description">{h.whySub}</p>
          </div>
          <div className="home-why-grid">
            {h.why.map((why, i) => (
              <article key={why.title}>
                <Icon name={(["user", "calendar", "wallet", "book", "shield", "messages"] as const)[i]} width={22} height={22} />
                <h3>{why.title}</h3>
                <p>{why.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>


      <section className="home-stories-section home-section" aria-labelledby="stories-title">
        <div className="home-container">
          <div className="home-section-heading">
            <div>
              <p className="home-eyebrow">{c.storiesEyebrow}</p>
              <h2 id="stories-title">{h.revTitle}</h2>
            </div>
          </div>
          <SnapRail kind="stories" label={h.revTitle} previous={c.previous} next={c.next} hint={c.swipe}>
            {h.reviews.map(review => (
              <figure key={review.name} className="home-story">
                <span className="story-quote-mark" aria-hidden="true">&ldquo;</span>
                <blockquote>{review.text}</blockquote>
                <figcaption>
                  <span className="story-avatar">{review.name[0]}</span>
                  <div>
                    <b>{review.name}</b>
                    <span>{review.from} · {review.goal}</span>
                  </div>
                </figcaption>
              </figure>
            ))}
          </SnapRail>
        </div>
      </section>

      <section className="home-teach-section home-section">
        <div className="home-container">
          <div className="home-teach-card">
            <div className="home-teach-content">
              <p className="home-eyebrow">{c.teacherEyebrow}</p>
              <h2>{h.ctaTutorTitle}</h2>
              <p>{h.ctaTutorText}</p>
              <ul>{h.ctaTutorPoints.map(point => <li key={point}><Icon name="check" width={16} height={16} />{point}</li>)}</ul>
              <Link href="/register?role=teacher" className="home-filled-button">
                {h.ctaTutorBtn}<Icon name="arrow" width={17} height={17} />
              </Link>
            </div>
            <img src={HOME_ASSETS.teacherOnboarding} alt="An English tutor preparing an online lesson" width={1000} height={800} loading="lazy" decoding="async" />
          </div>
        </div>
      </section>

      <section id="faq" className="home-faq-section home-section" aria-labelledby="faq-title">
        <div className="home-container home-faq-layout">
          <div className="home-faq-heading">
            <p className="home-eyebrow">{c.faqEyebrow}</p>
            <h2 id="faq-title">{h.faqTitle}</h2>
            <Link href="/assessment" className="home-text-link">
              {c.startTest}<Icon name="arrow" width={16} height={16} />
            </Link>
          </div>
          <div className="home-faq-list">
            {h.faq.map(([q, a]) => (
              <details key={q}>
                <summary>{q}<span className="faq-plus" aria-hidden="true">+</span></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}