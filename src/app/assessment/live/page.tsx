import { redirect } from "next/navigation";

// Live/oral placement assessments have been retired. Keep old bookmarks safe.
export default function LiveAssessmentPage() {
  redirect("/assessment");
}
