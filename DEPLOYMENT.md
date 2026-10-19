# انتشار Lingorain روی GitHub + Vercel + Neon

این پروژه برای **Next.js روی Vercel** و **PostgreSQL روی Neon** تنظیم شده است. ابتدا کد را به GitHub می‌فرستید، Neon را به‌عنوان دیتابیس متصل می‌کنید و سپس پروژه را از GitHub در Vercel Import می‌کنید. هر push جدید به شاخهٔ Production به‌صورت خودکار deployment جدید می‌سازد.

## 0. پیش از شروع

- یک حساب GitHub، Neon و Vercel داشته باشید.
- این ZIP را در یک پوشهٔ جدید استخراج کنید.
- فایل واقعی `.env` را commit نکنید؛ فقط `.env.example` مجاز است.
- اگر Neon شما همین حالا دادهٔ واقعی دارد، قبل از migration یک Neon branch یا backup بسازید و migration را اول روی branch آزمایشی امتحان کنید.

## 1. Push کردن پروژه به GitHub

یک repository خالی بسازید؛ انتخاب **Private** پیشنهاد می‌شود. در PowerShell، از پوشهٔ ریشهٔ پروژه اجرا کنید:

```powershell
git init
git add .
git status
```

قبل از commit مطمئن شوید `.env` و فایل‌های دارای secret در خروجی `git status` نیستند. سپس:

```powershell
git commit -m "Prepare Lingorain for Neon and Vercel"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/lingorain.git
git push -u origin main
```

به‌جای `YOUR-USERNAME` آدرس حساب خودتان را وارد کنید. اگر قبلاً repository و `origin` دارید، دوباره `git init` یا `git remote add` اجرا نکنید؛ فقط commit و push جدید انجام دهید.

## 2. ساخت اتصال Neon

در Neon روی **Connect** برای branch و database موردنظر بزنید و دو connection string بردارید:

- `DATABASE_URL`: رشتهٔ **Pooled**؛ hostname معمولاً `-pooler` دارد و برای درخواست‌های runtime برنامه استفاده می‌شود.
- `DATABASE_DIRECT_URL`: رشتهٔ **Direct**؛ برای اجرای migrationها و فرمان مدیریتی یک‌باره استفاده می‌شود.

از رشته‌های Neon با TLS استفاده کنید و query parameterهای تولیدشده توسط Neon را همان‌طور که هستند نگه دارید. کلمهٔ عبور را در سورس کد یا GitHub قرار ندهید. راهنمای رسمی اتصال Neon: https://neon.com/docs/get-started/connect-neon

## 3. تنظیم Environment Variables در Vercel

در Vercel، از **Add New → Project** repository به نام `lingorain` را Import کنید. Framework باید **Next.js** باشد و Root Directory پوشهٔ ریشهٔ پروژه باشد. Build Command تعریف‌شده در `vercel.json` را حفظ کنید؛ این دستور محیط را بررسی و برنامه را build می‌کند، اما schema دیتابیس را تغییر نمی‌دهد.

در **Settings → Environment Variables** مقادیر زیر را برای **Production** تنظیم کنید:

| Name | مقدار |
|---|---|
| `DATABASE_URL` | اتصال Pooled از Neon |
| `DATABASE_DIRECT_URL` | اتصال Direct از Neon (برای فرمان‌های مدیریتی؛ در build اجرا نمی‌شود) |
| `SESSION_SECRET` | راز تصادفی قوی با حداقل ۳۲ کاراکتر |
| `INTEGRATION_ENCRYPTION_KEY` | راز تصادفیِ جداگانه با حداقل ۳۲ کاراکتر؛ برای رمزنگاری کلیدهای سرویس در پنل ادمین |
| `APP_URL` | origin نهایی HTTPS، مثل `https://lingorain.vercel.app`؛ بدون مسیر اضافی |
| `CRON_SECRET` | راز تصادفی با حداقل ۳۲ کاراکتر برای Vercel Cron پاک‌سازی ضبط‌ها |
| `REMINDER_CRON_SECRET` | راز تصادفی جداگانه برای زمان‌بند ایمیل بیرونی، اگر از آن استفاده می‌کنید |

برای تولید **هر راز** به‌صورت جداگانه، در ترمینال اجرا کنید:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

این دستور را برای هر متغیر جدا اجرا کنید. رازها را در GitHub، کد سمت کلاینت یا `NEXT_PUBLIC_*` نگذارید. پس از تغییر متغیرهای Vercel باید deployment جدید انجام دهید.

**Preview جدا باشد:** متغیرهای Production نباید ناخواسته به دیتابیس زنده در Preview وصل شوند. یک branch جدا در Neon برای Preview بسازید و متغیرهای Preview را جداگانه تنظیم کنید.

## 4. اعمال migration روی Neon

Migrationها را از یک محیط کنترل‌شده و با اتصال Direct اجرا کنید؛ نه از Build Command. اول روی Neon branch آزمایشی اجرا کنید. برای دیتابیس موجود، backup بگیرید و خروجی migration را بررسی کنید.

از PowerShell در پوشهٔ پروژه:

```powershell
npm ci
$env:DATABASE_URL = "PASTE_NEON_DIRECT_CONNECTION_HERE"
$env:DATABASE_DIRECT_URL = $env:DATABASE_URL
$env:ALLOW_PRODUCTION_MIGRATIONS = "true"
npm run db:migrate
Remove-Item Env:ALLOW_PRODUCTION_MIGRATIONS
```

این دستورات ساختار دیتابیس را تغییر می‌دهند؛ آن‌ها را فقط وقتی اجرا کنید که اتصال به Neon branch صحیح را بررسی کرده‌اید و backup لازم را دارید. `npm run db:push` را روی production اجرا نکنید.

