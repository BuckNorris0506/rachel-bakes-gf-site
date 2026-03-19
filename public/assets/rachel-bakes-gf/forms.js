/**
 * Rachel Bakes GF — customer forms (preorder, custom order, waitlist).
 *
 * Submissions use fetch() + JSON to Netlify functions (via /api redirects):
 *   POST /api/preorder-submit      — preorder rows + daily cap
 *   POST /api/custom-order-submit  — custom inquiries (gated by custom_orders_open)
 *   POST /api/waitlist-signup      — notify-me list when preorders are closed
 *
 * Full behavior needs those APIs live (e.g. `netlify dev` from bucksites/ or production).
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

function handlePreorderSubmit(e) {
  e.preventDefault();
  var form = e.target;
  var nameEl = form.querySelector('[name="name"]');
  var contactEl = form.querySelector('[name="contact"]');
  var orderEl = form.querySelector('[name="order"]');
  var totalEl = form.querySelector('[name="order_total_dollars"]');

  if (!nameEl || !contactEl || !orderEl || !totalEl) return;

  var nameVal = (nameEl.value || '').trim();
  var contactVal = (contactEl.value || '').trim();
  var orderDetailsVal = (orderEl.value || '').trim();
  var totalValRaw = (totalEl.value || '').trim();

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
  if (!orderDetailsVal) {
    orderEl.focus();
    return;
  }

  var totalNum = parseFloat(totalValRaw);
  if (!Number.isFinite(totalNum) || totalNum <= 0) {
    totalEl.focus();
    statusEl.textContent = 'Please enter a valid estimated total.';
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
      order_details: orderDetailsVal,
      pickup_date: (form.querySelector('[name="pickup_date"]') && form.querySelector('[name="pickup_date"]').value) || '',
      pickup_window: (form.querySelector('[name="pickup_window"]') && form.querySelector('[name="pickup_window"]').value) || '',
      notes: (form.querySelector('[name="notes"]') && form.querySelector('[name="notes"]').value) || '',
      order_total_dollars: totalNum,
    }),
  })
    .then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) { return { ok: res.ok, data: data }; });
    })
    .then(function (out) {
      if (!out || !out.data) throw new Error('Invalid response from server.');
      if (out.data.success) {
        var capReached = out.data.capReached === true;
        var msg = out.data.message || 'Thanks! Your preorder request is saved.';
        if (capReached) {
          msg = 'Thanks! Your preorder request is saved. Preorders for today may close as we reach capacity.';
        }
        statusEl.textContent = msg;
        statusEl.classList.remove('text-[var(--rose)]');
        statusEl.classList.add('text-[var(--cocoa)]');
        form.reset();
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
  var contactEl = form.querySelector('[name="contact"]');
  if (!nameEl || !contactEl) return;
  var nameVal = (nameEl.value || '').trim();
  var contactVal = (contactEl.value || '').trim();
  if (!nameVal) {
    nameEl.focus();
    return;
  }
  if (!contactVal) {
    contactEl.focus();
    return;
  }
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

  var itemTypeEl = form.querySelector('[name="item_type"]');
  var itemTypeVal = itemTypeEl && itemTypeEl.value ? itemTypeEl.value : '';

  var eventDateVal = (form.querySelector('[name="event_date"]') && form.querySelector('[name="event_date"]').value) || '';
  var pickupDateVal = (form.querySelector('[name="pickup_date"]') && form.querySelector('[name="pickup_date"]').value) || '';
  var servingsVal = (form.querySelector('[name="servings"]') && form.querySelector('[name="servings"]').value) || '';
  var flavorVal = (form.querySelector('[name="flavor"]') && form.querySelector('[name="flavor"]').value) || '';
  var designNotesVal = (form.querySelector('[name="design_notes"]') && form.querySelector('[name="design_notes"]').value) || '';
  var inspirationLinkVal = (form.querySelector('[name="inspiration_link"]') && form.querySelector('[name="inspiration_link"]').value) || '';
  var allergyNotesVal = (form.querySelector('[name="allergy_notes"]') && form.querySelector('[name="allergy_notes"]').value) || '';
  var extraDetailsVal = (form.querySelector('[name="extra_details"]') && form.querySelector('[name="extra_details"]').value) || '';

  var submitBtn = form.querySelector('button[type="submit"], .cta-primary');
  var prevBtnText = submitBtn ? submitBtn.textContent : null;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }

  fetch('/api/custom-order-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nameVal,
      contact: contactVal,
      event_date: eventDateVal,
      pickup_date: pickupDateVal,
      item_type: itemTypeVal,
      servings: servingsVal,
      flavor: flavorVal,
      design_notes: designNotesVal,
      inspiration_link: inspirationLinkVal,
      allergy_notes: allergyNotesVal,
      extra_details: extraDetailsVal,
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

function handleNotifySignupSubmit(e) {
  e.preventDefault();
  var form = e.target;
  var nameEl = form.querySelector('[name="notify_name"]');
  var emailEl = form.querySelector('[name="notify_email"]');
  if (!emailEl) return;
  var nameVal = nameEl ? (nameEl.value || '').trim() : '';
  var emailVal = (emailEl.value || '').trim().toLowerCase();
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

  fetch('/api/waitlist-signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nameVal, email: emailVal }),
  })
    .then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) { return { ok: res.ok, data: data }; });
    })
    .then(function (out) {
      if (!out || !out.data) throw new Error('Invalid response from server.');
      if (out.data.success) {
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
        submitBtn.textContent = prevBtnText || 'Notify me';
      }
    });
}

document.addEventListener('DOMContentLoaded', function () {
  var preorderForm = document.getElementById('preorder-form');
  if (preorderForm) preorderForm.addEventListener('submit', handlePreorderSubmit);
  var customForm = document.getElementById('custom-order-form');
  if (customForm) customForm.addEventListener('submit', handleCustomOrderSubmit);
  document.body.addEventListener('submit', function (e) {
    if (e.target.id === 'notify-signup-form') {
      handleNotifySignupSubmit(e);
    }
  });
});
