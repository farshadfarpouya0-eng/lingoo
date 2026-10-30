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
| `INTEGRATION_ENCRYPTION_KEY` | اختیاری برای نصب تازه؛ در نصب موجود ممکن است داده‌ها با `SESSION_SECRET` رمز شده باشند، پس بدون migration کلید آن را اضافه/عوض نکنید |
| `PAYOUT_ENCRYPTION_KEY` | راز تصادفی مستقل با حداقل ۳۲ کاراکتر؛ برای رمزنگاری اطلاعات حساب برداشت معلمان |
| `APP_URL` | origin نهایی HTTPS، مثل `https://lingorain.vercel.app`؛ بدون مسیر اضافی |
| `CRON_SECRET` | راز تصادفی با حداقل ۳۲ کاراکتر برای زمان‌بند تسویه و پاک‌سازی ضبط‌ها |
| `REMINDER_CRON_SECRET` | راز تصادفی جداگانه برای زمان‌بند یادآوری ایمیل |

برای تولید **هر راز** به‌صورت جداگانه، در ترمینال اجرا کنید:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

این دستور را برای هر متغیر جدا اجرا کنید. رازها را در GitHub، کد سمت کلاینت یا `NEXT_PUBLIC_*` نگذارید. پس از تغییر متغیرهای Vercel باید deployment جدید انجام دهید.

**Preview جدا باشد:** متغیرهای Production نباید ناخواسته به دیتابیس زنده در Preview وصل شوند. یک branch جدا در Neon برای Preview بسازید و متغیرهای Preview را جداگانه تنظیم کنید.

## 4. اعمال migration روی Neon

تمام migrationهای مرتب‌شده از `0000` تا `0015` باید روی دیتابیس هدف اعمال شوند. اسکریپت `db:migrate` فایل‌ها را به ترتیب عددی اجرا می‌کند و در جدول `lingorain_schema_migrations` ثبت می‌کند تا در اجرای بعدی تکرار نشوند. Migrationها را از یک محیط کنترل‌شده و با اتصال Direct اجرا کنید؛ نه از Build Command. اول روی Neon branch آزمایشی اجرا کنید. برای دیتابیس موجود، backup بگیرید و خروجی هر migration را بررسی کنید.

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

برای اینکه تنظیم پیش‌فرض با Vercel Hobby و Pro یکسان و قابل استقرار باشد، زمان‌بندی پرتکرارِ تسویه و یادآوری را عمداً به سرویس بیرونی واگذار کرده‌ایم. زمان‌بند خارجی را با این سه job تنظیم کنید:

| Endpoint | تکرار | Header |
|---|---:|---|
| `/api/cron/lesson-settlement` | هر ۵ دقیقه | `Authorization: Bearer <CRON_SECRET>` |
| `/api/cron/lesson-reminders` | هر ۱ دقیقه | `Authorization: Bearer <REMINDER_CRON_SECRET>` |
| `/api/cron/recordings-cleanup` | هر ۵ دقیقه (برای retry توقف ضبط)؛ پاک‌سازی فایل‌های منقضی نیز در همین فراخوانی انجام می‌شود | `Authorization: Bearer <CRON_SECRET>` |

`vercel.json` فقط پاک‌سازی روزانه را برای Cron داخلی Vercel نگه می‌دارد. اگر Vercel Pro/Enterprise داری و می‌خواهی تسویه/یادآوری داخل خود Vercel اجرا شوند، می‌توانی Cronهای مربوط را با cadence بالا به فایل اضافه کنی؛ روی Hobby این cadence پشتیبانی نمی‌شود. مستندات: https://vercel.com/docs/cron-jobs/usage-and-pricing

### پاک‌سازی ضبط‌ها

`vercel.json` پاک‌سازی ضبط‌های منقضی‌شده را یک‌بار در روز اجرا می‌کند. برای retry سریع وضعیت `stop_pending`، زمان‌بند بیرونی باید همین endpoint را هر ۵ دقیقه با `CRON_SECRET` صدا بزند. زمان‌بند یادآوری فقط از `REMINDER_CRON_SECRET` استفاده می‌کند و به کلیدهای تسویه/ضبط دسترسی ندارد. در پنل **Admin → Integrations** باید تنظیمات Daily و webhook آن نیز تکمیل و آزمایش شوند.


## 8. حفاظت از اطلاعات برداشت معلم

اطلاعات حساب برداشت در نسخه جدید با AES-256-GCM و کلید مستقل `PAYOUT_ENCRYPTION_KEY` ذخیره می‌شود. `PAYOUT_ENCRYPTION_KEY` را به‌صورت راز تصادفی پایدار با حداقل ۳۲ کاراکتر تنظیم کنید؛ تغییر آن بدون رمزنگاری مجدد داده‌ها باعث غیرقابل‌خواندن‌شدن حساب‌های ذخیره‌شده می‌شود. `INTEGRATION_ENCRYPTION_KEY` برای نصب تازه اختیاری است؛ اگر قبلاً credentialها با `SESSION_SECRET` ذخیره شده‌اند، کلید را بدون migration جداگانه اضافه یا عوض نکنید. برای تولید رازها از `openssl rand -base64 48` استفاده کنید. `CRON_SECRET` و `REMINDER_CRON_SECRET` نیز باید دو مقدار مستقل با حداقل ۳۲ کاراکتر باشند.

پس از اجرای تمام migrationها تا `0015_temporary_suspensions.sql` و گرفتن backup، ابتدا اسکریپت را در حالت dry-run اجرا کنید:

```bash
npm run db:encrypt-payout-data
```

