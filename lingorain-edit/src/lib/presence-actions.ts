"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { userPresence } from "@/db/schema";
import { getUser } from "@/lib/auth";

export async function setPresenceVisibility(formData: FormData) {
  const user = await getUser();
  if (!user || !["student", "teacher"].includes(user.role)) return;
  const visible = formData.get("visible") === "on";
  await db.insert(userPresence).values({ userId: user.id, online: false, visible, lastSeenAt: new Date() })
    .onConflictDoUpdate({ target: userPresence.userId, set: { visible } });
  revalidatePath("/dashboard");
}
