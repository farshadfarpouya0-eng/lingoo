"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { learningMaterials, lessonReports, materialPurchases, transactions, users, teacherDocuments, lessons, referrals, referralRewards, referralLessonCredits, adminAuditLogs } from "@/db/schema";
import { ensureReferralCode } from "@/lib/referral-service";
import { validateUploadedPrivateFile } from "@/lib/private-storage";
import { getUser, requireAdmin } from "@/lib/auth";
import { canAccessLesson } from "@/lib/lesson-access";
import { ledger } from "@/lib/money";

const val=(fd:FormData,key:string,max=200)=>String(fd.get(key)||"").trim().slice(0,max);

export async function saveProfileAvatar(fd: FormData) {
  const user = await getUser();
  if (!user || !["student", "teacher"].includes(user.role)) return { ok: false, error: "Student or teacher account required." };
  const fileRef = val(fd, "fileRef", 2000);
  if (!fileRef.startsWith("storage://")) return { ok: false, error: "Upload a profile picture first." };
  try { await validateUploadedPrivateFile(fileRef, "avatars", user.id, "avatar"); }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Profile picture validation failed." }; }
  try {
    await db.update(users).set({ avatar: `/api/avatars/${user.id}`, avatarStorageRef: fileRef }).where(eq(users.id, user.id));
  } catch { return { ok: false, error: "Could not save the profile picture. Please retry." }; }
  revalidatePath("/dashboard"); revalidatePath(`/teachers/${user.id}`); revalidatePath("/teachers"); revalidatePath("/");
  return { ok: true };
}

