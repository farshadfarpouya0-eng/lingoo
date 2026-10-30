"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";

type CheckState = "idle" | "ok" | "error";

function permissionLabel(state: PermissionState) {
  return state === "granted" ? "مجاز" : state === "denied" ? "مسدود" : "هنوز درخواست نشده";
}

export default function TeacherClassTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const [camera, setCamera] = useState<CheckState>("idle");
  const [microphone, setMicrophone] = useState<CheckState>("idle");
  const [speaker, setSpeaker] = useState<CheckState>("idle");
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState("در حال بررسی مجوزها…");
  const [secureContext, setSecureContext] = useState(true);
  const [checks, setChecks] = useState({ internet: false, headphones: false, materials: false });

  useEffect(() => {
    setSecureContext(window.isSecureContext);
    let cancelled = false;
    const checkPermissions = async () => {
      try {
        if (!navigator.permissions?.query) {
          if (!cancelled) setPermissionStatus("وضعیت مجوزها توسط این مرورگر قابل بررسی مستقیم نیست؛ با شروع تست، درخواست دسترسی نمایش داده می‌شود.");
          return;
        }
        const [cameraPermission, microphonePermission] = await Promise.all([
          navigator.permissions.query({ name: "camera" as PermissionName }),
          navigator.permissions.query({ name: "microphone" as PermissionName }),
        ]);
        if (!cancelled) setPermissionStatus(`دوربین: ${permissionLabel(cameraPermission.state)} · میکروفون: ${permissionLabel(microphonePermission.state)}`);
        const update = () => {
          if (!cancelled) setPermissionStatus(`دوربین: ${permissionLabel(cameraPermission.state)} · میکروفون: ${permissionLabel(microphonePermission.state)}`);
        };
        cameraPermission.addEventListener("change", update);
        microphonePermission.addEventListener("change", update);
      } catch {
        if (!cancelled) setPermissionStatus("وضعیت مجوزها قابل خواندن نیست؛ برای بررسی، تست دوربین و میکروفون را اجرا کنید.");
      }
    };
    void checkPermissions();
    return () => { cancelled = true; };
  }, []);

  const stopTest = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    setTesting(false);
    setLevel(0);
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    void audioContextRef.current?.close();
  }, []);

  const startTest = async () => {
    setError("");
    setCamera("idle");
    setMicrophone("idle");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("مرورگر یا اتصال فعلی اجازه دسترسی به دوربین و میکروفون را نمی‌دهد. از HTTPS و مرورگر به‌روز استفاده کنید.");
        setCamera("error");
        setMicrophone("error");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCamera(stream.getVideoTracks().length ? "ok" : "error");
      setMicrophone(stream.getAudioTracks().length ? "ok" : "error");
      setTesting(true);

      const AudioContextClass = window.AudioContext;
      if (AudioContextClass && stream.getAudioTracks().length) {
        const context = new AudioContextClass();
        audioContextRef.current = context;
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
        const samples = new Uint8Array(analyser.fftSize);
        const readLevel = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) {
            const centered = (sample - 128) / 128;
            sum += centered * centered;
          }
          setLevel(Math.min(100, Math.round(Math.sqrt(sum / samples.length) * 260)));
          frameRef.current = requestAnimationFrame(readLevel);
        };
        readLevel();
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(name === "NotAllowedError"
        ? "دسترسی دوربین یا میکروفون رد شده است. مجوز آن را از تنظیمات مرورگر فعال کنید."
        : name === "NotFoundError"
          ? "دوربین یا میکروفون متصل پیدا نشد. دستگاه‌ها را بررسی کنید."
          : "تست دستگاه‌ها انجام نشد. اتصال و تنظیمات مرورگر را بررسی کنید.");
      setCamera("error");
      setMicrophone("error");
      stopTest();
    }
  };

  const testSpeaker = async () => {
    try {
      const Context = window.AudioContext;
      if (!Context) throw new Error("unsupported");
      const context = new Context();
      await context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 440;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.56);
      setSpeaker("ok");
      window.setTimeout(() => void context.close(), 700);
    } catch {
      setSpeaker("error");
      setError("پخش صدای آزمایشی در این مرورگر ممکن نشد.");
    }
  };

  const statusText = (state: CheckState) => state === "ok" ? "آماده" : state === "error" ? "نیاز به بررسی" : "تست نشده";
  const statusClass = (state: CheckState) => state === "ok" ? "bg-emerald-50 text-emerald-700" : state === "error" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500";

  return (
    <div className="space-y-6" dir="rtl">
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-teal-700">آماده‌سازی قبل از جلسه</p>
            <h2 className="mt-2 text-xl font-bold text-teal-950">تست کلاس LingoRoom</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">قبل از اولین جلسه، دوربین، میکروفون و صدای سیستم را بررسی کنید تا هنگام کلاس واقعی با تنظیمات دستگاه‌ها درگیر نشوید. این بخش جلسه واقعی ایجاد نمی‌کند و دانش‌آموزی وارد آن نمی‌شود.</p>
          </div>
          <span className="rounded-xl bg-teal-50 p-3 text-teal-700"><Icon name="video" width={25} height={25} /></span>
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,.8fr)]">
          <div className="overflow-hidden rounded-2xl bg-slate-950">
            <div className="relative aspect-video">
              <video ref={videoRef} muted playsInline className={`h-full w-full object-cover ${testing && camera === "ok" ? "block" : "hidden"}`} />
              {(!testing || camera !== "ok") && <div className="absolute inset-0 grid place-items-center text-center text-slate-400"><div><Icon name="video" width={34} height={34} className="mx-auto mb-3 opacity-60"/><p className="text-sm">پیش‌نمایش دوربین بعد از شروع تست نمایش داده می‌شود</p></div></div>}
              {testing && <span className="absolute bottom-3 right-3 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white">پیش‌نمایش فقط برای خودتان</span>}
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-bold text-teal-950"><Icon name="video" width={17}/> دوربین</div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(camera)}`}>{statusText(camera)}</span></div>
              <p className="mt-2 text-xs leading-6 text-slate-500">تصویر خودتان را در پیش‌نمایش بررسی کنید.</p>
            </div>
            <div className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-bold text-teal-950"><Icon name="messages" width={17}/> میکروفون</div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(microphone)}`}>{statusText(microphone)}</span></div>
              <p className="mt-2 text-xs text-slate-500">صحبت کنید و حرکت نشانگر صدا را ببینید.</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600 transition-[width]" style={{ width: `${level}%` }}/></div>
            </div>
            <div className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-bold text-teal-950"><Icon name="chart" width={17}/> بلندگو</div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(speaker)}`}>{statusText(speaker)}</span></div>
              <button type="button" onClick={testSpeaker} className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">پخش صدای آزمایشی</button>
              <p className="mt-2 text-[11px] text-slate-400">اگر صدا را شنیدید، خروجی صدای شما درست کار می‌کند.</p>
            </div>
          </div>
        </div>
        <section className="mt-5 rounded-2xl border border-slate-100 p-4">
          <h3 className="text-sm font-bold text-teal-950">وضعیت مرورگر و مجوزها</h3>
          <p className="mt-2 text-xs leading-6 text-slate-500">{permissionStatus}</p>
          <p className={`mt-2 text-xs font-semibold ${secureContext ? "text-emerald-700" : "text-amber-700"}`}>{secureContext ? "اتصال امن مرورگر فعال است." : "برای دسترسی به دوربین و میکروفون، سایت باید با HTTPS باز شود."}</p>
        </section>
        <section className="mt-5 rounded-2xl border border-slate-100 p-4">
          <h3 className="text-sm font-bold text-teal-950">چک‌لیست آمادگی قبل از کلاس</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={checks.internet} onChange={e => setChecks(v => ({ ...v, internet: e.target.checked }))} className="accent-teal-700" /> اتصال اینترنت بررسی شد</label>
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={checks.headphones} onChange={e => setChecks(v => ({ ...v, headphones: e.target.checked }))} className="accent-teal-700" /> هدفون و محیط مناسب آماده است</label>
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={checks.materials} onChange={e => setChecks(v => ({ ...v, materials: e.target.checked }))} className="accent-teal-700" /> کتاب و محتوای جلسه آماده است</label>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">{Object.values(checks).filter(Boolean).length} از ۳ مورد چک‌لیست تکمیل شده</p>
        </section>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-xs leading-6 text-rose-700">{error}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!testing ? <button type="button" onClick={startTest} className="rounded-xl bg-teal-800 px-5 py-3 text-sm font-bold text-white hover:bg-teal-900">شروع تست دوربین و میکروفون</button> : <button type="button" onClick={stopTest} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">پایان تست و بستن دوربین</button>}
          <Link href="/dashboard?tab=lessons" className="rounded-xl border border-teal-200 px-5 py-3 text-sm font-bold text-teal-800 hover:bg-teal-50">مشاهده کلاس‌های واقعی</Link>
        </div>
      </section>
      <section className="rounded-[22px] border border-amber-100 bg-amber-50/70 p-5">
        <h3 className="text-sm font-bold text-amber-950">روز برگزاری کلاس چه کار کنم؟</h3>
        <ol className="mt-3 space-y-2 text-xs leading-6 text-amber-950/80">
          <li>۱. از بخش «کلاس‌های من»، جلسه تأییدشده را پیدا کنید.</li>
          <li>۲. در زمان مجاز روی «ورود به کلاس» بزنید؛ لینک تست جایگزین کلاس واقعی نیست.</li>
          <li>۳. داخل LingoRoom ابتدا دوربین و میکروفون را بررسی کنید، سپس کتاب و تخته را از ابزارهای همان کلاس باز کنید.</li>
          <li>۴. اگر LingoRoom مشکل داشت، فقط از گزینه پشتیبان جلسه استفاده کنید.</li>
        </ol>
      </section>
    </div>
  );
}
