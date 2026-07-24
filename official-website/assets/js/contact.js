// نموذج تواصل معنا: تحقق بسيط ثم فتح برنامج البريد برسالة معبّأة (mailto).
// لا يحتاج خادماً؛ الشكاوى الرسمية تمرّ عبر بوابة الشكاوى المستقلة.
(function () {
  'use strict';

  const form = document.getElementById('contact-form');
  if (!form) return;

  const DEST = 'info@supervision.moedu.gov.iq';
  const fields = {
    'c-name': document.getElementById('c-name'),
    'c-email': document.getElementById('c-email'),
    'c-subject': document.getElementById('c-subject'),
    'c-message': document.getElementById('c-message')
  };
  const statusEl = document.getElementById('c-status');

  function setError(id, msg) {
    const errEl = document.getElementById('err-' + id);
    if (errEl) {
      errEl.textContent = msg || '';
      errEl.classList.toggle('show', Boolean(msg));
    }
    fields[id].classList.toggle('field-error', Boolean(msg));
    return !msg;
  }

  function validate() {
    const name = fields['c-name'].value.trim();
    const email = fields['c-email'].value.trim();
    const subject = fields['c-subject'].value.trim();
    const message = fields['c-message'].value.trim();
    const checks = [
      setError('c-name', name ? '' : 'الاسم مطلوب.'),
      setError('c-email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? '' : 'بريد إلكتروني غير صحيح.'),
      setError('c-subject', subject ? '' : 'الموضوع مطلوب.'),
      setError('c-message', message.length >= 10 ? '' : 'اكتب رسالة لا تقل عن 10 أحرف.')
    ];
    return !checks.includes(false);
  }

  Object.values(fields).forEach((el) => el.addEventListener('blur', validate));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validate()) {
      const first = form.querySelector('.err.show');
      if (first) first.closest('div').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const name = fields['c-name'].value.trim();
    const email = fields['c-email'].value.trim();
    const subject = fields['c-subject'].value.trim();
    const message = fields['c-message'].value.trim();

    const body =
      'الاسم: ' + name + '\n' +
      'البريد: ' + email + '\n\n' +
      message;
    const href = 'mailto:' + DEST +
      '?subject=' + encodeURIComponent('[استفسار] ' + subject) +
      '&body=' + encodeURIComponent(body);

    window.location.href = href;
    statusEl.className = 'text-sm mt-3 text-green-600';
    statusEl.textContent = 'تم فتح برنامج البريد لديك. إن لم يفتح تلقائياً، راسلنا مباشرة على ' + DEST;
  });
})();
