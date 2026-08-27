'use strict';

// Renderer chat interface Tab Rancang
// Dipanggil oleh rancang-chat.js — tidak boleh memanggil API langsung

function rcRenderStream(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<div class="rc-stream" id="rc-stream"></div>';
}

function rcAppendBubble(role, text, opts = {}) {
  const stream = document.getElementById('rc-stream');
  if (!stream) return;

  const bubble = document.createElement('div');
  bubble.className = `rc-bubble rc-bubble--${role}`;
  if (opts.id) bubble.id = opts.id;

  if (typeof text === 'string') {
    bubble.textContent = text;
  } else {
    bubble.appendChild(text); // Node langsung (untuk kartu ATP dll)
  }

  stream.appendChild(bubble);
  bubble.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return bubble;
}

function rcShowTyping() {
  const stream = document.getElementById('rc-stream');
  if (!stream || document.getElementById('rc-typing')) return;
  const el = document.createElement('div');
  el.id = 'rc-typing';
  el.className = 'rc-bubble rc-bubble--ai';
  el.innerHTML = '<div class="rc-typing-indicator"><span></span><span></span><span></span></div>';
  stream.appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function rcHideTyping() {
  document.getElementById('rc-typing')?.remove();
}

function rcRenderComposer(containerId, onSubmit) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const composer = document.createElement('div');
  composer.className = 'rc-composer';
  composer.id = 'rc-composer';
  composer.innerHTML = `
<div class="rc-composer-inner">
  <textarea class="rc-composer-input" id="rc-input" rows="1"
    placeholder="Ketik jawaban Anda…"></textarea>
  <button type="button" class="rc-composer-send" id="rc-send">Kirim</button>
</div>
<div class="rc-chips" id="rc-chips"></div>`;
  el.appendChild(composer);

  const input = document.getElementById('rc-input');
  const sendBtn = document.getElementById('rc-send');

  function resetHeight() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }

  input?.addEventListener('input', resetHeight);

  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const val = input.value.trim();
      if (val) {
        input.value = '';
        input.style.height = 'auto';
        onSubmit(val);
      }
    }
  });

  sendBtn?.addEventListener('click', () => {
    const val = input?.value.trim();
    if (val) {
      input.value = '';
      input.style.height = 'auto';
      onSubmit(val);
    }
  });
}

function rcRenderChips(options, onSelect) {
  const chips = document.getElementById('rc-chips');
  if (!chips) return;
  chips.innerHTML = options.map(o =>
    `<button type="button" class="rp-chip rc-chip-option"
      data-value="${o.value || o}">${o.label || o}</button>`
  ).join('');
  chips.querySelectorAll('.rc-chip-option').forEach(btn => {
    btn.addEventListener('click', () => {
      chips.innerHTML = '';
      onSelect(btn.dataset.value, btn.textContent);
    });
  });
}

function rcClearChips() {
  const chips = document.getElementById('rc-chips');
  if (chips) chips.innerHTML = '';
}

function rcSetComposerDisabled(disabled) {
  const composer = document.getElementById('rc-composer');
  if (!composer) return;
  if (disabled) composer.classList.add('rc-composer--disabled');
  else composer.classList.remove('rc-composer--disabled');
  const input = document.getElementById('rc-input');
  const send = document.getElementById('rc-send');
  if (input) input.disabled = disabled;
  if (send) send.disabled = disabled;
}

// ── Welcome screen (layar pembuka Tab Rancang) ────────────────────────────

function rcRenderWelcomeScreen(panel, mapelDisplay, onContinue) {
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const BTN_LABELS = {
    sesuaikan: 'Lanjut: Sesuaikan ATP',
    susun:     'Lanjut: Susun ATP Baru',
  };

  let selectedId = 'sesuaikan';

  panel.innerHTML = `
<div class="rc-welcome" id="rc-welcome">
  <div class="rc-welcome-ctx">
    <span class="rc-welcome-ctx-mapel">${escHtml(mapelDisplay)}</span>
    <span class="rc-welcome-ctx-label">Guru Mapel SMK</span>
    <span class="rc-welcome-ctx-atp">0 ATP</span>
  </div>
  <div class="rc-welcome-header">
    <h2 class="rc-welcome-title">Apa yang ingin Anda siapkan?</h2>
    <p class="rc-welcome-lead">MiClass menggunakan CP resmi dan data kelas Anda. Setiap rekomendasi sistem baru diterapkan setelah Anda setujui.</p>
  </div>
  <div class="rc-welcome-cards">
    <button type="button" class="rc-welcome-card" data-option="sesuaikan" aria-pressed="true">
      <span class="rc-welcome-card-label">Sesuaikan ATP yang ada</span>
      <span class="rc-welcome-card-badge">Direkomendasikan</span>
      <span class="rc-welcome-card-desc">Gunakan ATP yang sudah Anda miliki sebagai dasar, lalu sempurnakan bersama AI.</span>
    </button>
    <button type="button" class="rc-welcome-card" data-option="susun" aria-pressed="false">
      <span class="rc-welcome-card-label">Susun ATP baru</span>
      <span class="rc-welcome-card-desc">Mulai dari awal bersama AI berdasarkan CP resmi dan konteks kelas Anda.</span>
    </button>
    <button type="button" class="rc-welcome-card" data-option="modul" aria-pressed="false" aria-disabled="true">
      <span class="rc-welcome-card-label">Buat Modul Ajar</span>
      <span class="rc-welcome-card-badge rc-welcome-card-badge--soon">Segera hadir</span>
      <span class="rc-welcome-card-desc">Susun Modul Ajar lengkap dari ATP yang sudah ada.</span>
    </button>
  </div>
  <p class="rc-welcome-ai-note">AI akan membantu memberi rekomendasi dan mendeteksi data yang belum lengkap. Tidak ada keputusan yang diterapkan tanpa persetujuan Anda.</p>
  <div class="rc-welcome-footer">
    <button type="button" class="rc-welcome-btn" id="rc-welcome-lanjut">
      ${escHtml(BTN_LABELS['sesuaikan'])}
    </button>
  </div>
</div>`;

  panel.querySelectorAll('.rc-welcome-card').forEach(function (card) {
    card.addEventListener('click', function () {
      if (card.getAttribute('aria-disabled') === 'true') return;
      panel.querySelectorAll('.rc-welcome-card').forEach(function (c) {
        c.setAttribute('aria-pressed', 'false');
      });
      card.setAttribute('aria-pressed', 'true');
      selectedId = card.dataset.option;
      var btn = document.getElementById('rc-welcome-lanjut');
      if (btn) btn.textContent = BTN_LABELS[selectedId] || 'Lanjut';
    });
  });

  document.getElementById('rc-welcome-lanjut').addEventListener('click', function () {
    onContinue(selectedId);
  });
}
