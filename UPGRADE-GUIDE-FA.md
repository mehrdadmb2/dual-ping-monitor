# راهنمای نصب و ارتقای Dual Ping Monitor v4

این بسته برای جایگزینی کامل فایل‌های پروژه آماده شده است. نسخه‌ی جدید علاوه بر داشبورد، موتور Probe، Worker، ذخیره‌سازی تاریخچه و Workflow گیت‌هاب را نیز به‌روزرسانی می‌کند.

## ۱. قبل از جایگزینی

1. از ریپوی فعلی یک نسخه‌ی پشتیبان بگیر؛ مخصوصاً پوشه‌های `data/` و `docs/data/`.
2. فایل ZIP جدید را استخراج کن.
3. **محتویات پوشه‌ی پروژه داخل ZIP** را در ریشه‌ی ریپوی `mehrdadmb2/dual-ping-monitor` آپلود کن و فایل‌های هم‌نام را جایگزین کن.
4. تاریخچه‌ی قدیمی را حذف نکن. آرشیو کامل همراه داده‌های فعلی ساخته شده و نسخه‌ی جدید، ساختار قدیمی را هم می‌خواند.

فایل‌های مهمی که جایگزین می‌شوند:

- `.github/scripts/ping.js`
- `.github/scripts/merge.js`
- `.github/scripts/validate.js`
- `.github/workflows/monitor.yml`
- `targets.json`
- `cloudflare/worker.js`
- `cloudflare/wrangler.toml`
- `docs/index.html`
- `docs/style.css`
- `docs/script.js`
- `docs/config.js`
- `docs/sw.js`
- `docs/manifest.webmanifest`
- `docs/targets.json`

همچنین فایل‌های راهنما و آیکون جدید در آرشیو وجود دارند.

## ۲. تنظیم GitHub Actions

در ریپو وارد مسیر زیر شو:

`Settings → Actions → General → Workflow permissions`

گزینه‌ی **Read and write permissions** را فعال کن. Workflow جدید خودش `contents: write` را درخواست می‌کند، اما تنظیم دسترسی ریپو نیز باید اجازه‌ی نوشتن بدهد.

در GitHub Pages نیز این تنظیم را بررسی کن:

`Settings → Pages → Build and deployment → Deploy from a branch → main → /docs`

Workflow اصلی باید `.github/workflows/monitor.yml` باشد. اگر Workflowهای زمان‌بندی‌شده‌ی قدیمی برای همین مانیتور باقی مانده‌اند، آن‌ها را غیرفعال کن تا چند موتور هم‌زمان داده‌های تکراری تولید نکنند. Workflowهای نامرتبط پروژه را حذف نکن.

## ۳. انتشار Cloudflare Worker

Worker فعلی با همان نام `dual-ping-worker` حفظ شده است و URL قبلی قرار است بدون تغییر باقی بماند.

در PowerShell یا ترمینال، از ریشه‌ی ریپو اجرا کن:

```powershell
npx wrangler login
npx wrangler deploy --config cloudflare/wrangler.toml
```

اگر Wrangler قبلاً به اکانت Cloudflare وصل شده، دستور login لازم نیست.

### تنظیم توکن ذخیره‌سازی GitHub

Worker برای ذخیره‌ی تاریخچه‌ی Cloudflare باید اجازه‌ی نوشتن در ریپو داشته باشد. یک Fine-grained Personal Access Token بساز که فقط به ریپوی زیر دسترسی داشته باشد:

`mehrdadmb2/dual-ping-monitor`

مجوز موردنیاز:

`Repository permissions → Contents → Read and write`

سپس از ریشه‌ی ریپو اجرا کن:

```powershell
npx wrangler secret put GH_TOKEN --config cloudflare/wrangler.toml
```

توکن را در ورودی مخفی ترمینال Paste کن. آن را در فایل، `wrangler.toml`، GitHub Pages یا کد JavaScript قرار نده. اگر `GH_TOKEN` از قبل روی Worker تنظیم شده، برای Deploy مجدد نیازی به ساخت دوباره‌ی آن نیست.

## ۴. اجرای اولین پایش

1. در GitHub وارد تب **Actions** شو.
2. Workflow با نام **Dual Ping Monitor v4** را باز کن.
3. روی **Run workflow** بزن.
4. پس از پایان موفق، فایل‌های `data/github/`، `data/merged/`، `data/index.json` و کپی عمومی آن‌ها در `docs/data/` به‌روزرسانی می‌شوند.
5. Worker نیز هر پنج دقیقه Snapshot مستقل خودش را در `docs/data/cloudflare/` ذخیره می‌کند.

GitHub Actions هر ۱۰ دقیقه و Worker هر ۵ دقیقه اجرا می‌شوند. این دو منبع عمداً پوشه‌های متفاوتی را می‌نویسند تا به‌روزرسانی هم‌زمان باعث overwrite تاریخچه نشود.

## ۵. بررسی سلامت و مسیرها

این آدرس‌ها را باز کن:

| کاربرد | آدرس |
|---|---|
| داشبورد | `https://mehrdadmb2.github.io/dual-ping-monitor/` |
| سلامت Worker | `https://dual-ping-worker.game-developer-mb.workers.dev/health` |
| آخرین نمونه‌ی زمان‌بندی‌شده | `https://dual-ping-worker.game-developer-mb.workers.dev/api/latest` |
| Probe کامل و فوری | `https://dual-ping-worker.game-developer-mb.workers.dev/api/status` |
| تنظیمات اهداف | `https://dual-ping-worker.game-developer-mb.workers.dev/api/config` |
| فهرست تاریخچه‌ی Pages | `https://mehrdadmb2.github.io/dual-ping-monitor/data/index.json` |

