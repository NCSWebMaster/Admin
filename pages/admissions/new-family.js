// NCS OnePlace — pages/admissions/new-family.js
// New Interested Family intake: generates + emails ONE admissions access code
// covering the whole family, with N children entered up front.
// Requires supabase-client.js loaded first.

const GRADE_OPTIONS = [
  ['TK', 'Transitional Kindergarten'],
  ['K', 'Kindergarten'],
  ['1', '1st Grade'],
  ['2', '2nd Grade'],
  ['3', '3rd Grade'],
  ['4', '4th Grade'],
  ['5', '5th Grade'],
  ['6', '6th Grade'],
  ['7', '7th Grade'],
  ['8', '8th Grade'],
];

const US_STATES = ['CA','AL','AK','AZ','AR','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

function populateGradeSelect(select) {
  select.innerHTML = '<option value="" disabled selected>Select grade</option>';
  GRADE_OPTIONS.forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  });
}

function populateStateSelect(select) {
  US_STATES.forEach((abbr) => {
    const opt = document.createElement('option');
    opt.value = abbr;
    opt.textContent = abbr;
    select.appendChild(opt);
  });
  select.value = 'CA';
}

function populateSchoolYearSelect(select) {
  const now = new Date();
  const startYear = now.getMonth() >= 6 ? now.getFullYear() - 1 : now.getFullYear() - 2;
  for (let i = 0; i < 5; i++) {
    const y = startYear + i;
    const opt = document.createElement('option');
    opt.value = `${y}-${y + 1}`;
    opt.textContent = `${y}-${y + 1}`;
    select.appendChild(opt);
  }
}

