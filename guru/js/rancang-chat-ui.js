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

  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const val = input.value.trim();
      if (val) { input.value = ''; onSubmit(val); }
    }
    // Auto-resize
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  sendBtn?.addEventListener('click', () => {
    const val = input?.value.trim();
    if (val) { input.value = ''; onSubmit(val); }
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
