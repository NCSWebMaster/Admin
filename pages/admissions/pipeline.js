// NCS OnePlace — pages/admissions/pipeline.js
// Admissions Pipeline: 6 stage cards (fixed 2-col grid) + trash + family list with actions.
// Requires supabase-client.js loaded first.

const TABS = [
  { key: 'code_sent', label: 'Code Sent', full: 'Codes Sent' },
  { key: 'in_progress', label: 'Started', full: 'Applications Started' },
  { key: 'submitted', label: 'Submitted', full: 'Applications Submitted' },
  { key: 'accepted', label: 'Admitted', full: 'Admitted Students' },
  { key: 'waitlisted', label: 'Waitlisted', full: 'Waitlist' },
  { key: 'declined', label: 'Denied', full: 'Denied' },
];

const GRADE_LABELS = { TK: 'TK', K: 'K', '1': '1st', '2': '2nd', '3': '3rd', '4': '4th', '5': '5th', '6': '6th', '7': '7th', '8': '8th' };

// Detail panel: grouped into readable sections instead of one flat list.
const DETAIL_SECTIONS = [
  {
    title: 'Home Address',
    fields: [
      ['home_address_street', 'Street'],
      ['home_address_city', 'City'],
      ['home_address_state', 'State'],
      ['home_address_zip', 'ZIP'],
    ],
  },
  {
    title: 'Second Parent / Guardian',
    fields: [
      ['parent2_name', 'Name'],
      ['parent2_email', 'Email'],
      ['parent2_phone', 'Phone'],
    ],
  },
  {
    title: 'Student Background',
    fields: [
      ['dob', 'Date of Birth'],
      ['nickname', 'Nickname'],
      ['age', 'Age'],
      ['gender', 'Gender'],
      ['last_grade_completed', 'Last Grade Completed'],
      ['repeated_grade', 'Repeated a Grade'],
      ['repeated_grade_explain', 'Repeated Grade — Details'],
      ['disciplinary_history', 'Disciplinary History'],
      ['disciplinary_explain', 'Disciplinary — Details'],
      ['learning_needs', 'Learning Needs'],
      ['learning_needs_explain', 'Learning Needs — Details'],
      ['medical_notes', 'Medical Notes'],
    ],
  },
  {
    title: 'Church & Referral',
    fields: [
      ['church_affiliation', 'Church Affiliation'],
      ['referral_source', 'Referral Source'],
    ],
  },
  {
    title: 'Emergency Contact',
    fields: [
      ['emergency_contact_name', 'Name'],
      ['emergency_contact_relationship', 'Relationship'],
      ['emergency_contact_phone', 'Phone'],
    ],
  },
  {
    title: 'NCS Family Reference',
    fields: [
      ['ncs_family_reference_name', 'Name'],
      ['ncs_family_reference_email', 'Email'],
      ['ncs_family_reference_phone', 'Phone'],
    ],
  },
  {
    title: 'Signature',
    fields: [
      ['signature_name', 'Signed By'],
      ['signature_date', 'Date'],
    ],
  },
];

let allRows = [];
let activeTab = 'code_sent';
let selectedYear = 'all';
let expandedId = null;
let canHardDelete = false;

const TRASH_KEY = 'trash';

const els = {
  yearSelect: document.getElementById('year-select'),
  stageGrid: document.getElementById('stage-grid'),
  list: document.getElementById('family-list'),
  statusMsg: document.getElementById('status-msg'),
  trashCount: document.getElementById('trash-count'),
  trashToggleBtn: document.getElementById('trash-toggle-btn'),
};

function showStatus(message, type) {
  els.statusMsg.textContent = message;
  els.statusMsg.className = 'status-msg show ' + type;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => { els.statusMsg.className = 'status-msg'; }, 4000);
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function gradeLabel(g) { return GRADE_LABELS[g] || g || '—'; }

