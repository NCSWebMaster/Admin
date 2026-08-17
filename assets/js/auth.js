// NCS OnePlace — auth.js
// Login flow: Google OAuth (Supabase Auth) -> staff_roles check -> email MFA code.
// Requires supabase-client.js loaded first.
//
// IMPORTANT: the page must never silently skip past the "Sign in with
// Google" button just because a Supabase session is still cached in this
// browser. init() always shows the button first. Progressing past it only
// happens via an explicit click (see btnGoogle listener), or when the page
// reloads immediately after that click due to the OAuth redirect — tracked
// via the ncs_oauth_pending sessionStorage flag set right before we hand
// off to Google.

const els = {
  stepGoogle: document.getElementById('step-google'),
  stepMfa: document.getElementById('step-mfa'),
  btnGoogle: document.getElementById('btn-google'),
  btnVerify: document.getElementById('btn-verify'),
  btnResend: document.getElementById('btn-resend'),
  btnSwitchAccount: document.getElementById('btn-switch-account'),
  mfaInput: document.getElementById('mfa-code'),
  mfaEmailLabel: document.getElementById('mfa-email-label'),
  statusGoogle: document.getElementById('status-google'),
  statusMfa: document.getElementById('status-mfa'),
};

let resendCooldown = false;

function showStatus(el, message, type) {
  el.textContent = message;
  el.className = 'status-msg show ' + type;
}

function clearStatus(el) {
  el.className = 'status-msg';
}

function showStep(step) {
  els.stepGoogle.classList.remove('active');
  els.stepMfa.classList.remove('active');
  step.classList.add('active');
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.innerHTML = loading ? '<span class="spinner"></span>' + label : label;
}

async function proceedWithSession(session) {
  // Already fully verified this browser session? Skip straight through.
  if (sessionStorage.getItem('ncs_mfa_verified') === session.user.id) {
    window.location.href = '/pages/dashboard/index.html';
    return;
  }
  // We have a Supabase session (post Google OAuth) but MFA not yet verified this session.
  await checkStaffAndSendCode(session);
}

// Entry point — runs on every load of index.html
async function init() {
  const returningFromOAuth = sessionStorage.getItem('ncs_oauth_pending') === '1';
  sessionStorage.removeItem('ncs_oauth_pending');

  if (!returningFromOAuth) {
    // Fresh visit or reload — always require the explicit button click,
    // even if a Supabase session is still cached in this browser.
    showStep(els.stepGoogle);
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    showStep(els.stepGoogle);
    return;
  }

  await proceedWithSession(session);
}

async function checkStaffAndSendCode(session) {
  const email = session.user.email;

  const { data: staffRow, error } = await supabaseClient
    .from('staff_roles')
    .select('email, first_name, roles')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    showStep(els.stepGoogle);
    showStatus(els.statusGoogle, 'Something went wrong checking your account. Please try again.', 'error');
    await supabaseClient.auth.signOut();
    return;
  }

  if (!staffRow) {
    showStep(els.stepGoogle);
    showStatus(els.statusGoogle, email + ' is not set up as NCS staff. Contact your Super Admin.', 'error');
    await supabaseClient.auth.signOut();
    return;
  }

  els.mfaEmailLabel.textContent = email;
  showStep(els.stepMfa);
  await sendMfaCode();
}

async function sendMfaCode() {
  clearStatus(els.statusMfa);
  const { data, error } = await supabaseClient.rpc('request_email_mfa_code');

  if (error) {
    showStatus(els.statusMfa, 'Could not send verification code. Please try again.', 'error');
    return;
  }

  if (data === false) {
    showStatus(els.statusMfa, 'A code was just sent — check your inbox, or wait 30 seconds to resend.', 'info');
    return;
  }

  showStatus(els.statusMfa, 'Code sent — check your email.', 'success');
}

async function verifyMfaCode() {
  const code = els.mfaInput.value.trim();
  if (code.length !== 6) {
    showStatus(els.statusMfa, 'Enter the 6-digit code from your email.', 'error');
    return;
  }

  setLoading(els.btnVerify, true, 'Verifying…');
  const { data, error } = await supabaseClient.rpc('verify_email_mfa_code', { p_code: code });
  setLoading(els.btnVerify, false, 'Verify & continue');

  if (error) {
    showStatus(els.statusMfa, 'Something went wrong. Please try again.', 'error');
    return;
  }

  if (data !== true) {
    showStatus(els.statusMfa, 'Incorrect or expired code.', 'error');
    els.mfaInput.value = '';
    els.mfaInput.focus();
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  sessionStorage.setItem('ncs_mfa_verified', session.user.id);
  window.location.href = '/pages/dashboard/index.html';
}

// --- Event listeners ---

els.btnGoogle.addEventListener('click', async () => {
  clearStatus(els.statusGoogle);
  setLoading(els.btnGoogle, true, 'Redirecting…');

  // Mark that the next page load is a deliberate continuation of this
  // click, not a silent auto-resume — see init() above.
  sessionStorage.setItem('ncs_oauth_pending', '1');

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/index.html' },
  });
  if (error) {
    sessionStorage.removeItem('ncs_oauth_pending');
    setLoading(els.btnGoogle, false, 'Sign in with Google');
    showStatus(els.statusGoogle, 'Could not start sign-in. Please try again.', 'error');
  }
});

els.btnVerify.addEventListener('click', verifyMfaCode);

els.mfaInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') verifyMfaCode();
});

els.btnResend.addEventListener('click', async () => {
  if (resendCooldown) return;
  resendCooldown = true;
  await sendMfaCode();
  setTimeout(() => { resendCooldown = false; }, 30000);
});

els.btnSwitchAccount.addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  sessionStorage.removeItem('ncs_mfa_verified');
  showStep(els.stepGoogle);
  clearStatus(els.statusGoogle);
  setLoading(els.btnGoogle, false, 'Sign in with Google');
});

init();