function formatPhoneInput(e) {
  let digits = e.target.value.replace(/\D/g, '').slice(0, 10);
  let formatted = digits;
  if (digits.length > 6) {
    formatted = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  } else if (digits.length > 3) {
    formatted = `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  } else if (digits.length > 0) {
    formatted = `(${digits}`;
  }
  e.target.value = formatted;
}

const els = {
  form: document.getElementById('family-form'),
  formCard: document.getElementById('form-card'),
  successCard: document.getElementById('success-card'),
  statusMsg: document.getElementById('status-msg'),
  submitBtn: document.getElementById('btn-submit'),

  childrenContainer: document.getElementById('children-container'),
  btnAddChild: document.getElementById('btn-add-child'),

  schoolYear: document.getElementById('school-year'),

  parent1Name: document.getElementById('parent1-name'),
  parent1Phone: document.getElementById('parent1-phone'),
  parent1Email: document.getElementById('parent1-email'),

  street: document.getElementById('address-street'),
  city: document.getElementById('address-city'),
  state: document.getElementById('address-state'),
  zip: document.getElementById('address-zip'),

  btnAddParent2: document.getElementById('btn-add-parent2'),
  btnRemoveParent2: document.getElementById('btn-remove-parent2'),
  parent2Block: document.getElementById('parent2-block'),
  parent2Name: document.getElementById('parent2-name'),
  parent2Phone: document.getElementById('parent2-phone'),
  parent2Email: document.getElementById('parent2-email'),

  resultCode: document.getElementById('result-code'),
  resultEmail: document.getElementById('result-email'),
  btnAnother: document.getElementById('btn-another'),
};

function showStatus(message, type) {
  els.statusMsg.textContent = message;
  els.statusMsg.className = 'status-msg show ' + type;
}

function clearStatus() {
  els.statusMsg.className = 'status-msg';
}

async function requireStaffSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session || sessionStorage.getItem('ncs_mfa_verified') !== session.user.id) {
    window.location.href = '/index.html';
    return null;
  }
  return session;
}

// ── REPEATABLE CHILD ROWS ────────────────────────────────────
let childRowCount = 0;

function addChildRow() {
  childRowCount++;
  const row = document.createElement('div');
  row.className = 'child-row';
  row.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
      <h3 style="margin:0;font-size:0.95rem;">Child</h3>
      <button type="button" class="btn-text-remove child-remove-btn" style="display:none;">Remove</button>
    </div>
    <div class="form-row">
      <div class="form-field"><label>Student Name</label><input type="text" class="form-input child-name" required></div>
      <div class="form-field"><label>DOB</label><input type="date" class="form-input child-dob" required></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>Current Grade</label><select class="form-select child-current-grade" required></select></div>
      <div class="form-field"><label>Anticipated Grade</label><select class="form-select child-anticipated-grade" required></select></div>
    </div>
  `;
  els.childrenContainer.appendChild(row);
  populateGradeSelect(row.querySelector('.child-current-grade'));
  populateGradeSelect(row.querySelector('.child-anticipated-grade'));
  row.querySelector('.child-remove-btn').addEventListener('click', () => {
    row.remove();
    updateChildLabelsAndRemoveButtons();
  });
  updateChildLabelsAndRemoveButtons();
}

// Numbers each child ("Child 1", "Child 2"...) and only shows Remove once
// there's more than one — mirrors the same rule used on the apply site.
function updateChildLabelsAndRemoveButtons() {
  const rows = els.childrenContainer.querySelectorAll('.child-row');
  rows.forEach((row, i) => {
    row.querySelector('h3').textContent = rows.length > 1 ? `Child ${i + 1}` : 'Child';
    row.querySelector('.child-remove-btn').style.display = rows.length > 1 ? 'inline-block' : 'none';
  });
}

function collectChildren() {
  return Array.from(els.childrenContainer.querySelectorAll('.child-row')).map(row => ({
    student_full_name: row.querySelector('.child-name').value.trim(),
    dob: row.querySelector('.child-dob').value || null,
    current_grade: row.querySelector('.child-current-grade').value || null,
    anticipated_grade: row.querySelector('.child-anticipated-grade').value || null,
  }));
}

function validateChildren(children) {
  if (children.length === 0) return 'Please add at least one child.';
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    const label = children.length > 1 ? `Child ${i + 1}` : 'the child';
    if (!c.student_full_name) return `Please enter a name for ${label}.`;
    if (!c.dob) return `Please enter a date of birth for ${label}.`;
    if (!c.current_grade) return `Please select a current grade for ${label}.`;
    if (!c.anticipated_grade) return `Please select an anticipated grade for ${label}.`;
  }
  return null;
}

// ── FORM RESET ───────────────────────────────────────────────
function resetForm() {
  els.form.reset();
  els.state.value = 'CA';
  els.parent2Block.style.display = 'none';
  els.btnAddParent2.style.display = 'inline-block';
  els.childrenContainer.innerHTML = '';
  childRowCount = 0;
  addChildRow();
  els.successCard.style.display = 'none';
  els.formCard.style.display = 'block';
  clearStatus();
  els.childrenContainer.querySelector('.child-name').focus();
}

// ── SUBMIT ───────────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  clearStatus();

  if (!els.parent1Name.value.trim() || !els.parent1Email.value.trim() || !els.parent1Phone.value.trim()) {
    showStatus('Parent/Guardian name, phone, and email are required.', 'error');
    return;
  }

  const children = collectChildren();
  const childrenError = validateChildren(children);
  if (childrenError) {
    showStatus(childrenError, 'error');
    return;
  }

  if (!els.schoolYear.value) {
    showStatus('Select a school year.', 'error');
    return;
  }

  const parent2Active = els.parent2Block.style.display !== 'none';

  els.submitBtn.disabled = true;
  els.submitBtn.innerHTML = '<span class="spinner"></span>Generating code…';

  const { data, error } = await supabaseClient.rpc('generate_admission_family', {
    p_children: children,
    p_school_year: els.schoolYear.value,
    p_parent1_name: els.parent1Name.value.trim(),
    p_parent1_email: els.parent1Email.value.trim(),
    p_parent1_phone: els.parent1Phone.value.trim(),
    p_parent2_name: parent2Active ? (els.parent2Name.value.trim() || null) : null,
    p_parent2_email: parent2Active ? (els.parent2Email.value.trim() || null) : null,
    p_parent2_phone: parent2Active ? (els.parent2Phone.value.trim() || null) : null,
    p_home_address_street: els.street.value.trim() || null,
    p_home_address_city: els.city.value.trim() || null,
    p_home_address_state: els.state.value || null,
    p_home_address_zip: els.zip.value.trim() || null,
  });

  els.submitBtn.disabled = false;
  els.submitBtn.textContent = 'Generate code & send email';

  if (error) {
    showStatus('Could not generate the code: ' + error.message, 'error');
    return;
  }

  if (!data || data.success !== true) {
    showStatus('Something went wrong generating the code. Please try again.', 'error');
    return;
  }

  els.resultCode.textContent = data.code;
  els.resultEmail.textContent = els.parent1Email.value.trim();
  els.formCard.style.display = 'none';
  els.successCard.style.display = 'block';
}

els.btnAddChild.addEventListener('click', addChildRow);

els.btnAddParent2.addEventListener('click', () => {
  els.parent2Block.style.display = 'block';
  els.btnAddParent2.style.display = 'none';
  els.parent2Name.focus();
});

els.btnRemoveParent2.addEventListener('click', () => {
  els.parent2Name.value = '';
  els.parent2Phone.value = '';
  els.parent2Email.value = '';
  els.parent2Block.style.display = 'none';
  els.btnAddParent2.style.display = 'inline-block';
});

els.parent1Phone.addEventListener('input', formatPhoneInput);
els.parent2Phone.addEventListener('input', formatPhoneInput);
els.form.addEventListener('submit', handleSubmit);
els.btnAnother.addEventListener('click', resetForm);

(async () => {
  const session = await requireStaffSession();
  if (!session) return;

  populateStateSelect(els.state);
  populateSchoolYearSelect(els.schoolYear);
  addChildRow();
})();
