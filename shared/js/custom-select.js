/**
 * custom-select.js — dropdown gelap yang dipakai lintas halaman portal guru.
 *
 * Dipindahkan keluar dari guru.js karena classroom.html membutuhkannya tetapi
 * tidak boleh memuat guru.js utuh: guru.js memasang handler help dashboard ke
 * #help-strip, elemen yang juga ada di halaman classroom dengan isi berbeda.
 */
// ─── Custom dropdown reusable (dark theme) ────────────────────────────────
window.initCustomSelect = function (nativeEl, onChange) {
  nativeEl.style.display = 'none';

  const wrap = document.createElement('div');
  wrap.className = 'custom-select';
  nativeEl.parentNode.insertBefore(wrap, nativeEl);
  wrap.appendChild(nativeEl);

  const trigger = document.createElement('div');
  trigger.className = 'custom-select-trigger';
  trigger.setAttribute('role', 'button');
  trigger.setAttribute('tabindex', '0');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const labelSpan = document.createElement('span');
  const arrowSpan = document.createElement('span');
  arrowSpan.className = 'custom-select-arrow';
  arrowSpan.textContent = '▾';
  trigger.appendChild(labelSpan);
  trigger.appendChild(arrowSpan);

  const list = document.createElement('ul');
  list.className = 'custom-select-list';
  list.setAttribute('role', 'listbox');
  list.style.display = 'none';

  wrap.appendChild(trigger);
  wrap.appendChild(list);

  var _value = nativeEl.value;
  var _ac    = null;

  function syncLabel() {
    var opt = Array.from(nativeEl.options).find(function (o) { return o.value === _value; });
    labelSpan.textContent = opt ? opt.text : (nativeEl.options[0] ? nativeEl.options[0].text : '');
  }

  function buildList() {
    list.innerHTML = '';
    Array.from(nativeEl.options).forEach(function (opt) {
      if (!opt.value) return;
      var li = document.createElement('li');
      li.className = 'custom-select-option' + (_value === opt.value ? ' selected' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('tabindex', '-1');
      li.dataset.value = opt.value;
      li.textContent = opt.text;
      li.addEventListener('click', function () {
        _value = opt.value;
        nativeEl.value = opt.value;
        labelSpan.textContent = opt.text;
        list.querySelectorAll('.custom-select-option').forEach(function (o) { o.classList.remove('selected'); });
        li.classList.add('selected');
        closeList();
        trigger.focus();
        if (onChange) onChange(opt.value);
      });
      li.addEventListener('keydown', function (e) {
        var opts = Array.from(list.querySelectorAll('.custom-select-option'));
        var i    = opts.indexOf(li);
        if (e.key === 'ArrowDown') { e.preventDefault(); if (opts[i + 1]) opts[i + 1].focus(); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); i === 0 ? trigger.focus() : opts[i - 1].focus(); }
        if (e.key === 'Escape')    { closeList(); trigger.focus(); }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); }
      });
      list.appendChild(li);
    });
    syncLabel();
  }

  function openList() {
    list.style.display = '';
    trigger.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    if (_ac) _ac.abort();
    _ac = new AbortController();
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) closeList();
    }, { signal: _ac.signal });
  }

  function closeList() {
    list.style.display = 'none';
    trigger.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    if (_ac) { _ac.abort(); _ac = null; }
  }

  trigger.addEventListener('click', function (e) {
    e.stopPropagation();
    list.style.display !== 'none' ? closeList() : openList();
  });
  trigger.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); list.style.display !== 'none' ? closeList() : openList(); }
    if (e.key === 'Escape') closeList();
    if (e.key === 'ArrowDown') { e.preventDefault(); openList(); var f = list.querySelector('.custom-select-option'); if (f) f.focus(); }
  });

  buildList();

  return {
    el: wrap,
    getValue: function () { return _value; },
    setValue: function (v) {
      _value = v;
      nativeEl.value = v;
      syncLabel();
      list.querySelectorAll('.custom-select-option').forEach(function (o) {
        o.classList.toggle('selected', o.dataset.value === v);
      });
    },
    refresh: function () {
      _value = nativeEl.value;
      buildList();
    },
    destroy: function () {
      closeList();
      if (wrap.parentNode) { wrap.parentNode.insertBefore(nativeEl, wrap); wrap.remove(); }
      nativeEl.style.display = '';
    },
  };
};
