/* Premium PRO — minimal JS for navigation, reveal animations, filters, i18n switch, anti-spam */
(function () {
  const qs = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));

  const isEn = (() => {
    const lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    if (lang.startsWith('en')) return true;
    return /\/en(\/|$)/.test(window.location.pathname);
  })();

  const t = (ua, en) => (isEn ? en : ua);

  const currentFile = (() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    if (!last || !last.includes(".")) return "index.html";
    return last;
  })();

  // ---------------------------------------------------------------------------
  // Language switch (injected button)
  // ---------------------------------------------------------------------------
  (function injectLangSwitch() {
    const wrap = qs('.nav__cta');
    if (!wrap) return;
    if (qs('.lang-switch', wrap)) return;

    const file = currentFile;

    const href = isEn ? `../${file}` : `en/${file}`;

    const a = document.createElement('a');
    a.className = 'lang-switch';
    a.href = href;
    a.setAttribute('aria-label', t('English version', 'Українська версія'));
    a.setAttribute('title', t('English', 'Українська'));
    a.textContent = isEn ? 'UA' : 'EN';

    const burger = qs('[data-burger]', wrap);
    if (burger) wrap.insertBefore(a, burger);
    else wrap.appendChild(a);
  })();

  // ---------------------------------------------------------------------------
  // Mobile menu
  // ---------------------------------------------------------------------------
  const burger = qs('[data-burger]');
  const mobilePanel = qs('[data-mobile-panel]');
  if (burger && mobilePanel) {
    burger.addEventListener('click', () => {
      const expanded = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!expanded));
      mobilePanel.hidden = expanded;
    });

    // Close on link click
    qsa('a', mobilePanel).forEach((a) => {
      a.addEventListener('click', () => {
        burger.setAttribute('aria-expanded', 'false');
        mobilePanel.hidden = true;
      });
    });
  }

  
  // ---------------------------------------------------------------------------
  // Bottom mobile navigation (PRO)
  // ---------------------------------------------------------------------------
  (function injectBottomNav() {
    if (qs('.bottom-nav')) return;

    const desktopNav = qs('.nav');
    if (!desktopNav) return;

    const navLinks = qsa('a', desktopNav).filter((a) => {
      const href = (a.getAttribute('href') || '').trim();
      return href && !/order\.html$/i.test(href);
    });

    if (navLinks.length < 2) return;

    const iconBase = isEn ? '../assets/icons/' : 'assets/icons/';
    const iconFor = (href) => {
      const h = (href || '').toLowerCase();
      if (h.includes('about')) return 'compass.svg';
      if (h.includes('projects')) return 'blueprint.svg';
      if (h.includes('services')) return 'clipboard-check.svg';
      if (h.includes('blog')) return 'chart.svg';
      return 'compass.svg';
    };

    const wrap = document.createElement('nav');
    wrap.className = 'bottom-nav';
    wrap.setAttribute('aria-label', t('Швидка навігація', 'Quick navigation'));

    const inner = document.createElement('div');
    inner.className = 'bottom-nav__inner';

    navLinks.slice(0, 4).forEach((a) => {
      const href = (a.getAttribute('href') || '').trim();
      const label = (a.textContent || '').trim();

      const item = document.createElement('a');
      item.className = 'bn__item';
      item.href = href;
      if (href === currentFile) item.setAttribute('aria-current', 'page');

      const img = document.createElement('img');
      img.src = iconBase + iconFor(href);
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');

      const span = document.createElement('span');
      span.textContent = label;

      item.appendChild(img);
      item.appendChild(span);
      inner.appendChild(item);
    });

    wrap.appendChild(inner);
    document.body.appendChild(wrap);
  })();