export async function createMaterial(fd: FormData) {
  const admin = await requireAdmin();
  const title = val(fd, "title", 160), kind = val(fd, "kind", 30), category = val(fd, "category", 40) || "general";
  const rawPayload = String(fd.get("fileUrl") || "");
  if (rawPayload.length > 900_000) return { ok: false, error: "Course text is too large. Reduce the text content or split it into multiple courses." };
  const coverUrl = val(fd, "coverUrl", 2000);
  const isFree = fd.get("isFree") === "on";
  const rawPrice = Number(fd.get("price") || 0);
  if (!Number.isFinite(rawPrice) || rawPrice < 0 || rawPrice > 100000) return { ok: false, error: "Price must be between $0 and $100,000." };
  const price = Math.round(rawPrice * 100);
  if (!title || !["textbook", "audio", "worksheet"].includes(kind)) return { ok: false, error: "Enter a title and select a supported material type." };
  const allowedCategories = ["general", "conversation", "natural_conversation", "ielts", "toefl", "toeic", "business_english", "kids", "grammar", "vocabulary", "pronunciation", "academic_english", "travel_english", "reading_writing", "exam_prep"];
  if (!allowedCategories.includes(category)) return { ok: false, error: "Choose a supported course category." };
  if (!isFree && price < 1) return { ok: false, error: "Paid materials must have a price greater than zero." };
  let parsed: { mode?: string; pdfRef?: string; units?: Array<{ title?: string; content?: string; audioRef?: string; imageRef?: string; audioUrl?: string; imageUrl?: string }> } | null = null;
  try { parsed = JSON.parse(rawPayload); } catch { return { ok: false, error: "Course lessons are invalid. Please review the course and retry." }; }
  if (!parsed || !Array.isArray(parsed.units) || parsed.units.length < 1 || parsed.units.length > 100) return { ok: false, error: "Add between 1 and 100 lessons." };
  if (!["both", "self", "tutor"].includes(String(parsed.mode || "both"))) return { ok: false, error: "Choose a valid study mode." };
  const refs: string[] = [];
  if (coverUrl) refs.push(coverUrl);
  if (parsed.pdfRef) refs.push(parsed.pdfRef);
  for (const unit of parsed.units) {
    if (!unit || typeof unit.title !== "string" || unit.title.trim().length < 1 || unit.title.length > 180 || typeof unit.content !== "string" || unit.content.length > 30000) return { ok: false, error: "One of the lessons has an invalid title or too much text." };
    for (const ref of [unit.audioRef, unit.imageRef]) if (ref) refs.push(ref);
    // Do not accept arbitrary URLs or data URLs in new courses; all lesson media must be private storage references.
    if (unit.audioUrl || unit.imageUrl) return { ok: false, error: "Please re-upload lesson media using the private uploader." };
  }
  if (coverUrl && !coverUrl.startsWith("storage://")) return { ok: false, error: "Cover image must be uploaded to private storage." };
  if (parsed.pdfRef && !parsed.pdfRef.startsWith("storage://")) return { ok: false, error: "Textbook PDF must be uploaded to private storage." };
  if (refs.some(ref => !ref.startsWith("storage://"))) return { ok: false, error: "All uploaded course files must use private storage." };
  if (kind === "audio" && !parsed.units.some(u => u.audioRef)) return { ok: false, error: "Add at least one audio track to an audio course." };
  try {
    const checked = new Set<string>();
    for (const ref of refs) {
      if (checked.has(ref)) continue;
      const file = await validateUploadedPrivateFile(ref, "materials", admin.id, "material");
      checked.add(ref);
      const audioExtensions = ["mp3", "wav", "ogg", "m4a", "aac"];
      if (ref === coverUrl && !["jpg", "png", "webp"].includes(file.extension)) throw new Error("Cover images must be JPEG, PNG, or WebP.");
      if (ref === parsed.pdfRef && file.extension !== "pdf") throw new Error("The textbook file must be a PDF.");
      if (parsed.units.some(u => u.audioRef === ref) && !audioExtensions.includes(file.extension)) throw new Error("Audio tracks must use an audio file format.");
      if (parsed.units.some(u => u.imageRef === ref) && !["jpg", "png", "webp"].includes(file.extension)) throw new Error("Lesson images must be JPEG, PNG, or WebP.");
    }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Private upload validation failed." }; }
  const fileUrl = JSON.stringify({ mode: parsed.mode || "both", pdfRef: parsed.pdfRef || "", units: parsed.units.map(u => ({ title: u.title!.trim(), content: u.content, audioRef: u.audioRef || "", imageRef: u.imageRef || "" })) });
  try {
    await db.insert(learningMaterials).values({ title, description: val(fd, "description", 2000), kind, category,
      language: val(fd, "language", 50) || "English", level: val(fd, "level", 20) || "A1", fileUrl,
      coverUrl, isFree, price: isFree ? 0 : price, published: fd.get("published") === "on", createdBy: admin.id });
  } catch { return { ok: false, error: "The course files uploaded, but the course record could not be saved. Please retry or remove orphaned files from private storage." }; }
  revalidatePath("/admin/materials"); revalidatePath("/dashboard?tab=materials");
  return { ok: true };
}

export async function buyMaterial(fd:FormData){
  const user=await getUser(); if(!user||user.role!=="student") return {ok:false,error:"Students must sign in to purchase materials."};
  const id=Number(fd.get("id")); if(!Number.isInteger(id)||id<1)return {ok:false,error:"Invalid material."};
  try { await db.transaction(async tx=>{
    const [m]=await tx.select().from(learningMaterials).where(and(eq(learningMaterials.id,id),eq(learningMaterials.published,true)));
    if(!m)throw new Error("Material unavailable."); if(m.isFree)throw new Error("This material is free; open it directly.");
    const [existing]=await tx.select({id:materialPurchases.id}).from(materialPurchases).where(and(eq(materialPurchases.materialId,id),eq(materialPurchases.userId,user.id)));
    if(existing) return;
    const [updated]=await tx.update(users).set({balance:sql`${users.balance} - ${m.price}`}).where(and(eq(users.id,user.id),sql`${users.balance} >= ${m.price}`)).returning({id:users.id});
    if(!updated)throw new Error("Insufficient balance.");
    await tx.insert(materialPurchases).values({materialId:id,userId:user.id,amount:m.price,status:"paid"});
    await ledger(tx, user.id, "material_purchase", -m.price, `Purchased learning material #${id}`, undefined, `material:${id}:${user.id}`);
  }); } catch(e){return {ok:false,error:e instanceof Error?e.message:"Purchase failed."};}
  revalidatePath("/dashboard?tab=materials"); revalidatePath("/dashboard?tab=wallet"); return {ok:true};
}
export async function reportLessonIssue(fd:FormData){
  const user=await getUser(); if(!user)return {ok:false,error:"Sign in first."}; const id=Number(fd.get("lessonId"));
  if(!Number.isInteger(id)||id<1)return {ok:false,error:"Invalid lesson."};
  const [lesson]=await db.select({id:lessons.id,studentId:lessons.studentId,teacherId:lessons.teacherId}).from(lessons).where(eq(lessons.id,id));
  if(!lesson||!(await canAccessLesson(id,user.id)))return {ok:false,error:"You are not a participant in this lesson."};
  const description=val(fd,"description",3000); if(description.length<8)return {ok:false,error:"Please describe the issue."};
  await db.insert(lessonReports).values({lessonId:id,reporterId:user.id,category:val(fd,"category",40)||"technical",description});
  revalidatePath(`/classroom/${id}`); revalidatePath("/admin/reports"); return {ok:true};
}
export async function uploadTeacherDocument(fd: FormData) {
  const user = await getUser();
  if (!user || user.role !== "teacher") return { ok: false, error: "Teacher account required." };
  const fileRef = val(fd, "fileRef", 2000), documentType = val(fd, "documentType", 60);
  if (!fileRef.startsWith("storage://") || !["identity", "university", "teaching", "other"].includes(documentType)) {
    return { ok: false, error: "Choose a document type and upload a PDF or image file." };
  }
  try { await validateUploadedPrivateFile(fileRef, "teacher-documents", user.id, "document"); }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Private upload validation failed." }; }
  try {
    await db.insert(teacherDocuments).values({ teacherId: user.id, documentType, fileUrl: fileRef, optionalCredential: documentType !== "identity" });
  } catch { return { ok: false, error: "The private file was uploaded, but the document record could not be saved. Contact support before uploading again." }; }
  revalidatePath("/dashboard?tab=profile"); revalidatePath("/admin/documents");
  return { ok: true };
}
export async function updateMaterialStatus(fd:FormData){
  await requireAdmin(); const id=Number(fd.get("id")); if(!Number.isInteger(id))return {ok:false};
  await db.update(learningMaterials).set({published:fd.get("published")==="on"}).where(eq(learningMaterials.id,id)); revalidatePath("/admin/materials"); revalidatePath("/dashboard?tab=materials"); return {ok:true};
}
export async function createReferralLink(_fd: FormData){
  const user=await getUser();
  if(!user||user.role!=="student")return {ok:false};
  try { await ensureReferralCode(user.id); }
  catch { return {ok:false}; }
  revalidatePath("/dashboard");
  return {ok:true};
}

export async function claimReferralReward(fd:FormData){
  const user=await getUser();
  if(!user||user.role!=="student")return {ok:false,error:"Student account required."};
  const duration=Number(fd.get("duration"));
  const count=Number(fd.get("count"));
  if(!((duration===25&&count===10)||(duration===50&&count===5)))return {ok:false,error:"Choose one of the available reward options."};
  try {
    await db.transaction(async tx=>{
      const [locked]=await tx.select({id:users.id,role:users.role}).from(users).where(eq(users.id,user.id)).for("update");
      if(!locked||locked.role!=="student")throw new Error("forbidden");
      const [qualified]=await tx.select({count:sql<number>`count(*)::int`}).from(referrals)
        .where(and(eq(referrals.referrerId,user.id),eq(referrals.status,"qualified")));
      const [claimed]=await tx.select({count:sql<number>`count(*)::int`}).from(referralRewards)
        .where(and(eq(referralRewards.userId,user.id),eq(referralRewards.rewardType,"referral")));
      const available=Math.floor(Number(qualified?.count||0)/3)-Number(claimed?.count||0);
      if(available<1)throw new Error("not_eligible");
      const [reward]=await tx.insert(referralRewards).values({userId:user.id,duration,lessonsGranted:count,rewardType:"referral",status:"claimed"}).returning({id:referralRewards.id});
      await tx.insert(referralLessonCredits).values({userId:user.id,duration,remainingLessons:count,sourceRewardId:reward.id});
      await tx.insert(transactions).values({userId:user.id,type:"referral_reward",amount:0,note:`Referral reward: ${count} free ${duration}-minute lessons`});
    });
  } catch(e){return {ok:false,error:e instanceof Error&&e.message==="not_eligible"?"Complete three referred friends' first paid lesson before claiming a reward.":"Could not claim the reward. Please refresh and try again."};}
  revalidatePath("/dashboard");
  return {ok:true};
}

export async function createReferralReward(fd:FormData){
  const admin = await requireAdmin();
  const userId=Number(fd.get("userId")); const duration=Number(fd.get("duration")); const count=Number(fd.get("count"));
  if(!Number.isInteger(userId)||!([25,50].includes(duration))||!([5,10].includes(count))||!((duration===25&&count===10)||(duration===50&&count===5)))return {ok:false};
  await db.transaction(async tx=>{
    const [reward]=await tx.insert(referralRewards).values({userId,duration,lessonsGranted:count,rewardType:"admin_bonus",status:"claimed"}).returning({id:referralRewards.id});
    await tx.insert(referralLessonCredits).values({userId,duration,remainingLessons:count,sourceRewardId:reward.id});
    const note = `Admin bonus: ${count} × ${duration}-minute lessons`;
    await tx.insert(transactions).values({userId,type:"lesson_credit_bonus",amount:0,note});
    await tx.insert(adminAuditLogs).values({ adminId: admin.id, targetUserId: userId, action: "lesson_credit_bonus", reference: `referral_reward:${reward.id}`, note, metadata: { duration, lessonsGranted: count, rewardType: "admin_bonus" } });
  });
  revalidatePath("/dashboard"); revalidatePath("/admin"); return {ok:true};
}
