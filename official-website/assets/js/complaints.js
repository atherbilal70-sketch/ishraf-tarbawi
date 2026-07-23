// منطق بوابة الشكاوى: التحقق من الحقول، رفع الملف، توليد رقم التتبع، الاستعلام
// ملاحظة: الحفظ هنا محلي (localStorage) للعرض التجريبي؛ في المرحلة الثانية
// تُرسل البيانات إلى الخادم عبر POST /api/complaints والتحقق يعاد في الخادم إلزامياً.
(function () {
  'use strict';

  const form = document.getElementById('complaint-form');
  if (!form) return;

  const STORAGE_KEY = 'ishraf_complaints';
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

  const fields = {
    fullname: document.getElementById('fullname'),
    phone: document.getElementById('phone'),
    email: document.getElementById('email'),
    details: document.getElementById('details'),
    file: document.getElementById('id-file'),
    confirm: document.getElementById('confirm')
  };

  // ---------- أدوات عرض الأخطاء ----------
  function setError(name, message) {
    const errEl = document.getElementById('err-' + name);
    const input = fields[name];
    if (errEl) {
      errEl.textContent = message || '';
      errEl.classList.toggle('show', Boolean(message));
    }
    if (input && input.classList.contains('field')) {
      input.classList.toggle('field-error', Boolean(message));
    }
    return !message;
  }

  // ---------- قواعد التحقق ----------
  function validateFullname() {
    const v = fields.fullname.value.trim();
    if (!v) return setError('fullname', 'الاسم الثلاثي مطلوب.');
    if (v.split(/\s+/).length < 3) return setError('fullname', 'يرجى كتابة الاسم الثلاثي كاملاً (ثلاث كلمات على الأقل).');
    return setError('fullname', '');
  }

  function validatePhone() {
    const v = fields.phone.value.trim().replace(/[\s-]/g, '');
    if (!v) return setError('phone', 'رقم الهاتف مطلوب.');
    if (!/^07[0-9]{9}$/.test(v)) return setError('phone', 'يرجى إدخال رقم عراقي صحيح مكوّن من 11 رقماً يبدأ بـ 07.');
    return setError('phone', '');
  }

  function validateEmail() {
    const v = fields.email.value.trim();
    if (!v) return setError('email', 'البريد الإلكتروني مطلوب.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return setError('email', 'صيغة البريد الإلكتروني غير صحيحة.');
    return setError('email', '');
  }

  function validateRole() {
    const checked = form.querySelector('input[name="role"]:checked');
    return setError('role', checked ? '' : 'يرجى اختيار صفة المشتكي.');
  }

  function validateDetails() {
    const v = fields.details.value.trim();
    if (!v) return setError('details', 'تفاصيل الشكوى مطلوبة.');
    if (v.length < 30) return setError('details', 'يرجى كتابة 30 حرفاً على الأقل لتوضيح الشكوى.');
    return setError('details', '');
  }

  function validateFile() {
    const file = fields.file.files[0];
    if (!file) return setError('file', 'إرفاق واجهة الهوية الوطنية / البطاقة الموحدة إجباري.');
    if (!ALLOWED_TYPES.includes(file.type)) return setError('file', 'الصيغ المقبولة: PDF أو JPEG أو PNG فقط.');
    if (file.size > MAX_FILE_SIZE) return setError('file', 'حجم الملف يتجاوز الحد الأقصى (5 ميغابايت).');
    return setError('file', '');
  }

  function validateConfirm() {
    return setError('confirm', fields.confirm.checked ? '' : 'يرجى الإقرار بصحة المعلومات قبل الإرسال.');
  }

  // تحقق فوري عند مغادرة الحقل
  fields.fullname.addEventListener('blur', validateFullname);
  fields.phone.addEventListener('blur', validatePhone);
  fields.email.addEventListener('blur', validateEmail);
  fields.details.addEventListener('blur', validateDetails);

  // ---------- عداد أحرف التفاصيل ----------
  const detailsCount = document.getElementById('details-count');
  fields.details.addEventListener('input', () => {
    detailsCount.textContent = fields.details.value.trim().length;
  });

  // ---------- منطقة رفع الملف ----------
  const dropzone = document.getElementById('dropzone');
  const fileInfo = document.getElementById('file-info');
  const fileName = document.getElementById('file-name');
  const fileSize = document.getElementById('file-size');
  const fileRemove = document.getElementById('file-remove');

  function formatSize(bytes) {
    return bytes < 1024 * 1024
      ? (bytes / 1024).toFixed(0) + ' كيلوبايت'
      : (bytes / (1024 * 1024)).toFixed(2) + ' ميغابايت';
  }

  function showFile() {
    const file = fields.file.files[0];
    const valid = validateFile();
    if (file && valid) {
      fileName.textContent = file.name;
      fileSize.textContent = formatSize(file.size);
      fileInfo.classList.remove('hidden');
      dropzone.classList.add('hidden');
    } else {
      clearFile(false);
    }
  }

  function clearFile(clearError) {
    fields.file.value = '';
    fileInfo.classList.add('hidden');
    dropzone.classList.remove('hidden');
    if (clearError) setError('file', '');
  }

  fields.file.addEventListener('change', showFile);
  fileRemove.addEventListener('click', () => clearFile(true));

  ['dragover', 'dragenter'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    })
  );
  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) {
      fields.file.files = e.dataTransfer.files;
      showFile();
    }
  });
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fields.file.click();
    }
  });

  // ---------- توليد رقم التتبع والحفظ ----------
  function generateRef() {
    const year = new Date().getFullYear();
    const rand = Math.floor(100000 + Math.random() * 900000);
    return 'ISH-' + year + '-' + rand;
  }

  function loadComplaints() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveComplaint(record) {
    const all = loadComplaints();
    all.push(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }

  // ---------- الإرسال ----------
  const submitBtn = document.getElementById('submit-btn');
  const successModal = document.getElementById('success-modal');
  const refNumberEl = document.getElementById('ref-number');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const checks = [
      validateFullname(),
      validatePhone(),
      validateEmail(),
      validateRole(),
      validateDetails(),
      validateFile(),
      validateConfirm()
    ];
    if (checks.includes(false)) {
      const firstError = form.querySelector('.err.show');
      if (firstError) firstError.closest('div, label').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'جارٍ الإرسال…';

    // محاكاة إرسال إلى الخادم؛ تُستبدل بـ fetch('/api/complaints', { method: 'POST', body: new FormData(form) })
    setTimeout(() => {
      const ref = generateRef();
      saveComplaint({
        ref,
        name: fields.fullname.value.trim(),
        role: form.querySelector('input[name="role"]:checked').value,
        date: new Date().toISOString(),
        status: 'قيد المراجعة'
      });

      refNumberEl.textContent = ref;
      successModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';

      form.reset();
      clearFile(true);
      detailsCount.textContent = '0';
      submitBtn.disabled = false;
      submitBtn.textContent = 'إرسال الشكوى';
    }, 900);
  });

  // ---------- نافذة النجاح ----------
  document.getElementById('success-close').addEventListener('click', () => {
    successModal.classList.add('hidden');
    document.body.style.overflow = '';
  });

  document.getElementById('copy-ref').addEventListener('click', (e) => {
    navigator.clipboard.writeText(refNumberEl.textContent).then(() => {
      e.target.textContent = 'تم النسخ ✓';
      setTimeout(() => (e.target.textContent = 'نسخ'), 2000);
    });
  });

  // ---------- الاستعلام عن شكوى ----------
  const trackForm = document.getElementById('track-form');
  const trackInput = document.getElementById('track-input');
  const trackResult = document.getElementById('track-result');

  trackForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const ref = trackInput.value.trim().toUpperCase();
    trackResult.classList.remove('hidden');

    if (!ref) {
      trackResult.className = 'mt-4 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm';
      trackResult.textContent = 'يرجى إدخال رقم التتبع.';
      return;
    }

    const found = loadComplaints().find((c) => c.ref === ref);
    if (found) {
      const date = new Date(found.date).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric' });
      trackResult.className = 'mt-4 rounded-lg border border-green-200 bg-green-50 text-green-800 px-4 py-3 text-sm leading-relaxed';
      trackResult.innerHTML =
        '<strong>الحالة: ' + found.status + '</strong><br>' +
        'مقدّمة بتاريخ ' + date + ' — صفة المشتكي: ' + found.role + '.';
    } else {
      trackResult.className = 'mt-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm';
      trackResult.textContent = 'لم يُعثر على شكوى بهذا الرقم. تأكد من كتابته بالشكل: ISH-السنة-الرقم.';
    }
  });
})();
