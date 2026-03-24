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
    return (
      '<form data-rbgf-notify="1" class="ordering-notify-form grid gap-3 sm:grid-cols-2" novalidate>' +
      '<input class="form-field sm:col-span-2" type="email" name="notify_email" placeholder="Email *" autocomplete="email" required />' +
      '<input class="form-field" type="text" name="notify_name" placeholder="First name" autocomplete="given-name" />' +
      '<input class="form-field" type="tel" name="notify_phone" placeholder="Phone (optional)" autocomplete="tel" />' +
      '<div class="sm:col-span-2 space-y-2">' +
      '<p class="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Optional — what to notify you about</p>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm leading-6 text-[var(--sf-text)]">' +
      '<label class="flex gap-2 items-start cursor-pointer"><input type="checkbox" name="interest_preorder_drops" class="mt-1" /> <span>Preorder drops</span></label>' +
      '<label class="flex gap-2 items-start cursor-pointer"><input type="checkbox" name="interest_custom_availability" class="mt-1" /> <span>Custom availability</span></label>' +
      '<label class="flex gap-2 items-start cursor-pointer"><input type="checkbox" name="interest_holiday_specials" class="mt-1" /> <span>Dinner rolls &amp; holiday tables</span></label>' +
      '<label class="flex gap-2 items-start cursor-pointer"><input type="checkbox" name="interest_pickup_updates" class="mt-1" /> <span>Pickup updates</span></label>' +
      '</div></div>' +
      '<button type="submit" class="cta-secondary ordering-notify-btn sm:col-span-2">Sign up for notifications</button>' +
      '<div class="ordering-notify-status sm:col-span-2 text-sm leading-6 text-[var(--muted)]" aria-live="polite"></div>' +
      '</form>'
    );
  }

  var MODAL_DISMISS_KEY = 'rbgf_notify_modal_dismissed';
  var MODAL_SUB_KEY = 'rbgf_notify_modal_subscribed';

  function setupOrderingClosedModal() {
    if (preorderOpen || getOrderPagePath() !== 'home') return;
    if (document.getElementById('rbgf-ordering-modal')) return;
    try {
      if (sessionStorage.getItem(MODAL_DISMISS_KEY) === '1') return;
      if (sessionStorage.getItem(MODAL_SUB_KEY) === '1') return;
    } catch (e) {
      /* sessionStorage unavailable — still show modal once */
    }

    var opened = false;
    var delayMs = 800;
    var delayTimer = null;
    var prevFocus = null;

    var wrap = document.createElement('div');
    wrap.id = 'rbgf-ordering-modal';
    wrap.className = 'rbgf-ordering-modal';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<div class="rbgf-ordering-modal__backdrop" tabindex="-1" data-rbgf-close-modal></div>' +
      '<div class="rbgf-ordering-modal__sheet" role="dialog" aria-modal="true" aria-labelledby="rbgf-om-title">' +
        '<button type="button" class="rbgf-om-close" aria-label="Close" data-rbgf-close-modal>' +
          '<span aria-hidden="true">×</span>' +
        '</button>' +
        '<div class="rbgf-om-grid">' +
          '<div class="rbgf-om-visual">' +
            '<img src="Rachel Bakes GF-Pics/menu-soft-pretzel-bites.jpg" alt="" width="640" height="800" loading="lazy" decoding="async" />' +
          '</div>' +
          '<div class="rbgf-om-copy">' +
            '<p class="rbgf-om-kicker">Preorder pickup · Liberty, Missouri</p>' +
            '<h2 id="rbgf-om-title" class="rbgf-om-title">Ordering is closed right now</h2>' +
            '<p class="rbgf-om-lead">' + escapeHtml(statusMessage) + '</p>' +
            '<p class="rbgf-om-hint">Get a reopening alert — we’ll only use this to let you know when preorder opens again.</p>' +
            '<form id="notify-signup-modal-form" data-rbgf-notify="1" class="rbgf-om-form ordering-notify-form" novalidate>' +
              '<label class="rbgf-om-label">' +
                '<span class="rbgf-om-label-text">Email <abbr title="required">*</abbr></span>' +
                '<input class="form-field rbgf-om-input" type="email" name="notify_email" placeholder="you@example.com" autocomplete="email" required />' +
              '</label>' +
              '<label class="rbgf-om-label">' +
                '<span class="rbgf-om-label-text">First name <span class="rbgf-om-opt">(optional)</span></span>' +
                '<input class="form-field rbgf-om-input" type="text" name="notify_name" placeholder="First name" autocomplete="given-name" />' +
              '</label>' +
              '<label class="rbgf-om-label">' +
                '<span class="rbgf-om-label-text">Phone <span class="rbgf-om-opt">(optional)</span></span>' +
                '<input class="form-field rbgf-om-input" type="tel" name="notify_phone" placeholder="Phone" autocomplete="tel" />' +
              '</label>' +
              '<div class="rbgf-om-label" style="margin-top:0.5rem">' +
                '<span class="rbgf-om-label-text">Interests <span class="rbgf-om-opt">(optional)</span></span>' +
                '<div class="mt-2 space-y-2 text-sm">' +
                  '<label class="flex gap-2 items-start cursor-pointer"><input type="checkbox" name="interest_preorder_drops" class="mt-0.5" /> <span>Preorder drops</span></label>' +
                  '<label class="flex gap-2 items-start cursor-pointer"><input type="checkbox" name="interest_custom_availability" class="mt-0.5" /> <span>Custom availability</span></label>' +
                  '<label class="flex gap-2 items-start cursor-pointer"><input type="checkbox" name="interest_holiday_specials" class="mt-0.5" /> <span>Dinner rolls &amp; holiday tables</span></label>' +
                  '<label class="flex gap-2 items-start cursor-pointer"><input type="checkbox" name="interest_pickup_updates" class="mt-0.5" /> <span>Pickup updates</span></label>' +
                '</div>' +
              '</div>' +
              '<button type="submit" class="rbgf-om-submit ordering-notify-btn">Notify me when ordering opens</button>' +
              '<div class="ordering-notify-status rbgf-om-status" aria-live="polite"></div>' +
            '</form>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(wrap);

    var emailInput = wrap.querySelector('input[name="notify_email"]');

    function shouldBlock() {
      if (preorderOpen) return true;
      try {
        if (sessionStorage.getItem(MODAL_DISMISS_KEY) === '1') return true;
        if (sessionStorage.getItem(MODAL_SUB_KEY) === '1') return true;
      } catch (err) {
        /* ignore */
      }
      return false;
    }

    function openModal() {
      if (opened) return;
      if (shouldBlock()) return;
      opened = true;
      if (delayTimer) {
        clearTimeout(delayTimer);
        delayTimer = null;
      }
      wrap.classList.add('rbgf-ordering-modal--open');
      wrap.setAttribute('aria-hidden', 'false');
      document.body.classList.add('rbgf-modal-open');
      prevFocus = document.activeElement;
      if (emailInput) {
        setTimeout(function () {
          emailInput.focus();
        }, 80);
      }
    }

    function hideModalVisual() {
      wrap.classList.remove('rbgf-ordering-modal--open');
      wrap.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('rbgf-modal-open');
      if (prevFocus && typeof prevFocus.focus === 'function') {
        try {
          prevFocus.focus();
        } catch (f) {
          /* ignore */
        }
      }
    }

    function dismissModal() {
      try {
        sessionStorage.setItem(MODAL_DISMISS_KEY, '1');
      } catch (e2) {
        /* ignore */
      }
      hideModalVisual();
    }

    function onWaitlistSuccess() {
      if (delayTimer) {
        clearTimeout(delayTimer);
        delayTimer = null;
      }
      if (!opened) return;
      setTimeout(function () {
        hideModalVisual();
      }, 1100);
    }

    function onKeydown(e) {
      if (e.key !== 'Escape') return;
      if (!wrap.classList.contains('rbgf-ordering-modal--open')) return;
      dismissModal();
    }

    wrap.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('[data-rbgf-close-modal]')) {
        dismissModal();
      }
    });

    document.addEventListener('rbgf:waitlist-success', onWaitlistSuccess);
    document.addEventListener('keydown', onKeydown);

    delayTimer = setTimeout(function () {
      delayTimer = null;
      openModal();
    }, delayMs);
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
        '<div class="ordering-status-module">' +
          '<div class="ordering-status-copy">' +
            '<h2>Ordering is closed right now</h2>' +
            '<p>' + escapeHtml(statusMessage) + '</p>' +
            '<div class="ordering-status-pills"><span>Summer openings</span><span>Holiday preorder windows</span><span>Pickup in Liberty</span></div>' +
          '</div>' +
          '<div class="ordering-notify-signup">' +
            getNotifySignupFormHtml() +
          '</div>' +
        '</div>' +
      '</div>';
    /* After hero stack: strip sits below full-bleed hero + fixed header — never tucked under nav */
    var heroStack = main.querySelector('.rbgf-hero-stack');
    if (heroStack) {
      main.insertBefore(notice, heroStack.nextSibling);
    } else {
      main.insertBefore(notice, main.firstChild);
    }

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

    setupOrderingClosedModal();
  }

  function applyOrderPage() {
    if (preorderOpen || getOrderPagePath() !== 'order') return;
    var requestEl = document.getElementById('request');
    if (!requestEl) return;
    var section = requestEl.closest('section');
    if (!section) return;
    var closed = document.createElement('div');
    closed.id = 'request';
    closed.className = 'surface-strong compact-form-panel ordering-closed-box';
    closed.innerHTML =
      '<h2 class="font-display text-3xl">Ordering is currently closed</h2>' +
      '<p class="mt-3 text-base leading-7 text-[var(--muted)]">' + escapeHtml(statusMessage) + '</p>' +
      '<p class="mt-3 text-sm leading-7 text-[var(--muted)]">You can still browse the <a href="../menu/" class="text-rose font-medium hover:underline">menu</a>, check out the <a href="../gallery/" class="text-rose font-medium hover:underline">gallery</a>, and review <a href="../pickup-policies/" class="text-rose font-medium hover:underline">pickup &amp; policies</a>.</p>' +
      '<div class="ordering-notify-signup mt-5 pt-5 border-t border-[var(--line)]">' +
        '<p class="font-display text-xl text-ink">Get notified when we reopen</p>' +
        '<p class="mt-1 text-sm leading-7 text-[var(--muted)]">Join the list for summer and holiday preorder windows.</p>' +
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
    closed.className = 'surface-strong compact-form-panel ordering-closed-box';
    closed.innerHTML =
      '<h2 class="font-display text-3xl">Custom orders are not open right now</h2>' +
      '<p class="mt-3 text-base leading-7 text-[var(--muted)]">' + escapeHtml(statusMessage) + '</p>' +
      '<p class="mt-3 text-sm leading-7 text-[var(--muted)]">When custom inquiries reopen, we’ll take a limited number of straightforward requests—usually carrot cake and small preference notes—with enough notice.</p>' +
      '<div class="mt-4 surface rounded-2xl p-4"><p class="text-sm font-semibold text-ink">When open, we use this form for:</p><ul class="info-list mt-2 space-y-1 text-sm leading-7 text-[var(--muted)]"><li>Carrot cake and simple preferences (nuts, frosting)</li><li>Pickup timing in Liberty</li><li>Clear quantity and dates—no design briefs required</li></ul></div>';
    inquiryEl.parentNode.replaceChild(closed, inquiryEl);
  }

  function escapeHtml(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function applyStatusStrip() {
    var el = document.getElementById('rbgf-ordering-status-strip');
    if (!el) return;
    var capMsg = '';
    if (
      preorderOpen &&
      dailyCapCents != null &&
      todayTotalCents != null &&
      Number.isFinite(Number(dailyCapCents)) &&
      Number(dailyCapCents) > 0
    ) {
      var capD = Math.round(Number(dailyCapCents) / 100);
      var todayD = Math.round(Number(todayTotalCents) / 100);
      capMsg =
        ' · Today’s preorder volume: ~$' +
        todayD +
        ' of $' +
        capD +
        ' daily cap';
    }
    if (preorderOpen) {
      var policiesHref = './pickup-policies/';
      if (getOrderPagePath() === 'order') policiesHref = '../pickup-policies/';
      el.innerHTML =
        '<div class="mx-auto max-w-site px-5 py-3">' +
        '<p class="text-sm leading-6 text-[var(--sf-muted)]">' +
        '<span class="font-semibold text-[var(--sf-text)]">Preorder is open.</span> ' +
        'Pickup is in Liberty — we confirm your window when your bake is scheduled. ' +
        '<a href="' +
        policiesHref +
        '" class="text-rose font-medium hover:underline">Pickup &amp; policies</a>' +
        capMsg +
        '</p></div>';
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  function applyAll() {
    applyHeaderCta();
    applyHomepage();
    applyOrderPage();
    applyCustomOrdersPage();
    applyStatusStrip();
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
