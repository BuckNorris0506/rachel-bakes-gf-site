/**
 * Rachel Bakes GF — customer forms (preorder, custom order, waitlist, contact).
 *
 * POST /api/preorder-submit      — structured line items + tentative revenue + per-date soft cap
 * POST /api/custom-order-submit  — custom inquiries (gated by custom_orders_open)
 * POST /api/waitlist-signup      — notification interests + email
 * POST /api/contact-submit       — general questions (always when Supabase configured)
 */

function ensurePreorderStatusEl(form) {
  var statusEl = form.querySelector('.ordering-preorder-status');
  if (statusEl) return statusEl;
  statusEl = document.createElement('div');
  statusEl.className = 'ordering-preorder-status mt-4 text-sm leading-7 text-[var(--muted)]';
  statusEl.setAttribute('aria-live', 'polite');
  form.insertAdjacentElement('afterend', statusEl);
  return statusEl;
}

function collectPreorderLineItems(form) {
  var keys = ["pretzel_20_orders", "cinnamon_6", "cinnamon_12", "cream_pies", "rolls_6", "rolls_12"];
  var out = {};
  var any = false;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var el = form.querySelector('[name="' + k + '"]');
    var v = el ? parseInt(String(el.value || "0"), 10) : 0;
    if (!Number.isFinite(v) || v < 0) v = 0;
    if (v > 999) v = 999;
    out[k] = v;
    if (v > 0) any = true;
  }
  return any ? out : null;
}

function handlePreorderSubmit(e) {
  e.preventDefault();
  var form = e.target;
  var nameEl = form.querySelector('[name="name"]');
  var contactEl = form.querySelector('[name="contact"]');
  var dateSel = form.querySelector('select[name="pickup_date"]');
  var pickupSel = form.querySelector('select[name="pickup_window"]');
  var paySel = form.querySelector('select[name="payment_preference"]');

  if (!nameEl || !contactEl) return;

  var nameVal = (nameEl.value || '').trim();
  var contactVal = (contactEl.value || '').trim();
  var lineItems = collectPreorderLineItems(form);
  var dateVal = dateSel && !dateSel.disabled ? (dateSel.value || '').trim() : '';
  var pickupVal = pickupSel && !pickupSel.disabled ? (pickupSel.value || '').trim() : '';
  var payVal = paySel ? (paySel.value || '').trim() : '';

  var statusEl = ensurePreorderStatusEl(form);
  statusEl.textContent = '';
  statusEl.classList.remove('text-[var(--rose)]');
  statusEl.classList.remove('text-[var(--cocoa)]');
  statusEl.classList.add('text-[var(--muted)]');

  if (!nameVal) {
    nameEl.focus();
    return;
  }
  if (!contactVal) {
    contactEl.focus();
    return;
  }
  if (!lineItems) {
    statusEl.textContent = 'Choose at least one item (quantity greater than zero).';
    statusEl.classList.add('text-[var(--rose)]');
    statusEl.classList.remove('text-[var(--muted)]');
    var firstQty = form.querySelector('input[name="pretzel_20_orders"]');
    if (firstQty) firstQty.focus();
    return;
  }

  if (dateSel && dateSel.disabled) {
    statusEl.textContent = 'No pickup dates are available right now. Please try again later or use Contact.';
    statusEl.classList.add('text-[var(--rose)]');
    statusEl.classList.remove('text-[var(--muted)]');
    return;
  }
  if (!dateVal) {
    if (dateSel) dateSel.focus();
    statusEl.textContent = 'Please choose a pickup date.';
    statusEl.classList.add('text-[var(--rose)]');
    statusEl.classList.remove('text-[var(--muted)]');
    return;
  }
  if (pickupSel && pickupSel.disabled) {
    statusEl.textContent = 'No pickup windows are available for that date.';
    statusEl.classList.add('text-[var(--rose)]');
    statusEl.classList.remove('text-[var(--muted)]');
    return;
  }
  if (!pickupVal) {
    if (pickupSel) pickupSel.focus();
    statusEl.textContent = 'Please choose a pickup window.';
    statusEl.classList.add('text-[var(--rose)]');
    statusEl.classList.remove('text-[var(--muted)]');
    return;
  }
  if (!payVal || (payVal !== 'Card' && payVal !== 'Cash at pickup')) {
    if (paySel) paySel.focus();
    statusEl.textContent = 'Please choose how you would like to pay.';
    statusEl.classList.add('text-[var(--rose)]');
    statusEl.classList.remove('text-[var(--muted)]');
    return;
  }

  var submitBtn = form.querySelector('button[type="submit"], .cta-primary');
  var prevBtnText = submitBtn ? submitBtn.textContent : null;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }

  fetch('/api/preorder-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nameVal,
      contact: contactVal,
      line_items: lineItems,
      pickup_date: dateVal,
      pickup_window: pickupVal,
      payment_preference: payVal,
      notes: (form.querySelector('[name="notes"]') && form.querySelector('[name="notes"]').value) || '',
    }),
  })
    .then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) { return { ok: res.ok, data: data }; });
    })
    .then(function (out) {
      if (!out || !out.data) throw new Error('Invalid response from server.');
      if (out.data.success) {
        var msg = out.data.message || 'Thanks! Your preorder request is saved.';
        statusEl.textContent = msg;
        statusEl.classList.remove('text-[var(--rose)]');
        statusEl.classList.add('text-[var(--cocoa)]');
        form.reset();
        try {
          form.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (err) {
          /* ignore */
        }
        if (typeof window.rbgfRefreshPreorderPickupSelect === 'function') {
          window.rbgfRefreshPreorderPickupSelect();
        }
      } else {
        statusEl.textContent = out.data.error || "We couldn't save your preorder. Please try again.";
        statusEl.classList.remove('text-[var(--cocoa)]');
        statusEl.classList.add('text-[var(--rose)]');
      }
    })
    .catch(function () {
      statusEl.textContent = "We couldn't save your preorder. Please try again.";
      statusEl.classList.remove('text-[var(--cocoa)]');
      statusEl.classList.add('text-[var(--rose)]');
    })
    .finally(function () {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = prevBtnText || 'Send my request';
      }
    });
}

