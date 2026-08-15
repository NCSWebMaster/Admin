// NCS OnePlace — pages/admissions/pipeline.js
// Admissions pipeline: view all applications by status/school year, take action.
// Requires supabase-client.js loaded first.

const TABS = [
  { key: 'code_sent', label: 'Code Sent' },
  { key: 'in_progress', label: 'Started' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'accepted', label: 'Admitted' },
  { key: 'waitlisted', label: 'Waitlisted' },
  { key: 'declined', label: 'Denied' },
];

const GRADE_LABELS = { TK: 'TK', K: 'K', '1': '1st', '2': '2nd', '3': '3rd', '4': '4th', '5': '5th', '6': '6th', '7': '7th', '8': '8th' };

const DETAIL_FIELD_LABELS = {
  nickname: 'Nickname', age: 'Age', gender: 'Gender',
  last_grade_completed: 'Last Grade Completed',
  repeated_grade: 'Repeated a Grade', repeated_grade_explain: 'Repeated Grade — Details',
  disciplinary_history: 'Disciplinary History', disciplinary_explain: 'Disciplinary — Details',
  learning_needs: 'Learning Needs', learning_needs_explain: 'Learning Needs — Details',
  medical_notes: 'Medical Notes',
  church_affiliation: 'Church Affiliation', referral_source: 'Referral Source',
  emergency_contact_name: 'Emergency Contact', emergency_contact_relationship: 'Emergency Contact — Relationship',
  emergency_contact_phone: 'Emergency Contact — Phone',
  signature_name: 'Signature', signature_date: 'Signature Date',
  ncs_family_reference_name: 'NCS Family Reference', ncs_family_reference_email: 'NCS Reference — Email',
  ncs_family_reference_phone: 'NCS Reference — Phone',
  home_address_street: 'Street', home_address_city: 'City', home_address_state: 'State', home_address_zip: 'ZIP',
  parent2_name: 'Parent 2', parent2_email: 'Parent 2 — Email', parent2_phone: 'Parent 2 — Phone',
};

let allRows = [];
let activeTab = 'code_sent';
let selectedYear = 'all';
let expandedId = null;

const els = {
  yearSelect: document.getElementById('year-select'),
  tabBar: document.getElementById('tab-bar'),
  list: document.getElementById('family-list'),
  statusMsg: document.getElementById('status-msg'),
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
    .select('id, access_code, status, school_year, created_at, submitted_at, decided_at, student_full_name, dob, current_grade, anticipated_grade, parent1_name, parent1_email, parent1_phone, parent2_name, parent2_email, parent2_phone, home_address_street, home_address_city, home_address_state, home_address_zip, nickname, age, gender, previous_schools, last_grade_completed, repeated_grade, repeated_grade_explain, disciplinary_history, disciplinary_explain, learning_needs, learning_needs_explain, medical_notes, siblings, church_affiliation, referral_source, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, signature_name, signature_date, ncs_family_reference_name, ncs_family_reference_email, ncs_family_reference_phone')
    .is('deleted_at', null)
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

function filteredRows() {
  return allRows.filter(r => selectedYear === 'all' || r.school_year === selectedYear);
}

function render() {
  const rows = filteredRows();
  const counts = {};
  TABS.forEach(t => { counts[t.key] = 0; });
  rows.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });

  els.tabBar.innerHTML = TABS.map(t => `
    <button class="tab-btn ${t.key === activeTab ? 'active' : ''}" data-tab="${t.key}">
      ${t.label}<span class="count">${counts[t.key]}</span>
    </button>
  `).join('');

  els.tabBar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => { activeTab = btn.dataset.tab; expandedId = null; render(); });
  });

  const tabRows = rows.filter(r => r.status === activeTab);

  if (tabRows.length === 0) {
    els.list.innerHTML = '<div class="empty-state">No families in this stage right now.</div>';
    return;
  }

  els.list.innerHTML = tabRows.map(r => renderCard(r)).join('');
  attachCardHandlers(tabRows);
}

function renderCard(r) {
  const dateLine = r.status === 'code_sent' || r.status === 'in_progress'
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

  if (r.status === 'code_sent' || r.status === 'in_progress') {
    btns.push(`<button class="btn-mini" data-action="resend" data-id="${r.id}">Resend Code</button>`);
    btns.push(`<button class="btn-mini" data-action="copy" data-id="${r.id}">Copy Code</button>`);
    btns.push(`<button class="btn-mini danger" data-action="archive" data-id="${r.id}">Archive</button>`);
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

  return btns.join('');
}

function renderDetail(r) {
  const rows = [];
  for (const [key, label] of Object.entries(DETAIL_FIELD_LABELS)) {
    const val = r[key];
    if (val === null || val === undefined || val === '') continue;
    rows.push(`<dt>${label}</dt><dd>${escapeHtml(typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val))}</dd>`);
  }
  if (r.previous_schools && Array.isArray(r.previous_schools) && r.previous_schools.length) {
    rows.push(`<dt>Previous Schools</dt><dd>${r.previous_schools.map(s => escapeHtml(JSON.stringify(s))).join('; ')}</dd>`);
  }
  if (r.siblings && Array.isArray(r.siblings) && r.siblings.length) {
    rows.push(`<dt>Siblings</dt><dd>${r.siblings.map(s => escapeHtml(JSON.stringify(s))).join('; ')}</dd>`);
  }
  rows.push(`<dt>Access Code</dt><dd>${escapeHtml(r.access_code || '—')}</dd>`);

  if (rows.length === 0) return '<p style="color:var(--ink-soft);">No additional details captured yet.</p>';
  return `<dl>${rows.join('')}</dl>`;
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

  if (action === 'archive') {
    if (!confirm(`Archive ${row.student_full_name}'s record? It will be hidden from the pipeline.`)) return;
    const { error } = await supabaseClient.from('admissions_applications').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) { showStatus('Could not archive: ' + error.message, 'error'); return; }
    showStatus('Record archived.', 'success');
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

(async () => {
  const session = await requireStaffSession();
  if (!session) return;
  await loadData();
})();
