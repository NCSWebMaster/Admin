// NCS OnePlace — pages/admissions/reports.js
// Reports, rebuilt for the family/children model:
//   - Families Applied / Abandoned stay FAMILY-level counts (paperwork status)
//   - Admitted / Waitlisted / Denied now count CHILDREN, since decisions are
//     independent per child — a family with 2 kids where one is admitted and
//     one is waitlisted contributes 1 to each count, not 1 to just one.
// Requires supabase-client.js loaded first.

let allRows = [];
let selectedYear = 'all';

const els = {
  yearSelect: document.getElementById('year-select'),
  reportGrid: document.getElementById('report-grid'),
};

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
    .select('id, status, school_year, deleted_at, admission_children(decision)')
    .is('deleted_at', null);

  if (error) return;
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

function render() {
  const rows = allRows.filter(r => selectedYear === 'all' || r.school_year === selectedYear);

  const applied = rows.filter(r => r.status === 'submitted').length;
  const abandoned = rows.filter(r => r.status === 'code_sent' || r.status === 'in_progress').length;

  let accepted = 0, waitlisted = 0, declined = 0;
  rows.forEach(f => {
    f.admission_children.forEach(c => {
      if (c.decision === 'accepted') accepted++;
      if (c.decision === 'waitlisted') waitlisted++;
      if (c.decision === 'declined') declined++;
    });
  });

  const cards = [
    { key: 'applied', label: 'Families Applied', count: applied },
    { key: 'accepted', label: 'Students Admitted', count: accepted },
    { key: 'waitlisted', label: 'Students Waitlisted', count: waitlisted },
    { key: 'declined', label: 'Students Denied', count: declined },
    { key: 'abandoned', label: 'Families Abandoned', count: abandoned },
  ];

  els.reportGrid.innerHTML = cards.map(c => `
    <div class="report-card ${c.key}">
      <div class="report-count">${c.count}</div>
      <div class="report-label">${c.label}</div>
    </div>
  `).join('');
}

els.yearSelect.addEventListener('change', () => {
  selectedYear = els.yearSelect.value;
  render();
});

(async () => {
  const session = await requireStaffSession();
  if (!session) return;
  await loadData();
})();
