// NCS OnePlace — pages/admissions/new-family.js
// New Interested Family intake: generates + emails an admissions access code.
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

  studentName: document.getElementById('student-name'),
  studentDob: document.getElementById('student-dob'),
  currentGrade: document.getElementById('current-grade'),
  anticipatedGrade: document.getElementById('anticipated-grade'),

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

function resetForm() {
  els.form.reset();
  els.state.value = 'CA';
  els.parent2Block.style.display = 'none';
  els.btnAddParent2.style.display = 'inline-block';
  els.successCard.style.display = 'none';
  els.formCard.style.display = 'block';
  clearStatus();
  els.studentName.focus();
}

async function handleSubmit(e) {
  e.preventDefault();
  clearStatus();

  if (!els.parent1Name.value.trim() || !els.parent1Email.value.trim() || !els.parent1Phone.value.trim()) {
    showStatus('Parent/Guardian name, phone, and email are required.', 'error');
    return;
  }
  if (!els.studentName.value.trim() || !els.studentDob.value || !els.currentGrade.value || !els.anticipatedGrade.value) {
    showStatus('Student name, date of birth, current grade, and anticipated grade are required.', 'error');
    return;
  }

  const parent2Active = els.parent2Block.style.display !== 'none';

  els.submitBtn.disabled = true;
  els.submitBtn.innerHTML = '<span class="spinner"></span>Generating code…';

  const { data, error } = await supabaseClient.rpc('generate_admission_code', {
    p_student_full_name: els.studentName.value.trim(),
    p_dob: els.studentDob.value,
    p_current_grade: els.currentGrade.value,
    p_anticipated_grade: els.anticipatedGrade.value,
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

  populateGradeSelect(els.currentGrade);
  populateGradeSelect(els.anticipatedGrade);
  populateStateSelect(els.state);
})();
