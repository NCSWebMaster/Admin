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

// Detail panel: grouped into mini-cards, laid out in a responsive grid.
// Student Background is the "wide" card and includes a flagged callout for
// disciplinary/learning-needs/medical fields so they stand out from routine facts.
const DETAIL_CARDS = [
  {
    title: '👪 Second Parent',
    fields: [
      ['parent2_name', 'Name'],
      ['parent2_email', 'Email'],
      ['parent2_phone', 'Phone'],
    ],
  },
  {
    title: '🏠 Home Address',
    fields: [
      ['home_address_street', 'Street'],
      ['home_address_city', 'City'],
      ['home_address_state', 'State'],
      ['home_address_zip', 'ZIP'],
    ],
  },
  {
    title: '🚨 Emergency Contact',
    fields: [
      ['emergency_contact_name', 'Name'],
      ['emergency_contact_relationship', 'Relation'],
      ['emergency_contact_phone', 'Phone'],
    ],
  },
  {
    title: '🤝 NCS Reference',
    fields: [
      ['ncs_family_reference_name', 'Name'],
      ['ncs_family_reference_email', 'Email'],
      ['ncs_family_reference_phone', 'Phone'],
    ],
  },
  {
    title: '⛪ Church & Referral',
    fields: [
      ['church_affiliation', 'Church'],
      ['referral_source', 'Referral'],
    ],
  },
];