function handleCustomOrderSubmit(e) {
  e.preventDefault();
  var form = e.target;
  var nameEl = form.querySelector('[name="name"]');
  var emailEl = form.querySelector('[name="email"]');
  if (!nameEl || !emailEl) return;
  var nameVal = (nameEl.value || '').trim();
  var emailVal = (emailEl.value || '').trim();
  var phoneVal = (form.querySelector('[name="phone"]') && form.querySelector('[name="phone"]').value) || '';
  phoneVal = String(phoneVal).trim();

  if (!nameVal) {
    nameEl.focus();
    return;
  }
  var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);
  if (!emailOk) {
    emailEl.focus();
    return;
  }

  var paySel = form.querySelector('[name="payment_preference"]');
  var payVal = paySel ? (paySel.value || '').trim() : '';

  function ensureCustomStatusEl() {
    var statusEl = form.querySelector('.ordering-custom-status');
    if (statusEl) return statusEl;
    statusEl = document.createElement('div');
    statusEl.className = 'ordering-custom-status mt-4 text-sm leading-7 text-[var(--muted)]';
    statusEl.setAttribute('aria-live', 'polite');
    form.insertAdjacentElement('afterend', statusEl);
    return statusEl;
  }

  var statusEl = ensureCustomStatusEl();
  statusEl.textContent = '';
  statusEl.classList.remove('text-[var(--rose)]');
  statusEl.classList.add('text-[var(--muted)]');

  if (!payVal || (payVal !== 'Card' && payVal !== 'Cash at pickup')) {
    if (paySel) paySel.focus();
    statusEl.textContent = 'Please choose how you would like to pay.';
    statusEl.classList.add('text-[var(--rose)]');
    statusEl.classList.remove('text-[var(--muted)]');
    return;
  }

  var itemTypeEl = form.querySelector('[name="item_type"]');
  var itemTypeVal = itemTypeEl && itemTypeEl.value ? itemTypeEl.value : '';

  var eventDateVal = (form.querySelector('[name="event_date"]') && form.querySelector('[name="event_date"]').value) || '';
  var pickupDateVal = (form.querySelector('[name="pickup_date"]') && form.querySelector('[name="pickup_date"]').value) || '';
  var servingsVal = (form.querySelector('[name="servings"]') && form.querySelector('[name="servings"]').value) || '';
  var flavorVal = (form.querySelector('[name="flavor"]') && form.querySelector('[name="flavor"]').value) || '';
  var allergyNotesVal = (form.querySelector('[name="allergy_notes"]') && form.querySelector('[name="allergy_notes"]').value) || '';
  var extraDetailsVal = (form.querySelector('[name="extra_details"]') && form.querySelector('[name="extra_details"]').value) || '';

  var submitBtn = form.querySelector('button[type="submit"], .cta-primary');
  var prevBtnText = submitBtn ? submitBtn.textContent : null;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }

  function postPayload() {
    return fetch('/api/custom-order-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameVal,
        email: emailVal,
        phone: phoneVal,
        contact: emailVal + (phoneVal ? ' · ' + phoneVal : ''),
        event_date: eventDateVal,
        pickup_date: pickupDateVal,
        item_type: itemTypeVal,
        servings: servingsVal,
        flavor: flavorVal,
        allergy_notes: allergyNotesVal,
        extra_details: extraDetailsVal,
        payment_preference: payVal,
      }),
    })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (out) {
        if (!out || !out.data) throw new Error('Invalid response from server.');
        if (out.data.success) {
          statusEl.textContent = out.data.message || 'Thanks! Your custom order request was saved.';
          statusEl.classList.remove('text-[var(--rose)]');
          statusEl.classList.add('text-[var(--cocoa)]');
          form.reset();
        } else {
          var msg = out.data.error || "We couldn't save your custom order. Please try again.";
          statusEl.textContent = msg;
          statusEl.classList.remove('text-[var(--cocoa)]');
          statusEl.classList.add('text-[var(--rose)]');
        }
      })
      .catch(function () {
        statusEl.textContent = "We couldn't save your custom order. Please try again.";
        statusEl.classList.remove('text-[var(--cocoa)]');
        statusEl.classList.add('text-[var(--rose)]');
      })
      .finally(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = prevBtnText || 'Send my request';
        }
      });
  }

  postPayload();
}

