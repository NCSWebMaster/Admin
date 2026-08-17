// NCS OnePlace — pages/admissions/info-nights.js
// Manage upcoming Information Nights (shown on the public homepage) and
// view who RSVPed for each one (RSVPs land in admission_leads).
// Requires supabase-client.js loaded first.

let allNights = [];
let rsvpsByNight = {}; // { [night_id]: [ {parent_name, email, phone, student_name, grade_applying_for, created_at}, ... ] }
let expandedId = null;
let editingId = null;

const els = {
  list: document.getElementById('nightsList'),
  statusMsg: document.getElementById('status-msg'),
  addBtn: document.getElementById('addNightBtn'),
  overlay: document.getElementById('nightModalOverlay'),
  closeBtn: document.getElementById('nightModalCloseBtn'),
  title: document.getElementById('nightModalTitle'),
  form: document.getElementById('nightForm'),
  formError: document.getElementById('nightFormError'),
  submitBtn: document.getElementById('nightSubmitBtn'),
  fId: document.getElementById('nightId'),
  fDate: document.getElementById('nightDate'),
  fTime: document.getElementById('nightTime'),
  fLocation: document.getElementById('nightLocation'),
  fNotes: document.getElementById('nightNotes'),
};

function showStatus(message, type) {
  els.statusMsg.textContent = message;
  els.statusMsg.className = 'status-msg show ' + type;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => { els.statusMsg.className = 'status-msg'; }, 4000);
}

function formatDate(isoDate) {
  if (!isoDate) return '—';
  // isoDate is 'YYYY-MM-DD' from Postgres date column — parse as local, not UTC
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

async function requireStaffSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session || sessionStorage.getItem('ncs_mfa_verified') !== session.user.id) {
    window.location.href = '/index.html';
    return null;
  }
  return session;
}

async function loadData() {
  const { data: nights, error: nightsErr } = await supabaseClient
    .from('info_nights')
    .select('id, event_date, event_time, location, notes, created_at')
    .order('event_date', { ascending: true });

  if (nightsErr) {
    showStatus('Could not load information nights: ' + nightsErr.message, 'error');
    return;
  }
  allNights = nights || [];

  const { data: rsvps, error: rsvpErr } = await supabaseClient
    .from('admission_leads')
    .select('info_night_id, parent_name, email, phone, student_name, grade_applying_for, created_at')
    .not('info_night_id', 'is', null)
    .order('created_at', { ascending: false });

  if (rsvpErr) {
    showStatus('Could not load RSVPs: ' + rsvpErr.message, 'error');
  }

  rsvpsByNight = {};
  (rsvps || []).forEach(r => {
    if (!rsvpsByNight[r.info_night_id]) rsvpsByNight[r.info_night_id] = [];
    rsvpsByNight[r.info_night_id].push(r);
  });

  render();
}

function render() {
  if (allNights.length === 0) {
    els.list.innerHTML = '<div class="empty-state">No information nights scheduled yet.</div>';
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  els.list.innerHTML = allNights.map(n => renderCard(n, todayStr)).join('');
  attachHandlers();
}

function renderCard(n, todayStr) {
  const isPast = n.event_date < todayStr;
  const rsvps = rsvpsByNight[n.id] || [];
  const count = rsvps.length;

  return `
    <div class="night-card ${isPast ? 'past' : ''}" data-id="${n.id}">
      <div class="row-top">
        <div>
          <div class="night-date">${formatDate(n.event_date)} ${isPast ? '(Past)' : ''}</div>
          <div class="night-meta">${escapeHtml(n.event_time)} · ${escapeHtml(n.location)}</div>
          ${n.notes ? `<div class="night-notes">${escapeHtml(n.notes)}</div>` : ''}
        </div>
        <span class="rsvp-count-pill ${count === 0 ? 'zero' : ''}">${count} RSVP${count === 1 ? '' : 's'}</span>
      </div>
      <div class="card-actions">
        <button class="btn-mini" data-action="toggle-rsvps" data-id="${n.id}">${expandedId === n.id ? 'Hide RSVPs' : 'View RSVPs'}</button>
        <button class="btn-mini" data-action="edit" data-id="${n.id}">Edit</button>
        <button class="btn-mini danger" data-action="delete" data-id="${n.id}">Delete</button>
      </div>
      <div class="rsvp-panel ${expandedId === n.id ? 'show' : ''}">
        ${expandedId === n.id ? renderRsvpPanel(rsvps) : ''}
      </div>
    </div>
  `;
}

function renderRsvpPanel(rsvps) {
  if (rsvps.length === 0) return '<p style="color:var(--ink-soft);font-size:0.88rem;">No RSVPs yet.</p>';
  return rsvps.map(r => `
    <div class="rsvp-row">
      <div class="rsvp-name">${escapeHtml(r.student_name)} — ${escapeHtml(r.parent_name)}</div>
      <div class="rsvp-meta">${escapeHtml(r.email)} · ${escapeHtml(r.phone)}${r.grade_applying_for ? ' · ' + escapeHtml(r.grade_applying_for) : ''}</div>
    </div>
  `).join('');
}

function attachHandlers() {
  els.list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action, Number(btn.dataset.id)));
  });
}