let allRows = [];
let activeTab = 'code_sent';
let selectedYear = 'all';
let expandedId = null;
let canHardDelete = false;
let canOverrideDecision = false;

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
  const currentGradeChip = r.current_grade
    ? `<span class="chip">${gradeLabel(r.current_grade)}</span>`
    : `<span class="chip missing">Current grade not recorded</span>`;

  return `
    <div class="family-card" data-id="${r.id}">
      <div class="card-head">
        <div class="student-name">${escapeHtml(r.student_full_name || 'Unnamed Student')}</div>
        <span class="status-pill ${r.status}">${TABS.find(t => t.key === r.status)?.label || r.status}</span>
      </div>
      <div class="chips">
        ${currentGradeChip}
        <span class="chip">→ ${gradeLabel(r.anticipated_grade)}</span>
        <span class="chip">${escapeHtml(r.school_year || '—')}</span>
      </div>
      <div class="contact-box">
        <span class="icon">👤</span><span class="value">${escapeHtml(r.parent1_name || '—')}</span>
        <span class="icon">✉️</span><span class="value">${escapeHtml(r.parent1_email || '—')}</span>
        <span class="icon">📞</span><span class="value">${escapeHtml(r.parent1_phone || '—')}</span>
      </div>
      ${r.deleted_at ? `<div class="meta-line">Moved to Trash ${formatDate(r.deleted_at)}</div>` : ''}
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
    if (r.status === 'accepted' && !canOverrideDecision) {
      btns.push(`<span class="btn-mini locked">Admitted 🔒</span>`);
    } else {
      const otherOptions = TABS.filter(t => ['accepted', 'waitlisted', 'declined'].includes(t.key) && t.key !== r.status);
      btns.push(`
        <select class="btn-mini decision-select" data-role="decision-select" data-id="${r.id}">
          <option value="" selected disabled>Change decision…</option>
          ${otherOptions.map(t => `<option value="${t.key}">${t.label}</option>`).join('')}
        </select>
      `);
    }
  }

  btns.push(`<button class="icon-btn-trash" data-action="trash" data-id="${r.id}" title="Move to Trash">🗑</button>`);
  return btns.join('');
}

// Combines a Yes/No field with its free-text explanation into one line,
// e.g. "Yes — has an IEP" instead of two separate label rows.
function formatYesNoExplain(value, explain) {
  if (value === null || value === undefined || value === '') return null;
  const yn = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : escapeHtml(String(value));
  return explain ? `${yn} — ${escapeHtml(explain)}` : yn;
}

function renderDetail(r) {
  let cardsHtml = '';

  // --- Student Background (wide card + flagged callout) ---
  const bgRows = [];
  if (r.dob) bgRows.push(`<dt>DOB</dt><dd>${escapeHtml(r.dob)}</dd>`);
  if (r.nickname) bgRows.push(`<dt>Nickname</dt><dd>${escapeHtml(r.nickname)}</dd>`);
  if (r.age) bgRows.push(`<dt>Age</dt><dd>${escapeHtml(String(r.age))}</dd>`);
  if (r.gender) bgRows.push(`<dt>Gender</dt><dd>${escapeHtml(r.gender)}</dd>`);
  if (r.last_grade_completed) bgRows.push(`<dt>Last Grade</dt><dd>${escapeHtml(r.last_grade_completed)}</dd>`);
  const repeatedGrade = formatYesNoExplain(r.repeated_grade, r.repeated_grade_explain);
  if (repeatedGrade) bgRows.push(`<dt>Repeated Grade</dt><dd>${repeatedGrade}</dd>`);

  const flagRows = [];
  const disciplinary = formatYesNoExplain(r.disciplinary_history, r.disciplinary_explain);
  if (disciplinary) flagRows.push(`<div class="flag-row"><strong>Disciplinary:</strong> ${disciplinary}</div>`);
  const learningNeeds = formatYesNoExplain(r.learning_needs, r.learning_needs_explain);
  if (learningNeeds) flagRows.push(`<div class="flag-row"><strong>Learning Needs:</strong> ${learningNeeds}</div>`);
  if (r.medical_notes) flagRows.push(`<div class="flag-row"><strong>Medical:</strong> ${escapeHtml(r.medical_notes)}</div>`);

  if (bgRows.length || flagRows.length) {
    cardsHtml += `<div class="o2-card wide"><div class="sec-title">🎓 Student Background</div>`;
    if (bgRows.length) cardsHtml += `<dl>${bgRows.join('')}</dl>`;
    if (flagRows.length) cardsHtml += `<div class="flag-box"><div class="flag-title">🚩 Flag for Admission Review</div>${flagRows.join('')}</div>`;
    cardsHtml += `</div>`;
  }

  // --- Standard field-based cards ---
  for (const card of DETAIL_CARDS) {
    const rows = card.fields
      .map(([key, label]) => {
        const val = r[key];
        if (val === null || val === undefined || val === '') return null;
        const display = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val);
        return `<dt>${label}</dt><dd>${escapeHtml(display)}</dd>`;
      })
      .filter(Boolean);

    if (rows.length === 0) continue;
    cardsHtml += `<div class="o2-card"><div class="sec-title">${card.title}</div><dl>${rows.join('')}</dl></div>`;
  }

  // --- Previous Schools (own card, same dt/dd format as everything else) ---
  const schools = Array.isArray(r.previous_schools) ? r.previous_schools : [];
  if (schools.length) {
    const schoolRows = schools.map((s, i) => {
      const parts = [s.name, [s.city, s.state].filter(Boolean).join(', ')].filter(Boolean);
      return `<dt>School ${i + 1}</dt><dd>${escapeHtml(parts.join(' · ') || 'No details')}</dd>`;
    }).join('');
    cardsHtml += `<div class="o2-card"><div class="sec-title">🏫 Previous Schools</div><dl>${schoolRows}</dl></div>`;
  }

  // --- Siblings (own card, same dt/dd format as everything else) ---
  const siblings = Array.isArray(r.siblings) ? r.siblings : [];
  if (siblings.length) {
    const siblingRows = siblings.map((s, i) => {
      const parts = [s.name, s.age ? `Age ${s.age}` : ''].filter(Boolean);
      return `<dt>Sibling ${i + 1}</dt><dd>${escapeHtml(parts.join(' · ') || 'No details')}</dd>`;
    }).join('');
    cardsHtml += `<div class="o2-card"><div class="sec-title">👨‍👩‍👧 Siblings</div><dl>${siblingRows}</dl></div>`;
  }

  if (cardsHtml === '') {
    cardsHtml = '<p class="detail-empty" style="grid-column:1/-1;">No additional details captured yet.</p>';
  }

  // --- Record info footer: signature, timeline, access code ---
  const signatureLine = r.signature_name
    ? `Signed by ${escapeHtml(r.signature_name)}${r.signature_date ? ', ' + escapeHtml(r.signature_date) : ''}`
    : '';
  const timelineParts = [`Sent ${formatDate(r.created_at)}`];
  if (r.submitted_at) timelineParts.push(`Submitted ${formatDate(r.submitted_at)}`);
  if (r.decided_at) {
    timelineParts.push(`Decided ${formatDate(r.decided_at)}`);
  } else if (['accepted', 'waitlisted', 'declined'].includes(r.status)) {
    timelineParts.push(`Decided — not tracked before this feature`);
  }
  const footerRight = `${timelineParts.join(' · ')} · Code: <strong>${escapeHtml(r.access_code || '—')}</strong>`;

  return `<div class="o2-grid">${cardsHtml}` +
    `<div class="record-info"><span>${signatureLine}</span><span>${footerRight}</span></div>` +
    `</div>`;
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
  els.list.querySelectorAll('select[data-role="decision-select"]').forEach(sel => {
    sel.addEventListener('change', () => {
      const chosen = sel.value;
      sel.value = '';
      handleAction(chosen, Number(sel.dataset.id), tabRows);
    });
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
  canOverrideDecision = roles.includes('super_admin') || roles.includes('leader');

  await loadData();
})();
