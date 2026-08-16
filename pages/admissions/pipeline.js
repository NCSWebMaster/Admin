// NCS OnePlace — pages/admissions/pipeline.js
// Admissions Pipeline, rebuilt for the family/children model:
//   - Code Sent / Started / Submitted tabs filter by the FAMILY's paperwork status
//   - Admitted / Waitlist / Denied tabs filter by whether ANY child in the family
//     has that decision — siblings can have different outcomes, so a family can
//     appear under more than one of these three
//   - Stage counts for Admitted/Waitlist/Denied count CHILDREN, not families
//   - Accept/Waitlist/Deny actions live per child (see child section in detail panel),
//     not at the top of the family card, since decisions are no longer family-wide
// Requires supabase-client.js loaded first.

const TABS = [
  { key: 'code_sent', label: 'Code Sent', full: 'Codes Sent', level: 'family' },
  { key: 'in_progress', label: 'Started', full: 'Applications Started', level: 'family' },
  { key: 'submitted', label: 'Submitted', full: 'Applications Submitted', level: 'family' },
  { key: 'accepted', label: 'Admitted', full: 'Admitted Students', level: 'child' },
  { key: 'waitlisted', label: 'Waitlisted', full: 'Waitlist', level: 'child' },
  { key: 'declined', label: 'Denied', full: 'Denied', level: 'child' },
];

const GRADE_LABELS = { TK: 'TK', K: 'K', '1': '1st', '2': '2nd', '3': '3rd', '4': '4th', '5': '5th', '6': '6th', '7': '7th', '8': '8th' };
const DECISION_LABELS = { pending: 'Pending', accepted: 'Admitted', waitlisted: 'Waitlisted', declined: 'Denied' };
const DECISION_PILL_CLASS = { pending: 'code_sent', accepted: 'accepted', waitlisted: 'waitlisted', declined: 'declined' };

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

function trailingWord(name) {
  if (!name) return '';
  const parts = String(name).trim().split(/\s+/);
  return parts[parts.length - 1];
}