function handleAction(action, id) {
  const night = allNights.find(n => n.id === id);
  if (!night) return;

  if (action === 'toggle-rsvps') {
    expandedId = expandedId === id ? null : id;
    render();
    return;
  }

  if (action === 'edit') {
    openModal(night);
    return;
  }

  if (action === 'delete') {
    deleteNight(night);
    return;
  }
}

async function deleteNight(night) {
  const count = (rsvpsByNight[night.id] || []).length;
  const warning = count > 0
    ? ` This night has ${count} RSVP${count === 1 ? '' : 's'} already recorded in Admission Leads — those leads stay, but they'll no longer be linked to this event.`
    : '';
  if (!confirm(`Delete the ${formatDate(night.event_date)} information night?${warning}`)) return;

  const { error } = await supabaseClient.from('info_nights').delete().eq('id', night.id);
  if (error) { showStatus('Could not delete: ' + error.message, 'error'); return; }
  showStatus('Information night deleted.', 'success');
  await loadData();
}

function openModal(night) {
  editingId = night ? night.id : null;
  els.title.textContent = night ? 'Edit Information Night' : 'Add Information Night';
  els.fId.value = night ? night.id : '';
  els.fDate.value = night ? night.event_date : '';
  els.fTime.value = night ? night.event_time : '';
  els.fLocation.value = night ? night.location : 'NCS Main Campus';
  els.fNotes.value = night ? (night.notes || '') : '';
  els.formError.classList.remove('show');
  els.submitBtn.disabled = false;
  els.submitBtn.textContent = 'Save';
  els.overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  els.overlay.classList.remove('open');
  document.body.style.overflow = '';
}

els.addBtn.addEventListener('click', () => openModal(null));
els.closeBtn.addEventListener('click', closeModal);
els.overlay.addEventListener('click', e => { if (e.target === els.overlay) closeModal(); });

els.form.addEventListener('submit', async e => {
  e.preventDefault();

  const date = els.fDate.value;
  const time = els.fTime.value.trim();
  const location = els.fLocation.value.trim();
  const notes = els.fNotes.value.trim();

  if (!date || !time || !location) {
    els.formError.textContent = 'Date, time, and location are required.';
    els.formError.classList.add('show');
    return;
  }

  els.formError.classList.remove('show');
  els.submitBtn.disabled = true;
  els.submitBtn.textContent = 'Saving...';

  const payload = { event_date: date, event_time: time, location, notes: notes || null };
  const { error } = editingId
    ? await supabaseClient.from('info_nights').update(payload).eq('id', editingId)
    : await supabaseClient.from('info_nights').insert(payload);

  if (error) {
    els.formError.textContent = error.message;
    els.formError.classList.add('show');
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = 'Save';
    return;
  }

  showStatus(editingId ? 'Information night updated.' : 'Information night added — it will show on the homepage right away.', 'success');
  closeModal();
  await loadData();
});

(async () => {
  const session = await requireStaffSession();
  if (!session) return;
  await loadData();
})();
