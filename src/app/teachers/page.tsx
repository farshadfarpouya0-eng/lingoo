import { redirect } from "next/navigation";

// Tutor browsing is gone: students take the free placement test and get
// matched with a short list of teachers instead of searching everyone.
export default function Teachers() {
  redirect("/assessment");
}
