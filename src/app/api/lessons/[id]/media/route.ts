import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { canAccessLesson } from "@/lib/lesson-access";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg"];
const MAX_FILE_SIZE = 15 * 1024 * 1024;

declare global {
  var __lessonMediaMap: Map<number, Array<{ id: string; name: string; type: string; url: string; size: number; createdAt: string; uploadedBy: string }>> | undefined;
}
if (!global.__lessonMediaMap) {
  global.__lessonMediaMap = new Map();
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lessonId = Number((await params).id);
  if (!Number.isInteger(lessonId) || !(await canAccessLesson(lessonId, user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const items = global.__lessonMediaMap?.get(lessonId) || [];
  return NextResponse.json({ items });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lessonId = Number((await params).id);
  if (!Number.isInteger(lessonId) || !(await canAccessLesson(lessonId, user.id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "no_file" }, { status: 400 });

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "too_large", message: "File exceeds 15MB limit" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "invalid_type", message: "Only PNG, JPG, WebP and MP3, WAV allowed" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    const item = {
      id: Math.random().toString(36).substring(2, 9),
      name: file.name.slice(0, 80),
      type: file.type.startsWith("image/") ? "image" : "audio",
      url: dataUrl,
      size: file.size,
      createdAt: new Date().toISOString(),
      uploadedBy: user.name,
    };

    const current = global.__lessonMediaMap?.get(lessonId) || [];
    current.unshift(item);
    if (current.length > 10) current.pop();
    global.__lessonMediaMap?.set(lessonId, current);

    return NextResponse.json({ ok: true, item });
  } catch (err: any) {
    return NextResponse.json({ error: "upload_failed", message: err?.message }, { status: 500 });
  }
}
