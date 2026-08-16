// NCS OnePlace — pages/admin/create-user.js
// Creates a staff_roles row so the person can sign in with Google once they get there,
// and emails them a heads-up. Restricted to Super Admin both here and server-side.

const els = {
  form: document.getElementById('user-form'),
  formCard: document.getElementById('form-card'),
  successCard: document.getElementById('success-card'),
  statusMsg: document.getElementById('status-msg'),
  submitBtn: document.getElementById('btn-submit'),
  firstName: document.getElementById('first-name'),
  lastName: document.getElementById('last-name'),
  email: document.getElementById('email'),
  roleChecks: document.getElementById('role-checks'),
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

async function requireSuperAdmin() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session || sessionStorage.getItem('ncs_mfa_verified') !== session.user.id) {
    window.location.href = '/index.html';
    return null;
  }

  const { data: staffRow } = await supabaseClient
    .from('staff_roles')
    .select('roles')
    .eq('email', session.user.email)
    .maybeSingle();
  const roles = (staffRow && staffRow.roles) || [];

  if (!roles.includes('super_admin')) {
    els.formCard.innerHTML = '<p class="detail-empty">Creating users is restricted to Super Admins.</p>';
    return null;
  }
  return session;
}

function resetForm() {
  els.form.reset();
  els.successCard.style.display = 'none';
  els.formCard.style.display = 'block';
  clearStatus();
  els.firstName.focus();
}

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearStatus();

  const firstName = els.firstName.value.trim();
  const lastName = els.lastName.value.trim();
  const email = els.email.value.trim();
  const roles = Array.from(els.roleChecks.querySelectorAll('input:checked')).map(el => el.value);

  if (!firstName || !lastName || !email) {
    showStatus('First name, last name, and email are all required.', 'error');
    return;
  }
  if (roles.length === 0) {
    showStatus('Select at least one role.', 'error');
    return;
  }

  els.submitBtn.disabled = true;
  els.submitBtn.innerHTML = '<span class="spinner"></span>Creating…';

  const { data, error } = await supabaseClient.rpc('create_staff_user', {
    p_first_name: firstName,
    p_last_name: lastName,
    p_email: email,
    p_roles: roles,
  });

  els.submitBtn.disabled = false;
  els.submitBtn.textContent = 'Create User & Send Welcome Email';

  if (error) {
    showStatus('Could not create user: ' + error.message, 'error');
    return;
  }
  if (!data || data.success !== true) {
    showStatus('Something went wrong. Please try again.', 'error');
    return;
  }

  els.resultEmail.textContent = email;
  els.formCard.style.display = 'none';
  els.successCard.style.display = 'block';
});

els.btnAnother.addEventListener('click', resetForm);

requireSuperAdmin();
