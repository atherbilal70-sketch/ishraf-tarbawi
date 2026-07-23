// باكند بوابة الشكاوى — مديرية الإشراف التربوي
// Cloudflare Worker + D1 (سجلات) + R2 (مرفقات الهوية، تخزين خاص غير علني)
//
// المسارات:
//   POST   /api/complaints                         استلام شكوى + مرفق، توليد رقم تتبع
//   GET    /api/complaints/:ref                     الاستعلام عن الحالة (بيانات محدودة، علني)
//   GET    /api/admin/complaints                    (محمي) قائمة الشكاوى مع فلترة
//   PATCH  /api/admin/complaints/:ref               (محمي) تحديث الحالة
//   GET    /api/admin/complaints/:ref/attachment    (محمي) تنزيل صورة الهوية + تسجيل تدقيق
//
// الأسرار/الإعدادات (wrangler secret / vars):
//   ADMIN_KEY            مفتاح الموظفين للمسارات المحمية (إلزامي لتفعيلها)
//   ALLOWED_ORIGIN       أصل الموقع المسموح له بـ CORS (افتراضي: *)
//   RATE_LIMIT_PER_HOUR  حد الشكاوى من نفس الـ IP في الساعة (افتراضي: 5)

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const STATUSES = ['قيد المراجعة', 'قيد المعالجة', 'منجزة', 'مرفوضة'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const cors = corsHeaders(env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    try {
      // POST /api/complaints
      if (path === '/api/complaints' && request.method === 'POST') {
        return await submitComplaint(request, env, cors);
      }

      // GET /api/complaints/:ref
      let m = path.match(/^\/api\/complaints\/([A-Za-z0-9-]+)$/);
      if (m && request.method === 'GET') {
        return await trackComplaint(m[1], env, cors);
      }

      // GET /api/admin/complaints
      if (path === '/api/admin/complaints' && request.method === 'GET') {
        return await adminList(request, env, cors, url);
      }

      // PATCH /api/admin/complaints/:ref
      m = path.match(/^\/api\/admin\/complaints\/([A-Za-z0-9-]+)$/);
      if (m && request.method === 'PATCH') {
        return await adminUpdate(m[1], request, env, cors);
      }

      // GET /api/admin/complaints/:ref/attachment
      m = path.match(/^\/api\/admin\/complaints\/([A-Za-z0-9-]+)\/attachment$/);
      if (m && request.method === 'GET') {
        return await adminAttachment(m[1], request, env, cors);
      }

      return json({ error: 'المسار غير موجود' }, 404, cors);
    } catch (err) {
      return json({ error: 'حدث خطأ غير متوقع في الخادم' }, 500, cors);
    }
  }
};