خروجی فقط تعداد ردیف‌های نیازمند رمزنگاری را نشان می‌دهد و هیچ مقدار حسابی را چاپ نمی‌کند. پس از بررسی branch دیتابیس و backup، برای اعمال رمزنگاری اجرا کنید:

```bash
npm run db:encrypt-payout-data -- --apply
```

این اسکریپت هم اطلاعات ذخیره‌شده‌ی پروفایل معلم را رمز می‌کند و هم حساب‌های موجود در سابقه برداشت را. پنل مدیریت حساب‌ها را به‌طور پیش‌فرض ماسک می‌کند؛ نمایش کامل فقط با اقدام مدیر و ثبت audit log امکان‌پذیر است.

## 9. تنظیم سایر شرکت‌ها در Admin → Integrations

| قابلیت | نیاز خارجی |
|---|---|
| یادآوری ایمیل | Resend + دامنه/فرستنده تأییدشده + زمان‌بند |
| فایل خصوصی و مدارک | Supabase Storage؛ bucket باید Private باشد |
| پرداخت | Stripe؛ کلید secret و webhook signing secret و endpoint مطابق مستندات پروژه |
| ویدئوی کلاس و ضبط | Daily؛ API key و webhook، و مجوز cloud recording |
| چت لحظه‌ای | Pusher Channels؛ بدون آن چت با polling احراز هویت‌شده کار می‌کند |
| محدودسازی درخواست بین چند سرور | Upstash Redis؛ توصیه‌شده برای استقرار چندنمونه‌ای |
| کلاس زنده بدون سرویس اختصاصی | Jitsi عمومی fallback است؛ SLA یا حریم خصوصی یک سرویس تحت مالکیت شما را تضمین نمی‌کند |

`INTEGRATION_ENCRYPTION_KEY` برای نصب تازه توصیه می‌شود تا credentialها با یک راز مستقل ذخیره شوند. در نصب موجود، اگر رمزگذاری قبلی از `SESSION_SECRET` استفاده کرده است، همان مقدار را حفظ کنید؛ بدون برنامه مهاجرت، کلید را اضافه یا عوض نکنید.

## 9.1. احراز هویت، منطقه زمانی و عملیات مدیریتی

- Migrationهای `0012_auth_audit_timezone_workflow.sql`, `0013_shared_rate_limit_buckets.sql`, `0014_scheduled_job_runs.sql` و `0015_temporary_suspensions.sql` بخشی از schema نسخه جاری هستند و باید به‌ترتیب اعمال شوند.
- ثبت‌نام جدید با `email_verified=false` ایجاد می‌شود و ورود تا زمان تأیید ایمیل بسته است. ایمیل تأیید و بازیابی رمز از Resend استفاده می‌کنند؛ به همین دلیل Resend و `APP_URL` باید پیش از بازکردن ثبت‌نام عمومی تنظیم شوند.
- داده‌های منطقه زمانی با شناسه IANA (برای مثال `Europe/Berlin`) ذخیره می‌شوند تا تغییر ساعت تابستانی براساس قواعد منطقه محاسبه شود.
- جدول `rate_limit_buckets` در migration `0013` fallback مشترک PostgreSQL برای محدودسازی درخواست‌هاست. Upstash اختیاری است.
- جدول `scheduled_job_runs` در migration `0014` تاریخچه اجرای Cron را در Admin → Operations ذخیره می‌کند.
- Migration `0015` زمان پایان تعلیق را اضافه می‌کند؛ مجازات‌ها می‌توانند ۷روزه، ۳۰روزه یا دائمی باشند و تغییرات با شناسه مدیر در Audit ثبت می‌شوند.
- Admin → Audit log تغییرات دستی موجودی، بررسی مدارک و گردش وضعیت برداشت را ثبت می‌کند.
- وضعیت برداشت‌ها: pending → approved → processing → paid؛ رد درخواست از وضعیت‌های مجاز، موجودی رزروشده را به معلم برمی‌گرداند.
- تغییر نقش، بازنشانی رمز توسط مدیر و تعلیق/رفع تعلیق دستی نیز در Audit ثبت می‌شود؛ بازنشانی رمز و تغییر نقش نشست‌های قدیمی را باطل می‌کند.
- تخته کلاس از revision مشترک استفاده می‌کند؛ اگر کاربر دیگری هم‌زمان تغییری ثبت کرده باشد، نسخه محلی بی‌صدا جایگزین نسخه جدید نمی‌شود و کاربر باید نسخه تازه را دریافت کند.

**نکته زمان‌بندی:** زمان‌بند بیرونی برای سه endpoint جدول بالا لازم است. زمان‌بندی دقیق دقیقه‌ای را بدون تأیید پلن Vercel در `vercel.json` قرار ندهید. در Vercel Hobby، زمان‌بندی Cron فقط یک‌بار در روز مجاز است؛ برای یادآوری هر دقیقه و تسویه هر پنج دقیقه از زمان‌بند بیرونی استفاده کنید.

## 10. پیش از بازکردن سایت برای کاربران

روی staging باید `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build` را اجرا کنید؛ سپس migrationها، ثبت‌نام/ورود، رزرو هم‌زمان چند صندلی، بازپرداخت، پرداخت تکراری Stripe، رضایت و دانلود ضبط، حذف هفت‌روزه و یادآوری ایمیل را با سرویس واقعی آزمایش کنید. در محیط فعلی این بررسی کامل هنوز تأیید نشده است؛ سالم‌بودن ZIP به‌تنهایی به معنی آماده‌بودن برای production نیست.