function collectNotifyInterests(form) {
  function ck(n) {
    var el = form.querySelector('[name="' + n + '"]');
    return !!(el && el.checked);
  }
  return {
    preorder_drops: ck('interest_preorder_drops'),
    custom_availability: ck('interest_custom_availability'),
    holiday_specials: ck('interest_holiday_specials'),
    pickup_updates: ck('interest_pickup_updates'),
  };
}

function handleNotifySignupSubmit(e) {
  e.preventDefault();
  var form = e.target;
  var nameEl = form.querySelector('[name="notify_name"]');
  var emailEl = form.querySelector('[name="notify_email"]');
  if (!emailEl) return;
  var nameVal = nameEl ? (nameEl.value || '').trim() : '';
  var emailVal = (emailEl.value || '').trim().toLowerCase();
  var phoneVal = (form.querySelector('[name="notify_phone"]') && form.querySelector('[name="notify_phone"]').value) || '';
  phoneVal = String(phoneVal).trim();
  var statusEl = form.querySelector('.ordering-notify-status');
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.classList.remove('text-[var(--rose)]');
    statusEl.classList.add('text-[var(--muted)]');
  }

  var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);
  if (!emailOk) {
    if (statusEl) statusEl.textContent = 'Please enter a valid email address.';
    emailEl.focus();
    return;
  }

  var submitBtn = form.querySelector('button[type="submit"], .ordering-notify-btn');
  var prevBtnText = submitBtn ? submitBtn.textContent : null;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }

  var interests = collectNotifyInterests(form);

  fetch('/api/waitlist-signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nameVal,
      email: emailVal,
      phone: phoneVal,
      interests: interests,
    }),
  })
    .then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) { return { ok: res.ok, data: data }; });
    })
    .then(function (out) {
      if (!out || !out.data) throw new Error('Invalid response from server.');
      if (out.data.success) {
        try {
          sessionStorage.setItem('rbgf_notify_modal_subscribed', '1');
        } catch (err) {
          /* ignore */
        }
        document.dispatchEvent(new CustomEvent('rbgf:waitlist-success', { bubbles: true }));
        if (statusEl) {
          statusEl.textContent = out.data.message || 'Thanks! You are on the list.';
          statusEl.classList.remove('text-[var(--rose)]');
          statusEl.classList.add('text-[var(--cocoa)]');
        }
        form.reset();
      } else {
        var msg = out.data.error || 'We couldn\'t save your signup. Please try again.';
        if (statusEl) {
          statusEl.textContent = msg;
          statusEl.classList.remove('text-[var(--muted)]');
          statusEl.classList.add('text-[var(--rose)]');
        }
      }
    })
    .catch(function () {
      if (statusEl) {
        statusEl.textContent = 'We couldn\'t save your signup. Please try again.';
        statusEl.classList.remove('text-[var(--muted)]');
        statusEl.classList.add('text-[var(--rose)]');
      }
    })
    .finally(function () {
      if (submitBtn) {
        submitBtn.disabled = false;
        var defaultLabel = 'Sign up for notifications';
        if (form.id === 'notify-signup-modal-form') defaultLabel = 'Notify me when ordering opens';
        submitBtn.textContent = prevBtnText || defaultLabel;
      }
    });
}

