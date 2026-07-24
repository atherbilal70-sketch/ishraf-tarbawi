#!/usr/bin/env bash
# نشر باكند بوابة الشكاوى إلى Cloudflare بأمر واحد.
# يُنشئ قاعدة D1 ومخزن R2 إن لم يوجدا، ويربط معرّف القاعدة في wrangler.toml،
# ويطبّق المخطط، ويضبط الأسرار (من متغيرات البيئة إن وُجدت)، ثم ينشر الـ Worker.
#
# المتطلب الوحيد: تسجيل الدخول لحساب Cloudflare مرة واحدة:
#     npx wrangler login
# أو تعيين رمز API:
#     export CLOUDFLARE_API_TOKEN=xxxxx
#
# أسرار اختيارية (تُضبط تلقائياً إن كانت في البيئة):
#     ADMIN_KEY        (إلزامي لتفعيل لوحة الإدارة — يُطلب إن لم يُعطَ)
#     RESEND_API_KEY   EMAIL_FROM   TURNSTILE_SECRET   (اختيارية)
#
# الاستخدام:  bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

WR="npx --yes wrangler"
DB_NAME="ishraf-complaints"
BUCKET="ishraf-id-attachments"

echo "==> التحقق من تثبيت الاعتماديات…"
[ -d node_modules ] || npm install --no-audit --no-fund

# ---------- قاعدة البيانات D1 ----------
echo "==> التأكد من وجود قاعدة D1: $DB_NAME"
DB_ID="$($WR d1 list --json 2>/dev/null | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try{const a=JSON.parse(s);const m=a.find(x=>x.name==="'"$DB_NAME"'");process.stdout.write(m?m.uuid||m.database_id||"":"");}catch{process.stdout.write("");}
  });' || true)"

if [ -z "$DB_ID" ]; then
  echo "    إنشاء قاعدة جديدة…"
  CREATE_OUT="$($WR d1 create "$DB_NAME" 2>&1 || true)"
  echo "$CREATE_OUT"
  DB_ID="$(printf '%s' "$CREATE_OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)"
fi

if [ -z "$DB_ID" ]; then
  echo "!! تعذّر الحصول على معرّف قاعدة D1. تأكد من تسجيل الدخول (npx wrangler login) ثم أعد المحاولة." >&2
  exit 1
fi
echo "    معرّف القاعدة: $DB_ID"

# ربط المعرّف في wrangler.toml (يستبدل النائب أو أي معرّف سابق)
node -e '
  const fs=require("fs");const f="wrangler.toml";let t=fs.readFileSync(f,"utf8");
  t=t.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "'"$DB_ID"'"`);
  fs.writeFileSync(f,t);
  console.log("    تم تحديث wrangler.toml بمعرّف القاعدة.");
'

# ---------- مخزن R2 ----------
echo "==> التأكد من وجود مخزن R2: $BUCKET"
if ! $WR r2 bucket list 2>/dev/null | grep -q "$BUCKET"; then
  echo "    إنشاء المخزن…"
  $WR r2 bucket create "$BUCKET" || true
else
  echo "    موجود."
fi

# ---------- تطبيق المخطط على القاعدة البعيدة ----------
echo "==> تطبيق مخطط قاعدة البيانات (remote)…"
$WR d1 execute "$DB_NAME" --remote --file=schema.sql --yes || \
$WR d1 execute "$DB_NAME" --remote --file=schema.sql

# ---------- ضبط الأسرار ----------
put_secret () {
  local key="$1" val="${2:-}"
  if [ -n "$val" ]; then
    printf '%s' "$val" | $WR secret put "$key"
    echo "    ضُبط السر: $key"
  fi
}

echo "==> ضبط الأسرار…"
if [ -z "${ADMIN_KEY:-}" ] && [ -t 0 ]; then
  read -rsp "    أدخل ADMIN_KEY (مفتاح لوحة الإدارة): " ADMIN_KEY; echo
fi
if [ -z "${ADMIN_KEY:-}" ]; then
  echo "    (تحذير: لم يُضبط ADMIN_KEY — لوحة الإدارة ستبقى معطّلة حتى تضبطه لاحقاً)"
fi
put_secret ADMIN_KEY "${ADMIN_KEY:-}"
put_secret RESEND_API_KEY  "${RESEND_API_KEY:-}"
put_secret EMAIL_FROM      "${EMAIL_FROM:-}"
put_secret TURNSTILE_SECRET "${TURNSTILE_SECRET:-}"

# ---------- النشر ----------
echo "==> نشر الـ Worker…"
DEPLOY_OUT="$($WR deploy 2>&1)"
echo "$DEPLOY_OUT"

URL="$(printf '%s' "$DEPLOY_OUT" | grep -oE 'https://[a-zA-Z0-9._-]+\.workers\.dev' | head -1)"
echo ""
echo "======================================================================"
echo "  تم النشر بنجاح ✅"
[ -n "$URL" ] && echo "  عنوان الـ API:  $URL"
echo ""
echo "  الخطوة الأخيرة: ضع هذا العنوان في official-website/assets/js/config.js"
echo "      API_BASE: '${URL:-https://ishraf-complaints.<حسابك>.workers.dev}'"
echo "  ثم انشر الواجهة (ادفع إلى main) لتعمل الاستمارة ولوحة الإدارة فعلياً."
echo "======================================================================"
