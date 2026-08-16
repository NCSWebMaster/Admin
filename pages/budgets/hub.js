// NCS OnePlace — pages/budgets/hub.js
// NCS Room Budgets: Room Mom & Teacher budgets, tracked by Budget / Current Spend / Total Spent / Spend Left.
// Current Spend = most recent logged expense. Total Spent = sum of all logged expenses.
// Requires supabase-client.js loaded first.

let budgets = [];
let expensesByBudget = {};
let selectedYear = 'all';
let canManage = false;
let openExpenseFormId = null;

const els = {
  yearSelect: document.getElementById('year-select'),
  statusMsg: document.getElementById('status-msg'),
  roomMomList: document.getElementById('room-mom-list'),
  teacherList: document.getElementById('teacher-list'),
};

function showStatus(message, type) {
  els.statusMsg.textContent = message;
  els.statusMsg.className = 'status-msg show ' + type;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => { els.statusMsg.className = 'status-msg'; }, 4000);
}

function formatMoney(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
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
  const { data: budgetRows, error: budgetErr } = await supabaseClient
    .from('room_budgets')
    .select('id, budget_type, owner_name, school_year, budget_amount, created_at')
    .is('deleted_at', null)
    .order('owner_name', { ascending: true });

  if (budgetErr) {
    showStatus('Could not load budgets: ' + budgetErr.message, 'error');
    return;
  }
  budgets = budgetRows || [];

  const { data: expenseRows, error: expErr } = await supabaseClient
    .from('room_budget_expenses')
    .select('id, budget_id, amount, description, spent_at, created_at')
    .order('spent_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (expErr) {
    showStatus('Could not load expenses: ' + expErr.message, 'error');
    return;
  }

  expensesByBudget = {};
  (expenseRows || []).forEach(e => {
    if (!expensesByBudget[e.budget_id]) expensesByBudget[e.budget_id] = [];
    expensesByBudget[e.budget_id].push(e);
  });

  populateYearSelect();
  render();
}

function populateYearSelect() {
  const years = Array.from(new Set(budgets.map(b => b.school_year).filter(Boolean))).sort().reverse();
  const current = els.yearSelect.value || 'all';
  els.yearSelect.innerHTML = '<option value="all">All Years</option>' +
    years.map(y => `<option value="${y}">${y}</option>`).join('');
  els.yearSelect.value = years.includes(current) ? current : 'all';
  selectedYear = els.yearSelect.value;
}

function budgetStats(budget) {
  const expenses = expensesByBudget[budget.id] || [];
  const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const currentSpend = expenses.length ? Number(expenses[0].amount) : 0;
  const spendLeft = Number(budget.budget_amount) - totalSpent;
  const pct = budget.budget_amount > 0 ? Math.min(100, (totalSpent / budget.budget_amount) * 100) : 0;
  const statusClass = spendLeft <= 0 ? 'zero' : (spendLeft / budget.budget_amount <= 0.2 ? 'low' : 'healthy');
  return { expenses, totalSpent, currentSpend, spendLeft, pct, statusClass };
}

function render() {
  const filtered = budgets.filter(b => selectedYear === 'all' || b.school_year === selectedYear);
  renderList(els.roomMomList, filtered.filter(b => b.budget_type === 'room_mom'));
  renderList(els.teacherList, filtered.filter(b => b.budget_type === 'teacher'));
  attachHandlers();
}

function renderList(container, items) {
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-state">No budgets yet for this year.</div>';
    return;
  }
  container.innerHTML = items.map(renderBudgetCard).join('');
}

