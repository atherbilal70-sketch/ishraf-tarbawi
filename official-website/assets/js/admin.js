// لوحة إدارة الشكاوى — تستهلك مسارات /api/admin في الـ Worker
// المصادقة عبر ترويسة x-admin-key؛ يُحفظ المفتاح في sessionStorage (يُمحى بإغلاق التبويب).
(function () {
  'use strict';

  const SS_BASE = 'ishraf_admin_base';
  const SS_KEY = 'ishraf_admin_key';
  const STATUS_STYLES = {
    'قيد المراجعة': 'bg-amber-100 text-amber-800',
    'قيد المعالجة': 'bg-blue-100 text-blue-800',
    'منجزة': 'bg-green-100 text-green-800',
    'مرفوضة': 'bg-red-100 text-red-800'
  };

  const configBase = (window.SITE_CONFIG && window.SITE_CONFIG.API_BASE || '').replace(/\/+$/, '');

  let apiBase = '';
  let adminKey = '';
  let page = 1;
  let totalPages = 1;
  let current = null; // الشكوى المفتوحة في النافذة

  // عناصر
  const loginScreen = document.getElementById('login-screen');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('login-form');
  const apiBaseInput = document.getElementById('api-base');
  const adminKeyInput = document.getElementById('admin-key');
  const loginError = document.getElementById('login-error');

  const rowsEl = document.getElementById('rows');
  const tableEmpty = document.getElementById('table-empty');
  const tableLoading = document.getElementById('table-loading');
  const statCards = document.getElementById('stat-cards');
  const filterSearch = document.getElementById('filter-search');
  const filterStatus = document.getElementById('filter-status');
  const pageInfo = document.getElementById('page-info');
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');

  const detailModal = document.getElementById('detail-modal');
  const dMsg = document.getElementById('d-msg');

  // ---------- أدوات ----------
  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function statusBadge(status) {
    return '<span class="inline-block px-2.5 py-1 rounded-full text-xs font-bold ' +
      (STATUS_STYLES[status] || 'bg-slate-100 text-slate-700') + '">' + esc(status) + '</span>';
  }

  async function api(path, options) {
    const opts = options || {};
    opts.headers = Object.assign({ 'x-admin-key': adminKey }, opts.headers || {});
    const resp = await fetch(apiBase + path, opts);
    let data = null;
    try { data = await resp.json(); } catch { /* قد يكون رداً غير JSON */ }
    return { ok: resp.ok, status: resp.status, data };
  }

  // ---------- الدخول ----------
  function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');
    loadStats();
    loadComplaints();
  }

  async function attemptLogin(base, key) {
    apiBase = base.replace(/\/+$/, '');
    adminKey = key;
    // تحقق من المفتاح عبر مسار محمي خفيف
    const res = await api('/api/admin/stats');
    if (res.ok) {
      sessionStorage.setItem(SS_BASE, apiBase);
      sessionStorage.setItem(SS_KEY, adminKey);
      return true;
    }
    if (res.status === 401) throw new Error('مفتاح الدخول غير صحيح.');
    if (res.status === 503) throw new Error('لوحة الإدارة غير مفعّلة على الخادم (لم يُضبط ADMIN_KEY).');
    throw new Error((res.data && res.data.error) || 'تعذر الاتصال بالخادم. تحقق من العنوان.');
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.remove('show');
    const base = apiBaseInput.value.trim() || configBase;
    const key = adminKeyInput.value.trim();
    if (!base) { loginError.textContent = 'أدخل عنوان الخادم (API).'; loginError.classList.add('show'); return; }
    if (!key) { loginError.textContent = 'أدخل مفتاح الدخول.'; loginError.classList.add('show'); return; }

    const btn = loginForm.querySelector('button');
    btn.disabled = true; btn.textContent = 'جارٍ التحقق…';
    try {
      await attemptLogin(base, key);
      showDashboard();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.add('show');
    } finally {
      btn.disabled = false; btn.textContent = 'دخول';
    }
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem(SS_KEY);
    adminKey = '';
    dashboard.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    adminKeyInput.value = '';
  });

  // ---------- الإحصائيات ----------
  async function loadStats() {
    const res = await api('/api/admin/stats');
    if (!res.ok) return;
    const { total, counts } = res.data;
    const cards = [
      { label: 'إجمالي الشكاوى', value: total, cls: 'bg-primary text-white' },
      { label: 'قيد المراجعة', value: counts['قيد المراجعة'], cls: 'bg-amber-50 text-amber-800' },
      { label: 'قيد المعالجة', value: counts['قيد المعالجة'], cls: 'bg-blue-50 text-blue-800' },
      { label: 'منجزة', value: counts['منجزة'], cls: 'bg-green-50 text-green-800' },
      { label: 'مرفوضة', value: counts['مرفوضة'], cls: 'bg-red-50 text-red-800' }
    ];
    statCards.innerHTML = cards.map((c) =>
      '<div class="rounded-xl border border-slate-200 p-4 ' + c.cls + '">' +
        '<p class="text-2xl font-extrabold">' + (c.value || 0) + '</p>' +
        '<p class="text-xs font-bold mt-1 opacity-90">' + c.label + '</p>' +
      '</div>'
    ).join('');
  }

  // ---------- قائمة الشكاوى ----------
  let searchTimer = null;

  async function loadComplaints() {
    tableLoading.classList.remove('hidden');
    tableEmpty.classList.add('hidden');
    rowsEl.innerHTML = '';

    const params = new URLSearchParams({ page: String(page), perPage: '20' });
    if (filterStatus.value) params.set('status', filterStatus.value);
    if (filterSearch.value.trim()) params.set('q', filterSearch.value.trim());

    const res = await api('/api/admin/complaints?' + params.toString());
    tableLoading.classList.add('hidden');

    if (!res.ok) {
      tableEmpty.textContent = (res.data && res.data.error) || 'تعذر تحميل الشكاوى.';
      tableEmpty.classList.remove('hidden');
      return;
    }

    const { items, total, perPage } = res.data;
    totalPages = Math.max(1, Math.ceil(total / perPage));

    if (!items.length) {
      tableEmpty.textContent = 'لا توجد شكاوى مطابقة.';
      tableEmpty.classList.remove('hidden');
    } else {
      rowsEl.innerHTML = items.map((c) =>
        '<tr class="hover:bg-surface">' +
          '<td class="td font-bold text-primary" dir="ltr">' + esc(c.ref) + '</td>' +
          '<td class="td">' + esc(c.full_name) + '</td>' +
          '<td class="td">' + esc(c.role) + '</td>' +
          '<td class="td whitespace-nowrap">' + fmtDate(c.created_at) + '</td>' +
          '<td class="td">' + statusBadge(c.status) + '</td>' +
          '<td class="td"><button class="dl-btn" data-ref="' + esc(c.ref) + '">عرض</button></td>' +
        '</tr>'
      ).join('');
    }

    pageInfo.textContent = 'صفحة ' + page + ' من ' + totalPages + ' — الإجمالي ' + total;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;

    // احفظ العناصر للوصول إليها عند فتح التفاصيل
    loadComplaints._items = items;
  }

  rowsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ref]');
    if (!btn) return;
    const item = (loadComplaints._items || []).find((c) => c.ref === btn.dataset.ref);
    if (item) openDetail(item);
  });

  filterStatus.addEventListener('change', () => { page = 1; loadComplaints(); });
  filterSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { page = 1; loadComplaints(); }, 350);
  });
  document.getElementById('refresh-btn').addEventListener('click', () => { loadStats(); loadComplaints(); });

  // تصدير CSV (يحترم الفلاتر الحالية) — يتطلب ترويسة المصادقة → عبر blob
  document.getElementById('export-btn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const prev = e.target.textContent;
    e.target.textContent = 'جارٍ التصدير…';
    try {
      const params = new URLSearchParams();
      if (filterStatus.value) params.set('status', filterStatus.value);
      if (filterSearch.value.trim()) params.set('q', filterSearch.value.trim());
      const resp = await fetch(apiBase + '/api/admin/export?' + params.toString(), { headers: { 'x-admin-key': adminKey } });
      if (!resp.ok) throw new Error('تعذر التصدير.');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'complaints-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'تعذر التصدير.');
    } finally {
      e.target.disabled = false;
      e.target.textContent = prev;
    }
  });
  prevBtn.addEventListener('click', () => { if (page > 1) { page--; loadComplaints(); } });
  nextBtn.addEventListener('click', () => { if (page < totalPages) { page++; loadComplaints(); } });

  // ---------- تفاصيل الشكوى ----------
  function openDetail(c) {
    current = c;
    dMsg.textContent = '';
    document.getElementById('detail-ref').textContent = 'الشكوى ' + c.ref;
    document.getElementById('d-name').textContent = c.full_name;
    document.getElementById('d-role').textContent = c.role;
    document.getElementById('d-phone').textContent = c.phone;
    document.getElementById('d-email').textContent = c.email;
    document.getElementById('d-date').textContent = fmtDate(c.created_at);
    document.getElementById('d-updated').textContent = fmtDate(c.updated_at);
    document.getElementById('d-details').textContent = c.details;
    document.getElementById('d-status').value = c.status;
    document.getElementById('audit-box').classList.add('hidden');
    document.getElementById('audit-list').innerHTML = '';
    detailModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  const ACTION_LABELS = { view_attachment: 'اطّلاع على الهوية', update_status: 'تغيير الحالة' };

  document.getElementById('d-audit').addEventListener('click', async (e) => {
    if (!current) return;
    const box = document.getElementById('audit-box');
    const list = document.getElementById('audit-list');
    box.classList.remove('hidden');
    list.innerHTML = '<li class="text-slate-400">جارٍ التحميل…</li>';
    const res = await api('/api/admin/audit?ref=' + encodeURIComponent(current.ref));
    if (!res.ok) { list.innerHTML = '<li class="text-red-600">تعذر تحميل السجل.</li>'; return; }
    if (!res.data.items.length) { list.innerHTML = '<li class="text-slate-400">لا توجد سجلات.</li>'; return; }
    list.innerHTML = res.data.items.map((a) =>
      '<li class="flex justify-between gap-3 border-b border-slate-50 pb-1.5">' +
        '<span class="font-bold text-slate-700">' + esc(ACTION_LABELS[a.action] || a.action) +
          (a.detail ? ' — ' + esc(a.detail) : '') + '</span>' +
        '<span class="text-slate-400 whitespace-nowrap">' + fmtDate(a.created_at) + '</span>' +
      '</li>'
    ).join('');
  });

  function closeDetail() {
    detailModal.classList.add('hidden');
    document.body.style.overflow = '';
    current = null;
  }

  detailModal.querySelectorAll('[data-close-detail]').forEach((el) => el.addEventListener('click', closeDetail));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !detailModal.classList.contains('hidden')) closeDetail();
  });

  function setMsg(text, kind) {
    dMsg.textContent = text;
    dMsg.className = 'text-sm mt-3 ' + (kind === 'error' ? 'text-red-600' : 'text-green-600');
  }

  // حفظ الحالة
  document.getElementById('d-save').addEventListener('click', async (e) => {
    if (!current) return;
    const status = document.getElementById('d-status').value;
    e.target.disabled = true;
    const res = await api('/api/admin/complaints/' + encodeURIComponent(current.ref), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status })
    });
    e.target.disabled = false;
    if (res.ok) {
      current.status = status;
      setMsg('تم تحديث الحالة.', 'ok');
      loadStats();
      loadComplaints();
    } else {
      setMsg((res.data && res.data.error) || 'تعذر تحديث الحالة.', 'error');
    }
  });

  // تنزيل الهوية (يتطلب ترويسة المصادقة → عبر blob)
  document.getElementById('d-download').addEventListener('click', async (e) => {
    if (!current) return;
    e.target.disabled = true;
    setMsg('جارٍ جلب المرفق…', 'ok');
    try {
      const resp = await fetch(apiBase + '/api/admin/complaints/' + encodeURIComponent(current.ref) + '/attachment', {
        headers: { 'x-admin-key': adminKey }
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || 'تعذر تنزيل المرفق.');
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = current.ref + '-هوية';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg('تم تنزيل المرفق.', 'ok');
    } catch (err) {
      setMsg(err.message, 'error');
    } finally {
      e.target.disabled = false;
    }
  });

  // ---------- استعادة جلسة سابقة ----------
  (function init() {
    apiBaseInput.value = sessionStorage.getItem(SS_BASE) || configBase || '';
    const savedKey = sessionStorage.getItem(SS_KEY);
    const savedBase = sessionStorage.getItem(SS_BASE) || configBase;
    if (savedKey && savedBase) {
      apiBase = savedBase.replace(/\/+$/, '');
      adminKey = savedKey;
      showDashboard();
    }
  })();
})();
