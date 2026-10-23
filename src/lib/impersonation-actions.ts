"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** Leave an impersonated account and restore the saved admin session. */
export async function exitImpersonation() {
  const jar = await cookies();
  const adminToken = jar.get("admin_sid")?.value;
  if (adminToken) {
    jar.set("sid", adminToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 14 * 86400,
    });
    jar.delete("admin_sid");
  }
  redirect("/admin/testing");
}
