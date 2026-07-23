// إعداد الموقع — عدّل عنوان الـ API بعد نشر الـ Worker
// اترك API_BASE فارغاً للعمل بالوضع التجريبي (حفظ محلي في المتصفح).
window.SITE_CONFIG = {
  // مثال بعد النشر: 'https://ishraf-complaints.<اسم-حسابك>.workers.dev'
  API_BASE: '',
  // مفتاح موقع Cloudflare Turnstile (اختياري). عند ضبطه يظهر التحقق البشري
  // في استمارة الشكاوى، ويجب ضبط TURNSTILE_SECRET في الخادم أيضاً.
  TURNSTILE_SITE_KEY: ''
};