function familyDisplayName(f) {
  const surname = trailingWord(f.parent1_name) || 'Family';
  return `${surname} Family`;
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
    .from('admission_families')
    .select(`
      id, access_code, status, school_year, created_at, submitted_at, deleted_at,
      parent1_name, parent1_email, parent1_phone, parent2_name, parent2_email, parent2_phone,
      home_address_street, home_address_city, home_address_state, home_address_zip,
      church_affiliation, referral_source,
      emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
      ncs_family_reference_name, ncs_family_reference_email, ncs_family_reference_phone,
      signature_name, signature_date,
      admission_children (
        id, student_full_name, nickname, dob, age, gender, current_grade, anticipated_grade,
        last_grade_completed, previous_schools, repeated_grade, repeated_grade_explain,
        disciplinary_history, disciplinary_explain, learning_needs, learning_needs_explain,
        medical_notes, decision, decided_at
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    showStatus('Could not load applications: ' + error.message, 'error');
    return;
  }
  allRows = (data || []).map(f => ({ ...f, admission_children: f.admission_children || [] }));
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

function familyHasChildDecision(family, decision) {
  return family.admission_children.some(c => c.decision === decision);
}

function familyMatchesTab(family, tabKey) {
  const tab = TABS.find(t => t.key === tabKey);
  if (!tab) return false;
  if (tab.level === 'family') {
    if (tabKey === 'submitted') {
      // "needs review" — submitted paperwork with at least one undecided child
      return family.status === 'submitted' && family.admission_children.some(c => c.decision === 'pending');
    }
    return family.status === tabKey;
  }
  return familyHasChildDecision(family, tabKey);
}

function render() {
  const nonDeleted = nonDeletedRows();
  const trashed = deletedRows();

  const counts = {};
  TABS.forEach(t => { counts[t.key] = 0; });
  nonDeleted.forEach(f => {
    if (f.status === 'code_sent') counts.code_sent++;
    if (f.status === 'in_progress') counts.in_progress++;
    if (f.status === 'submitted' && f.admission_children.some(c => c.decision === 'pending')) counts.submitted++;
    f.admission_children.forEach(c => {
      if (c.decision === 'accepted') counts.accepted++;
      if (c.decision === 'waitlisted') counts.waitlisted++;
      if (c.decision === 'declined') counts.declined++;
    });
  });

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

  const tabRows = activeTab === TRASH_KEY ? trashed : nonDeleted.filter(f => familyMatchesTab(f, activeTab));

  if (tabRows.length === 0) {
    els.list.innerHTML = `<div class="empty-state">${activeTab === TRASH_KEY ? 'Trash is empty.' : 'No families in this stage right now.'}</div>`;
    return;
  }

  els.list.innerHTML = tabRows.map(f => renderCard(f)).join('');
  attachCardHandlers(tabRows);
}

function childChip(c) {
  const gradeText = c.current_grade ? `${gradeLabel(c.current_grade)} → ${gradeLabel(c.anticipated_grade)}` : gradeLabel(c.anticipated_grade);
  const decisionText = c.decision !== 'pending' ? ` · ${DECISION_LABELS[c.decision]}` : '';
  return `<span class="chip">${escapeHtml(c.student_full_name || 'Unnamed')} — ${gradeText}${decisionText}</span>`;
}

function renderCard(f) {
  const childChips = f.admission_children.length
    ? f.admission_children.map(childChip).join('')
    : `<span class="chip missing">No children added yet</span>`;

  return `
    <div class="family-card" data-id="${f.id}">
      <div class="card-head">
        <div class="student-name">${escapeHtml(familyDisplayName(f))}</div>
        <span class="status-pill ${f.status}">${f.status === 'code_sent' ? 'Code Sent' : f.status === 'in_progress' ? 'Started' : 'Submitted'}</span>
      </div>
      <div class="chips">
        ${childChips}
        <span class="chip">${escapeHtml(f.school_year || '—')}</span>
      </div>
      <div class="contact-box">
        <span class="icon">👤</span><span class="value">${escapeHtml(f.parent1_name || '—')}</span>
        <span class="icon">✉️</span><span class="value">${escapeHtml(f.parent1_email || '—')}</span>
        <span class="icon">📞</span><span class="value">${escapeHtml(f.parent1_phone || '—')}</span>
      </div>
      ${f.deleted_at ? `<div class="meta-line">Moved to Trash ${formatDate(f.deleted_at)}</div>` : ''}
      <div class="card-actions">
        ${cardActionsHtml(f)}
      </div>
      <div class="detail-panel ${expandedId === f.id ? 'show' : ''}" id="detail-${f.id}">
        ${expandedId === f.id ? renderDetail(f) : ''}
      </div>
    </div>
  `;
}

function cardActionsHtml(f) {
  const btns = [`<button class="btn-mini" data-action="toggle-detail" data-id="${f.id}">${expandedId === f.id ? 'Hide Details' : 'View Details'}</button>`];

  if (f.deleted_at) {
    btns.push(`<button class="btn-mini" data-action="restore" data-id="${f.id}">Restore</button>`);
    if (canHardDelete) {
      btns.push(`<button class="btn-mini danger" data-action="hard-delete" data-id="${f.id}">Delete Permanently</button>`);
    }
    return btns.join('');
  }

  if (f.status === 'code_sent' || f.status === 'in_progress') {
    btns.push(`<button class="btn-mini" data-action="resend" data-id="${f.id}">Resend Code</button>`);
    btns.push(`<button class="btn-mini" data-action="copy" data-id="${f.id}">Copy Code</button>`);
  }

  btns.push(`<button class="icon-btn-trash" data-action="trash" data-id="${f.id}" title="Move to Trash">🗑</button>`);
  return btns.join('');
}

function formatYesNoExplain(value, explain) {
  if (value === null || value === undefined || value === '') return null;
  const yn = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : escapeHtml(String(value));
  return explain ? `${yn} — ${escapeHtml(explain)}` : yn;
}

// One wide card per child: background + flag + schools + decision controls,
// all together since it's all about that one kid.
function renderChildCard(c, familyId) {
  const bgRows = [];
  if (c.dob) bgRows.push(`<dt>DOB</dt><dd>${escapeHtml(c.dob)}</dd>`);
  if (c.nickname) bgRows.push(`<dt>Nickname</dt><dd>${escapeHtml(c.nickname)}</dd>`);
  if (c.age) bgRows.push(`<dt>Age</dt><dd>${escapeHtml(String(c.age))}</dd>`);
  if (c.gender) bgRows.push(`<dt>Gender</dt><dd>${escapeHtml(c.gender)}</dd>`);
  if (c.anticipated_grade) bgRows.push(`<dt>Anticipated Grade</dt><dd>${escapeHtml(c.anticipated_grade)}</dd>`);
  if (c.last_grade_completed) bgRows.push(`<dt>Last Grade</dt><dd>${escapeHtml(c.last_grade_completed)}</dd>`);
  const repeatedGrade = formatYesNoExplain(c.repeated_grade, c.repeated_grade_explain);
  if (repeatedGrade) bgRows.push(`<dt>Repeated Grade</dt><dd>${repeatedGrade}</dd>`);

  const schools = Array.isArray(c.previous_schools) ? c.previous_schools : [];
  schools.forEach((s, i) => {
    const label = schools.length > 1 ? `School ${i + 1}` : 'Previous School';
    const parts = [s.name, [s.city, s.state].filter(Boolean).join(', ')].filter(Boolean);
    if (parts.length) bgRows.push(`<dt>${label}</dt><dd>${escapeHtml(parts.join(' · '))}</dd>`);
  });

  const flagRows = [];
  const disciplinary = formatYesNoExplain(c.disciplinary_history, c.disciplinary_explain);
  if (disciplinary) flagRows.push(`<div class="flag-row"><strong>Disciplinary:</strong> ${disciplinary}</div>`);
  const learningNeeds = formatYesNoExplain(c.learning_needs, c.learning_needs_explain);
  if (learningNeeds) flagRows.push(`<div class="flag-row"><strong>Learning Needs:</strong> ${learningNeeds}</div>`);
  if (c.medical_notes) flagRows.push(`<div class="flag-row"><strong>Medical:</strong> ${escapeHtml(c.medical_notes)}</div>`);

  const pillClass = DECISION_PILL_CLASS[c.decision] || 'code_sent';
  const decidedLine = c.decided_at ? `<span style="font-size:0.75rem;color:var(--ink-soft);margin-left:8px;">${formatDate(c.decided_at)}</span>` : '';

  let decisionControls;
  if (c.decision === 'accepted' && !canOverrideDecision) {
    decisionControls = `<span class="btn-mini locked">Admitted 🔒</span>`;
  } else if (c.decision === 'pending') {
    decisionControls = `
      <button class="btn-mini accept" data-action="child-decision" data-decision="accepted" data-child-id="${c.id}" data-family-id="${familyId}">Accept</button>
      <button class="btn-mini" data-action="child-decision" data-decision="waitlisted" data-child-id="${c.id}" data-family-id="${familyId}">Waitlist</button>
      <button class="btn-mini danger" data-action="child-decision" data-decision="declined" data-child-id="${c.id}" data-family-id="${familyId}">Deny</button>
    `;
  } else {
    const otherOptions = ['accepted', 'waitlisted', 'declined'].filter(d => d !== c.decision);
    decisionControls = `
      <select class="btn-mini decision-select" data-role="child-decision-select" data-child-id="${c.id}" data-family-id="${familyId}">
        <option value="" selected disabled>Change decision…</option>
        ${otherOptions.map(d => `<option value="${d}">${DECISION_LABELS[d]}</option>`).join('')}
      </select>
    `;
  }

  return `
    <div class="o2-card wide">
      <div class="sec-title">🎓 ${escapeHtml(c.student_full_name || 'Student')}</div>
      ${bgRows.length ? `<dl>${bgRows.join('')}</dl>` : ''}
      ${flagRows.length ? `<div class="flag-box"><div class="flag-title">🚩 Flag for Admission Review</div>${flagRows.join('')}</div>` : ''}
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;align-items:center;flex-wrap:wrap;gap:8px;">
        <span class="status-pill ${pillClass}">${DECISION_LABELS[c.decision]}</span>
        ${decidedLine}
        <span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;">${decisionControls}</span>
      </div>
    </div>
  `;
}

function renderDetail(f) {
  let cardsHtml = f.admission_children.map(c => renderChildCard(c, f.id)).join('');

  const familyCards = [
    { title: '👪 Second Parent', fields: [['parent2_name','Name'],['parent2_email','Email'],['parent2_phone','Phone']] },
    { title: '🏠 Home Address', fields: [['home_address_street','Street'],['home_address_city','City'],['home_address_state','State'],['home_address_zip','ZIP']] },
    { title: '🚨 Emergency Contact', fields: [['emergency_contact_name','Name'],['emergency_contact_relationship','Relation'],['emergency_contact_phone','Phone']] },
    { title: '🤝 NCS Reference', fields: [['ncs_family_reference_name','Name'],['ncs_family_reference_email','Email'],['ncs_family_reference_phone','Phone']] },
    { title: '⛪ Church & Referral', fields: [['church_affiliation','Church'],['referral_source','Referral']] },
  ];

  for (const card of familyCards) {
    const rows = card.fields
      .map(([key, label]) => {
        const val = f[key];
        if (val === null || val === undefined || val === '') return null;
        return `<dt>${label}</dt><dd>${escapeHtml(String(val))}</dd>`;
      })
      .filter(Boolean);
    if (rows.length === 0) continue;
    cardsHtml += `<div class="o2-card"><div class="sec-title">${card.title}</div><dl>${rows.join('')}</dl></div>`;
  }

  if (cardsHtml === '') {
    cardsHtml = '<p class="detail-empty" style="grid-column:1/-1;">No additional details captured yet.</p>';
  }

  const signatureLine = f.signature_name
    ? `Signed by ${escapeHtml(f.signature_name)}${f.signature_date ? ', ' + escapeHtml(f.signature_date) : ''}`
    : '';
  const timelineParts = [`Sent ${formatDate(f.created_at)}`];
  if (f.submitted_at) timelineParts.push(`Submitted ${formatDate(f.submitted_at)}`);
  const footerRight = `${timelineParts.join(' · ')} · Code: <strong>${escapeHtml(f.access_code || '—')}</strong>`;

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
    btn.addEventListener('click', () => handleAction(btn, tabRows));
  });
  els.list.querySelectorAll('select[data-role="child-decision-select"]').forEach(sel => {
    sel.addEventListener('change', () => {
      const decision = sel.value;
      sel.value = '';
      handleChildDecision(Number(sel.dataset.childId), Number(sel.dataset.familyId), decision, tabRows);
    });
  });
}

async function handleChildDecision(childId, familyId, decision, tabRows) {
  const family = tabRows.find(f => f.id === familyId);
  const child = family && family.admission_children.find(c => c.id === childId);
  if (!child) return;

  const isChange = child.decision !== 'pending';
  const label = DECISION_LABELS[decision];
  const msg = isChange
    ? `Change ${child.student_full_name || 'this child'}'s decision to "${label}"? This re-sends a decision email to the family.`
    : `Mark ${child.student_full_name || 'this child'} as "${label}"? This sends a decision email to the family right away.`;
  if (!confirm(msg)) return;

  const { error } = await supabaseClient.rpc('set_admission_child_decision', { p_child_id: childId, p_decision: decision });
  if (error) { showStatus('Could not update decision: ' + error.message, 'error'); return; }
  showStatus(`Marked as ${label}.`, 'success');
  await loadData();
}

async function handleAction(btn, tabRows) {
  const action = btn.dataset.action;

  if (action === 'child-decision') {
    await handleChildDecision(Number(btn.dataset.childId), Number(btn.dataset.familyId), btn.dataset.decision, tabRows);
    return;
  }

  const id = Number(btn.dataset.id);
  const row = tabRows.find(f => f.id === id);
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
    const { error } = await supabaseClient.rpc('send_admission_family_code_email', { p_family_id: id });
    if (error) { showStatus('Could not resend: ' + error.message, 'error'); return; }
    showStatus('Code email resent.', 'success');
    return;
  }

  if (action === 'trash') {
    if (!confirm(`Move ${familyDisplayName(row)}'s record to Trash? You can restore it later.`)) return;
    const { error } = await supabaseClient.from('admission_families').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) { showStatus('Could not move to trash: ' + error.message, 'error'); return; }
    showStatus('Moved to Trash.', 'success');
    await loadData();
    return;
  }

  if (action === 'restore') {
    if (!confirm(`Restore ${familyDisplayName(row)}'s record from Trash?`)) return;
    const { error } = await supabaseClient.from('admission_families').update({ deleted_at: null }).eq('id', id);
    if (error) { showStatus('Could not restore: ' + error.message, 'error'); return; }
    showStatus('Record restored.', 'success');
    await loadData();
    return;
  }

  if (action === 'hard-delete') {
    if (!confirm(`Permanently delete ${familyDisplayName(row)}'s record? This cannot be undone.`)) return;
    const { error } = await supabaseClient.from('admission_families').delete().eq('id', id);
    if (error) { showStatus('Could not delete: ' + error.message, 'error'); return; }
    showStatus('Record permanently deleted.', 'success');
    await loadData();
    return;
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