## 5. ساخت حساب ادمین اولیه

پس از migration، در همان محیط کنترل‌شده اتصال `DATABASE_URL` را روی اتصال Direct Neon نگه دارید و اجرا کنید:

```powershell
$env:ADMIN_EMAIL = "admin@yourdomain.com"
$env:ADMIN_PASSWORD = "REPLACE_WITH_A_UNIQUE_LONG_PASSWORD"
npx tsx scripts/create-admin.ts
Remove-Item Env:ADMIN_PASSWORD
```

از ایمیل واقعی خودتان و رمز قوی و یکتا استفاده کنید. اسکریپت اگر این ایمیل متعلق به کاربر عادی باشد، نقش آن را خودکار به admin ارتقا نمی‌دهد.

## 6. Deploy در Vercel

پس از تنظیم متغیرهای بالا و آماده شدن schema و ادمین، از Vercel **Deploy** را اجرا کنید یا یک commit جدید به شاخهٔ Production push کنید. هر push بعدی به GitHub به‌طور خودکار deployment می‌سازد. راهنمای رسمی: https://vercel.com/docs/git

Region تابع Vercel را در تنظیمات پروژه طوری انتخاب کنید که تا حد امکان با region دیتابیس Neon و کاربران واقعی هماهنگ باشد؛ پروژه عمداً یک Region ثابت را در `vercel.json` تحمیل نمی‌کند.

## 7. زمان‌بندی یادآوری ایمیل و پاک‌سازی ضبط

### یادآوری ایمیل

- در **Admin → Integrations** کلید Resend و فرستندهٔ تأییدشده را وارد و اتصال را آزمایش کنید.
- endpoint یادآوری: `/api/cron/lesson-reminders`؛ هر فراخوانی باید header زیر را بفرستد: `Authorization: Bearer <secret>`.
- این پروژه به اجرا تقریباً هر دقیقه نیاز دارد تا یادآوری‌های ۳۰ و ۱۰ دقیقه‌ای به‌موقع ارسال شوند.

**اگر Vercel Hobby دارید:** طبق محدودیت Cron رسمی Vercel، زمان‌بندی‌های بیش از یک بار در روز در این پلن مجاز نیست؛ به همین علت cron دقیقه‌ای یادآوری در `vercel.json` پیش‌فرض قرار داده نشده است. یک سرویس زمان‌بندی بیرونی مانند cron-job.org را تنظیم کنید تا هر دقیقه endpoint یادآوری را با `REMINDER_CRON_SECRET` فراخوانی کند. در این حالت `CRON_SECRET` برای پاک‌سازی ضبط توسط Vercel و `REMINDER_CRON_SECRET` برای یادآوری بیرونی مستقل هستند. مستندات: https://vercel.com/docs/cron-jobs/usage-and-pricing

اگر از Vercel Pro/Enterprise با Cron دقیقه‌ای استفاده می‌کنید، می‌توانید job زیر را به `crons` در `vercel.json` اضافه کنید و یادآوری را از خود Vercel اجرا کنید:

```json
{ "path": "/api/cron/lesson-reminders", "schedule": "* * * * *" }
```

در هر دو حالت، `CRON_SECRET` باید برای پاک‌سازی ضبط تنظیم باشد؛ وگرنه درخواست زمان‌بندی‌شدهٔ پاک‌سازی مجاز نخواهد شد.

### پاک‌سازی ضبط‌ها

`vercel.json` پاک‌سازی ضبط‌های منقضی‌شده را یک‌بار در روز اجرا می‌کند. `CRON_SECRET` را در Vercel تنظیم کنید تا Vercel Cron هدر Authorization امن بفرستد. در پنل **Admin → Integrations** باید تنظیمات Daily و webhook آن نیز تکمیل و آزمایش شوند.

## 8. تنظیم سایر شرکت‌ها در Admin → Integrations

| قابلیت | نیاز خارجی |
|---|---|
| یادآوری ایمیل | Resend + دامنه/فرستنده تأییدشده + زمان‌بند |
| فایل خصوصی و مدارک | Supabase Storage؛ bucket باید Private باشد |
| پرداخت | Stripe؛ کلید secret و webhook signing secret و endpoint مطابق مستندات پروژه |
| ویدئوی کلاس و ضبط | Daily؛ API key و webhook، و مجوز cloud recording |
| چت لحظه‌ای | Pusher Channels؛ بدون آن چت با polling احراز هویت‌شده کار می‌کند |
| محدودسازی درخواست بین چند سرور | Upstash Redis؛ توصیه‌شده برای استقرار چندنمونه‌ای |
| کلاس زنده بدون سرویس اختصاصی | Jitsi عمومی fallback است؛ SLA یا حریم خصوصی یک سرویس تحت مالکیت شما را تضمین نمی‌کند |

`INTEGRATION_ENCRYPTION_KEY` باید پیش از ذخیرهٔ کلیدهای این سرویس‌ها تنظیم شده باشد. این کلید را گم یا عوض نکنید مگر اینکه از قبل فرایند مهاجرت/رمزگذاری مجدد credentialهای ذخیره‌شده را آماده کرده باشید.

## 9. پیش از بازکردن سایت برای کاربران

روی staging باید `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build` را اجرا کنید؛ سپس migrationها، ثبت‌نام/ورود، رزرو هم‌زمان چند صندلی، بازپرداخت، پرداخت تکراری Stripe، رضایت و دانلود ضبط، حذف هفت‌روزه و یادآوری ایمیل را با سرویس واقعی آزمایش کنید. در محیط فعلی این بررسی کامل هنوز تأیید نشده است؛ سالم‌بودن ZIP به‌تنهایی به معنی آماده‌بودن برای production نیست.
