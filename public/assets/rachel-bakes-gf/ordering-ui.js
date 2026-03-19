/**
 * Ordering status UI controller (API-backed).
 *
 * Primary: fetch GET /api/ordering-status and use it as the source of truth.
 * Temporary fallback: uses window.RACHEL_BAKES_ORDERING when the API fails/unavailable.
 */
(function () {
  var fallbackConfig = window.RACHEL_BAKES_ORDERING;
  if (!fallbackConfig) return;

  // Fallback/default state (from ordering-config.js)
  var preorderOpen = fallbackConfig.preorderOpen === true;
  var customOrdersOpen = fallbackConfig.customOrdersOpen === true;
  var statusMessage = fallbackConfig.statusMessage || 'Ordering is currently closed.';

  var dailyCapCents = null;
  var todayTotalCents = null;

  function getOrderPagePath() {
    var pathname = (typeof window.location !== 'undefined' && window.location.pathname) || '';
    if (pathname.indexOf('custom-orders') !== -1) return 'custom-orders';
    if (pathname.indexOf('/order') !== -1) return 'order';
    if (pathname === '' || pathname === '/' || pathname === '/index.html' || pathname.match(/\/rachel-bakes-gf(\/index\.html)?\/?$/)) return 'home';
    return 'other';
  }

  function applyHeaderCta() {
    if (preorderOpen) return;
    var wrap = document.querySelector('.header-cta-wrap');
    if (!wrap) return;
    var link = wrap.querySelector('a');
    if (!link) return;
    link.textContent = 'Ordering closed';
    link.classList.add('ordering-closed');
    var orderHref = document.querySelector('.header-nav a[href*="order"], .header-mobile-nav a[href*="order"]');
    if (orderHref) {
      var href = orderHref.getAttribute('href');
      if (href && href.indexOf('#') !== 0 && href.indexOf('custom') === -1) link.setAttribute('href', href);
    }
    var mobileLinks = document.querySelectorAll('.header-mobile-nav a[href*="order"]');
    mobileLinks.forEach(function (a) {
      if (a.getAttribute('href') && a.getAttribute('href').indexOf('custom') === -1) {
        a.textContent = 'Order (closed)';
      }
    });
  }

  function getNotifySignupFormHtml() {
    return '<form id="notify-signup-form" class="ordering-notify-form mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" novalidate>' +
      '<input class="form-field" type="text" name="notify_name" placeholder="First name" />' +
      '<input class="form-field" type="email" name="notify_email" placeholder="Email" required />' +
      '<button type="submit" class="cta-secondary ordering-notify-btn">Notify me</button>' +
      '<div class="ordering-notify-status col-span-full mt-1 text-sm leading-6 text-[var(--muted)]" aria-live="polite"></div>' +
      '</form>';
  }

  function applyHomepage() {
    if (preorderOpen || getOrderPagePath() !== 'home') return;
    var main = document.querySelector('main');
    if (!main) return;
    var notice = document.createElement('section');
    notice.className = 'ordering-closed-notice';
    notice.id = 'notify-signup';
    notice.setAttribute('aria-live', 'polite');
    notice.innerHTML =
      '<div class="mx-auto max-w-site px-5">' +
        '<div class="ordering-closed-banner">' +
          '<p class="ordering-closed-banner-text">' + escapeHtml(statusMessage) + '</p>' +
          '<a href="./order/" class="ordering-closed-banner-link">See when ordering opens</a>' +
        '</div>' +
        '<div class="ordering-notify-signup surface-strong mt-6 rounded-[1.75rem] p-6">' +
          '<h2 class="font-display text-xl text-ink">Get notified when ordering opens</h2>' +
          '<p class="mt-2 text-sm leading-7 text-[var(--muted)]">Join the list for summer openings and holiday preorders. We’ll reach out when we’re taking orders again.</p>' +
          getNotifySignupFormHtml() +
        '</div>' +
      '</div>';
    main.insertBefore(notice, main.firstChild);

    var heroCtas = main.querySelectorAll('a.cta-primary[href*="order"]');
    heroCtas.forEach(function (a) {
      a.textContent = 'Ordering info';
      a.classList.remove('cta-primary');
      a.classList.add('cta-secondary', 'ordering-cta-info');
    });

    var readyCta = main.querySelector('section .cta-primary[href*="order"]');
    if (readyCta) {
      readyCta.textContent = 'Ordering info';
      readyCta.classList.remove('cta-primary');
      readyCta.classList.add('cta-secondary', 'ordering-cta-info');
      var ctaGrid = readyCta.parentElement;
      if (ctaGrid && ctaGrid.classList.contains('grid')) {
        var notifyLink = document.createElement('a');
        notifyLink.href = '#notify-signup';
        notifyLink.className = 'cta-secondary';
        notifyLink.textContent = 'Get notified when we open';
        ctaGrid.appendChild(notifyLink);
      }
    }
  }

  function applyOrderPage() {
    if (preorderOpen || getOrderPagePath() !== 'order') return;
    var requestEl = document.getElementById('request');
    if (!requestEl) return;
    var section = requestEl.closest('section');
    if (!section) return;
    var closed = document.createElement('div');
    closed.id = 'request';
    closed.className = 'surface-strong rounded-[2rem] p-7 ordering-closed-box';
    closed.innerHTML =
      '<h2 class="font-display text-3xl">Ordering is currently closed</h2>' +
      '<p class="mt-4 text-lg leading-8 text-[var(--muted)]">' + escapeHtml(statusMessage) + '</p>' +
      '<p class="mt-5 text-sm leading-7 text-[var(--muted)]">You can still browse the <a href="../menu/" class="text-rose font-medium hover:underline">menu</a>, check out the <a href="../gallery/" class="text-rose font-medium hover:underline">gallery</a>, and read our <a href="../pickup-policies/" class="text-rose font-medium hover:underline">pickup &amp; policies</a>. We’ll open for summer bakes and select holiday preorders—check back or follow along for updates.</p>' +
      '<div class="ordering-notify-signup mt-8 pt-8 border-t border-[var(--line)]">' +
        '<p class="font-display text-xl text-ink">Be the first to know when we open orders again</p>' +
        '<p class="mt-2 text-sm leading-7 text-[var(--muted)]">Get notified for summer openings and holiday preorder launches.</p>' +
        getNotifySignupFormHtml() +
      '</div>';
    requestEl.parentNode.replaceChild(closed, requestEl);
  }

  function applyCustomOrdersPage() {
    if (customOrdersOpen || getOrderPagePath() !== 'custom-orders') return;
    var inquiryEl = document.getElementById('inquiry');
    if (!inquiryEl) return;
    var closed = document.createElement('div');
    closed.id = 'inquiry';
    closed.className = 'surface-strong rounded-[2rem] p-7 ordering-closed-box';
    closed.innerHTML =
      '<h2 class="font-display text-3xl">Custom orders are not open right now</h2>' +
      '<p class="mt-4 text-lg leading-8 text-[var(--muted)]">' + escapeHtml(statusMessage) + '</p>' +
      '<p class="mt-5 text-sm leading-7 text-[var(--muted)]">When we open for custom orders again, we’ll take on a limited number of requests—simple celebration cakes, smaller batches, and things we can do well with enough notice. Check back or follow us for updates.</p>' +
      '<div class="mt-6 surface rounded-2xl p-5"><p class="text-sm font-semibold text-ink">What we offer when custom orders are open</p><ul class="info-list mt-3 space-y-2 text-sm leading-7 text-[var(--muted)]"><li>Simple celebration cakes</li><li>Limited flavor and style options</li><li>Orders with enough lead time for pickup in Liberty</li></ul></div>';
    inquiryEl.parentNode.replaceChild(closed, inquiryEl);
  }

  function escapeHtml(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function applyAll() {
    applyHeaderCta();
    applyHomepage();
    applyOrderPage();
    applyCustomOrdersPage();
  }

  function loadOrderingStatusFromApi() {
    // Netlify functions (via redirect) live at /api/ordering-status.
    // When hosting locally without netlify running, this fetch will fail and we fall back.
    return fetch('/api/ordering-status', { cache: 'no-store' })
      .then(function (res) {
        if (!res || !res.ok) throw new Error('ordering-status API returned ' + (res ? res.status : 'unknown'));
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        if (data.preorderOpen != null) preorderOpen = data.preorderOpen === true;
        if (data.customOrdersOpen != null) customOrdersOpen = data.customOrdersOpen === true;
        if (typeof data.statusMessage === 'string') statusMessage = data.statusMessage;
        if (data.dailyCapCents != null) dailyCapCents = Number(data.dailyCapCents);
        if (data.todayTotalCents != null) todayTotalCents = Number(data.todayTotalCents);
      });
  }

  function init() {
    loadOrderingStatusFromApi()
      .then(function () {
        applyAll();
      })
      .catch(function () {
        // Graceful fallback: keep whatever ordering-config.js set.
        applyAll();
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
