(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const key = $('#api-key'), file = $('#notebook'), load = $('#load'), preview = $('#preview-button');
  const queueNote = $('#queue-note'), previewNote = $('#preview-note'), results = $('#preview-results');
  const addForm = $('#add'), add = $('#add-button'), addNote = $('#add-note');
  const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const dateStyle = { day: 'numeric', month: 'short', year: 'numeric' };
  const calendar = new Intl.DateTimeFormat('en-IN', { ...dateStyle, timeZone: 'UTC' });
  const clock = new Intl.DateTimeFormat('en-IN', { ...dateStyle, timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
  const groups = [$('#call-next'), $('#deferred'), $('#paid')];
  const empty = ['No installments are eligible to call.', 'No installments are on hold or deferred.', 'No confirmed payments.'];
  const statuses = new Map(Object.entries({
    no_contact: 'No contact requested', hardship: 'Hardship reported',
    promise_wait: 'Waiting for promised payment',
    would_call: 'Eligible to call', payment_hold: 'Payment claim on hold', callback_wait: 'Waiting for callback',
    not_due: 'Not due yet', blocked: 'Blocked', skipped: 'Skipped', paid: 'Payment confirmed', needs_check: 'Needs review'
  }));
  let active = null, loaded = false;

  function reason(value) {
    if (typeof value !== 'string' || !value.trim()) return 'No reason provided.';
    const text = value.trim().replace(/\b(\d+) day\(s\)/g, (_, n) => `${n} day${n === '1' ? '' : 's'}`);
    return /^[a-z_]+$/.test(text) ? text.replaceAll('_', ' ') : text;
  }

  function status(value) {
    return statuses.get(value) || (typeof value === 'string' && value ? value.replaceAll('_', ' ') : 'Status unavailable');
  }

  function amount(value) {
    if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return 'Not available';
    return Number.isFinite(Number(value)) ? money.format(Number(value)) : 'Not available';
  }

  function dueDate(value) {
    if (!value) return 'Not available';
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? calendar.format(date) : String(value);
  }

  function time(value) {
    if (!value) return 'Time unavailable';
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return `${value} (time zone not supplied)`;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? `${clock.format(date)} IST` : 'Time unavailable';
  }

  function notice(node, text = '', error = false) {
    node.textContent = text;
    node.classList.toggle('error', error);
  }

  function clearQueue(text = 'Queue not loaded.') {
    loaded = false;
    for (const group of groups) {
      $('.count', group).textContent = '—';
      $('.rows', group).replaceChildren();
    }
    $('#as-of').textContent = text;
    notice(queueNote);
  }

  function clearPreview() {
    notice(previewNote);
    results.hidden = true;
    results.open = false;
    $('ul', results).replaceChildren();
  }

  function controls() {
    key.readOnly = !!active;
    load.disabled = file.disabled = add.disabled = !!active;
    if (!active) load.textContent = loaded ? 'Reload queue' : 'Load queue';
    preview.disabled = !!active || !key.value.trim() || !file.files.length;
    $('#forget').hidden = !key.value;
    for (const control of document.querySelectorAll('.installment button, .installment input')) control.disabled = !!active;
  }

  function clearRecordView() {
    file.value = '';
    file.setCustomValidity('');
    clearQueue();
    clearPreview();
    notice(addNote);
    controls();
  }

  function forget() {
    active?.abort();
    key.value = '';
    key.setCustomValidity('');
    addForm.reset();
    clearRecordView();
  }

  async function request(path, signal, options = {}) {
    let response;
    try {
      response = await fetch(path, { ...options, signal, mode: 'same-origin', credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { 'X-API-Key': key.value.trim(), ...options.headers } });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error(options.method === 'POST' ? 'No response from the API. Reload the queue to check the outcome before retrying.' : 'No response from the API. Check the connection and retry.');
    }
    if (response.ok) return response;
    const type = response.headers.get('content-type') || '';
    let detail;
    if (type.includes('json')) {
      const data = await response.json().catch(() => null);
      detail = data?.detail ?? data?.message;
      if (Array.isArray(detail)) detail = detail.map(item => item?.msg).filter(Boolean).join('; ');
    } else if (type.startsWith('text/plain')) detail = await response.text();
    if (response.status === 401 || response.status === 403) { clearQueue('Queue access denied.'); clearPreview(); }
    const message = typeof detail === 'string' && detail.trim() ? detail.trim() : response.statusText;
    const secret = key.value.trim();
    throw new Error(`HTTP ${response.status}${message ? ': ' + (secret ? message.replaceAll(secret, '[redacted]') : message).slice(0, 400) : ''}`);
  }

  async function run(button, label, output, task) {
    if (active) return;
    if (!key.value.trim()) { key.setCustomValidity('Enter your API key.'); key.reportValidity(); return; }
    const controller = new AbortController(), idle = button.textContent;
    const wasFocused = document.activeElement === button;
    active = controller;
    button.textContent = label;
    button.setAttribute('aria-busy', 'true');
    notice(output);
    controls();
    try { await task(controller.signal); }
    catch (error) { if (!controller.signal.aborted) notice(output.isConnected ? output : queueNote, error.message, true); }
    finally {
      active = null;
      button.removeAttribute('aria-busy');
      button.textContent = idle;
      controls();
      if (wasFocused && document.activeElement === document.body) {
        (button.isConnected ? button : $('#queue-title')).focus({ preventScroll: true });
      }
    }
  }

  function bindPromise(item, row, id, update) {
    const details = $('.promise-control', item);
    if (!id || id === '.' || id === '..' || row.status === 'paid' || row.status === 'promise_wait' || !(row.outstanding_amount > 0)) {
      details.remove();
      return;
    }
    $('summary', details).setAttribute('aria-label', `Record a promise to pay for ${row.name || 'this borrower'}, due ${dueDate(row.due_date)}`);
    const form = $('.promise-form', details), when = form.elements.deadline, value = form.elements.amount;
    value.max = String(row.outstanding_amount);
    const setMin = () => { when.min = new Date((Math.floor(Date.now() / 60000) + 1 + 330) * 60000).toISOString().slice(0, 16); };
    setMin();
    when.addEventListener('focus', setMin);
    when.addEventListener('input', () => when.setCustomValidity(''));
    value.addEventListener('input', () => value.setCustomValidity(''));
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!/^\d+(?:\.\d{1,2})?$/.test(value.value)) { value.setCustomValidity('Enter an INR amount with up to two decimal places, such as 250.25.'); value.reportValidity(); return; }
      const stamp = `${when.value}${when.value.length === 16 ? ':00' : ''}+05:30`;
      if (!(Date.parse(stamp) > Date.now())) { when.setCustomValidity('Choose a future payment deadline in IST.'); when.reportValidity(); return; }
      update($('button', form), 'Recording…', 'promise', 'Promise recorded',
        { amount: value.value, promise_at: stamp }, $('.promise-note', details));
    });
  }

  function installment(row, rank) {
    const item = $('#row-template').content.firstElementChild.cloneNode(true);
    const name = row.name || 'Name unavailable', actions = $('.actions', item);
    $('h4', item).textContent = name;
    $('.customer', item).textContent = row.customer_id ? `Customer ${row.customer_id}` : 'Customer ID unavailable';
    if (rank !== null) { $('.rank', item).hidden = false; $('.rank', item).textContent = `#${rank}`; }
    $('.due', item).textContent = dueDate(row.due_date);
    $('.balance', item).textContent = amount(row.outstanding_amount);
    $('.received', item).textContent = amount(row.paid_amount);
    $('.status', item).textContent = status(row.status);
    $('.reason', item).textContent = reason(row.reason);
    if (row.callback_at && !row.contact_preference) { $('.callback-time', item).hidden = false; $('.callback-time', item).textContent = `Callback: ${time(row.callback_at)}`; }

    const id = String(row.installment_id ?? '').trim();
    bindPromise(item, row, id, update);
    if (!id || id === '.' || id === '..') {
      const hint = document.createElement('p');
      hint.className = 'hint'; hint.textContent = 'No installment reference; actions unavailable.';
      actions.replaceWith(hint);
      return item;
    }
    $('summary', actions).setAttribute('aria-label', `Manage installment for ${name}, due ${dueDate(row.due_date)}`);
    const output = $('.action-note', actions), callback = $('.callback-form', actions);
    function update(button, label, action, success, body, message = output) {
      run(button, label, message, async signal => {
        const options = { method: 'POST' };
        if (body) { options.headers = { 'Content-Type': 'application/json' }; options.body = JSON.stringify(body); }
        await request(`/queue/${encodeURIComponent(id)}/${action}`, signal, options);
        await loadQueue(signal, `${success} for ${name}.`, id);
      });
    }
    const contact = $('.contact-actions', actions);
    contact.hidden = row.contact_preference === 'no_contact';
    for (const button of contact.querySelectorAll('[data-stop]')) {
      const reason = button.dataset.stop;
      button.hidden = row.contact_preference === reason;
      button.addEventListener('click', () => update(button, 'Recording…', 'contact-preference', 'Automated outreach stopped across installments', { reason }));
    }
    callback.hidden = !!row.contact_preference;
    const refresh = $('.refresh', actions);
    refresh.addEventListener('click', () => update(refresh, 'Checking payment…', 'refresh', 'Payment refresh requested'));
    const claim = $('.claim', actions);
    if (row.status === 'paid') {
      claim.remove(); $('.claim-hint', actions).remove(); callback.remove();
    } else {
      claim.addEventListener('click', () => update(claim, 'Reporting claim…', 'already-paid', 'Already-paid claim submitted'));
      const when = $('input', callback);
      const hours = $('.hours', callback);
      hours.id = `hours-${encodeURIComponent(id)}`;
      when.setAttribute('aria-describedby', hours.id);
      const setMin = () => {
        // datetime-local has no time zone: its minimum is the next whole minute on the IST clock.
        when.min = new Date((Math.floor(Date.now() / 60000) + 1 + 330) * 60000).toISOString().slice(0, 16);
      };
      setMin();
      when.addEventListener('focus', setMin);
      when.addEventListener('input', () => when.setCustomValidity(''));
      callback.addEventListener('submit', event => {
        event.preventDefault();
        const stamp = `${when.value}${when.value.length === 16 ? ':00' : ''}+05:30`;
        if (!(Date.parse(stamp) > Date.now())) { when.setCustomValidity('Choose a future time in IST.'); when.reportValidity(); return; }
        const hour = Number(when.value.split('T')[1].slice(0, 2));
        if (hour < 8 || hour >= 19) { when.setCustomValidity(hours.textContent); when.reportValidity(); return; }
        update($('button', callback), 'Scheduling…', 'callback', 'Callback request submitted', { callback_at: stamp });
      });
    }
    return item;
  }

  async function loadQueue(signal, success = '', focusId = '') {
    try {
      const response = await request('/queue', signal);
      const data = await response.json().catch(() => null);
      if (!Array.isArray(data?.call_queue) || !Array.isArray(data.other)) throw new Error('The API returned an unreadable queue.');
      if (signal.aborted) return;
      const rows = [[], [], []];
      for (const row of [...data.call_queue, ...data.other]) {
        if (!row || typeof row !== 'object') throw new Error('The API returned an unreadable installment.');
        rows[row.status === 'paid' ? 2 : row.status === 'would_call' ? 0 : 1].push(row);
      }
      let focusTarget;
      groups.forEach((group, i) => {
        const list = $('.rows', group);
        list.replaceChildren();
        $('.count', group).textContent = rows[i].length;
        if (!rows[i].length) { const msg = document.createElement('li'); msg.className = 'empty'; msg.textContent = empty[i]; list.append(msg); }
        rows[i].forEach((row, index) => {
          const item = installment(row, i === 0 ? row.rank ?? index + 1 : null);
          list.append(item);
          if (focusId && String(row.installment_id) === focusId) focusTarget = $('summary', item);
        });
      });
      loaded = true;
      $('#as-of').textContent = data.as_of ? `As of ${time(data.as_of)}` : 'Queue loaded; timestamp unavailable.';
      notice(queueNote, success || 'Queue loaded.');
      if (focusId) (focusTarget || $('#queue-title')).focus();
    } catch (error) {
      if (signal.aborted) return;
      clearQueue('Queue unavailable.');
      notice(queueNote, `${success ? success + ' ' : ''}Could not load the queue. ${error.message}`, true);
      if (focusId) $('#queue-title').focus();
    }
  }

  $('#access').addEventListener('submit', event => { event.preventDefault(); run(load, 'Loading…', queueNote, loadQueue); });
  key.addEventListener('input', () => { key.setCustomValidity(''); clearRecordView(); });
  $('#forget').addEventListener('click', () => { forget(); key.focus(); });
  file.addEventListener('change', () => { file.setCustomValidity(''); clearPreview(); controls(); });
  $('#preview').addEventListener('submit', event => {
    event.preventDefault();
    const page = file.files[0];
    if (!page) return;
    const knownType = ['image/jpeg', 'image/png', 'application/pdf'].includes(page.type);
    const genericType = !page.type || page.type === 'application/octet-stream';
    if (!page.size || !(knownType || (genericType && /\.(jpe?g|png|pdf)$/i.test(page.name)))) {
      file.setCustomValidity('Choose a nonempty JPG, PNG or PDF file.'); file.reportValidity(); return;
    }
    clearPreview();
    run(preview, 'Reading notebook…', previewNote, async signal => {
      const body = new FormData(); body.append('file', page); body.append('dry_run', 'true');
      const response = await request('/trigger/notebook', signal, { method: 'POST', body });
      const data = await response.json().catch(() => null);
      if (signal.aborted) return;
      const rows = Array.isArray(data?.results) ? data.results : null;
      const count = Number.isInteger(data?.rows_read) && data.rows_read >= 0 ? data.rows_read : rows?.length;
      if (count == null) notice(previewNote, 'The API returned an unreadable notebook preview.', true);
      else notice(previewNote, `${count} ${count === 1 ? 'row' : 'rows'} read. No calls placed.`);
      for (const row of rows || []) {
        const li = document.createElement('li');
        li.textContent = `${row?.name || row?.customer_id || 'Unnamed row'}: ${status(row?.status)}. ${reason(row?.reason)}`;
        $('ul', results).append(li);
      }
      results.hidden = !rows?.length;
      await loadQueue(signal);
    });
  });
  addForm.addEventListener('submit', event => {
    event.preventDefault();
    const body = Object.fromEntries([...new FormData(addForm)].map(([name, value]) => [name, value.trim()]));
    body.outstanding_amount = Number(body.outstanding_amount);
    run(add, 'Adding…', addNote, async signal => {
      // dry_run registers the installment and never dispatches a call.
      const response = await request('/trigger/call?dry_run=true', signal,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => null);
      if (signal.aborted) return;
      const outcome = `${status(data?.status)}: ${reason(data?.reason)}`;
      if (!data?.installment_id) { notice(addNote, `Not added; no call placed. ${outcome}`, true); return; }
      addForm.reset();
      notice(addNote, `${body.name} added to the queue; no call placed. ${outcome}`);
      await loadQueue(signal);
    });
  });
  window.addEventListener('pagehide', forget);
  forget();
})();
