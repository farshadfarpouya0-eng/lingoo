/**
 * Homepage assets are served from Next's public folder. Keep the original
 * files in public/images; do not duplicate them under src/assets, which makes
 * Git/Vercel builds fail when those binaries are not copied with the source.
 */
export const HOME_ASSETS = {
  heroAdults: "/images/hero-adults.webp",
  heroAdults400: "/images/hero-adults-400.webp",
  heroKids: "/images/hero-kids.webp",
  heroOnline: "/images/hero-online.webp",
  featureTutor: "/images/feature-tutor.webp",
  featureStudy: "/images/feature-study.webp",
  featureSchedule: "/images/feature-schedule.webp",
  kidsBirdie: "/images/kids-birdie.webp",
  kidsTeddy: "/images/kids-teddy.webp",
  kidsLulu: "/images/kids-lulu.webp",
  kidsNini: "/images/kids-nini.webp",
  kidsMomo: "/images/kids-momo.webp",
  kidsPiki: "/images/kids-piki.webp",
  teacherOnboarding: "/images/teacher-onboarding.webp",
} as const;
