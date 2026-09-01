'use strict';

// Renderer chat interface Tab Rancang
// Dipanggil oleh rancang-chat.js — tidak boleh memanggil API langsung

function rcRenderStream(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML =
    '<div id="rc-modul-progress" style="display:none;padding:6px 14px 4px;' +
    'font-size:0.82rem;color:var(--gold,#f2c14e);border-bottom:1px solid rgba(242,193,78,0.18);' +
    'background:rgba(242,193,78,0.05);">' +
    'Modul Ajar · Langkah <span id="rc-prog-step">1</span> dari 4 · ' +
    '<span id="rc-prog-name"></span></div>' +
    '<div class="rc-stream" id="rc-stream"></div>';
}

const _MODUL_PROGRESS_MAP = {
  KONTEKS_MODUL:   { step: 1, name: 'Konteks' },
  SUMBER_STRATEGI: { step: 2, name: 'Sumber & Strategi' },
  ASESMEN_MODUL:   { step: 3, name: 'Asesmen' },
  MODUL_SUMMARY:   { step: 4, name: 'Konfirmasi' },
};

function rcUpdateModulProgress(phase) {
  const bar = document.getElementById('rc-modul-progress');
  if (!bar) return;
  const info = _MODUL_PROGRESS_MAP[phase];
  if (!info) { bar.style.display = 'none'; return; }
  bar.style.display = '';
  const stepEl = document.getElementById('rc-prog-step');
  const nameEl = document.getElementById('rc-prog-name');
  if (stepEl) stepEl.textContent = info.step;
  if (nameEl) nameEl.textContent = info.name;
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

// Tandai satu bubble jawaban guru bisa diedit: tombol "✏" muncul saat bubble
// di-tap (mobile tidak punya hover). onEdit dipanggil dengan (questionId, phase).
function rcMakeBubbleEditable(bubble, questionId, phase, onEdit) {
  if (!bubble || typeof onEdit !== 'function') return;
  bubble.dataset.questionId = questionId;
  bubble.dataset.phase = phase;
  bubble.style.cursor = 'pointer';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'rc-edit-btn';
  editBtn.setAttribute('aria-label', 'Ubah jawaban ini');
  editBtn.title = 'Ubah jawaban ini';
  editBtn.textContent = '✏ Ubah';
  // Warna & latar eksplisit — tidak bergantung pada stylesheet eksternal
  // supaya tetap kontras di dark theme meski .rc-edit-btn belum diberi gaya.
  editBtn.style.cssText =
    'display:none;margin-left:8px;padding:2px 8px;background:rgba(255,255,255,0.12);' +
    'color:#f2c14e;border:1px solid rgba(242,193,78,0.5);border-radius:999px;' +
    'cursor:pointer;font-size:0.78rem;line-height:1.4;opacity:1;';
  editBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    onEdit(questionId, phase);
  });
  bubble.appendChild(editBtn);

  bubble.addEventListener('click', function () {
    editBtn.style.display = editBtn.style.display === 'none' ? 'inline-block' : 'none';
  });
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
</div>`;
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

function rcClearStream() {
  const stream = document.getElementById('rc-stream');
  if (stream) stream.innerHTML = '';
}

function rcSetComposerVisible(visible) {
  const wrap = document.getElementById('rc-composer-wrap');
  if (!wrap) return;
  wrap.style.display = visible ? '' : 'none';
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

// rcSetComposerDisabled tidak menyimpan state di _chat — hanya memanipulasi
// DOM. Dipakai saat sebuah alur (mis. konfirmasi ← Rancang) perlu membaca
// state disabled saat ini sebelum menimpanya sementara.
function rcIsComposerDisabled() {
  const composer = document.getElementById('rc-composer');
  return !!composer && composer.classList.contains('rc-composer--disabled');
}

// ── Welcome screen (layar pembuka Tab Rancang) ────────────────────────────

// atpCount: jumlah ATP tersimpan. null/undefined = belum diketahui (query gagal)
// — badge tidak boleh berbohong "0 ATP" saat jawabannya sebenarnya tidak ada.
function rcRenderWelcomeScreen(panel, mapelDisplay, onContinue, atpCount) {
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
    modul:     'Lanjut: Buat Modul Ajar',
  };

  let selectedId = 'sesuaikan';

  const atpLabel = typeof atpCount !== 'number'
    ? '— ATP'
    : atpCount === 0
      ? 'Belum ada ATP'
      : `${atpCount} ATP tersimpan`;

  panel.innerHTML = `
