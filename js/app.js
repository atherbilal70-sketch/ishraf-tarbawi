(() => {
  'use strict';

  const LS = {
    favorites: 'ishraf.favorites',
    notes: 'ishraf.notes',
    contacts: 'ishraf.contacts',
    reminders: 'ishraf.reminders',
    theme: 'ishraf.theme',
    fontSize: 'ishraf.fontSize'
  };

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  };

  let DATA = { categories: [] };
  let currentCategoryId = null;
  let currentLaw = null;

  const el = (sel) => document.querySelector(sel);
  const els = (sel) => Array.from(document.querySelectorAll(sel));

  const TEMPLATES = [
    {
      id: 'tpl-general',
      title: 'كتاب رسمي عام',
      body:
`بسم الله الرحمن الرحيم
وزارة التربية
[اسم الجهة المرسل إليها]

م / [موضوع الكتاب]

استناداً إلى [الاستناد القانوني أو الإداري]، نحيطكم علماً بـ [تفاصيل الموضوع]...

يرجى التفضل بالاطلاع واتخاذ ما يلزم.

مع التقدير،
[الاسم والمنصب]
[التاريخ]`
    },
    {
      id: 'tpl-referral',
      title: 'كتاب إحالة موضوع',
      body:
`م / إحالة

نرفق لكم طياً [وصف المرفق]، للاطلاع واتخاذ الإجراء اللازم بخصوص [موضوع الإحالة]، وإعلامنا بالنتيجة.

مع التقدير،
[الاسم والمنصب]
[التاريخ]`
    },
    {
      id: 'tpl-leave-request',
      title: 'طلب إجازة',
      body:
`م / طلب إجازة

أرجو من سيادتكم الموافقة على منحي إجازة [نوع الإجازة] لمدة [عدد الأيام] يوم، اعتباراً من [تاريخ البدء] ولغاية [تاريخ الانتهاء]، وذلك لـ [السبب].

مع التقدير،
[الاسم والمنصب]
[التاريخ]`
    },
    {
      id: 'tpl-visit-report',
      title: 'تقرير زيارة ميدانية / صفية',
      body:
`تقرير زيارة

اسم المدرسة / الجهة: [الاسم]
تاريخ الزيارة: [التاريخ]
الغرض من الزيارة: [الغرض]

الملاحظات:
- [ملاحظة 1]
- [ملاحظة 2]

التوصيات:
- [توصية 1]
- [توصية 2]

اسم المُشرف: [الاسم]
التوقيع: __________`
    }
  ];

  const QUICK_ACTIONS = [
    { icon: '📚', label: 'تصفح القوانين', action: () => switchView('view-laws') },
    { icon: '🤖', label: 'اسأل الذكاء الاصطناعي', action: () => switchView('view-ai') },
    { icon: '📄', label: 'النماذج الرسمية', action: () => switchView('view-templates') },
    { icon: '⭐', label: 'المفضلة', action: () => switchView('view-favorites') }
  ];

  const aiState = { history: [] };

  // ---------------- View switching ----------------
  function switchView(viewId) {
    els('.view').forEach(v => v.classList.add('hidden'));
    el('#' + viewId).classList.remove('hidden');
    els('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === viewId));
    el('#main').scrollTo({ top: 0 });
  }

  els('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  els('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.back));
  });

  // ---------------- Data loading ----------------
  async function loadData() {
    try {
      const res = await fetch('data/laws.json');
      DATA = await res.json();
    } catch (e) {
      DATA = { categories: [] };
    }
    renderCategories();
    renderQuickGrid();
    renderHomeFavorites();
    renderHomeUpcoming();
    renderTemplates();
    renderFavoritesView();
    renderContacts();
    renderReminders();
  }

  function allLaws() {
    const out = [];
    DATA.categories.forEach(cat => {
      (cat.laws || []).forEach(law => out.push({ ...law, categoryId: cat.id, categoryTitle: cat.title }));
    });
    return out;
  }

  function findLaw(lawId) {
    return allLaws().find(l => l.id === lawId) || null;
  }

  // ---------------- Home ----------------
  function renderQuickGrid() {
    const grid = el('#quickGrid');
    grid.innerHTML = '';
    QUICK_ACTIONS.forEach(qa => {
      const div = document.createElement('div');
      div.className = 'quick-tile';
      div.innerHTML = `<div class="tile-icon">${qa.icon}</div><div>${qa.label}</div>`;
      div.addEventListener('click', qa.action);
      grid.appendChild(div);
    });
  }

  function renderHomeFavorites() {
    const wrap = el('#homeFavorites');
    const favIds = store.get(LS.favorites, []);
    const laws = favIds.map(findLaw).filter(Boolean).slice(0, 3);
    wrap.innerHTML = '';
    if (!laws.length) {
      wrap.innerHTML = '<div class="empty-state">لم تُضِف أي عنصر للمفضلة بعد.</div>';
      return;
    }
    laws.forEach(law => wrap.appendChild(lawRow(law)));
  }

  function renderHomeUpcoming() {
    const wrap = el('#homeUpcoming');
    const reminders = store.get(LS.reminders, []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = reminders.filter(r => r.date >= today).slice(0, 3);
    wrap.innerHTML = '';
    if (!upcoming.length) {
      wrap.innerHTML = '<div class="empty-state">لا توجد مواعيد قادمة مضافة.</div>';
      return;
    }
    upcoming.forEach(r => {
      const row = document.createElement('div');
      row.className = 'card-row';
      row.innerHTML = `<div><div class="row-title">${escapeHtml(r.title)}</div><div class="row-sub">${r.date}</div></div>`;
      wrap.appendChild(row);
    });
  }

  // ---------------- Categories / Laws ----------------
  function renderCategories() {
    const wrap = el('#categoryList');
    wrap.innerHTML = '';
    DATA.categories.forEach(cat => {
      const card = document.createElement('div');
      card.className = 'category-card';
      card.innerHTML = `
        <div class="cat-icon">${cat.icon || '📁'}</div>
        <div>
          <div class="cat-title">${escapeHtml(cat.title)}</div>
          <div class="cat-count">${(cat.laws || []).length} عنصر</div>
        </div>`;
      card.addEventListener('click', () => openCategory(cat.id));
      wrap.appendChild(card);
    });
  }

  function openCategory(catId) {
    currentCategoryId = catId;
    const cat = DATA.categories.find(c => c.id === catId);
    if (!cat) return;
    el('#categoryTitle').textContent = cat.title;
    const wrap = el('#categoryLaws');
    wrap.innerHTML = '';
    if (!cat.laws || !cat.laws.length) {
      wrap.innerHTML = '<div class="empty-state">لم تتم إضافة أي قانون أو تعليمات ضمن هذا التصنيف بعد.<br>سيتم تحديث المحتوى تباعاً.</div>';
    } else {
      cat.laws.forEach(law => wrap.appendChild(lawRow({ ...law, categoryId: cat.id, categoryTitle: cat.title })));
    }
    switchView('view-category');
  }

  function lawRow(law) {
    const row = document.createElement('div');
    row.className = 'card-row';
    row.innerHTML = `
      <div>
        <div class="row-title">${escapeHtml(law.title)}</div>
        <div class="row-sub">${escapeHtml(law.categoryTitle || '')}</div>
      </div>
      <div class="chev">‹</div>`;
    row.addEventListener('click', () => openLaw(law.id));
    return row;
  }

  function openLaw(lawId) {
    const law = findLaw(lawId);
    if (!law) return;
    currentLaw = law;
    el('#lawTitle').textContent = law.title;
    el('#lawMeta').textContent = [law.categoryTitle, law.source].filter(Boolean).join(' · ');
    el('#lawBody').textContent = law.body || law.summary || 'لا يوجد نص مفصل بعد.';

    const favIds = store.get(LS.favorites, []);
    const favBtn = el('#favToggle');
    favBtn.textContent = favIds.includes(law.id) ? '★ إزالة من المفضلة' : '☆ إضافة للمفضلة';

    const notes = store.get(LS.notes, {});
    el('#lawNote').value = notes[law.id] || '';

    switchView('view-law');
  }

  el('#favToggle').addEventListener('click', () => {
    if (!currentLaw) return;
    let favIds = store.get(LS.favorites, []);
    if (favIds.includes(currentLaw.id)) {
      favIds = favIds.filter(id => id !== currentLaw.id);
    } else {
      favIds.push(currentLaw.id);
    }
    store.set(LS.favorites, favIds);
    openLaw(currentLaw.id);
    renderHomeFavorites();
    renderFavoritesView();
  });

  el('#saveNote').addEventListener('click', () => {
    if (!currentLaw) return;
    const notes = store.get(LS.notes, {});
    notes[currentLaw.id] = el('#lawNote').value;
    store.set(LS.notes, notes);
    el('#saveNote').textContent = 'تم الحفظ ✓';
    setTimeout(() => { el('#saveNote').textContent = 'حفظ الملاحظة'; }, 1500);
  });

  // ---------------- Favorites view ----------------
  function renderFavoritesView() {
    const wrap = el('#favoritesList');
    const empty = el('#favoritesEmpty');
    const favIds = store.get(LS.favorites, []);
    const laws = favIds.map(findLaw).filter(Boolean);
    wrap.innerHTML = '';
    if (!laws.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    laws.forEach(law => wrap.appendChild(lawRow(law)));
  }

  // ---------------- Templates ----------------
  function renderTemplates() {
    const wrap = el('#templateList');
    wrap.innerHTML = '';
    TEMPLATES.forEach(tpl => {
      const card = document.createElement('div');
      card.className = 'card-row';
      card.style.alignItems = 'flex-start';
      card.style.cursor = 'default';
      card.innerHTML = `
        <div style="flex:1">
          <div class="row-title">${escapeHtml(tpl.title)}</div>
          <pre style="white-space:pre-wrap;font-family:inherit;font-size:.82rem;color:var(--text-muted);margin:.5rem 0 0;">${escapeHtml(tpl.body)}</pre>
          <button class="btn-outline copy-tpl" data-id="${tpl.id}" style="margin-top:.6rem;">نسخ النص</button>
        </div>`;
      wrap.appendChild(card);
    });
    els('.copy-tpl').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tpl = TEMPLATES.find(t => t.id === btn.dataset.id);
        try {
          await navigator.clipboard.writeText(tpl.body);
          btn.textContent = 'تم النسخ ✓';
        } catch (e) {
          btn.textContent = 'تعذر النسخ';
        }
        setTimeout(() => { btn.textContent = 'نسخ النص'; }, 1500);
      });
    });
  }

  // ---------------- Contacts ----------------
  function renderContacts() {
    const wrap = el('#contactsList');
    const contacts = store.get(LS.contacts, []);
    wrap.innerHTML = '';
    if (!contacts.length) {
      wrap.innerHTML = '<div class="empty-state">لا توجد جهات اتصال مضافة بعد.</div>';
      return;
    }
    contacts.forEach(c => {
      const row = document.createElement('div');
      row.className = 'card-row';
      row.style.cursor = 'default';
      row.innerHTML = `
        <div><div class="row-title">${escapeHtml(c.name)}</div><div class="row-sub">${escapeHtml(c.role || '')} ${c.phone ? '· ' + escapeHtml(c.phone) : ''}</div></div>
        <button class="icon-btn del-contact" data-id="${c.id}" style="color:var(--danger)">✕</button>`;
      wrap.appendChild(row);
    });
    els('.del-contact').forEach(btn => {
      btn.addEventListener('click', () => {
        const contacts = store.get(LS.contacts, []).filter(c => c.id !== btn.dataset.id);
        store.set(LS.contacts, contacts);
        renderContacts();
      });
    });
  }

  el('#addContact').addEventListener('click', () => {
    const name = prompt('اسم جهة الاتصال:');
    if (!name) return;
    const role = prompt('المنصب / الجهة (اختياري):') || '';
    const phone = prompt('رقم الهاتف (اختياري):') || '';
    const contacts = store.get(LS.contacts, []);
    contacts.push({ id: 'c' + Date.now(), name, role, phone });
    store.set(LS.contacts, contacts);
    renderContacts();
  });

  // ---------------- Reminders ----------------
  function renderReminders() {
    const wrap = el('#remindersList');
    const reminders = store.get(LS.reminders, []).slice().sort((a, b) => a.date.localeCompare(b.date));
    wrap.innerHTML = '';
    if (!reminders.length) {
      wrap.innerHTML = '<div class="empty-state">لا توجد مواعيد مضافة بعد.</div>';
      return;
    }
    reminders.forEach(r => {
      const row = document.createElement('div');
      row.className = 'card-row';
      row.style.cursor = 'default';
      row.innerHTML = `
        <div><div class="row-title">${escapeHtml(r.title)}</div><div class="row-sub">${r.date}</div></div>
        <button class="icon-btn del-reminder" data-id="${r.id}" style="color:var(--danger)">✕</button>`;
      wrap.appendChild(row);
    });
    els('.del-reminder').forEach(btn => {
      btn.addEventListener('click', () => {
        const reminders = store.get(LS.reminders, []).filter(r => r.id !== btn.dataset.id);
        store.set(LS.reminders, reminders);
        renderReminders();
        renderHomeUpcoming();
      });
    });
  }

  function openReminderPrompt() {
    const title = prompt('عنوان الموعد:');
    if (!title) return;
    const date = prompt('التاريخ (YYYY-MM-DD):');
    if (!date) return;
    const reminders = store.get(LS.reminders, []);
    reminders.push({ id: 'r' + Date.now(), title, date });
    store.set(LS.reminders, reminders);
    renderReminders();
    renderHomeUpcoming();
  }

  el('#addReminder').addEventListener('click', openReminderPrompt);

  // ---------------- AI Assistant ----------------
  function renderAIChat() {
    const wrap = el('#aiChat');
    wrap.innerHTML = '';
    aiState.history.forEach(msg => {
      const bubble = document.createElement('div');
      bubble.className = 'ai-bubble ' + (msg.role === 'user' ? 'ai-user' : 'ai-assistant');
      bubble.textContent = msg.content;
      wrap.appendChild(bubble);
    });
    wrap.scrollTop = wrap.scrollHeight;
  }

  async function sendAIQuestion() {
    const input = el('#aiInput');
    const question = input.value.trim();
    if (!question) return;

    el('#aiNotConfiguredNotice').classList.add('hidden');
    el('#aiOfflineNotice').classList.add('hidden');

    const cfg = window.APP_CONFIG || {};
    if (!cfg.aiEndpoint || cfg.aiEndpoint.indexOf('REPLACE_WITH') !== -1) {
      el('#aiNotConfiguredNotice').classList.remove('hidden');
      return;
    }
    if (!navigator.onLine) {
      el('#aiOfflineNotice').classList.remove('hidden');
      return;
    }

    const priorHistory = aiState.history.slice();
    aiState.history.push({ role: 'user', content: question });
    renderAIChat();
    input.value = '';

    const sendBtn = el('#aiSend');
    sendBtn.disabled = true;
    sendBtn.textContent = 'جارٍ التفكير...';

    try {
      const res = await fetch(cfg.aiEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-app-key': cfg.aiSharedKey || ''
        },
        body: JSON.stringify({
          question,
          history: priorHistory,
          laws: allLaws().map(l => ({ title: l.title, summary: l.summary, body: l.body, source: l.source }))
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'خطأ غير معروف');
      aiState.history.push({ role: 'assistant', content: data.answer || 'تعذر الحصول على إجابة.' });
    } catch (e) {
      aiState.history.push({ role: 'assistant', content: 'حدث خطأ أثناء الاتصال بالمساعد الذكي. حاول مرة أخرى لاحقاً.' });
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'إرسال السؤال';
      renderAIChat();
    }
  }

  el('#aiSend').addEventListener('click', sendAIQuestion);
  el('#aiInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAIQuestion();
    }
  });

  // ---------------- Settings ----------------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    el('#darkModeToggle').checked = theme === 'dark';
  }
  function applyFontSize(size) {
    document.documentElement.setAttribute('data-font', size);
    els('.font-size-btns button').forEach(b => b.classList.toggle('active', b.dataset.size === size));
  }

  el('#darkModeToggle').addEventListener('change', (e) => {
    const theme = e.target.checked ? 'dark' : 'light';
    store.set(LS.theme, theme);
    applyTheme(theme);
  });

  els('.font-size-btns button').forEach(btn => {
    btn.addEventListener('click', () => {
      store.set(LS.fontSize, btn.dataset.size);
      applyFontSize(btn.dataset.size);
    });
  });

  // ---------------- Search ----------------
  el('#searchBtn').addEventListener('click', () => {
    el('#searchOverlay').classList.remove('hidden');
    el('#searchInput').focus();
  });
  el('#closeSearch').addEventListener('click', () => {
    el('#searchOverlay').classList.add('hidden');
    el('#searchInput').value = '';
    el('#searchResults').innerHTML = '';
  });
  el('#searchInput').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const wrap = el('#searchResults');
    wrap.innerHTML = '';
    if (!q) return;
    const results = allLaws().filter(law => {
      const hay = [law.title, law.summary, law.body, (law.tags || []).join(' ')].join(' ').toLowerCase();
      return hay.includes(q);
    });
    if (!results.length) {
      wrap.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'empty-state';
      box.innerHTML = 'لا توجد نتائج مطابقة في القوانين المضافة.<br><button id="askAIFromSearch" class="btn-outline" style="margin-top:.7rem;">🤖 اسأل الذكاء الاصطناعي بدلاً من ذلك</button>';
      wrap.appendChild(box);
      el('#askAIFromSearch').addEventListener('click', () => {
        el('#searchOverlay').classList.add('hidden');
        switchView('view-ai');
        el('#aiInput').value = q;
        el('#aiInput').focus();
      });
      return;
    }
    results.forEach(law => {
      const row = lawRow(law);
      row.addEventListener('click', () => {
        el('#searchOverlay').classList.add('hidden');
      });
      wrap.appendChild(row);
    });
  });

  // ---------------- Menu button (shortcut to laws) ----------------
  el('#menuBtn').addEventListener('click', () => switchView('view-laws'));

  // ---------------- Helpers ----------------
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ---------------- Init ----------------
  function init() {
    const theme = store.get(LS.theme, 'light');
    const fontSize = store.get(LS.fontSize, 'medium');
    applyTheme(theme);
    applyFontSize(fontSize);
    loadData();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  init();
})();
