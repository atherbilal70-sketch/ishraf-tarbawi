-- مخطط قاعدة بيانات بوابة الشكاوى (Cloudflare D1)
-- التطبيق: npx wrangler d1 execute ishraf-complaints --file=schema.sql

CREATE TABLE IF NOT EXISTS complaints (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ref             TEXT    NOT NULL UNIQUE,          -- رقم التتبع ISH-YYYY-XXXXXX
  full_name       TEXT    NOT NULL,
  phone           TEXT    NOT NULL,
  email           TEXT    NOT NULL,
  role            TEXT    NOT NULL,                 -- صفة المشتكي
  details         TEXT    NOT NULL,
  attachment_key  TEXT    NOT NULL,                 -- مفتاح الملف في R2 (غير علني)
  attachment_name TEXT    NOT NULL,
  attachment_type TEXT    NOT NULL,
  attachment_size INTEGER NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'قيد المراجعة',
  ip              TEXT,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_complaints_status  ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_created ON complaints(created_at);
CREATE INDEX IF NOT EXISTS idx_complaints_ip      ON complaints(ip, created_at);

-- سجل تدقيق لكل اطّلاع موظف على مرفقات الهوية أو تغيير حالة
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ref        TEXT    NOT NULL,
  action     TEXT    NOT NULL,   -- view_attachment | update_status
  detail     TEXT,
  ip         TEXT,
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_ref ON audit_log(ref);