<div class="rc-welcome" id="rc-welcome">
  <div class="rc-welcome-ctx">
    <span class="rc-welcome-ctx-mapel">${escHtml(mapelDisplay)}</span>
    <span class="rc-welcome-ctx-label">Guru Mapel SMK</span>
    <span class="rc-welcome-ctx-atp">${escHtml(atpLabel)}</span>
  </div>
  <div class="rc-welcome-header">
    <h2 class="rc-welcome-title">ATP selesai. Tanpa begadang.</h2>
    <p class="rc-welcome-lead">Yang biasanya butuh berhari-hari, selesai dalam satu sesi. MiClass mengerjakan bagian beratnya — Anda cukup menjawab beberapa pertanyaan dan mengonfirmasi hasilnya.</p>
  </div>
  <div class="rc-welcome-cards">
    <button type="button" class="rc-welcome-card" data-option="sesuaikan" aria-pressed="true">
      <span class="rc-welcome-card-label">Sesuaikan ATP yang ada</span>
      <span class="rc-welcome-card-badge">Direkomendasikan</span>
      <span class="rc-welcome-card-desc">Perbarui ATP lama Anda dalam hitungan menit — tanpa mengulang dari awal.</span>
    </button>
    <button type="button" class="rc-welcome-card" data-option="susun" aria-pressed="false">
      <span class="rc-welcome-card-label">Susun ATP baru</span>
      <span class="rc-welcome-card-desc">ATP satu fase penuh, selesai hari ini — bukan bulan depan.</span>
    </button>
    <button type="button" class="rc-welcome-card" data-option="modul" aria-pressed="false">
      <span class="rc-welcome-card-label">Buat Modul Ajar</span>
      <span class="rc-welcome-card-badge">Butuh ATP aktif</span>
      <span class="rc-welcome-card-desc">Dari ATP ke rencana pertemuan siap pakai — langsung bisa dibawa ke kelas.</span>
    </button>
  </div>
  <p class="rc-welcome-ai-note">Guru yang sibuk tidak butuh aplikasi yang rumit. MiClass dirancang agar Anda bisa fokus mengajar — bukan mengurus berkas.</p>
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

