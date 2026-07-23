# باكند بوابة الشكاوى — Cloudflare Worker

خدمة خلفية لاستلام الشكاوى وتخزين مرفقات الهوية بشكل خاص وتوليد أرقام التتبع، مبنية على:

- **Cloudflare Workers** — منطق الـ API.
- **D1** — قاعدة بيانات SQL لسجلات الشكاوى وسجل التدقيق.
- **R2** — تخزين صور الهوية بشكل **خاص** (لا يُتاح للعامة؛ لا يُقرأ إلا عبر مسار محمي بمفتاح الموظف).

## المسارات (API)

| الطريقة | المسار | الوصف | الحماية |
|---|---|---|---|
| `POST` | `/api/complaints` | استلام شكوى (multipart) + المرفق، توليد رقم التتبع | علني |
| `GET` | `/api/complaints/:ref` | حالة الشكوى (بيانات محدودة: الحالة، الصفة، التاريخ) | علني |
| `GET` | `/api/admin/stats` | إحصائيات: الإجمالي وعدد كل حالة | `x-admin-key` |
| `GET` | `/api/admin/export` | تصدير CSV للشكاوى (يحترم `?status=&q=`) | `x-admin-key` |
| `GET` | `/api/admin/audit` | سجل التدقيق `?ref=&limit=` | `x-admin-key` |
| `GET` | `/api/admin/complaints` | قائمة الشكاوى مع فلترة `?status=&q=&page=&perPage=` | `x-admin-key` |
| `PATCH` | `/api/admin/complaints/:ref` | تحديث الحالة `{ "status": "قيد المعالجة" }` | `x-admin-key` |
| `GET` | `/api/admin/complaints/:ref/attachment` | تنزيل صورة الهوية (+ تسجيل تدقيق) | `x-admin-key` |

الحالات المسموحة: `قيد المراجعة`، `قيد المعالجة`، `منجزة`، `مرفوضة`.

## الأمان المطبّق

- تحقق كامل من المدخلات في الخادم (لا يُعتمد على تحقق المتصفح).
- فحص النوع الحقيقي للملف عبر التوقيع الثنائي (magic bytes) وليس الامتداد، وحد أقصى 5MB.
- المرفقات مخزّنة في R2 خاص باسم عشوائي؛ لا رابط علني — التنزيل عبر مسار محمي فقط.
- سجل تدقيق لكل اطّلاع على مرفق أو تغيير حالة (مع الـ IP والوقت)، ويُعرض في لوحة الإدارة.
- تحديد المعدل: حد أقصى لعدد الشكاوى من نفس الـ IP في الساعة (`RATE_LIMIT_PER_HOUR`).
- **حماية Turnstile (CAPTCHA)** اختيارية: عند ضبط `TURNSTILE_SECRET` يتحقق الخادم من رمز
  التحقق البشري قبل قبول الشكوى، وتظهر أداة التحقق في الواجهة عند ضبط `TURNSTILE_SITE_KEY`
  في `assets/js/config.js`. بدونهما تعمل البوابة دون تحقق بشري.
- CORS مقيّد بأصل الموقع عبر `ALLOWED_ORIGIN`.

## الإشعارات البريدية (اختيارية)

عند ضبط السرين `RESEND_API_KEY` و`EMAIL_FROM` يرسل الخادم بريداً تلقائياً:

- **عند استلام الشكوى** — تأكيد للمشتكي يتضمن رقم التتبع.
- **عند تغيير الحالة** — إشعار بالحالة الجديدة.

يستخدم خدمة [Resend](https://resend.com) (REST بسيط)، ويتطلب نطاقاً مُوثّقاً في حساب Resend
ليكون `EMAIL_FROM` منه. إن لم يُضبط المفتاحان تعمل البوابة كاملةً دون إرسال بريد (بلا أعطال).

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM   # no-reply@your-verified-domain
```

## خطوات النشر

يتطلب حساب Cloudflare و`npx wrangler login` لمرة واحدة.

```bash
cd official-website/backend
npm install

# 1) أنشئ قاعدة D1 وانسخ database_id إلى wrangler.toml
npx wrangler d1 create ishraf-complaints

# 2) أنشئ حاوية R2 الخاصة
npx wrangler r2 bucket create ishraf-id-attachments

# 3) هيّئ الجداول (محلياً للتطوير، وعن بُعد للإنتاج)
npm run db:init          # محلي
npm run db:init:remote   # على قاعدة الإنتاج

# 4) اضبط مفتاح الموظفين للمسارات المحمية
npx wrangler secret put ADMIN_KEY

# 5) شغّل محلياً أو انشر
npm run dev
npm run deploy
```

بعد النشر ستحصل على رابط مثل `https://ishraf-complaints.<حسابك>.workers.dev`.

## ربط الواجهة الأمامية

في `official-website/assets/js/config.js` ضع الرابط:

```js
window.SITE_CONFIG = { API_BASE: 'https://ishraf-complaints.<حسابك>.workers.dev' };
```

عند ترك `API_BASE` فارغاً يبقى الموقع يعمل بالوضع التجريبي (حفظ محلي في المتصفح) دون خادم.
وفي الإنتاج اضبط `ALLOWED_ORIGIN` في `wrangler.toml` على أصل الموقع الرسمي بدل `*`.

## أمثلة استخدام لوحة الإدارة

```bash
# قائمة الشكاوى قيد المراجعة
curl -H "x-admin-key: $ADMIN_KEY" \
  "https://ishraf-complaints.<حسابك>.workers.dev/api/admin/complaints?status=قيد المراجعة"

# تحديث حالة شكوى
curl -X PATCH -H "x-admin-key: $ADMIN_KEY" -H "content-type: application/json" \
  -d '{"status":"قيد المعالجة"}' \
  "https://ishraf-complaints.<حسابك>.workers.dev/api/admin/complaints/ISH-2026-123456"
```
