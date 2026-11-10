import heroAdults from "@/assets/home/hero-adults.webp";
import heroAdults400 from "@/assets/home/hero-adults-400.webp";
import heroKids from "@/assets/home/hero-kids.webp";
import heroOnline from "@/assets/home/hero-online.webp";
import featureTutor from "@/assets/home/feature-tutor.webp";
import featureStudy from "@/assets/home/feature-study.webp";
import featureSchedule from "@/assets/home/feature-schedule.webp";
import kidsBirdie from "@/assets/home/kids-birdie.webp";
import kidsTeddy from "@/assets/home/kids-teddy.webp";
import kidsLulu from "@/assets/home/kids-lulu.webp";
import kidsNini from "@/assets/home/kids-nini.webp";
import kidsMomo from "@/assets/home/kids-momo.webp";
import kidsPiki from "@/assets/home/kids-piki.webp";
import teacherOnboarding from "@/assets/home/teacher-onboarding.webp";

/**
 * Homepage art is imported through the Next.js asset pipeline instead of relying only on
 * public/ paths. On Vercel this produces hashed /_next/static/media URLs and fails the
 * build if an image is missing, instead of silently rendering broken homepage images.
 */
export const HOME_ASSETS = {
  heroAdults: heroAdults.src,
  heroAdults400: heroAdults400.src,
  heroKids: heroKids.src,
  heroOnline: heroOnline.src,
  featureTutor: featureTutor.src,
  featureStudy: featureStudy.src,
  featureSchedule: featureSchedule.src,
  kidsBirdie: kidsBirdie.src,
  kidsTeddy: kidsTeddy.src,
  kidsLulu: kidsLulu.src,
  kidsNini: kidsNini.src,
  kidsMomo: kidsMomo.src,
  kidsPiki: kidsPiki.src,
  teacherOnboarding: teacherOnboarding.src,
} as const;