// ---------------------------------------------------------------------------
  // Reveal on scroll
  // ---------------------------------------------------------------------------
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealEls = qsa('.reveal');
  if (!prefersReduced && revealEls.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  // ---------------------------------------------------------------------------
  // Projects filters
  // ---------------------------------------------------------------------------
  const filterWrap = qs('[data-filters]');
  if (filterWrap) {
    const chips = qsa('[data-filter]', filterWrap);
    const cards = qsa('[data-project]');
    const setActive = (chip) => {
      chips.forEach((c) => c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'));
    };
    const apply = (cat) => {
      cards.forEach((card) => {
        const cats = (card.getAttribute('data-categories') || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        const show = cat === 'all' ? true : cats.includes(cat);
        card.style.display = show ? '' : 'none';
      });
    };
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const cat = chip.getAttribute('data-filter') || 'all';
        setActive(chip);
        apply(cat);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Order form — anti-spam foundation + (optional) Turnstile + endpoint hook
  // ---------------------------------------------------------------------------
  const orderForm = qs('#orderForm');
  if (orderForm) {
    const status = qs('#formStatus');
    const setStatus = (msg, ok) => {
      if (!status) return;
      status.textContent = msg || '';
      status.style.color = ok ? '#05603a' : '#b42318';
    };

    // Config: you can override in console or by editing this object
    const CFG = Object.assign(
      {
        formEndpoint: '', // e.g. https://your-worker.yourdomain.workers.dev/api/order
        turnstileSiteKey: '0x4AAAAAACmJMwrZ8JNi4ty5', // Cloudflare Turnstile site key (optional)
        minFillMs: 2500, // minimum time a human needs to fill the form
        minIntervalMs: 45000, // rate limit per browser
      },
      window.SIP_CONFIG || {}
    );

    // Per-page overrides (recommended): <form id="orderForm" data-endpoint="/api/order" data-turnstile-sitekey="...">
    const dsEndpoint = String(orderForm.getAttribute("data-endpoint") || "").trim();
    if (dsEndpoint) CFG.formEndpoint = dsEndpoint;
    const dsKeyRaw = String(orderForm.getAttribute("data-turnstile-sitekey") || "").trim();
    const dsKey = /^(__|replace|your|demo)/i.test(dsKeyRaw) ? "" : dsKeyRaw;
    if (dsKey) CFG.turnstileSiteKey = dsKey;

    // Hidden honeypot (bots often fill every field)
    const hpWrap = document.createElement('div');
    hpWrap.style.position = 'absolute';
    hpWrap.style.left = '-9999px';
    hpWrap.style.width = '1px';
    hpWrap.style.height = '1px';
    hpWrap.style.overflow = 'hidden';
    hpWrap.setAttribute('aria-hidden', 'true');

    const hpInput = document.createElement('input');
    hpInput.type = 'text';
    hpInput.name = 'website';
    hpInput.autocomplete = 'off';
    hpInput.tabIndex = -1;

    hpWrap.appendChild(hpInput);
    orderForm.insertBefore(hpWrap, orderForm.firstChild);

    // Timestamp (basic "fill time" check)
    const tsInput = document.createElement('input');
    tsInput.type = 'hidden';
    tsInput.name = 'ts';
    tsInput.value = String(Date.now());
    orderForm.appendChild(tsInput);

    // Interaction tracking (bots submit without any real interaction)
    let interacted = false;
    const markInteracted = () => {
      interacted = true;
      window.removeEventListener('pointerdown', markInteracted, true);
      window.removeEventListener('keydown', markInteracted, true);
      window.removeEventListener('touchstart', markInteracted, true);
    };
    window.addEventListener('pointerdown', markInteracted, true);
    window.addEventListener('keydown', markInteracted, true);
    window.addEventListener('touchstart', markInteracted, { capture: true, passive: true });

    // Optional: Turnstile widget
    const ensureTurnstile = () => {
      if (!CFG.turnstileSiteKey) return;
      if (qs('.cf-turnstile', orderForm)) return;

      const wrap = document.createElement('div');
      wrap.className = 'field';
      const widget = document.createElement('div');
      widget.className = 'cf-turnstile';
      widget.setAttribute('data-sitekey', CFG.turnstileSiteKey);
      widget.setAttribute('data-theme', 'light');
      wrap.appendChild(widget);

      // Insert right before the submit button
      const submitBtn = qs('button[type="submit"]', orderForm);
      if (submitBtn && submitBtn.parentElement) {
        submitBtn.parentElement.insertBefore(wrap, submitBtn);
      } else {
        orderForm.appendChild(wrap);
      }

      // Load Turnstile script once
      if (!qs('script[data-turnstile]', document)) {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        s.async = true;
        s.defer = true;
        s.setAttribute('data-turnstile', 'true');
        document.head.appendChild(s);
      }
    };

    ensureTurnstile();

    const MSG_REQUIRED = t('Будь ласка, заповніть обов’язкові поля.', 'Please fill in the required fields.');
    const MSG_TURNSTILE_CONFIG = t(
      'Форма ще налаштовується. Будь ласка, спробуйте пізніше або напишіть нам на email.',
      'The form is being configured. Please try again later or email us.'
    );
    const MSG_DEMO_OK = t(
      'Дякуємо! Запит надіслано (демо). Підключимо реальну відправку на email/CRM на наступному етапі.',
      'Thank you! The request has been sent (demo). We will connect real delivery to email/CRM at the next stage.'
    );
    const MSG_SPAM = t(
      'Перевірка безпеки: зачекайте кілька секунд і спробуйте ще раз.',
      'Security check: please wait a few seconds and try again.'
    );
    const MSG_RATE = t('Забагато спроб. Спробуйте трохи пізніше.', 'Too many attempts. Please try again a bit later.');
    const MSG_SENT = t('Дякуємо! Заявку надіслано.', 'Thank you! Your request has been sent.');
    const MSG_FAIL = t(
      'Помилка відправки. Спробуйте ще раз або напишіть нам на email.',
      'Sending failed. Please try again or email us.'
    );

    const getLastSubmit = () => {
      try {
        return Number(localStorage.getItem('sip_last_submit') || 0);
      } catch (_) {
        return 0;
      }
    };
    const setLastSubmit = (ts) => {
      try {
        localStorage.setItem('sip_last_submit', String(ts));
      } catch (_) {
        /* ignore */
      }
    };

    const serialize = () => {
      const data = {};
      const fd = new FormData(orderForm);
      fd.forEach((value, key) => {
        data[key] = String(value);
      });
      return data;
    };

    orderForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Required fields validation
      const required = qsa('[required]', orderForm);
      const firstInvalid = required.find((el) => !String(el.value || '').trim());
      if (firstInvalid) {
        firstInvalid.focus();
        setStatus(MSG_REQUIRED, false);
        return;
      }

      // Anti-spam: honeypot
      if (hpInput.value.trim()) {
        // Silent drop (bot)
        orderForm.reset();
        setStatus('', true);
        return;
      }

      // Anti-spam: interaction + fill time
      const startedAt = Number(tsInput.value || 0);
      const now = Date.now();
      if (!interacted || (startedAt && now - startedAt < CFG.minFillMs)) {
        setStatus(MSG_SPAM, false);
        return;
      }

      // Anti-spam: rate limiting (browser-level)
      const last = getLastSubmit();
      if (last && now - last < CFG.minIntervalMs) {
        setStatus(MSG_RATE, false);
        return;
      }

      // PRO: if a real endpoint is set, Turnstile should also be configured
      const requiresTurnstile = Boolean(CFG.formEndpoint);
      if (requiresTurnstile && !CFG.turnstileSiteKey) {
        setStatus(MSG_TURNSTILE_CONFIG, false);
        return;
      }

      // Anti-spam: if Turnstile is enabled — require token
      if (CFG.turnstileSiteKey) {
        const tokenEl = qs('input[name="cf-turnstile-response"]', orderForm);
        const token = tokenEl ? String(tokenEl.value || '').trim() : '';
        if (!token) {
          setStatus(MSG_SPAM, false);
          return;
        }
      }

      // If endpoint is not configured — demo mode (still protected by anti-spam checks above)
      if (!CFG.formEndpoint) {
        setStatus(MSG_DEMO_OK, true);
        setLastSubmit(now);
        orderForm.reset();
        // Refresh the timestamp so next submission isn't auto-blocked
        tsInput.value = String(Date.now());
        interacted = false;
        window.addEventListener('pointerdown', markInteracted, true);
        window.addEventListener('keydown', markInteracted, true);
        window.addEventListener('touchstart', markInteracted, { capture: true, passive: true });
        return;
      }

      // Real submit (expects JSON endpoint)
      try {
        setStatus(t('Надсилаємо…', 'Sending…'), true);

        const payload = serialize();
        payload.__lang = isEn ? 'en' : 'uk';
        payload.__ua = navigator.userAgent || '';
        payload.__page = window.location.href || '';
        payload.__ts_client = String(now);

        const res = await fetch(CFG.formEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error('bad status');
        setStatus(MSG_SENT, true);
        setLastSubmit(now);
        orderForm.reset();
        tsInput.value = String(Date.now());
      } catch (err) {
        setStatus(MSG_FAIL, false);
      }
    });
  }
})();