// ---------- استلام شكوى ----------
async function submitComplaint(request, env, cors) {
  if (!env.DB || !env.ATTACHMENTS) {
    return json({ error: 'الخدمة غير مهيأة بعد (قاعدة البيانات أو التخزين)' }, 503, cors);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'صيغة الطلب غير صالحة (يتوقع multipart/form-data)' }, 400, cors);
  }

  const fullName = str(form.get('fullname'));
  const phone = str(form.get('phone')).replace(/[\s-]/g, '');
  const email = str(form.get('email'));
  const role = str(form.get('role'));
  const details = str(form.get('details'));
  const file = form.get('file');

  // التحقق من الخادم (إلزامي — لا يُعتمد على تحقق المتصفح)
  const errors = {};
  if (fullName.split(/\s+/).filter(Boolean).length < 3) errors.fullname = 'الاسم الثلاثي مطلوب (ثلاث كلمات على الأقل).';
  if (!/^07[0-9]{9}$/.test(phone)) errors.phone = 'رقم هاتف عراقي غير صحيح.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'بريد إلكتروني غير صحيح.';
  if (!role) errors.role = 'صفة المشتكي مطلوبة.';
  if (details.length < 30) errors.details = 'تفاصيل الشكوى قصيرة جداً (30 حرفاً على الأقل).';

  if (!file || typeof file.arrayBuffer !== 'function') {
    errors.file = 'إرفاق صورة الهوية إجباري.';
  } else {
    if (!ALLOWED_TYPES.includes(file.type)) errors.file = 'صيغة الملف غير مقبولة (PDF أو JPEG أو PNG).';
    if (file.size > MAX_FILE_SIZE) errors.file = 'حجم الملف يتجاوز 5 ميغابايت.';
    if (file.size === 0) errors.file = 'الملف فارغ.';
  }

  if (Object.keys(errors).length) {
    return json({ error: 'تحقّق من الحقول', fields: errors }, 422, cors);
  }

  // فحص النوع الحقيقي عبر البايتات الأولى (لا يُعتمد على الامتداد وحده)
  const bytes = new Uint8Array(await file.arrayBuffer());
  const realType = sniffType(bytes);
  if (!realType || realType !== file.type) {
    return json({ error: 'تحقّق من الحقول', fields: { file: 'محتوى الملف لا يطابق نوعه المعلن.' } }, 422, cors);
  }

  // تحديد المعدل: حد الشكاوى من نفس الـ IP خلال ساعة
  const ip = request.headers.get('cf-connecting-ip') || '';
  const limit = parseInt(env.RATE_LIMIT_PER_HOUR || '5', 10);
  if (ip) {
    const sinceHour = new Date(Date.now() - 3600000).toISOString();
    const { results } = await env.DB.prepare(
      'SELECT COUNT(*) AS c FROM complaints WHERE ip = ? AND created_at > ?'
    ).bind(ip, sinceHour).all();
    if (results[0].c >= limit) {
      return json({ error: 'تم تجاوز عدد الشكاوى المسموح خلال ساعة. حاول لاحقاً.' }, 429, cors);
    }
  }

  const now = new Date().toISOString();
  const ext = realType === 'application/pdf' ? 'pdf' : realType === 'image/png' ? 'png' : 'jpg';

  // توليد رقم تتبع فريد مع إعادة المحاولة عند التصادم
  let ref;
  for (let attempt = 0; attempt < 6; attempt++) {
    ref = generateRef();
    const key = `ids/${ref}.${ext}`;
    try {
      await env.ATTACHMENTS.put(key, bytes, {
        httpMetadata: { contentType: realType },
        customMetadata: { ref, originalName: file.name || `id.${ext}` }
      });
      await env.DB.prepare(
        `INSERT INTO complaints
          (ref, full_name, phone, email, role, details,
           attachment_key, attachment_name, attachment_size, attachment_type,
           status, ip, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        ref, fullName, phone, email, role, details,
        key, (file.name || `id.${ext}`).slice(0, 255), file.size, realType,
        'قيد المراجعة', ip, now, now
      ).run();
      return json({ ref, status: 'قيد المراجعة', message: 'تم استلام شكواك بنجاح.' }, 201, cors);
    } catch (e) {
      // تصادم رقم التتبع (UNIQUE) → نظّف المرفق وأعد المحاولة
      await env.ATTACHMENTS.delete(key).catch(() => {});
      if (attempt === 5) {
        return json({ error: 'تعذر إنشاء الشكوى، حاول مرة أخرى.' }, 500, cors);
      }
    }
  }
}

// ---------- الاستعلام عن الحالة (علني، بيانات محدودة) ----------
async function trackComplaint(ref, env, cors) {
  if (!env.DB) return json({ error: 'الخدمة غير مهيأة' }, 503, cors);
  const { results } = await env.DB.prepare(
    'SELECT ref, role, status, created_at FROM complaints WHERE ref = ?'
  ).bind(ref.toUpperCase()).all();

  if (!results.length) {
    return json({ error: 'لم يُعثر على شكوى بهذا الرقم.' }, 404, cors);
  }
  const r = results[0];
  return json({ ref: r.ref, role: r.role, status: r.status, created_at: r.created_at }, 200, cors);
}

// ---------- (محمي) قائمة الشكاوى ----------
async function adminList(request, env, cors, url) {
  const guard = requireAdmin(request, env, cors);
  if (guard) return guard;

  const status = url.searchParams.get('status');
  const q = str(url.searchParams.get('q'));
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get('perPage') || '20', 10)));

  const where = [];
  const args = [];
  if (status && STATUSES.includes(status)) { where.push('status = ?'); args.push(status); }
  if (q) { where.push('(full_name LIKE ? OR ref LIKE ? OR email LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = (await env.DB.prepare(`SELECT COUNT(*) AS c FROM complaints ${clause}`).bind(...args).all()).results[0].c;
  const { results } = await env.DB.prepare(
    `SELECT ref, full_name, phone, email, role, details, status, created_at, updated_at
     FROM complaints ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...args, perPage, (page - 1) * perPage).all();

  return json({ total, page, perPage, items: results }, 200, cors);
}

// ---------- (محمي) تحديث الحالة ----------
async function adminUpdate(ref, request, env, cors) {
  const guard = requireAdmin(request, env, cors);
  if (guard) return guard;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'طلب غير صالح' }, 400, cors); }
  const status = str(body.status);
  if (!STATUSES.includes(status)) {
    return json({ error: 'حالة غير معروفة', allowed: STATUSES }, 422, cors);
  }

  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    'UPDATE complaints SET status = ?, updated_at = ? WHERE ref = ?'
  ).bind(status, now, ref.toUpperCase()).run();

  if (!res.meta.changes) {
    return json({ error: 'لم يُعثر على الشكوى' }, 404, cors);
  }
  await logAudit(env, ref.toUpperCase(), 'update_status', status, request);
  return json({ ref: ref.toUpperCase(), status }, 200, cors);
}