// ── Picker daftar ATP tersimpan (mode 'sesuaikan') ────────────────────────
// Memakai ulang kelas .rc-welcome-* yang sudah ada supaya tampilannya identik
// dengan layar pembuka — tidak ada CSS baru yang perlu ditambahkan.
// onDelete (opsional) dipanggil dengan (atp) setelah guru mengonfirmasi hapus.
function rcRenderAtpPicker(panel, items, onPick, onDelete) {
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function tanggal(iso) {
    if (!iso) return 'tanggal tidak tercatat';
    const d = new Date(iso);
    if (isNaN(d)) return 'tanggal tidak tercatat';
    return 'diperbarui ' + d.toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  const STATUS_LABEL = { aktif: 'Aktif', draft: 'Draf' };

  let selectedId = items[0]?.id || null;

  const cards = items.map(function (atp) {
    const judul  = [atp.mapel, 'Fase ' + atp.fase, atp.jenjang].filter(Boolean).join(' · ');
    const jumlah = Array.isArray(atp.progresi_tp) ? atp.progresi_tp.length : 0;
    const tp     = jumlah ? jumlah + ' TP tersusun' : 'Belum ada TP';
    return `
    <div class="rc-atp-card-wrap" style="position:relative;">
      <button type="button" class="rc-welcome-card" data-atp-id="${escHtml(atp.id)}"
        aria-pressed="${atp.id === selectedId ? 'true' : 'false'}">
        <span class="rc-welcome-card-label">${escHtml(judul)}</span>
        <span class="rc-welcome-card-badge">${escHtml(STATUS_LABEL[atp.status] || atp.status)}</span>
        <span class="rc-welcome-card-desc">${escHtml(tp)} · ${escHtml(tanggal(atp.updated_at))}</span>
      </button>
      <button type="button" class="rc-atp-delete-btn" data-atp-id="${escHtml(atp.id)}"
        aria-label="Hapus ATP ini" title="Hapus ATP ini"
        style="position:absolute;top:8px;right:8px;display:flex;align-items:center;gap:4px;
          background:rgba(220,53,69,0.15);color:#ff6b6b;border:1px solid rgba(220,53,69,0.5);
          border-radius:999px;cursor:pointer;font-size:0.82rem;line-height:1.4;opacity:1;
          padding:4px 10px;">🗑 Hapus</button>
    </div>`;
  }).join('');

  panel.innerHTML = `
<div class="rc-welcome" id="rc-atp-picker">
  <div class="rc-welcome-header">
    <h2 class="rc-welcome-title">ATP mana yang ingin disesuaikan?</h2>
    <p class="rc-welcome-lead">Pilih satu ATP tersimpan. Jawaban yang sudah Anda isi sebelumnya akan dimuat kembali.</p>
  </div>
  <div class="rc-welcome-cards">${cards}</div>
  <p class="rc-welcome-ai-note" id="rc-atp-picker-pesan"></p>
  <div class="rc-welcome-footer">
    <button type="button" class="rc-welcome-btn" id="rc-atp-picker-lanjut">Buka ATP Ini</button>
  </div>
</div>`;

  panel.querySelectorAll('.rc-welcome-card').forEach(function (card) {
    card.addEventListener('click', function () {
      panel.querySelectorAll('.rc-welcome-card').forEach(function (c) {
        c.setAttribute('aria-pressed', 'false');
      });
      card.setAttribute('aria-pressed', 'true');
      selectedId = card.dataset.atpId;
    });
  });

  document.getElementById('rc-atp-picker-lanjut').addEventListener('click', function () {
    const picked = items.find(function (a) { return a.id === selectedId; });
    if (picked) onPick(picked);
  });

  panel.querySelectorAll('.rc-atp-delete-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const atp = items.find(function (a) { return a.id === btn.dataset.atpId; });
      if (!atp || typeof onDelete !== 'function') return;
      rcConfirmHapusAtp(atp, function () { onDelete(atp); });
    });
  });
}

// Konfirmasi hapus ATP inline di dalam area pesan picker — memakai ulang
// kelas .rp-chip yang sudah ada, tidak menambah CSS baru.
function rcConfirmHapusAtp(atp, onConfirm) {
  const pesan = document.getElementById('rc-atp-picker-pesan');
  if (!pesan) return;
  const judul = [atp.mapel, 'Fase ' + atp.fase].filter(Boolean).join(' ');
  pesan.innerHTML = '';

  const teks = document.createElement('span');
  teks.textContent = `Hapus ATP ${judul}? Tindakan ini tidak dapat dibatalkan. `;

  const btnHapus = document.createElement('button');
  btnHapus.type = 'button';
  btnHapus.className = 'rp-chip';
  btnHapus.style.cssText = 'margin-left:8px;';
  btnHapus.textContent = 'Hapus';
  btnHapus.addEventListener('click', function () {
    pesan.innerHTML = '';
    onConfirm();
  });

  const btnBatal = document.createElement('button');
  btnBatal.type = 'button';
  btnBatal.className = 'rp-chip';
  btnBatal.style.cssText = 'margin-left:6px;';
  btnBatal.textContent = 'Batal';
  btnBatal.addEventListener('click', function () {
    pesan.innerHTML = '';
  });

  pesan.appendChild(teks);
  pesan.appendChild(btnHapus);
  pesan.appendChild(btnBatal);
}
