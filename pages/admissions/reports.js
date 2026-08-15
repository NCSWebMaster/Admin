// NCS OnePlace — pages/admissions/reports.js
// Reports: how many families applied, were admitted, waitlisted, denied, or abandoned.
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
    .from('admissions_applications')
    .select('id, status, school_year, deleted_at')
    .is('deleted_at', null);

  if (error) return;
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

function render() {
  const rows = allRows.filter(r => selectedYear === 'all' || r.school_year === selectedYear);

  const applied = rows.length;
  const accepted = rows.filter(r => r.status === 'accepted').length;
  const waitlisted = rows.filter(r => r.status === 'waitlisted').length;
  const declined = rows.filter(r => r.status === 'declined').length;
  const abandoned = rows.filter(r => r.status === 'code_sent' || r.status === 'in_progress').length;

  const cards = [
    { key: 'applied', label: 'Families Applied', count: applied },
    { key: 'accepted', label: 'Admitted', count: accepted },
    { key: 'waitlisted', label: 'Waitlisted', count: waitlisted },
    { key: 'declined', label: 'Denied', count: declined },
    { key: 'abandoned', label: 'Abandoned', count: abandoned },
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