function humanizeKey(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
  const { data, error } = await supabaseClient
    .from('admissions_applications')
    .select('id, access_code, status, school_year, created_at, submitted_at, decided_at, deleted_at, student_full_name, dob, current_grade, anticipated_grade, parent1_name, parent1_email, parent1_phone, parent2_name, parent2_email, parent2_phone, home_address_street, home_address_city, home_address_state, home_address_zip, nickname, age, gender, previous_schools, last_grade_completed, repeated_grade, repeated_grade_explain, disciplinary_history, disciplinary_explain, learning_needs, learning_needs_explain, medical_notes, siblings, church_affiliation, referral_source, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, signature_name, signature_date, ncs_family_reference_name, ncs_family_reference_email, ncs_family_reference_phone')
    .order('created_at', { ascending: false });

  if (error) {
    showStatus('Could not load applications: ' + error.message, 'error');
    return;
  }
  allRows = data || [];
  populateYearSelect();
  render();
}

function populateYearSelect() {
  const years = Array.from(new Set(allRows.map(r => r.school_year).filter(Boolean))).sort().reverse();
  const current = els.yearSelect.value || 'all';
  els.yearSelect.innerHTML = '<option value="all">All Years</option>' +
    years.map(y => `<option value="${y}">${y}</option>`).join('');
  els.yearSelect.value = years.includes(current) ? current : 'all';
  selectedYear = els.yearSelect.value;
}

function rowsByYear() {
  return allRows.filter(r => selectedYear === 'all' || r.school_year === selectedYear);
}

function nonDeletedRows() { return rowsByYear().filter(r => !r.deleted_at); }
function deletedRows() { return rowsByYear().filter(r => !!r.deleted_at); }

function render() {
  const nonDeleted = nonDeletedRows();
  const trashed = deletedRows();

  const counts = {};
  TABS.forEach(t => { counts[t.key] = 0; });
  nonDeleted.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });

  els.trashCount.textContent = trashed.length;
  els.trashToggleBtn.classList.toggle('active', activeTab === TRASH_KEY);

  els.stageGrid.innerHTML = TABS.map(t => `
    <button class="stage-card ${t.key === activeTab ? 'active' : ''}" data-tab="${t.key}">
      <div class="stage-count">${counts[t.key]}</div>
      <div class="stage-label">${t.full}</div>
    </button>
  `).join('');

  els.stageGrid.querySelectorAll('.stage-card').forEach(btn => {
    btn.addEventListener('click', () => { activeTab = btn.dataset.tab; expandedId = null; render(); });
  });

  const tabRows = activeTab === TRASH_KEY ? trashed : nonDeleted.filter(r => r.status === activeTab);

  if (tabRows.length === 0) {
    els.list.innerHTML = `<div class="empty-state">${activeTab === TRASH_KEY ? 'Trash is empty.' : 'No families in this stage right now.'}</div>`;
    return;
  }

  els.list.innerHTML = tabRows.map(r => renderCard(r)).join('');
  attachCardHandlers(tabRows);
}

function renderCard(r) {
  const dateLine = r.deleted_at
    ? `Moved to Trash ${formatDate(r.deleted_at)}`
    : r.status === 'code_sent' || r.status === 'in_progress'
      ? `Code sent ${formatDate(r.created_at)}`
      : r.status === 'submitted'
        ? `Submitted ${formatDate(r.submitted_at)}`
        : `Decided ${formatDate(r.decided_at)}`;

  return `
    <div class="family-card" data-id="${r.id}">
      <div class="row-top">
        <div>
          <div class="student-name">${escapeHtml(r.student_full_name || 'Unnamed Student')}</div>
          <div class="meta-line">${gradeLabel(r.current_grade)} → ${gradeLabel(r.anticipated_grade)} · ${escapeHtml(r.school_year || '—')}</div>
          <div class="meta-line">${escapeHtml(r.parent1_name || '—')} · ${escapeHtml(r.parent1_email || '—')} · ${escapeHtml(r.parent1_phone || '—')}</div>
          <div class="meta-line">${dateLine}</div>
        </div>
        <span class="status-pill ${r.status}">${TABS.find(t => t.key === r.status)?.label || r.status}</span>
      </div>
      <div class="card-actions">
        ${cardActionsHtml(r)}
      </div>
      <div class="detail-panel ${expandedId === r.id ? 'show' : ''}" id="detail-${r.id}">
        ${expandedId === r.id ? renderDetail(r) : ''}
      </div>
    </div>
  `;
}