// ---------- (محمي) تنزيل صورة الهوية ----------
async function adminAttachment(ref, request, env, cors) {
  const guard = requireAdmin(request, env, cors);
  if (guard) return guard;
  if (!env.ATTACHMENTS) return json({ error: 'التخزين غير مهيأ' }, 503, cors);

  const { results } = await env.DB.prepare(
    'SELECT attachment_key, attachment_type, attachment_name FROM complaints WHERE ref = ?'
  ).bind(ref.toUpperCase()).all();
  if (!results.length) return json({ error: 'لم يُعثر على الشكوى' }, 404, cors);

  const obj = await env.ATTACHMENTS.get(results[0].attachment_key);
  if (!obj) return json({ error: 'المرفق غير موجود' }, 404, cors);

  await logAudit(env, ref.toUpperCase(), 'view_attachment', results[0].attachment_name, request);

  return new Response(obj.body, {
    status: 200,
    headers: {
      'content-type': results[0].attachment_type,
      'content-disposition': `attachment; filename="${sanitizeFilename(results[0].attachment_name)}"`,
      'cache-control': 'no-store',
      ...cors
    }
  });
}

// ---------- أدوات ----------
function requireAdmin(request, env, cors) {
  if (!env.ADMIN_KEY) return json({ error: 'لوحة الإدارة غير مفعّلة على الخادم' }, 503, cors);
  if (request.headers.get('x-admin-key') !== env.ADMIN_KEY) {
    return json({ error: 'غير مصرح' }, 401, cors);
  }
  return null;
}

async function logAudit(env, ref, action, detail, request) {
  const ip = request.headers.get('cf-connecting-ip') || '';
  await env.DB.prepare(
    'INSERT INTO audit_log (ref, action, detail, ip, created_at) VALUES (?,?,?,?,?)'
  ).bind(ref, action, (detail || '').slice(0, 255), ip, new Date().toISOString()).run().catch(() => {});
}

function generateRef() {
  const year = new Date().getFullYear();
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000;
  return `ISH-${year}-${n}`;
}

// فحص النوع عبر التوقيع الثنائي (magic bytes)
function sniffType(b) {
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf'; // %PDF
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  return null;
}

function sanitizeFilename(name) {
  return String(name).replace(/[^\w.\-؀-ۿ ]+/g, '_').slice(0, 120) || 'attachment';
}

function str(v) {
  return (v == null ? '' : String(v)).trim();
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-admin-key',
    'Access-Control-Max-Age': '86400'
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors }
  });
}
