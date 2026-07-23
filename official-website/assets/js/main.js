// السلوك المشترك لصفحات الموقع: القائمة، السلايدر، العدادات، الفلترة
(function () {
  'use strict';

  // ---------- القائمة على الهاتف ----------
  const menuBtn = document.getElementById('menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => {
      const open = mobileMenu.classList.toggle('hidden') === false;
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    mobileMenu.addEventListener('click', (e) => {
      if (e.target.closest('a')) mobileMenu.classList.add('hidden');
    });
  }

  // ---------- ظل شريط التنقل عند التمرير ----------
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  // ---------- سنة التذييل ----------
  document.querySelectorAll('#year').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  // ---------- السلايدر ----------
  const slider = document.getElementById('slider');
  if (slider) {
    const slides = slider.querySelectorAll('.slide');
    const dotsWrap = document.getElementById('slider-dots');
    let current = 0;
    let timer = null;

    slides.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'slider-dot' + (i === 0 ? ' dot-active' : '');
      dot.setAttribute('aria-label', 'الانتقال إلى الشريحة ' + (i + 1));
      dot.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(dot);
    });
    const dots = dotsWrap.querySelectorAll('.slider-dot');

    function goTo(index) {
      slides[current].classList.remove('slide-active');
      dots[current].classList.remove('dot-active');
      current = (index + slides.length) % slides.length;
      slides[current].classList.add('slide-active');
      dots[current].classList.add('dot-active');
      restart();
    }

    function restart() {
      clearInterval(timer);
      timer = setInterval(() => goTo(current + 1), 6000);
    }

    document.getElementById('slide-next').addEventListener('click', () => goTo(current + 1));
    document.getElementById('slide-prev').addEventListener('click', () => goTo(current - 1));
    slider.addEventListener('mouseenter', () => clearInterval(timer));
    slider.addEventListener('mouseleave', restart);
    restart();
  }

  // ---------- عدادات الإحصائيات ----------
  const statNums = document.querySelectorAll('.stat-num[data-count]');
  if (statNums.length) {
    const fmt = new Intl.NumberFormat('ar-IQ');
    const animate = (el) => {
      const target = parseInt(el.dataset.count, 10);
      const duration = 1800;
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        // منحنى تباطؤ في النهاية
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt.format(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animate(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    statNums.forEach((el) => observer.observe(el));
  }

  // ---------- فلترة الإنجازات والأنشطة ----------
  const newsFilters = document.getElementById('news-filters');
  const newsGrid = document.getElementById('news-grid');
  if (newsFilters && newsGrid) {
    const cards = newsGrid.querySelectorAll('.news-card');
    const emptyMsg = document.getElementById('news-empty');
    newsFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      newsFilters.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('filter-active'));
      btn.classList.add('filter-active');
      const filter = btn.dataset.filter;
      let visible = 0;
      cards.forEach((card) => {
        const show = filter === 'all' || card.dataset.category === filter;
        card.classList.toggle('hidden', !show);
        if (show) visible++;
      });
      emptyMsg.classList.toggle('hidden', visible > 0);
    });
  }

  // ---------- تكبير بطاقة الخبر ----------
  const newsModal = document.getElementById('news-modal');
  if (newsModal && newsGrid) {
    const open = (card) => {
      newsModal.querySelector('#news-modal-badge').textContent = card.querySelector('.news-badge').textContent;
      newsModal.querySelector('#news-modal-title').textContent = card.querySelector('.news-title').textContent;
      newsModal.querySelector('#news-modal-date').textContent = card.querySelector('.news-date').textContent;
      newsModal.querySelector('#news-modal-text').textContent = card.querySelector('.news-text').textContent;
      newsModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    };
    const close = () => {
      newsModal.classList.add('hidden');
      document.body.style.overflow = '';
    };
    newsGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.news-card');
      if (card) open(card);
    });
    newsGrid.addEventListener('keydown', (e) => {
      const card = e.target.closest('.news-card');
      if (card && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        open(card);
      }
    });
    newsModal.querySelectorAll('[data-close-modal]').forEach((el) => el.addEventListener('click', close));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !newsModal.classList.contains('hidden')) close();
    });
  }

  // ---------- بحث وفلترة جدول النتائج ----------
  const resultsTable = document.getElementById('results-table');
  if (resultsTable) {
    const searchInput = document.getElementById('results-search');
    const regionSelect = document.getElementById('results-region');
    const yearSelect = document.getElementById('results-year');
    const rows = resultsTable.querySelectorAll('tbody .row');
    const emptyMsg = document.getElementById('results-empty');

    const applyFilters = () => {
      const q = searchInput.value.trim().toLowerCase();
      const region = regionSelect.value;
      const year = yearSelect.value;
      let visible = 0;
      rows.forEach((row) => {
        const cells = row.querySelectorAll('.td');
        const rowYear = cells[0].textContent.trim();
        const rowRegion = cells[1].textContent.trim();
        const text = row.textContent.toLowerCase();
        const show =
          (!q || text.includes(q)) &&
          (!region || rowRegion === region) &&
          (!year || rowYear === year);
        row.classList.toggle('hidden', !show);
        if (show) visible++;
      });
      emptyMsg.classList.toggle('hidden', visible > 0);
    };

    searchInput.addEventListener('input', applyFilters);
    regionSelect.addEventListener('change', applyFilters);
    yearSelect.addEventListener('change', applyFilters);

    // أزرار التحميل تجريبية في هذه المرحلة (تُربط بملفات حقيقية مع الخادم)
    resultsTable.addEventListener('click', (e) => {
      if (e.target.closest('.dl-btn')) {
        alert('نسخة تجريبية: سيتم ربط الملفات الرسمية عند تفعيل الخادم (المرحلة الثانية).');
      }
    });
  }
})();