function handleContactSubmit(e) {
  e.preventDefault();
  var form = e.target;
  var nameEl = form.querySelector('[name="name"]');
  var emailEl = form.querySelector('[name="email"]');
  var msgEl = form.querySelector('[name="message"]');
  if (!nameEl || !emailEl || !msgEl) return;

  var nameVal = (nameEl.value || '').trim();
  var emailVal = (emailEl.value || '').trim().toLowerCase();
  var phoneVal = (form.querySelector('[name="phone"]') && form.querySelector('[name="phone"]').value) || '';
  phoneVal = String(phoneVal).trim();
  var messageVal = (msgEl.value || '').trim();

  var statusEl = form.querySelector('.rbgf-contact-status');
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.classList.remove('text-[var(--rose)]');
    statusEl.classList.add('text-[var(--muted)]');
  }

  if (!nameVal) {
    nameEl.focus();
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
    if (statusEl) statusEl.textContent = 'Please enter a valid email.';
    emailEl.focus();
    return;
  }
  if (messageVal.length < 8) {
    if (statusEl) statusEl.textContent = 'Please write a bit more so we can help.';
    msgEl.focus();
    return;
  }

  var submitBtn = form.querySelector('button[type="submit"]');
  var prevBtnText = submitBtn ? submitBtn.textContent : null;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';
  }

  fetch('/api/contact-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nameVal,
      email: emailVal,
      phone: phoneVal,
      message: messageVal,
    }),
  })
    .then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) { return { ok: res.ok, data: data }; });
    })
    .then(function (out) {
      if (!out || !out.data) throw new Error('Invalid response from server.');
      if (out.data.success) {
        if (statusEl) {
          statusEl.textContent = out.data.message || 'Thanks — we received your message.';
          statusEl.classList.remove('text-[var(--rose)]');
          statusEl.classList.add('text-[var(--cocoa)]');
        }
        form.reset();
      } else {
        if (statusEl) {
          statusEl.textContent = out.data.error || 'Something went wrong. Please try again.';
          statusEl.classList.add('text-[var(--rose)]');
        }
      }
    })
    .catch(function () {
      if (statusEl) {
        statusEl.textContent = 'We could not send your message. Please try again.';
        statusEl.classList.add('text-[var(--rose)]');
      }
    })
    .finally(function () {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = prevBtnText || 'Send message';
      }
    });
}

document.addEventListener('DOMContentLoaded', function () {
  var preorderForm = document.getElementById('preorder-form');
  if (preorderForm) preorderForm.addEventListener('submit', handlePreorderSubmit);
  var customForm = document.getElementById('custom-order-form');
  if (customForm) customForm.addEventListener('submit', handleCustomOrderSubmit);
  var contactForm = document.getElementById('contact-form');
  if (contactForm) contactForm.addEventListener('submit', handleContactSubmit);

  document.body.addEventListener('submit', function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('data-rbgf-notify') === '1') {
      handleNotifySignupSubmit(e);
    }
  });
});
