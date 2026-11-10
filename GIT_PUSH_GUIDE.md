# راهنمای امن پوش کردن Lingorain به GitHub

ریپوی هدف: `https://github.com/farshadfarpouya0-eng/lingoo`

## وضعیت فعلی این پوشه

این پوشه در محیط فعلی `.git` ندارد. بنابراین آن را با `git init` و `push --force` روی ریپوی قبلی هل ندهید؛ این کار می‌تواند تاریخچه و فایل‌های ریموت را خراب کند. روش امن این است که ریپوی موجود را clone کنید، فایل‌های اصلاح‌شده را روی آن کپی کنید، تغییرات را review کنید و بعد commit/push انجام دهید.

## چه چیزهایی باید بمانند / کامیت شوند

- `src/` تمام سورس برنامه
- `public/` شامل تصاویر، لوگو، `pdf.worker.min.mjs` و `pdf-assets/` چون PDF.js به آن‌ها نیاز دارد
- `drizzle/` تمام migrationها، مخصوصاً `0018_crypto_network_settings.sql`
- `scripts/` اسکریپت‌های migration، تست و استقرار
- `docs/` و فایل‌های راهنمای Markdown
- `package.json` و `package-lock.json`
- `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`
- `vercel.json`, `netlify.toml` و کانفیگ‌های Drizzle
- `.env.example` فقط نمونه بدون secret
- `.gitignore`

## چه چیزهایی نباید کامیت شوند

- `node_modules/`
- `.next/`, `.netlify/`, `.vercel/`, `out/`, `coverage/`
- `.env`, `.env.local`, `.env.production` و هر فایل دارای secret واقعی
- کلیدهای خصوصی `*.pem`, `*.key`، dump دیتابیس، بکاپ محلی
- `playwright-report/`, `test-results/`, `artifacts/`, `*.tsbuildinfo`, لاگ‌ها
- `public/downloads/` اگر فایل موقت preview دارد

فایل‌های Markdown قدیمی در روت لازم نیستند برای build، اما حذف آن‌ها ضروری نیست. اگر خواستید تمیزتر شود، آن‌ها را به `docs/history/` منتقل کنید؛ حذف کورکورانه توصیه نمی‌شود چون بعضی راهنماهای استقرار به آن‌ها ارجاع می‌دهند.

## روش پیشنهادی: حفظ تاریخچه ریپوی قبلی

در ترمینال سیستم خودتان، خارج از این پوشه:

```bash
git clone https://github.com/farshadfarpouya0-eng/lingoo.git lingoo-push
cd lingoo-push
git switch -c fix/classroom-materials-crypto
```

سپس فایل‌های پروژه اصلاح‌شده را از پوشه فعلی به `lingoo-push` کپی کنید. اگر `rsync` دارید:

```bash
rsync -av \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.netlify' \
  --exclude '.vercel' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '*.tsbuildinfo' \
  --exclude 'playwright-report' \
  --exclude 'test-results' \
  /path/to/current-lingorain/ \
  ./
```

نکته: عمداً `--delete` نگذاشته‌ایم تا فایل موجود در ریموت ناخواسته حذف نشود. بعد از کپی، `git status` را بررسی کنید. اگر دقیقاً می‌خواهید ریموت آینه این پوشه شود و مطمئن هستید فایل‌های ریموت دیگر لازم نیستند، می‌توانید با احتیاط `--delete` اضافه کنید.

## بررسی قبل از commit

```bash
git status --short
git diff --stat
git check-ignore .env
git ls-files --error-unmatch .env 2>/dev/null && echo 'WARNING: .env is tracked' || echo 'OK: .env is not tracked'
```

`git check-ignore .env` باید `.env` را چاپ کند. اگر `.env` قبلاً در ریپو track شده باشد، فقط ignore کافی نیست:

```bash
git rm --cached .env
git commit -m "Remove local environment file from tracking"
```

اگر secret واقعی قبلاً push شده، آن secret را rotate کنید؛ حذف از تاریخچه Git به‌تنهایی کافی نیست.

## تست و push

```bash
npm ci
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
git add -A
git commit -m "Fix classroom video, responsive workspace, materials and crypto settings"
git push -u origin fix/classroom-materials-crypto
```

سپس در GitHub Pull Request بسازید و بعد از review به `main` merge کنید. اگر مستقیم به `main` مجاز هستید و branch protection ندارید:

```bash
git switch main
git merge fix/classroom-materials-crypto
git push origin main
```

از `git push --force` روی `main` استفاده نکنید مگر کاملاً بدانید چرا لازم است.

## بعد از push / استقرار

- Push به GitHub به‌تنهایی migration دیتابیس production را اجرا نمی‌کند.
- برای Neon/Vercel ابتدا backup بگیرید، سپس migrationهای عقب‌مانده تا `0018` را با روش کنترل‌شده `DEPLOYMENT.md` و `scripts/run-migrations.mjs` اعمال کنید.
- روی production از `drizzle-kit push` استفاده نکنید.
- متغیرهای محیطی واقعی را در Vercel/Netlify تنظیم کنید: `DATABASE_URL`, `DATABASE_DIRECT_URL`, `SESSION_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, `PAYOUT_ENCRYPTION_KEY`, `APP_URL`, `CRON_SECRET`, `REMINDER_CRON_SECRET` و کلیدهای سرویس‌های فعال.
- برای ویدیوی واقعی، JaaS یا Jitsi اختصاصی را در Admin → Integrations تنظیم کنید.
- برای کریپتو، آدرس‌های دریافت و شبکه‌ها را در Admin → Crypto Settings فعال کنید.
