(function () {
  const client   = window.supabaseClient;
  const errorMsg = document.getElementById('error-msg');

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
  }

  function hideError() {
    errorMsg.textContent = '';
    errorMsg.style.display = 'none';
  }

  // Redirect ke dashboard jika session sudah aktif
  window.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await client.auth.getSession();
    if (session) window.location.href = 'dashboard.html';
  });

  // Handler form login
  document.getElementById('form-login').addEventListener('submit', async function (e) {
    e.preventDefault();
    hideError();

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btn      = document.getElementById('btn-masuk');

    btn.disabled = true;
    btn.textContent = 'Masuk...';

    const { error } = await client.auth.signInWithPassword({ email, password });

    if (error) {
      showError(error.message);
      btn.disabled = false;
      btn.textContent = 'Masuk';
      return;
    }

    window.location.href = 'dashboard.html';
  });
}());