داشبورد برای تازه‌سازی خودکار از `/api/latest` استفاده می‌کند؛ این endpoint اول KV (در صورت اتصال) و سپس آخرین Snapshot عمومی GitHub را می‌خواند تا برای هر بار بازدید، ۴۴ Probe تکراری اجرا نشود. دکمه‌ی بروزرسانی و میانبر `R` از `/api/status` برای اجرای Probe کامل و فوری استفاده می‌کنند.

در پاسخ `/health` مقدار `publisherConfigured` باید `true` باشد تا نشان دهد تنظیمات انتشار تاریخچه وجود دارند. این مقدار به‌تنهایی معتبر بودن توکن را تضمین نمی‌کند؛ لاگ Worker و ساخته‌شدن فایل روزانه را هم بررسی کن.

برای مشاهده‌ی گزارش‌های Worker:

```powershell
npx wrangler tail --config cloudflare/wrangler.toml
```

## ۶. تغییرات مهم در تحلیل وضعیت

- `HTTP 2xx` و `3xx`: سرویس پاسخ داده و وضعیت `up` می‌گیرد.
- `HTTP 4xx`: سرور در دسترس بوده اما درخواست را محدود، رد یا Rate-limit کرده؛ وضعیت `degraded` می‌گیرد.
- `HTTP 5xx`: خطای سمت سرویس/سرور؛ وضعیت `down` می‌گیرد.
- ICMP فقط یکی از سیگنال‌هاست. اگر HTTP سالم باشد، مسدود بودن Ping به‌تنهایی سرویس را Down نمی‌کند.
- برای DNS، یک Query واقعی از طریق DNS-over-HTTPS ارسال و پاسخ از نظر ID، RCODE و Answer بررسی می‌شود.
- Cloudflare Workers داده‌ی ICMP تولید نمی‌کند؛ در داشبورد این مورد «پشتیبانی‌نشده» باقی می‌ماند و به‌عنوان Packet Loss ساختگی نمایش داده نمی‌شود.

## ۷. سقف اهداف و عملکرد

نسخه‌ی فعلی ۳۸ سایت و ۶ Resolver را پایش می‌کند؛ مجموع ۴۴ هدف. این عدد عمداً برای حفظ فضای لازم جهت ذخیره‌سازی تاریخچه و Retryهای GitHub انتخاب شده است. Worker با پنج Probe هم‌زمان کار می‌کند تا به سقف اتصال خروجی نزدیک نشود. برای افزودن هدف جدید، هر دو بخش `targets.json` و کاتالوگ پیش‌فرض Worker باید به‌روزرسانی شوند؛ Validator این دو را با هم تطبیق می‌دهد و در صورت ناهماهنگی، Workflow را پیش از Probe متوقف می‌کند.

## ۸. خطاهای متداول

| نشانه | علت محتمل | اقدام |
|---|---|---|
| `publisherConfigured: false` | `GH_TOKEN` تنظیم نشده یا `GH_REPO` اشتباه است | Secret و متغیرهای Wrangler را بررسی کن. |
| GitHub `401` | توکن نامعتبر، منقضی یا لغوشده | توکن تازه بساز و Secret را جایگزین کن. |
| GitHub `403` | مجوز Contents کافی نیست، دسترسی ریپو وجود ندارد یا محدودیت API | دسترسی Fine-grained token و لاگ Worker را بررسی کن. |
| `404` در خواندن فایل روزانه | فایل آن روز هنوز ساخته نشده | برای فایل جدید طبیعی است؛ Worker باید آن را ایجاد کند. |
| داشبورد بدون داده | Pages هنوز Deploy نشده یا کش مرورگر قدیمی است | وضعیت Actions/Pages را بررسی و `Ctrl + F5` بزن. |
| API زنده جواب نمی‌دهد | Probe طولانی، اختلال Worker یا محدودیت مقصدها | `/health` و `wrangler tail` را بررسی کن. |
| بعضی سایت‌ها `degraded` هستند | پاسخ 403/404/429 یا محدودیت ضدربات | این وضعیت به معنی قطع کامل شبکه نیست؛ HTTP status را در جزئیات بررسی کن. |
| تاریخچه‌ی Cloudflare ساخته نمی‌شود ولی API زنده است | مشکل `GH_TOKEN` یا API نوشتن GitHub | Secret و مجوز Contents را بررسی کن؛ Live API مستقل است. |

## ۹. امکانات رابط کاربری

- پنج پوسته‌ی مستقل با ذخیره‌ی انتخاب در مرورگر
- جستجو، دسته‌بندی، فیلتر گروهی و مرتب‌سازی
- جزئیات هر هدف و آخرین کد HTTP، DNS، ICMP، تأخیر، Jitter و Packet Loss
- نمودار تأخیر در بازه‌های ۱ ساعت، ۶ ساعت، ۲۴ ساعت و ۷ روز
- مقایسه‌ی دو نقطه‌ی پایش و رویدادهای فعال
- خروجی JSON و CSV
- تازه‌سازی دوره‌ای کم‌هزینه از آخرین Snapshot زمان‌بندی‌شده؛ اجرای Probe کامل و فوری با دکمه‌ی بروزرسانی
- میانبرها: `/` جستجو، `R` بروزرسانی، `T` تغییر تم، `?` نمایش راهنما و اعداد ۱ تا ۴ برای بازه‌ی نمودار
- پشتیبانی از کش پوسته و بارگذاری آفلاین آخرین نسخه‌ی ذخیره‌شده

---

**نکته:** فایل‌ها آماده‌ی جایگزینی هستند، اما انتشار روی GitHub و Deploy کردن Worker باید در اکانت خودت انجام شود. بسته‌ی تحویلی هیچ توکن یا Secret شخصی در خودش ندارد.