function cardActionsHtml(r) {
  const btns = [`<button class="btn-mini" data-action="toggle-detail" data-id="${r.id}">${expandedId === r.id ? 'Hide Details' : 'View Details'}</button>`];

  if (r.deleted_at) {
    btns.push(`<button class="btn-mini" data-action="restore" data-id="${r.id}">Restore</button>`);
    if (canHardDelete) {
      btns.push(`<button class="btn-mini danger" data-action="hard-delete" data-id="${r.id}">Delete Permanently</button>`);
    }
    return btns.join('');
  }

  if (r.status === 'code_sent' || r.status === 'in_progress') {
    btns.push(`<button class="btn-mini" data-action="resend" data-id="${r.id}">Resend Code</button>`);
    btns.push(`<button class="btn-mini" data-action="copy" data-id="${r.id}">Copy Code</button>`);
  }

  if (r.status === 'submitted') {
    btns.push(`<button class="btn-mini accept" data-action="accepted" data-id="${r.id}">Accept</button>`);
    btns.push(`<button class="btn-mini" data-action="waitlisted" data-id="${r.id}">Waitlist</button>`);
    btns.push(`<button class="btn-mini danger" data-action="declined" data-id="${r.id}">Deny</button>`);
  }

  if (['accepted', 'waitlisted', 'declined'].includes(r.status)) {
    btns.push(`<button class="btn-mini" data-action="accepted" data-id="${r.id}">Change to Admitted</button>`);
    btns.push(`<button class="btn-mini" data-action="waitlisted" data-id="${r.id}">Change to Waitlisted</button>`);
    btns.push(`<button class="btn-mini danger" data-action="declined" data-id="${r.id}">Change to Denied</button>`);
  }

  btns.push(`<button class="btn-mini danger" data-action="trash" data-id="${r.id}">Move to Trash</button>`);
  return btns.join('');
}