function renderBudgetCard(b) {
  const { expenses, totalSpent, currentSpend, spendLeft, pct, statusClass } = budgetStats(b);
  const isFormOpen = openExpenseFormId === b.id;

  const expenseListHtml = expenses.length
    ? `<div class="expense-list">${expenses.slice(0, 5).map(e => `
        <div class="expense-row"><span>${formatDate(e.spent_at)} — ${escapeHtml(e.description || 'No description')}</span><span>${formatMoney(e.amount)}</span></div>
      `).join('')}</div>`
    : '';

  return `
    <div class="budget-card" data-id="${b.id}">
      <div class="budget-top">
        <span class="budget-name">${escapeHtml(b.owner_name)}</span>
        <span class="spend-left-pill ${statusClass}">${formatMoney(spendLeft)} left</span>
      </div>
      <div class="progress-track"><div class="progress-fill ${statusClass}" style="width:${pct}%;"></div></div>
      <div class="stats-strip">
        <div class="stat"><span class="val">${formatMoney(b.budget_amount)}</span>Budget</div>
        <div class="stat"><span class="val">${formatMoney(currentSpend)}</span>Current</div>
        <div class="stat"><span class="val">${formatMoney(totalSpent)}</span>Total Spent</div>
      </div>
      ${canManage ? `<div class="card-actions">
        <button class="btn-mini" data-action="toggle-expense" data-id="${b.id}">${isFormOpen ? 'Cancel' : 'Log Expense'}</button>
      </div>` : ''}
      <div class="expense-form ${isFormOpen ? 'show' : ''}" id="expense-form-${b.id}">
        <div class="form-row cols-3">
          <div class="form-field"><label>Amount ($)</label><input type="number" step="0.01" min="0" class="form-input exp-amount" id="exp-amount-${b.id}"></div>
          <div class="form-field"><label>Date</label><input type="date" class="form-input exp-date" id="exp-date-${b.id}"></div>
          <div class="form-field"><label>Description</label><input type="text" class="form-input exp-desc" id="exp-desc-${b.id}" placeholder="e.g. Snacks"></div>
        </div>
        <button class="btn-mini accept" data-action="save-expense" data-id="${b.id}">Save Expense</button>
      </div>
      ${expenseListHtml}
    </div>
  `;
}

function attachHandlers() {
  document.querySelectorAll('[data-action="toggle-expense"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      openExpenseFormId = openExpenseFormId === id ? null : id;
      render();
    });
  });

  document.querySelectorAll('[data-action="save-expense"]').forEach(btn => {
    btn.addEventListener('click', () => saveExpense(Number(btn.dataset.id)));
  });
}

async function saveExpense(budgetId) {
  const amountEl = document.getElementById(`exp-amount-${budgetId}`);
  const dateEl = document.getElementById(`exp-date-${budgetId}`);
  const descEl = document.getElementById(`exp-desc-${budgetId}`);

  const amount = parseFloat(amountEl.value);
  if (!amount || amount <= 0) {
    showStatus('Enter a valid expense amount.', 'error');
    return;
  }

  const { error } = await supabaseClient.from('room_budget_expenses').insert({
    budget_id: budgetId,
    amount: amount,
    description: descEl.value.trim() || null,
    spent_at: dateEl.value || new Date().toISOString().slice(0, 10),
  });

  if (error) {
    showStatus('Could not save expense: ' + error.message, 'error');
    return;
  }

  showStatus('Expense logged.', 'success');
  openExpenseFormId = null;
  await loadData();
}

// --- Add Budget forms ---

document.querySelectorAll('.btn-add-budget').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    document.getElementById(`add-form-${type}`).classList.add('show');
  });
});

document.querySelectorAll('[data-action="cancel-budget"]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById(`add-form-${btn.dataset.type}`).classList.remove('show');
  });
});

document.querySelectorAll('[data-action="save-budget"]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const type = btn.dataset.type;
    const formEl = document.getElementById(`add-form-${type}`);
    const ownerName = formEl.querySelector('.add-owner-name').value.trim();
    const schoolYear = formEl.querySelector('.add-school-year').value.trim();
    const amount = parseFloat(formEl.querySelector('.add-amount').value);

    if (!ownerName || !schoolYear || !amount || amount < 0) {
      showStatus('Fill in name, school year, and a valid budget amount.', 'error');
      return;
    }

    const { error } = await supabaseClient.from('room_budgets').insert({
      budget_type: type,
      owner_name: ownerName,
      school_year: schoolYear,
      budget_amount: amount,
    });

    if (error) {
      showStatus('Could not create budget: ' + error.message, 'error');
      return;
    }

    formEl.classList.remove('show');
    formEl.querySelector('.add-owner-name').value = '';
    formEl.querySelector('.add-school-year').value = '';
    formEl.querySelector('.add-amount').value = '';
    showStatus('Budget created.', 'success');
    await loadData();
  });
});

els.yearSelect.addEventListener('change', () => {
  selectedYear = els.yearSelect.value;
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
  canManage = roles.includes('staff') || roles.includes('leader') || roles.includes('super_admin');

  if (!canManage) {
    document.querySelectorAll('.btn-add-budget').forEach(b => b.style.display = 'none');
  }

  await loadData();
})();