// Formats a sibling/previous-school object into one clean readable line,
// e.g. "Name: Jane Doe · Grade: 3" instead of raw JSON.
function formatArrayItem(obj) {
  if (typeof obj !== 'object' || obj === null) return escapeHtml(String(obj));
  const parts = Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${humanizeKey(k)}: ${escapeHtml(String(v))}`);
  return parts.length ? parts.join(' · ') : '<span class="detail-empty">No details</span>';
}

function renderDetail(r) {
  let html = '';

  for (const section of DETAIL_SECTIONS) {
    const rows = section.fields
      .map(([key, label]) => {
        const val = r[key];
        if (val === null || val === undefined || val === '') return null;
        const display = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val);
        return `<dt>${label}</dt><dd>${escapeHtml(display)}</dd>`;
      })
      .filter(Boolean);

    if (rows.length === 0) continue;
    html += `<div class="detail-section"><div class="detail-section-title">${section.title}</div><dl>${rows.join('')}</dl></div>`;
  }

  if (r.previous_schools && Array.isArray(r.previous_schools) && r.previous_schools.length) {
    html += `<div class="detail-section"><div class="detail-section-title">Previous Schools</div>` +
      r.previous_schools.map(s => `<div class="detail-list-item">${formatArrayItem(s)}</div>`).join('') +
      `</div>`;
  }

  if (r.siblings && Array.isArray(r.siblings) && r.siblings.length) {
    html += `<div class="detail-section"><div class="detail-section-title">Siblings</div>` +
      r.siblings.map(s => `<div class="detail-list-item">${formatArrayItem(s)}</div>`).join('') +
      `</div>`;
  }

  if (html === '') {
    html = '<p class="detail-empty">No additional details captured yet.</p>';
  }

  html += `<div class="detail-access-code">Access Code: <strong>${escapeHtml(r.access_code || '—')}</strong></div>`;

  return html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function attachCardHandlers(tabRows) {
  els.list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action, Number(btn.dataset.id), tabRows));
  });
}

async function handleAction(action, id, tabRows) {
  const row = tabRows.find(r => r.id === id);
  if (!row) return;

  if (action === 'toggle-detail') {
    expandedId = expandedId === id ? null : id;
    render();
    return;
  }

  if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(row.access_code);
      showStatus('Code copied to clipboard.', 'success');
    } catch {
      showStatus('Could not copy — code is ' + row.access_code, 'info');
    }
    return;
  }

  if (action === 'resend') {
    if (!confirm(`Resend the access code email to ${row.parent1_email}?`)) return;
    const { error } = await supabaseClient.rpc('send_admission_code_email', { p_application_id: id });
    if (error) { showStatus('Could not resend: ' + error.message, 'error'); return; }
    showStatus('Code email resent.', 'success');
    return;
  }

  if (action === 'trash') {
    if (!confirm(`Move ${row.student_full_name}'s record to Trash? You can restore it later.`)) return;
    const { error } = await supabaseClient.from('admissions_applications').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) { showStatus('Could not move to trash: ' + error.message, 'error'); return; }
    showStatus('Moved to Trash.', 'success');
    await loadData();
    return;
  }

  if (action === 'restore') {
    if (!confirm(`Restore ${row.student_full_name}'s record from Trash?`)) return;
    const { error } = await supabaseClient.from('admissions_applications').update({ deleted_at: null }).eq('id', id);
    if (error) { showStatus('Could not restore: ' + error.message, 'error'); return; }
    showStatus('Record restored.', 'success');
    await loadData();
    return;
  }

  if (action === 'hard-delete') {
    if (!confirm(`Permanently delete ${row.student_full_name}'s record? This cannot be undone.`)) return;
    const { error } = await supabaseClient.from('admissions_applications').delete().eq('id', id);
    if (error) { showStatus('Could not delete: ' + error.message, 'error'); return; }
    showStatus('Record permanently deleted.', 'success');
    await loadData();
    return;
  }

  if (['accepted', 'waitlisted', 'declined'].includes(action)) {
    const isChange = ['accepted', 'waitlisted', 'declined'].includes(row.status);
    const label = TABS.find(t => t.key === action)?.label || action;
    const msg = isChange
      ? `Change ${row.student_full_name}'s decision to "${label}"? This re-sends a decision email to the family.`
      : `Mark ${row.student_full_name} as "${label}"? This sends a decision email to the family right away.`;
    if (!confirm(msg)) return;

    const { error } = await supabaseClient.rpc('set_admission_decision', { p_application_id: id, p_decision: action });
    if (error) { showStatus('Could not update decision: ' + error.message, 'error'); return; }
    showStatus(`Marked as ${label}.`, 'success');
    await loadData();
  }
}

els.yearSelect.addEventListener('change', () => {
  selectedYear = els.yearSelect.value;
  expandedId = null;
  render();
});

els.trashToggleBtn.addEventListener('click', () => {
  activeTab = activeTab === TRASH_KEY ? 'code_sent' : TRASH_KEY;
  expandedId = null;
  render();
});

(async () => {
  const session = await requireStaffSession();
  if (!session) return;

  const { data: staffRow } = await supabaseClient
    .from('staff_roles')
    .select('roles')
    .eq('email', session.user.email)
    .maybeSingle();
  const roles = (staffRow && staffRow.roles) || [];
  canHardDelete = roles.includes('super_admin') || roles.includes('leader');

  await loadData();
})();
