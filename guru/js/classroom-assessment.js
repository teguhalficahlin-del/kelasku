(function () {
  'use strict';

  const client = window.supabaseClient;
  const SipApi = window.api;

  // ─── State ──────────────────────────────────────────────────────────────────
  let _cId    = null;
  let _tId    = null;
  let _loaded = false;
  // null bila semua sumber kritis termuat; selain itu daftar nama sumber
  // yang gagal. Dipakai untuk membedakan "gagal dimuat" dari "memang kosong"
  // -- keduanya dulu terlihat sama persis di layar.
  let _loadError = null;

  let _tpList   = [];  // rows from tp_kktp
  let _asmts    = [];  // rows from assessments
  let _roster   = [];  // [{id, nama}] active students in classroom
  let _sGroups  = {};  // { studentId: grup }
  let _roleGuru = null; // role_guru dari profiles (WALI_KELAS_SD | MAPEL | null)

  // Penjaga re-entrancy untuk seluruh jalur simpan penilaian. Tombolnya memang
  // sudah di-disable sebelum await pertama, dan modal membangun ulang isinya
  // setiap kali dibuka sehingga listener tidak menumpuk — flag ini lapis kedua
  // yang tidak bergantung pada keadaan DOM, agar simpan tetap tunggal bila
  // pemicunya kelak datang dari jalur lain (tombol dipakai ulang, shortcut
  // keyboard, atau pemanggilan langsung dari kode).
  let _nilaiSedangDisimpan = false;
  let _selMapel = null; // mapel aktif di Section 1 dropdown (WALI_KELAS_SD only, null = belum diinit)
  let _classroomMapelKey = ''; // window._classroomMapelKey — mapel fix classroom (guru MAPEL)
  let _classroomJenjang  = ''; // window._classroomJenjang  — jenjang classroom

  // ── Rekap section state ────────────────────────────────────────────────────
  // Keduanya ditimpa DEFAULT_SEMESTER/DEFAULT_YEAR di initPenilaian dan sekali
  // lagi di renderRecap. Nilai literal di sini hanya sempat hidup sebelum init
  // berjalan; ia tidak bisa memakai kedua konstanta itu karena keduanya const
  // yang dideklarasikan di bawah (temporal dead zone).
  let _rcSemester   = '1';
  let _rcTahun      = null;
  let _rcMapel         = null;
  let _rcMapelUserSet  = false; // true setelah user mengubah mapel di Section 3
  let _rcTeknik     = null;
  let _rcInstrumen  = null;
  let _rcPage1      = 0;      // DAFTAR NILAI pagination (5 per halaman)
  let _rcPage2      = 0;      // HASIL NILAI pagination (5 per halaman)
  // Jenis yang sedang ditampilkan di Rekap. Default SUMATIF supaya panel ini
  // terbuka persis seperti sebelum dropdown jenis ada.
  let _rcJenis      = 'SUMATIF';
  let _rcPageF      = 0;      // pagination rekap FORMATIF
  let _rcPageD      = 0;      // pagination rekap DIAGNOSTIK
  let _rcMetode          = 'rata'; // 'rata' | 'bobot' | 'terbaik'
  let _rcMetodeListener  = null;   // listener delegasi pada cc — di-replace tiap render
  let _rcBobots          = [];
  let _rcLastSumatifIds  = [];
  // null | { groups: [{tpId, judul, rows:[{id, nama, nilaiAkhir, predikat}]}],
  //          skipped: jumlah sumatif tanpa TP yang dibuang }
  let _rcHasil      = null;

  // ─── Constants ──────────────────────────────────────────────────────────────
  const CY           = new Date().getFullYear();
  // Tahun ajaran DAN semester sama-sama berganti di bulan Juli, bukan Januari.
  // Batasnya ditulis sekali di sini supaya keduanya mustahil berselisih.
  // getMonth() berbasis nol: 6 = Juli.
  //
  // Harus tetap sama dengan SEMESTER_PHASES di guru/js/guru.js:
  //   1 Jan – 30 Jun = semester 2,  1 Jul – 31 Des = semester 1.
  // Dihitung ulang di sini, bukan diambil dari sana: getCurrentSemesterPhase()
  // adalah fungsi lokal di dalam IIFE berkas itu dan tidak diekspor ke window,
  // sedangkan fn_guru_trial_status() tidak membawa field semester sama sekali.
  //
  // Keduanya const yang dihitung sekali saat skrip dimuat. Sesi yang dibiarkan
  // terbuka melewati tengah malam 30 Juni tidak akan ikut berpindah sampai
  // halamannya dimuat ulang — dapat diterima untuk pemakaian sehari.
  const _SEM1_BERJALAN   = new Date().getMonth() >= 6;
  const DEFAULT_YEAR     = _SEM1_BERJALAN ? `${CY}/${CY + 1}` : `${CY - 1}/${CY}`;
  const DEFAULT_SEMESTER = _SEM1_BERJALAN ? '1' : '2';

  const INSTRUMEN_MAP = {
    OBSERVASI:   ['Lembar Observasi', 'Catatan Anekdot', 'Checklist'],
    TES:         ['Pilihan Ganda', 'Uraian', 'Campuran'],
    PENUGASAN:   ['Rubrik', 'Checklist'],
    PROYEK:      ['Rubrik', 'Checklist'],
    PORTOFOLIO:  ['Rubrik', 'Checklist'],
    UNJUK_KERJA: ['Rubrik', 'Checklist'],
    TES_LISAN:   ['Wawancara', 'Monolog', 'Dialog'],
  };

  const STATUS_GRUP  = { PAHAM: 'A', BELUM_PAHAM: 'B', PERLU_PERHATIAN: 'C' };
  const STATUS_LBL   = { PAHAM: 'Paham', BELUM_PAHAM: 'Belum Paham', PERLU_PERHATIAN: 'Perlu Perhatian' };
  const JENIS_LBL    = { DIAGNOSTIK: 'Diagnostik', FORMATIF: 'Formatif', SUMATIF: 'Sumatif' };
  const TIPE_LBL     = { CP: 'CP', TP: 'TP', KKTP: 'KKTP' };
  const TIPE_COLOR   = { CP: '#4a7c59', TP: 'var(--gold)', KKTP: '#7c4a7c' };

  const STATUS_FORMATIF_LBL = { TERCAPAI: 'Tercapai', BERKEMBANG: 'Berkembang', PERLU_DUKUNGAN: 'Perlu Dukungan' };
  const PREDIKAT_RUBRIK = [
    { val: 'SB',  lbl: 'Sangat Berkembang' },
    { val: 'BSH', lbl: 'Berkembang Sesuai Harapan' },
    { val: 'MB',  lbl: 'Mulai Berkembang' },
    { val: 'BB',  lbl: 'Belum Berkembang' },
  ];
  const TINGKAT_OBS = ['Terlihat jelas', 'Terlihat', 'Belum terlihat'];

  const DEFAULT_RENTANG = { BB: [0, 54], MB: [55, 69], BSH: [70, 84], SB: [85, 100] };
  const PREDIKAT_ORDER  = ['BB', 'MB', 'BSH', 'SB'];
  const RC_PAGE_SIZE    = 5;

  const MAPEL_SD = [
    'Bahasa Indonesia', 'Matematika', 'IPAS',
    'Pendidikan Pancasila', 'Seni', 'Bahasa Inggris',
  ];

  function teknikLbl(t) {
    if (!t) return '';
    if (t === 'TES') return 'Tes Tertulis';
    return t.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  }

  // ─── Micro-helpers ──────────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(id) { return document.getElementById(id); }

  function toast(msg, ok = true) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);
      background:${ok ? 'var(--success,#2d6a4f)' : '#c0392b'};color:#fff;
      padding:.5rem 1.25rem;border-radius:.5rem;font-size:var(--fs-ui);
      z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }

  function fieldLbl(text) {
    return `<div style="font-size:var(--fs-caption);color:var(--text-secondary);
      margin-bottom:.3rem">${text}</div>`;
  }

  function inputCss(extra) {
    return `width:100%;box-sizing:border-box;
      background:var(--bg-input,rgba(255,255,255,.06));
      border:1px solid var(--border-subtle,rgba(255,255,255,.18));
      color:var(--text-primary);padding:.5rem .625rem;
      border-radius:.375rem;font-size:var(--fs-ui);${extra ?? ''}`;
  }

  // ─── Chip helpers ────────────────────────────────────────────────────────────
  function chipHtml(val, label, selected) {
    const selStyle = selected
      ? 'background:var(--gold);color:var(--text-on-gold,#000);border-color:var(--gold)'
      : 'color:var(--text-secondary);border-color:var(--border-subtle,rgba(255,255,255,.18))';
    return `<span class="pai-chip${selected ? ' pai-chip--sel' : ''}" data-val="${esc(val)}"
      style="display:inline-flex;align-items:center;padding:.3rem .75rem;border-radius:1rem;
      border:1.5px solid;cursor:pointer;font-size:var(--fs-caption);user-select:none;${selStyle}">
      ${esc(label)}</span>`;
  }

  function wireChips(containerEl, multi, onChange) {
    containerEl.addEventListener('click', e => {
      const chip = e.target.closest('.pai-chip');
      if (!chip || !containerEl.contains(chip)) return;
      if (!multi) {
        containerEl.querySelectorAll('.pai-chip').forEach(c => {
          c.classList.remove('pai-chip--sel');
          c.style.background = '';
          c.style.color = 'var(--text-secondary)';
          c.style.borderColor = 'var(--border-subtle,rgba(255,255,255,.18))';
        });
        chip.classList.add('pai-chip--sel');
        chip.style.background = 'var(--gold)';
        chip.style.color = 'var(--text-on-gold,#000)';
        chip.style.borderColor = 'var(--gold)';
      } else {
        const s = chip.classList.toggle('pai-chip--sel');
        chip.style.background = s ? 'var(--gold)' : '';
        chip.style.color = s ? 'var(--text-on-gold,#000)' : 'var(--text-secondary)';
        chip.style.borderColor = s ? 'var(--gold)' : 'var(--border-subtle,rgba(255,255,255,.18))';
      }
      if (onChange) onChange(chip.dataset.val);
    });
  }

  function chipVal(containerEl) {
    return containerEl?.querySelector('.pai-chip--sel')?.dataset.val ?? null;
  }

  // ─── KKTP rentang helpers ────────────────────────────────────────────────────
  function getRentang(item)    { return item?.rentang ?? DEFAULT_RENTANG; }
  function nilaiTengah(predikat, rentang) {
    const r = rentang?.[predikat];
    if (!r) return null;
    return Math.round((r[0] + r[1]) / 2);
  }
  function rentangSummary(rentang) {
    return PREDIKAT_ORDER.map(p => `${p}: ${rentang[p]?.[0] ?? '?'}–${rentang[p]?.[1] ?? '?'}`).join(' · ');
  }
  function getPredikat(nilai, rentang) {
    const r = rentang ?? DEFAULT_RENTANG;
    for (let i = PREDIKAT_ORDER.length - 1; i >= 0; i--) {
      const p = PREDIKAT_ORDER[i];
      if (nilai >= (r[p]?.[0] ?? 0)) return p;
    }
    return PREDIKAT_ORDER[0];
  }
  function kktpStatText(nilai, rentang) {
    if (nilai == null || isNaN(nilai)) return 'KKTP —';
    const p     = getPredikat(nilai, rentang);
    const range = (rentang ?? DEFAULT_RENTANG)[p];
    return `KKTP: ${p} (${range?.[0] ?? '?'}–${range?.[1] ?? '?'})`;
  }
  function kktpStatColor(nilai, rentang) {
    if (nilai == null || isNaN(nilai)) return 'var(--text-secondary)';
    const p = getPredikat(nilai, rentang ?? DEFAULT_RENTANG);
    return p === 'SB' || p === 'BSH' ? 'var(--success,#2d6a4f)' : '#c0392b';
  }
  function buildRentangRowsHtml(rentang) {
    return PREDIKAT_ORDER.map(p => {
      const [low, high] = rentang[p] ?? [0, 100];
      return `<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.375rem">
        <span style="min-width:2.75rem;font-size:var(--fs-caption);font-weight:600;color:var(--text-primary)">${p}</span>
        <input class="kktp-rentang-low" data-pred="${p}" type="number" min="0" max="100"
          value="${low}" style="${inputCss('width:4.5rem;text-align:center')}">
        <span style="font-size:var(--fs-caption);color:var(--text-secondary)">–</span>
        <input class="kktp-rentang-high" data-pred="${p}" type="number" min="0" max="100"
          value="${high}" style="${inputCss('width:4.5rem;text-align:center')}">
      </div>`;
    }).join('');
  }
  function collectRentang() {
    const box = el('pai-modal-box');
    const r   = {};
    PREDIKAT_ORDER.forEach(p => {
      const low  = box?.querySelector(`.kktp-rentang-low[data-pred="${p}"]`);
      const high = box?.querySelector(`.kktp-rentang-high[data-pred="${p}"]`);
      // Tanpa `|| 0` dan `|| 100`: kotak kosong kini menghasilkan NaN, bukan
      // batas yang tampak sah. Dulu KKTP yang batasnya tidak pernah diketik
      // siapa pun tersimpan sebagai 0–100 dan dipakai getPredikat() apa adanya.
      // validasiRentang() yang menolaknya sekarang.
      r[p] = [parseFloat(low?.value), parseFloat(high?.value)];
    });
    return r;
  }

  // Mengembalikan pesan galat, atau null bila rentangnya sah.
  //
  // Batas antar predikat boleh renggang — DEFAULT_RENTANG memang begitu, BB
  // berakhir di 54 dan MB mulai di 55. Yang dilarang hanya tumpang tindih,
  // karena di situ satu nilai bisa jatuh ke dua predikat sekaligus dan yang
  // menang cuma soal urutan pemeriksaan di getPredikat().
  function validasiRentang(rentang) {
    for (const p of PREDIKAT_ORDER) {
      const [lo, hi] = rentang[p] ?? [];
      if (!Number.isFinite(lo) || !Number.isFinite(hi))
        return `Batas ${p} harus berupa angka`;
      if (lo < 0 || hi > 100)
        return `Batas ${p} harus berada di antara 0 dan 100`;
      if (lo > hi)
        return `Batas bawah ${p} (${lo}) tidak boleh melebihi batas atasnya (${hi})`;
    }
    for (let i = 0; i < PREDIKAT_ORDER.length - 1; i++) {
      const a = PREDIKAT_ORDER[i];
      const b = PREDIKAT_ORDER[i + 1];
      if (rentang[a][1] > rentang[b][0])
        return `Rentang ${a} dan ${b} tumpang tindih: ${a} berakhir di `
          + `${rentang[a][1]}, ${b} mulai di ${rentang[b][0]}`;
    }
    return null;
  }

  // Rekap nilai adalah turunan: ia dihitung dari hasil sumatif lalu disimpan.
  // Begitu hasil itu berubah atau penilaiannya hilang, angka tersimpan menjadi
  // klaim tanpa dasar — dan tidak ada apa pun di layar yang menandainya basi.
  // Menghapusnya lebih jujur daripada membiarkannya: rekap kosong terang-terangan
  // meminta dihitung ulang, rekap basi diam-diam salah.
  //
  // Dicakup ke TP + semester + tahun berjalan, mengikuti kunci grade_recap
  // (classroom_id, student_id, tp_kktp_id, semester, tahun_ajaran) — rekap TP
  // lain dan tahun lain tidak ikut terhapus.
  //
  // SipApi tidak punya method hapus untuk tabel ini dan api.js di luar cakupan
  // perubahan, jadi client dipakai langsung. RLS mengizinkannya: gr_guru_delete
  // (pemilik classroom) di-AND dengan trial_guard_delete (guru aktif).
  async function hapusRekapTp(tpKktpId) {
    if (!tpKktpId) return 0;
    const { data, error } = await client
      .from('grade_recap')
      .delete()
      .eq('classroom_id', _cId)
      .eq('tp_kktp_id', tpKktpId)
      .eq('semester', _rcSemester)
      .eq('tahun_ajaran', _rcTahun)
      .select('id');
    if (error) throw error;
    return (data ?? []).length;
  }

  // Jumlah rekap milik satu TP, TANPA batasan semester: menghapus TP membuang
  // seluruh rekapnya, jadi angka yang disebut ke guru harus seluruhnya juga.
  async function hitungRekapTp(tpKktpId) {
    const { count, error } = await client
      .from('grade_recap')
      .select('id', { count: 'exact', head: true })
      .eq('classroom_id', _cId)
      .eq('tp_kktp_id', tpKktpId);
    if (error) throw error;
    return count ?? 0;
  }

  // ─── Data loading ────────────────────────────────────────────────────────────
  // Tiga sumber bersifat KRITIS: TP/KKTP adalah dasar predikat, daftar penilaian
  // adalah isi Section 2 dan seluruh rekap, daftar siswa adalah kolom pertama
  // setiap tabel. Kegagalan salah satunya membuat tab ini menyesatkan, bukan
  // sekadar kurang lengkap. Grup diferensiasi hanya melengkapi rekap Diagnostik,
  // jadi kegagalannya dicatat ke console tapi tidak memblokir apa pun.
  //
  // Sebelum ini keempatnya memakai .catch(() => []), sehingga gagal jaringan
  // tiba di layar sebagai daftar kosong -- guru tidak punya cara membedakannya
  // dari kelas yang memang belum diisi.
  async function loadAll() {
    const gagal = [];
    const ambil = async (label, promise, kritis) => {
      try {
        return await promise;
      } catch (err) {
        console.error(`loadAll: ${label} gagal`, err);
        if (kritis) gagal.push(label);
        return null;
      }
    };

    const [tp, asmts, grps, roster] = await Promise.all([
      ambil('Tujuan Pembelajaran & KKTP', SipApi.getTpKktp(_cId, _tId),  true),
      ambil('Daftar penilaian',           SipApi.getAssessments(_cId),   true),
      ambil('Grup diferensiasi',          SipApi.getStudentGroups(_cId), false),
      ambil('Daftar siswa',               loadRoster(),                  true),
    ]);

    _tpList  = tp ?? [];
    _asmts   = asmts ?? [];
    _sGroups = Object.fromEntries((grps ?? []).map(g => [g.student_id, g.grup]));
    _roster  = roster ?? [];
    _loadError = gagal.length ? gagal : null;
  }

  async function loadRoster() {
    // supabase-js TIDAK melempar pada galat PostgREST; ia mengembalikan
    // { data: null, error }. Tanpa memeriksa error secara eksplisit, kegagalan
    // berakhir sebagai daftar kosong -- dan .catch() di pemanggil pun tidak akan
    // pernah menangkapnya, karena tidak ada yang dilempar.
    const { data, error } = await client
      .from('classroom_roster').select('id, full_name')
      .eq('classroom_id', _cId)
      .order('full_name');
    if (error) throw error;
    return (data ?? []).map(r => ({ id: r.id, nama: r.full_name }));
  }

  // ─── Init ───────────────────────────────────────────────────────────────────
  async function initAssessmentTab(cId, tId) {
    _cId = cId;
    _tId = tId;
    // Reset state yang mungkin bocor dari classroom sebelumnya
    _classroomMapelKey = window._classroomMapelKey || '';
    _classroomJenjang  = window._classroomJenjang  || '';
    _selMapel         = null;
    _rcSemester       = DEFAULT_SEMESTER;
    _rcTahun          = DEFAULT_YEAR;
    _rcMapel          = null;
    _rcMapelUserSet   = false;
    _rcTeknik         = null;
    _rcInstrumen      = null;
    _rcPage1          = 0;
    _rcPage2          = 0;
    _rcJenis          = 'SUMATIF';
    _rcPageF          = 0;
    _rcPageD          = 0;
    _rcMetode         = 'rata';
    _rcBobots         = [];
    _rcLastSumatifIds = [];
    _rcHasil          = null;
    _rcMetodeListener = null;
    const panel = el('panel-penilaian');
    if (!panel) return;
    panel.innerHTML = '<div style="padding:1.5rem;color:var(--text-secondary)">Memuat data penilaian…</div>';
    // loadAll() sudah menangkap kegagalan tiap sumber satu per satu; sampai di
    // sini berarti ada yang meledak di luar dugaan. Panel tidak boleh tersangkut
    // di "Memuat data penilaian…" selamanya.
    try {
      await loadAll();
    } catch (err) {
      console.error('initPenilaian: loadAll gagal', err);
      _loadError = ['Data penilaian'];
    }
    _loaded = true;
    renderMain();
  }

  // ─── Main render ─────────────────────────────────────────────────────────────
  function renderMain() {
    const panel = el('panel-penilaian');
    if (!panel) return;

    // Panel galat hanya muncul bila sumber KRITIS gagal. Ia menyebut sumber mana
    // yang gagal, bukan sekadar "terjadi kesalahan": guru perlu tahu apakah yang
    // hilang itu daftar siswanya atau penilaiannya.
    const errHtml = _loadError ? `
<div style="margin-bottom:.75rem;padding:.75rem;border-radius:.5rem;
  background:rgba(192,57,43,.12);border:1px solid #c0392b">
  <div style="font-size:var(--fs-ui);font-weight:600;color:#c0392b;margin-bottom:.25rem">
    Sebagian data gagal dimuat</div>
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.5rem">
    Gagal dimuat: ${esc(_loadError.join(', '))}. Yang tampil di bawah belum tentu
    lengkap — bisa jadi datanya ada tapi tidak sampai. Simpan Rekap, Hitung Nilai
    Akhir, dan Unduh Excel dinonaktifkan dulu supaya tidak ada yang tersimpan atau
    terunduh setengah jadi.</div>
  <button type="button" id="pai-btn-muat-ulang"
    style="font-size:var(--fs-caption);padding:.3rem .9rem;border-radius:.375rem;
    border:1px solid #c0392b;background:transparent;color:#c0392b;cursor:pointer">
    ↻ Muat ulang</button>
</div>` : '';

    panel.innerHTML = `
<div style="display:flex;align-items:center;justify-content:space-between;
  margin-bottom:.5rem;min-height:2rem">
  <span style="font-size:var(--fs-caption);color:var(--text-secondary)">Tab Penilaian</span>
  <button type="button" id="btn-unduh-excel-penilaian"${_loadError ? ' disabled' : ''}
    style="font-size:var(--fs-caption);padding:.25rem .75rem;border-radius:.375rem;
    border:1px solid ${_loadError ? 'var(--border-subtle,rgba(255,255,255,.18))' : 'var(--gold)'};
    background:transparent;color:${_loadError ? 'var(--text-secondary)' : 'var(--gold)'};
    cursor:${_loadError ? 'default' : 'pointer'};
    display:flex;align-items:center;gap:.375rem;white-space:nowrap">
    ⬇ Unduh Excel
  </button>
</div>
${errHtml}

<div class="panel">
  <h2 class="panel-header" data-panel="pan-tp-body"
    style="font-size:var(--fs-h3);color:var(--gold)">
    Perencanaan Penilaian <span class="panel-collapse-arrow">▼</span>
  </h2>
  <div class="panel-body-collapse" id="pan-tp-body">
    <div id="pai-tp-list"></div>
    <button type="button" data-action="add-tp"
      style="margin-top:.75rem;min-height:var(--btn-h);background:var(--gold);
      color:var(--text-on-gold);font-weight:var(--fw-medium);font-size:var(--fs-ui);
      padding:0 var(--btn-px);border-radius:var(--btn-r);border:none;cursor:pointer">
      + Tambah TP/KKTP
    </button>
  </div>
</div>

<div class="panel">
  <h2 class="panel-header" data-panel="pan-asmt-body"
    style="font-size:var(--fs-h3);color:var(--gold)">
    Pelaksanaan Penilaian <span class="panel-collapse-arrow">▶</span>
  </h2>
  <div class="panel-body-collapse" id="pan-asmt-body" style="display:none">
    <div id="pai-asmt-list"></div>
    <button type="button" data-action="add-asmt"
      style="margin-top:.75rem;min-height:var(--btn-h);background:var(--gold);
      color:var(--text-on-gold);font-weight:var(--fw-medium);font-size:var(--fs-ui);
      padding:0 var(--btn-px);border-radius:var(--btn-r);border:none;cursor:pointer">
      + Tambah Penilaian
    </button>
  </div>
</div>

<div class="panel">
  <h2 class="panel-header" data-panel="pan-recap-body"
    style="font-size:var(--fs-h3);color:var(--gold)">
    Rekap Penilaian <span class="panel-collapse-arrow">▶</span>
  </h2>
  <div class="panel-body-collapse" id="pan-recap-body" style="display:none">
    <div id="pai-recap-wrap"></div>
  </div>
</div>

<div id="pai-modal" style="display:none;position:fixed;inset:0;
  background:rgba(0,0,0,.6);z-index:1000;overflow-y:auto;
  padding:1rem .75rem;-webkit-overflow-scrolling:touch">
  <div id="pai-modal-box"
    style="background:var(--bg-card,#1e1e1e);border-radius:.75rem;
    max-width:34rem;margin:2rem auto;padding:1.5rem;
    position:relative;box-shadow:0 8px 32px rgba(0,0,0,.5)">
  </div>
</div>`;

    initCollapsePanel();
    panel.addEventListener('click', handleClick);
    el('btn-unduh-excel-penilaian')?.addEventListener('click', downloadPenilaianExcel);
    el('pai-btn-muat-ulang')?.addEventListener('click', async function () {
      this.disabled = true; this.textContent = 'Memuat…';
      try {
        await loadAll();
      } catch (err) {
        console.error('muat ulang: loadAll gagal', err);
        _loadError = ['Data penilaian'];
      }
      renderMain();
    });
    renderTpList();
    renderAsmtList();
  }

  // ─── Collapse — single expand, auto-load recap on open ──────────────────────
  function initCollapsePanel() {
    const headers = Array.from(
      el('panel-penilaian')?.querySelectorAll('.panel-header[data-panel]') ?? []
    );
    headers.forEach(h => {
      h.style.cursor = 'pointer';
      h.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        const body = el(h.dataset.panel);
        if (!body) return;
        const open = body.style.display !== 'none';
        if (!open) {
          // Close all other sections
          headers.forEach(oh => {
            if (oh === h) return;
            const ob = el(oh.dataset.panel);
            if (ob) ob.style.display = 'none';
            const oa = oh.querySelector('.panel-collapse-arrow');
            if (oa) oa.textContent = '▶';
          });
          body.style.display = '';
          const arrow = h.querySelector('.panel-collapse-arrow');
          if (arrow) arrow.textContent = '▼';
          if (h.dataset.panel === 'pan-recap-body') renderRecap();
        } else {
          body.style.display = 'none';
          const arrow = h.querySelector('.panel-collapse-arrow');
          if (arrow) arrow.textContent = '▶';
        }
      });
    });
  }

  // ─── Event delegation ────────────────────────────────────────────────────────
  function handleClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'add-tp':       openTpModal(null);            break;
      case 'edit-tp':      openTpModal(btn.dataset.id);  break;
      case 'del-tp':       confirmDeleteTp(btn.dataset.id); break;
      case 'add-asmt':     openAsmtModal(null);           break;
      case 'edit-asmt':    openAsmtModal(btn.dataset.id); break;
      case 'del-asmt':     confirmDeleteAsmt(btn.dataset.id); break;
      case 'close-modal':  closeModal();                 break;
    }
  }

  // ─── Modal helpers ───────────────────────────────────────────────────────────
  function openModal() {
    const m = el('pai-modal');
    if (!m) return;
    m.style.display = '';
    m.scrollTop = 0;
    m.onclick = ev => { if (ev.target === m) closeModal(); };
  }
  function closeModal() {
    const m = el('pai-modal');
    if (m) m.style.display = 'none';
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 1 — Perencanaan Penilaian
  // ══════════════════════════════════════════════════════════════════════════════

  function renderTpList() {
    const c      = el('pai-tp-list');
    if (!c) return;
    const isWali = _roleGuru === 'WALI_KELAS_SD';
    if (isWali && _selMapel === null) _selMapel = MAPEL_SD[0];

    const dropHtml = isWali ? `
<div style="margin-bottom:.75rem">
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.3rem">Mata Pelajaran</div>
  <select id="pai-tp-mapel-sel" style="${inputCss('max-width:18rem')}">
    ${MAPEL_SD.map(m => `<option value="${esc(m)}"${m === _selMapel ? ' selected' : ''}>${esc(m)}</option>`).join('')}
  </select>
</div>` : '';

    const allRoots = _tpList.filter(t => !t.parent_id);
    const roots    = isWali
      ? allRoots.filter(t => !t.mapel || t.mapel === _selMapel)
      : allRoots;

    const listHtml = roots.length
      ? roots.map(tp => tpRowHtml(tp)).join('')
      : `<p style="color:var(--text-secondary);font-size:var(--fs-caption)">
          Belum ada TP/KKTP. Klik "+ Tambah TP/KKTP" untuk mulai.</p>`;

    c.innerHTML = dropHtml + listHtml;

    if (isWali) {
      c.querySelector('#pai-tp-mapel-sel')?.addEventListener('change', function () {
        _selMapel = this.value;
        renderTpList();
      });
    }

    // Single-expand collapse wiring — klik header → tutup semua, buka yang diklik
    const headers = Array.from(c.querySelectorAll('.pai-tp-hdr'));
    headers.forEach(hdr => {
      hdr.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        const bodyId = hdr.dataset.bodyId;
        const body   = bodyId ? document.getElementById(bodyId) : null;
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        headers.forEach(oh => {
          const ob = oh.dataset.bodyId ? document.getElementById(oh.dataset.bodyId) : null;
          if (ob) ob.style.display = 'none';
          const oa = oh.querySelector('.pai-tp-arrow');
          if (oa) oa.textContent = '▶';
        });
        if (!isOpen) {
          body.style.display = '';
          const arrow = hdr.querySelector('.pai-tp-arrow');
          if (arrow) arrow.textContent = '▼';
        }
      });
    });
  }

  // Penanda siapa yang dapat melihat entri ini di portal. Tanpa penanda, guru
  // tidak punya cara tahu bahwa entri yang ia buat tersembunyi dari siswa.
  function visBadgeHtml(tp) {
    const target = [];
    if (tp.is_visible_siswa) target.push('Siswa');
    if (tp.is_visible_ortu)  target.push('Ortu');
    const label = target.length ? '👁 ' + target.join(' + ') : '🔒 Hanya guru';
    const color = target.length ? 'var(--gold)' : 'var(--text-muted)';
    return `<span title="${target.length ? 'Terlihat di portal ' + target.join(' dan ') : 'Tidak tampil di portal siswa/ortu'}"
      style="flex-shrink:0;font-size:.625rem;color:${color};white-space:nowrap;opacity:.9">${label}</span>`;
  }

  function tpRowHtml(tp) {
    const kids     = _tpList.filter(t => t.parent_id === tp.id);
    const color    = TIPE_COLOR[tp.tipe] ?? '#555';
    const txtColor = color === 'var(--gold)' ? 'var(--text-on-gold,#000)' : '#fff';
    const bodyId   = `pai-tp-body-${tp.id}`;

    // Header label: CP shows konten snippet, TP/KKTP shows judul
    const hdTxt = tp.tipe === 'CP'
      ? esc(tp.konten ? tp.konten.slice(0, 60) + (tp.konten.length > 60 ? '…' : '') : '—')
      : esc(tp.judul);

    // Body content
    const descHtml = tp.konten
      ? `<div style="padding:.5rem .75rem .5rem 1.5rem;font-size:var(--fs-caption);
            color:var(--text-secondary);
            border-top:1px solid var(--border-subtle,rgba(255,255,255,.08))">
            ${esc(tp.konten)}</div>`
      : '';
    const kHtml = kids.map(k => kktpChildHtml(k)).join('');

    return `
<div style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
    border-radius:.5rem;margin-bottom:.5rem;overflow:hidden">
  <div class="pai-tp-hdr" data-body-id="${bodyId}"
      style="display:flex;align-items:center;gap:.5rem;padding:.625rem .75rem;
      background:var(--bg-elevated,rgba(255,255,255,.04));cursor:pointer;user-select:none">
    <span style="flex-shrink:0;font-size:.6875rem;font-weight:700;
        padding:.2rem .45rem;border-radius:.25rem;
        background:${color};color:${txtColor}">
      ${TIPE_LBL[tp.tipe] ?? tp.tipe}
    </span>
    <span style="flex:1;font-size:var(--fs-ui);font-weight:var(--fw-medium,500);
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${hdTxt}</span>
    ${visBadgeHtml(tp)}
    <span class="pai-tp-arrow"
        style="font-size:.75rem;color:var(--text-secondary);flex-shrink:0;margin-right:.15rem">▶</span>
    <button type="button" data-action="edit-tp" data-id="${tp.id}"
      style="background:transparent;border:none;cursor:pointer;font-size:1rem;padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7;flex-shrink:0" title="Edit">✏️</button>
    <button type="button" data-action="del-tp"  data-id="${tp.id}"
      style="background:rgba(231,76,60,.13);border:none;cursor:pointer;font-size:1rem;padding:.35rem .45rem;border-radius:.25rem;line-height:1;color:#e74c3c;min-width:2.25rem;flex-shrink:0" title="Hapus">🗑</button>
  </div>
  <div id="${bodyId}" style="display:none">${descHtml}${kHtml}</div>
</div>`;
  }

  function kktpChildHtml(k) {
    const r = getRentang(k);
    function cell(p) {
      return `<div style="padding:.25rem .375rem;background:var(--bg-elevated,rgba(255,255,255,.04));border-radius:.25rem;font-size:.7rem"><strong style="color:var(--text-secondary)">${p}</strong> ${r[p]?.[0] ?? '?'}–${r[p]?.[1] ?? '?'}</div>`;
    }
    return `
<div style="margin:.25rem .75rem .375rem 1.25rem;border-left:2px solid #7c4a7c;padding:.375rem .625rem">
  <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.375rem">
    <span style="font-size:.6875rem;font-weight:700;padding:.15rem .4rem;border-radius:.25rem;
        background:#7c4a7c;color:#fff;flex-shrink:0">KKTP</span>
    <span style="flex:1"></span>
    <button type="button" data-action="edit-tp" data-id="${k.id}"
      style="background:transparent;border:none;cursor:pointer;font-size:1rem;padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7" title="Edit">✏️</button>
    <button type="button" data-action="del-tp"  data-id="${k.id}"
      style="background:rgba(231,76,60,.13);border:none;cursor:pointer;font-size:1rem;padding:.35rem .45rem;border-radius:.25rem;line-height:1;color:#e74c3c;min-width:2.25rem" title="Hapus">🗑</button>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:.25rem">
    ${cell('BB')}${cell('MB')}${cell('BSH')}${cell('SB')}
  </div>
</div>`;
  }

  function openTpModal(editId) {
    const item   = editId ? _tpList.find(t => t.id === editId) : null;
    const isEdit = !!item;

    let selTipe  = item?.tipe ?? 'TP';
    let selMapel = item?.mapel ?? _selMapel ?? _classroomMapelKey ?? MAPEL_SD[0]; // default ke mapel aktif Section 1

    const isWali = _roleGuru === 'WALI_KELAS_SD';
    // Filter TP induk by mapel aktif agar guru tidak bisa pilih TP dari mapel yang salah
    const tpOpts = _tpList.filter(t =>
      t.tipe === 'TP' && (!isWali || !t.mapel || t.mapel === selMapel)
    );

    const mapelChipsHtml = isWali
      ? `<div style="margin-bottom:.875rem">
          ${fieldLbl('Mata Pelajaran')}
          <select id="tp-mapel-sel" style="${inputCss()}">
            ${MAPEL_SD.map(m => `<option value="${esc(m)}"${m === selMapel ? ' selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </div>`
      : '';

    const tipeOpts = ['CP', 'TP', 'KKTP']
      .map(t => `<option value="${t}"${selTipe === t ? ' selected' : ''}>${TIPE_LBL[t]}</option>`).join('');

    const parentOpts = tpOpts.map(t =>
      `<option value="${t.id}"${item?.parent_id === t.id ? ' selected' : ''}>${esc(t.judul)}</option>`
    ).join('');

    el('pai-modal-box').innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
  <h3 style="margin:0;color:var(--gold)">${isEdit ? 'Edit' : 'Tambah'} TP/KKTP</h3>
  <button data-action="close-modal" style="background:transparent;border:none;cursor:pointer;font-size:1.25rem;padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7">×</button>
</div>
<div id="tp-form" style="display:flex;flex-direction:column;gap:.875rem">
  ${mapelChipsHtml}
  <div>
    ${fieldLbl('Tipe')}
    <select id="tp-tipe-sel" style="${inputCss()}">${tipeOpts}</select>
  </div>
  <div id="tp-parent-row" style="${selTipe === 'KKTP' ? '' : 'display:none'}">
    ${fieldLbl('TP induk')}
    <select id="tp-parent-sel" style="${inputCss()}">
      <option value="">— Pilih TP —</option>${parentOpts}
    </select>
  </div>
  <div id="tp-judul-row" style="${selTipe === 'CP' ? 'display:none' : ''}">
    ${fieldLbl(selTipe === 'KKTP' ? 'Deskripsi' : 'Judul')}
    <input id="tp-judul" type="text" value="${esc(item?.judul ?? '')}"
      placeholder="${selTipe === 'KKTP' ? 'Deskripsi KKTP…' : 'Judul TP/KKTP…'}" style="${inputCss()}">
  </div>
  <div id="tp-konten-row" style="${selTipe === 'KKTP' ? 'display:none' : ''}">
    ${fieldLbl(selTipe === 'CP' ? 'Deskripsi / Teks CP' : 'Deskripsi (opsional)')}
    <textarea id="tp-konten" rows="3"
      style="${inputCss('resize:vertical')}"
      placeholder="Teks capaian pembelajaran…">${esc(item?.konten ?? '')}</textarea>
  </div>
  <div id="tp-range-row" style="${selTipe === 'KKTP' ? '' : 'display:none'}">
    ${fieldLbl('Rentang Predikat KKTP')}
    ${buildRentangRowsHtml(item ? getRentang(item) : DEFAULT_RENTANG)}
  </div>
  <div style="display:flex;gap:.75rem">
    <div style="flex:1">
      ${fieldLbl('Tahun Ajaran')}
      <input id="tp-year" type="text" maxlength="9"
        value="${esc(item?.academic_year ?? DEFAULT_YEAR)}"
        placeholder="2025/2026" style="${inputCss()}">
    </div>
    <div id="tp-sem-wrap" style="${selTipe === 'CP' ? 'display:none' : ''}">
      ${fieldLbl('Semester')}
      <select id="tp-sem" style="${inputCss()}">
        <option value="1"${(item?.semester ?? 1) === 1 ? ' selected' : ''}>1</option>
        <option value="2"${item?.semester === 2 ? ' selected' : ''}>2</option>
      </select>
    </div>
  </div>
  <div>
    ${fieldLbl('Tampilkan di portal')}
    <label style="display:flex;align-items:center;gap:.5rem;font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.35rem;cursor:pointer">
      <input type="checkbox" id="tp-vis-siswa"${item?.is_visible_siswa ? ' checked' : ''}>
      <span>Tampilkan ke siswa</span>
    </label>
    <label style="display:flex;align-items:center;gap:.5rem;font-size:var(--fs-caption);color:var(--text-secondary);cursor:pointer">
      <input type="checkbox" id="tp-vis-ortu"${item?.is_visible_ortu ? ' checked' : ''}>
      <span>Tampilkan ke orang tua</span>
    </label>
    <div style="font-size:var(--fs-caption);color:var(--text-muted);margin-top:.35rem">
      Bila tidak dicentang, entri ini hanya terlihat oleh Anda.
    </div>
  </div>
  <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:.25rem">
    <button data-action="close-modal" style="min-height:var(--btn-h);background:transparent;color:var(--gold);border:1.5px solid var(--gold-border);font-size:var(--fs-ui);padding:0 var(--btn-px);border-radius:var(--btn-r);cursor:pointer">Batal</button>
    <button id="btn-tp-save"
      style="padding:.5rem 1.25rem;background:var(--gold);
      color:var(--text-on-gold,#000);border:none;border-radius:.375rem;
      font-weight:600;cursor:pointer">${isEdit ? 'Simpan' : 'Tambah'}</button>
  </div>
  <div id="tp-err" style="color:#e74c3c;font-size:var(--fs-caption);display:none"></div>
</div>`;

    if (isWali) {
      el('tp-mapel-sel')?.addEventListener('change', function () {
        selMapel = this.value;
        const filteredTps = _tpList.filter(t =>
          t.tipe === 'TP' && (!t.mapel || t.mapel === selMapel)
        );
        const parentSel = el('tp-parent-sel');
        if (parentSel) {
          parentSel.innerHTML =
            '<option value="">— Pilih TP —</option>' +
            filteredTps.map(t => `<option value="${t.id}">${esc(t.judul)}</option>`).join('');
        }
      });
    }

    el('tp-tipe-sel').addEventListener('change', function () {
      selTipe = this.value;
      const val = selTipe;
      el('tp-parent-row').style.display = val === 'KKTP' ? '' : 'none';
      el('tp-judul-row').style.display  = val === 'CP'   ? 'none' : '';
      el('tp-konten-row').style.display = val === 'KKTP' ? 'none' : '';
      el('tp-range-row').style.display  = val === 'KKTP' ? '' : 'none';
      el('tp-sem-wrap').style.display   = val === 'CP'   ? 'none' : '';
      const judulLbl = el('pai-modal-box').querySelector('#tp-judul-row > div');
      if (judulLbl) judulLbl.textContent = val === 'KKTP' ? 'Deskripsi' : 'Judul';
      const judulEl = el('tp-judul');
      if (judulEl) judulEl.placeholder = val === 'KKTP' ? 'Deskripsi KKTP…' : 'Judul TP/KKTP…';
      const kontenLbl = el('pai-modal-box').querySelector('#tp-konten-row > div');
      if (kontenLbl) kontenLbl.textContent = val === 'CP' ? 'Deskripsi / Teks CP' : 'Deskripsi (opsional)';
    });

    el('tp-parent-sel').addEventListener('change', function () {
      const tp = _tpList.find(t => t.id === this.value);
      // Auto-fill judul dari konten TP induk jika judul masih kosong
      const judulEl = el('tp-judul');
      if (judulEl && judulEl.value.trim() === '') judulEl.value = tp?.konten ?? '';
      // BUG-1.1: wariskan mapel dari TP induk agar KKTP selalu selaras dengan TP-nya
      if (isWali && tp?.mapel) {
        selMapel = tp.mapel;
        const mapelSel = el('tp-mapel-sel');
        if (mapelSel) mapelSel.value = selMapel;
      }
    });

    el('btn-tp-save').addEventListener('click', async () => {
      const judul = selTipe === 'CP' ? '' : el('tp-judul').value.trim();
      if (selTipe !== 'CP' && !judul) {
        el('tp-err').textContent = 'Judul wajib diisi';
        el('tp-err').style.display = '';
        return;
      }
      // KKTP tanpa TP induk tidak punya arti: predikat dibaca lewat parent_id,
      // sehingga baris yatim itu tidak akan pernah dipakai rekap mana pun —
      // tersimpan, tampil di daftar, dan diam-diam tak berfungsi.
      if (selTipe === 'KKTP' && !el('tp-parent-sel')?.value) {
        el('tp-err').textContent = 'KKTP harus dikaitkan ke sebuah TP induk';
        el('tp-err').style.display = '';
        return;
      }
      const rentang = selTipe === 'KKTP' ? collectRentang() : null;
      if (rentang) {
        const salahRentang = validasiRentang(rentang);
        if (salahRentang) {
          el('tp-err').textContent = salahRentang;
          el('tp-err').style.display = '';
          return;
        }
      }
      const payload = {
        tipe:         selTipe,
        judul,
        konten:       selTipe !== 'KKTP' ? (el('tp-konten').value.trim() || null) : null,
        parent_id:    selTipe === 'KKTP' ? (el('tp-parent-sel').value || null) : null,
        rentang,
        batas_bawah:  null,
        batas_atas:   null,
        academic_year: el('tp-year').value.trim() || DEFAULT_YEAR,
        semester:     selTipe === 'CP' ? null : (parseInt(el('tp-sem').value) || 1),
        mapel: isWali ? selMapel : (_classroomMapelKey || null),
        // Default kolom ini di DB adalah false, dan sebelumnya tidak ada UI yang
        // menyetelnya sama sekali — akibatnya bagian "Dokumen Penilaian" di portal
        // siswa dan ortu dipastikan selalu kosong.
        is_visible_siswa: !!el('tp-vis-siswa')?.checked,
        is_visible_ortu:  !!el('tp-vis-ortu')?.checked,
      };
      if (_nilaiSedangDisimpan) return;
      _nilaiSedangDisimpan = true;
      const btnSave    = el('btn-tp-save');
      const labelAsli  = btnSave.textContent;
      btnSave.disabled    = true;
      btnSave.textContent = 'Menyimpan…';
      try {
        if (isEdit) {
          await SipApi.updateTpKktp(editId, payload);
          _tpList = _tpList.map(t => t.id === editId ? { ...t, ...payload } : t);
        } else {
          const n   = _tpList.filter(t => !t.parent_id).length;
          const row = await SipApi.createTpKktp(_cId, _tId, { ...payload, urutan: n + 1 });
          _tpList.push(row);
        }
        closeModal();
        renderTpList();
        toast(`TP/KKTP berhasil ${isEdit ? 'diperbarui' : 'ditambahkan'}`);
      } catch (err) {
        el('tp-err').textContent = err.message || 'Gagal menyimpan';
        el('tp-err').style.display = '';
        btnSave.disabled = false;
      } finally {
        _nilaiSedangDisimpan = false;
        btnSave.textContent = labelAsli;
      }
    });

    openModal();
  }

  async function confirmDeleteTp(id) {
    const item = _tpList.find(t => t.id === id);
    if (!item) return;

    // Rekap nilai menunjuk TP lewat grade_recap.tp_kktp_id, jadi menghapus TP
    // membuang rekapnya juga. Jumlahnya disebutkan supaya guru tahu persis apa
    // yang hilang — kalimat umum terlalu mudah diklik lewat.
    let rekapFrasa = '';
    if (item.tipe === 'TP') {
      try {
        const n = await hitungRekapTp(id);
        rekapFrasa = n > 0 ? ` beserta ${n} rekap nilai tersimpan` : '';
      } catch (e) {
        // Jumlahnya tidak terbaca. Peringatannya tetap harus muncul — tanpa
        // angka, tapi tidak boleh menghilang begitu saja.
        console.error('gagal menghitung rekap TP', e);
        rekapFrasa = ' termasuk semua rekap nilai yang tersimpan';
      }
    }

    const msg = item.tipe === 'CP'
      ? 'Menghapus CP ini akan menghapus entri ini secara permanen.'
      : item.tipe === 'TP'
        ? `TP ini akan dihapus${rekapFrasa}. Penilaian tetap ada tapi tidak lagi terhubung ke TP.`
        : 'Menghapus KKTP ini secara permanen.';
    if (!confirm(msg)) return;
    try {
      await SipApi.deleteTpKktp(id);
      _tpList = _tpList.filter(t => t.id !== id && t.parent_id !== id);
      renderTpList();
      toast('TP/KKTP dihapus');
    } catch (err) {
      toast('Gagal menghapus: ' + (err.message || ''), false);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 2 — Pelaksanaan Penilaian
  // ══════════════════════════════════════════════════════════════════════════════

  function renderAsmtList() {
    const c      = el('pai-asmt-list');
    if (!c) return;
    const isWali = _roleGuru === 'WALI_KELAS_SD';
    if (isWali && _selMapel === null) _selMapel = MAPEL_SD[0];

    const dropHtml = isWali ? `
<div style="margin-bottom:.75rem">
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.3rem">Mata Pelajaran</div>
  <select id="pai-asmt-mapel-sel" style="${inputCss('max-width:18rem')}">
    ${MAPEL_SD.map(m => `<option value="${esc(m)}"${m === _selMapel ? ' selected' : ''}>${esc(m)}</option>`).join('')}
  </select>
</div>` : '';

    // Penilaian tanpa TP tetap muncul di semua filter mapel — label "Tanpa TP" ditampilkan di row
    const visible = isWali
      ? _asmts.filter(a => {
          if (!a.tp_kktp_id) return true;
          const tp = _tpList.find(t => t.id === a.tp_kktp_id);
          return !tp || !tp.mapel || tp.mapel === _selMapel;
        })
      : _asmts;

    if (!visible.length) {
      c.innerHTML = dropHtml + `<p style="color:var(--text-secondary);font-size:var(--fs-caption)">
        Belum ada penilaian. Klik "+ Tambah Penilaian" untuk mulai.</p>`;
    } else {
      const grouped = { DIAGNOSTIK: [], FORMATIF: [], SUMATIF: [] };
      visible.forEach(a => { if (grouped[a.jenis]) grouped[a.jenis].push(a); });
      c.innerHTML = dropHtml + ['DIAGNOSTIK', 'FORMATIF', 'SUMATIF'].map(jenis => {
        const list = grouped[jenis];
        if (!list.length) return '';
        return `
<div style="margin-bottom:.875rem">
  <div style="font-size:var(--fs-caption);font-weight:700;color:var(--gold);
      text-transform:uppercase;letter-spacing:.07em;margin-bottom:.4rem">
    ${JENIS_LBL[jenis]}
  </div>
  ${list.map(a => asmtRowHtml(a)).join('')}
</div>`;
      }).join('');
    }

    if (isWali) {
      c.querySelector('#pai-asmt-mapel-sel')?.addEventListener('change', function () {
        _selMapel = this.value;
        renderAsmtList();
      });
    }
  }

  // Blok kendali visibilitas hasil penilaian ke portal siswa/ortu.
  // Diletakkan pada penilaian (bukan per nilai) — guru memutuskan sekali untuk
  // satu penilaian.
  //
  // Penilaian baru SELALU tersembunyi, apa pun jenisnya. Sebelumnya hanya
  // DIAGNOSTIK yang tersembunyi sementara Formatif dan Sumatif tercentang
  // otomatis, sehingga nilai sumatif terbit begitu disimpan — padahal petunjuk
  // tab menjanjikan sebaliknya, dan default kolomnya di DB juga false.
  // Menerbitkan nilai kini selalu tindakan sadar, bukan akibat samping menyimpan.
  //
  // Parameter jenis sengaja dipertahankan: pemanggilnya sudah mengirimkannya dan
  // blok ini kemungkinan masih membutuhkannya bila kelak teksnya dibedakan.
  function visPenilaianHtml(item, jenis) {  // eslint-disable-line no-unused-vars
    const baru   = !item;
    const cekSis = baru ? false : !!item.is_visible_siswa;
    const cekOrt = baru ? false : !!item.is_visible_ortu;
    return `
  <div>
    ${fieldLbl('Tampilkan hasil di portal')}
    <label style="display:flex;align-items:center;gap:.5rem;font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.35rem;cursor:pointer">
      <input type="checkbox" id="asmt-vis-siswa"${cekSis ? ' checked' : ''}>
      <span>Tampilkan ke siswa</span>
    </label>
    <label style="display:flex;align-items:center;gap:.5rem;font-size:var(--fs-caption);color:var(--text-secondary);cursor:pointer">
      <input type="checkbox" id="asmt-vis-ortu"${cekOrt ? ' checked' : ''}>
      <span>Tampilkan ke orang tua</span>
    </label>
    <div style="font-size:var(--fs-caption);color:var(--text-muted);margin-top:.35rem">
      Nilai tersembunyi secara default. Centang kotak di atas untuk menampilkan
      ke siswa atau orang tua.
    </div>
  </div>`;
  }

  // Penanda visibilitas pada daftar penilaian.
  function visAsmtBadgeHtml(a) {
    const t = [];
    if (a.is_visible_siswa) t.push('Siswa');
    if (a.is_visible_ortu)  t.push('Ortu');
    const label = t.length ? 'LIHAT ' + t.join(' + ') : 'Hanya guru';
    const color = t.length ? 'var(--gold)' : 'var(--text-muted)';
    return `<span title="${t.length ? 'Hasil terlihat di portal ' + t.join(' dan ') : 'Hasil tidak tampil di portal siswa/ortu'}"
      style="flex-shrink:0;font-size:.625rem;color:${color};white-space:nowrap;opacity:.9">${label}</span>`;
  }

  function asmtRowHtml(a) {
    const tp      = _tpList.find(t => t.id === a.tp_kktp_id);
    const teknik  = teknikLbl(a.teknik);
    const title   = [teknik || JENIS_LBL[a.jenis], a.instrumen].filter(Boolean).join(' — ');
    return `
<div style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
    border-radius:.5rem;margin-bottom:.375rem">
  <div style="display:flex;align-items:center;gap:.5rem;padding:.5rem .75rem">
    <div style="flex:1;min-width:0">
      <div style="font-size:var(--fs-ui);font-weight:var(--fw-medium,500);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(title)}</div>
      ${tp ? `<div style="font-size:var(--fs-caption);color:var(--text-secondary)">${esc(tp.judul)}</div>`
           : `<div style="font-size:var(--fs-caption);color:var(--text-secondary);font-style:italic">Tanpa TP</div>`}
    </div>
    ${visAsmtBadgeHtml(a)}
    <button type="button" data-action="edit-asmt" data-id="${a.id}"
      style="background:transparent;border:none;cursor:pointer;font-size:1rem;padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7" title="Edit">✏️</button>
    <button type="button" data-action="del-asmt"  data-id="${a.id}"
      style="background:rgba(231,76,60,.13);border:1.5px solid rgba(231,76,60,.3);cursor:pointer;font-size:1rem;padding:.35rem .45rem;border-radius:.25rem;line-height:1;color:#e74c3c;min-width:2.25rem;flex-shrink:0" title="Hapus">🗑</button>
  </div>
</div>`;
  }

  async function openAsmtModal(editId) {
    if (!editId) { openAsmtCreateModal(); return; }

    const item   = _asmts.find(a => a.id === editId);
    const tpOpts = _tpList.filter(t => t.tipe === 'TP');

    let selJenis     = item?.jenis     ?? 'FORMATIF';
    let selTeknik    = item?.teknik    ?? '';
    let selInstrumen = item?.instrumen ?? '';

    const isWali    = _roleGuru === 'WALI_KELAS_SD';
    const _initTp   = _tpList.find(t => t.id === item?.tp_kktp_id);
    let selMapel    = _initTp?.mapel ?? _selMapel ?? _classroomMapelKey ?? MAPEL_SD[0];

    const results = await SipApi.getAssessmentResults(editId).catch(() => []);
    const resMap  = Object.fromEntries(results.map(r => [r.student_id, r]));

    function buildTpOptHtml() {
      const candidates = tpOpts.filter(t => !isWali || !t.mapel || t.mapel === selMapel);
      return [
        `<option value="">— Opsional —</option>`,
        ...candidates.map(t => {
          const hasKktp = _tpList.some(k => k.parent_id === t.id && k.tipe === 'KKTP');
          return `<option value="${t.id}"${item?.tp_kktp_id === t.id ? ' selected' : ''}>${esc(t.judul)} ${hasKktp ? '✓' : '⚠'}</option>`;
        }),
      ].join('');
    }

    const teknikOptHtml = ['', 'OBSERVASI', 'TES', 'PENUGASAN', 'PROYEK', 'PORTOFOLIO', 'UNJUK_KERJA', 'TES_LISAN']
      .map(t => `<option value="${t}"${selTeknik === t ? ' selected' : ''}>${t ? teknikLbl(t) : '— Teknik (opsional) —'}</option>`)
      .join('');

    const instrOpts = selTeknik ? (INSTRUMEN_MAP[selTeknik] || [])
      .map(i => `<option value="${i}"${selInstrumen === i ? ' selected' : ''}>${i}</option>`)
      .join('') : '';

    const mapelChipsHtml = isWali
      ? `<div>
          ${fieldLbl('Mata Pelajaran')}
          <select id="asmt-mapel-sel" style="${inputCss()}">
            ${MAPEL_SD.map(m => `<option value="${esc(m)}"${m === selMapel ? ' selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </div>`
      : '';

    el('pai-modal-box').innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
  <h3 style="margin:0;color:var(--gold)">Edit Penilaian</h3>
  <button data-action="close-modal"
    style="background:transparent;border:none;cursor:pointer;font-size:1.25rem;
    padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7">×</button>
</div>
<div style="display:flex;flex-direction:column;gap:.875rem">
  ${mapelChipsHtml}
  <div>
    ${fieldLbl('Tujuan penilaian')}
    <textarea id="asmt-tujuan" rows="2"
      style="${inputCss('resize:vertical')}"
      placeholder="Apa yang ingin diketahui/dipantau?">${esc(item?.tujuan ?? '')}</textarea>
  </div>
  <div>
    ${fieldLbl('TP yang dinilai')}
    <select id="asmt-tp-sel" style="${inputCss()}">${buildTpOptHtml()}</select>
  </div>
  <div>
    ${fieldLbl('Jenis penilaian')}
    <select id="asmt-jenis-sel" style="${inputCss()}">
      ${['DIAGNOSTIK', 'FORMATIF', 'SUMATIF'].map(j => `<option value="${j}"${selJenis === j ? ' selected' : ''}>${JENIS_LBL[j]}</option>`).join('')}
    </select>
  </div>
  <div>
    ${fieldLbl('Teknik')}
    <select id="asmt-teknik-sel" style="${inputCss()}">${teknikOptHtml}</select>
  </div>
  <div id="asmt-instr-row" style="${instrOpts ? '' : 'display:none'}">
    ${fieldLbl('Instrumen')}
    <select id="asmt-instr-sel" style="${inputCss()}">
      <option value="">— Pilih —</option>${instrOpts}
    </select>
  </div>
  <div id="asmt-body-instr-wrap" class="pai-body-instr-wrap"></div>
  <div id="asmt-output-wrap" style="${selJenis === 'SUMATIF' ? '' : 'display:none'}">
    <div style="font-size:var(--fs-caption);font-weight:700;color:var(--gold);
      text-transform:uppercase;letter-spacing:.07em;margin-bottom:.5rem">Catat Nilai</div>
    <div id="asmt-sum-names" style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.375rem"></div>
    <div id="asmt-sum-nav"
      style="display:none;align-items:center;gap:.5rem;margin-bottom:.375rem">
      <button type="button" id="asmt-sum-prev"
        style="background:transparent;border:1px solid var(--border-subtle,rgba(255,255,255,.18));
        color:var(--text-secondary);border-radius:.3rem;padding:.15rem .5rem;cursor:pointer;
        font-size:var(--fs-caption)">←</button>
      <span id="asmt-sum-page-lbl"
        style="font-size:var(--fs-caption);color:var(--text-secondary)"></span>
      <button type="button" id="asmt-sum-next"
        style="background:transparent;border:1px solid var(--border-subtle,rgba(255,255,255,.18));
        color:var(--text-secondary);border-radius:.3rem;padding:.15rem .5rem;cursor:pointer;
        font-size:var(--fs-caption)">→</button>
    </div>
    <div id="asmt-sum-dots"
      style="display:flex;gap:.35rem;margin-bottom:.625rem;min-height:.625rem"></div>
    <div id="asmt-sum-input"
      style="display:none;border:1px solid var(--border-subtle,rgba(255,255,255,.18));
      border-radius:.4rem;padding:.625rem .75rem"></div>
  </div>
  <div>
    ${fieldLbl('Refleksi guru (opsional)')}
    <textarea id="asmt-refleksi" rows="2"
      style="${inputCss('resize:vertical')}"
      placeholder="Catatan refleksi…">${esc(item?.refleksi_guru ?? '')}</textarea>
  </div>
  ${visPenilaianHtml(item, selJenis)}
  <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:.25rem">
    <button data-action="close-modal"
      style="min-height:var(--btn-h);background:transparent;color:var(--gold);
      border:1.5px solid var(--gold-border);font-size:var(--fs-ui);
      padding:0 var(--btn-px);border-radius:var(--btn-r);cursor:pointer">Batal</button>
    <button id="btn-asmt-save"
      style="padding:.5rem 1.25rem;background:var(--gold);
      color:var(--text-on-gold,#000);border:none;border-radius:.375rem;
      font-weight:600;cursor:pointer">Simpan</button>
  </div>
  <div id="asmt-err"
    style="color:#e74c3c;font-size:var(--fs-caption);display:none"></div>
</div>`;

    const bodyInstrWrap = el('asmt-body-instr-wrap');
    wireBodyInstrumen(bodyInstrWrap);

    // ── Wire Mapel dropdown (WALI_KELAS_SD only) → cascade filter TP dropdown ──
    if (isWali) {
      el('asmt-mapel-sel')?.addEventListener('change', function () {
        selMapel = this.value;
        el('asmt-tp-sel').innerHTML = buildTpOptHtml();
      });
    }

    // Explicitly set instrSel.value + wire onchange for initial instrumen state.
    // Some browsers don't honour the `selected` attribute when innerHTML is set
    // dynamically; setting .value programmatically after DOM creation is robust.
    if (selTeknik) {
      const instrSel = el('asmt-instr-sel');
      if (instrSel) {
        if (selInstrumen) instrSel.value = selInstrumen;
        instrSel.onchange = function () {
          selInstrumen = this.value;
          if (selJenis !== 'SUMATIF')
            renderBodyInstrumen(selTeknik, selInstrumen, bodyInstrWrap);
        };
      }
    }

    // Initial Isi Penilaian render + prefill from saved konten
    // TES tidak punya sub-instrumen sehingga selInstrumen kosong — tetap render
    if (selJenis !== 'SUMATIF' && selTeknik && (selInstrumen || selTeknik === 'TES')) {
      renderBodyInstrumen(selTeknik, selInstrumen, bodyInstrWrap);
      if (item?.konten) prefillBodyInstrumen(bodyInstrWrap, item.konten, selTeknik, selInstrumen);
    }

    // ── Wire Jenis dropdown ──────────────────────────────────────────────────
    el('asmt-jenis-sel').addEventListener('change', function () {
      selJenis = this.value;
      const outputWrap = el('asmt-output-wrap');
      if (selJenis === 'SUMATIF') {
        if (outputWrap) outputWrap.style.display = '';
        bodyInstrWrap.innerHTML = '';
        renderSumPage();
      } else {
        if (outputWrap) outputWrap.style.display = 'none';
        renderBodyInstrumen(selTeknik, selInstrumen, bodyInstrWrap);
      }
    });

    // ── Wire Teknik cascade → instrumen → body instrumen ─────────────────────
    el('asmt-teknik-sel').addEventListener('change', function () {
      selTeknik    = this.value;
      selInstrumen = '';
      const opts     = selTeknik ? (INSTRUMEN_MAP[selTeknik] || []) : [];
      const instrRow = el('asmt-instr-row');
      const instrSel = el('asmt-instr-sel');
      if (opts.length) {
        instrSel.innerHTML = `<option value="">— Pilih —</option>` +
          opts.map(i => `<option value="${i}">${i}</option>`).join('');
        instrRow.style.display = '';
        instrSel.onchange = function () {
          selInstrumen = this.value;
          if (selJenis !== 'SUMATIF')
            renderBodyInstrumen(selTeknik, selInstrumen, bodyInstrWrap);
        };
      } else {
        instrRow.style.display = 'none';
      }
      if (selJenis === 'SUMATIF') {
        bodyInstrWrap.innerHTML = '';
        flushSumActive();
        _sumActiveSid = null;
        renderSumPage();
      } else {
        renderBodyInstrumen(selTeknik, '', bodyInstrWrap);
      }
    });

    // ── SUMATIF pagination state ─────────────────────────────────────────────
    const PAGE_SIZE   = 5;
    let _sumPage      = 0;
    let _sumActiveSid = null;
    const _sumNilai   = {};
    // Siswa yang sudah punya baris di assessment_results. Disemai dari resMap
    // (hasil getAssessmentResults) lalu tumbuh setiap upsert berhasil, supaya
    // simpan kedua di modal yang sama tetap tahu barisnya sudah ada.
    const _rowUpserted = new Set(Object.keys(resMap));

    // Initialize _sumNilai from resMap
    {
      const isTesInit = !selTeknik || selTeknik === 'TES';
      const kktpInit  = item?.tp_kktp_id
        ? _tpList.filter(t => t.parent_id === item.tp_kktp_id && t.tipe === 'KKTP')
        : [];
      const kktp0Init = kktpInit[0];
      for (const s of _roster) {
        const r = resMap[s.id];
        if (!r) continue;
        if (isTesInit) {
          _sumNilai[s.id] = { nilai: r.nilai ?? null, tl: r.tindak_lanjut ?? null };
        } else {
          const predikat = (r.nilai != null && kktp0Init)
            ? getPredikat(r.nilai, getRentang(kktp0Init))
            : null;
          _sumNilai[s.id] = { predikat, nilai: r.nilai ?? null, tl: r.tindak_lanjut ?? null };
        }
      }
    }

    function flushSumActive() {
      if (!_sumActiveSid) return;
      const tlEl  = el('asmt-sum-tl');
      const isTes = !selTeknik || selTeknik === 'TES';
      if (isTes) {
        const nilaiEl = el('asmt-sum-nilai');
        const raw     = nilaiEl?.value;
        const n       = raw !== '' && raw != null ? parseFloat(raw) : null;
        _sumNilai[_sumActiveSid] = {
          nilai: isNaN(n) ? null : n,
          tl:    tlEl ? chipVal(tlEl) : null,
        };
      } else {
        const predChipsEl = el('asmt-sum-pred-chips');
        const selPred     = predChipsEl ? chipVal(predChipsEl) : null;
        const kktp        = getKktpItems()[0];
        const rent        = kktp ? getRentang(kktp) : null;
        const autoN       = selPred && rent ? nilaiTengah(selPred, rent) : null;
        _sumNilai[_sumActiveSid] = {
          predikat: selPred,
          nilai:    autoN,
          tl:       tlEl ? chipVal(tlEl) : null,
        };
      }
    }

    function renderSumInput() {
      const inputEl = el('asmt-sum-input');
      if (!_sumActiveSid) { if (inputEl) inputEl.style.display = 'none'; return; }
      const stu   = _roster.find(r => r.id === _sumActiveSid);
      const vals  = _sumNilai[_sumActiveSid] ?? {};
      const kktp  = getKktpItems()[0];
      const rent  = kktp ? getRentang(kktp) : null;
      const isTes = !selTeknik || selTeknik === 'TES';

      const namaHtml = `<div style="font-size:var(--fs-ui);font-weight:600;margin-bottom:.5rem">
        ${esc(stu?.nama ?? '')}</div>`;

      let valorHtml;
      if (isTes) {
        const kktpColor = kktp && vals.nilai != null ? kktpStatColor(vals.nilai, rent) : 'var(--text-secondary)';
        const kktpStr   = kktp && vals.nilai != null ? kktpStatText(vals.nilai, rent) : '';
        valorHtml = `
<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.375rem">
  <input type="number" id="asmt-sum-nilai" min="0" max="100" step="0.5"
    placeholder="Nilai 0–100"
    value="${vals.nilai != null ? String(vals.nilai) : ''}"
    style="${inputCss('width:7rem;font-size:var(--fs-caption)')}">
  <span id="asmt-sum-kktp"
    style="font-size:var(--fs-caption);color:${kktpColor}">${kktpStr}</span>
</div>`;
      } else {
        const selPred   = vals.predikat ?? null;
        const autoN     = selPred && rent ? nilaiTengah(selPred, rent) : null;
        const kktpColor = autoN != null ? kktpStatColor(autoN, rent) : 'var(--text-secondary)';
        const kktpStr   = kktp
          ? (autoN != null ? kktpStatText(autoN, rent) : 'Pilih predikat')
          : '';
        valorHtml = `
<div style="margin-bottom:.375rem">
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.25rem">Predikat:</div>
  <div id="asmt-sum-pred-chips" style="display:flex;flex-wrap:wrap;gap:.35rem">
    ${PREDIKAT_ORDER.map(p => chipHtml(p, p, selPred === p)).join('')}
  </div>
  <div style="margin-top:.375rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
    <span style="font-size:var(--fs-caption);color:var(--text-secondary)">Nilai:</span>
    <span id="asmt-sum-pred-nilai"
      style="font-size:var(--fs-ui);font-weight:600;min-width:2rem">
      ${autoN != null ? autoN : '—'}</span>
    <span id="asmt-sum-kktp"
      style="font-size:var(--fs-caption);color:${kktpColor}">${kktpStr}</span>
  </div>
</div>`;
      }

      const tlHtml = `
<div>
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.25rem">
    Tindak lanjut:</div>
  <div id="asmt-sum-tl" style="display:flex;flex-wrap:wrap;gap:.35rem">
    ${[['PENGAYAAN','Pengayaan'],['PENGUATAN','Penguatan'],['PENDAMPINGAN','Pendampingan']].map(([v,l]) => chipHtml(v, l, vals.tl === v)).join('')}
  </div>
</div>`;

      inputEl.innerHTML = namaHtml + valorHtml + tlHtml;
      inputEl.style.display = '';

      if (isTes) {
        el('asmt-sum-nilai')?.addEventListener('input', function () {
          const kktp2  = getKktpItems()[0];
          const kktpEl = el('asmt-sum-kktp');
          if (!kktpEl) return;
          const n     = this.value === '' ? null : parseFloat(this.value);
          const rent2 = kktp2 ? getRentang(kktp2) : null;
          kktpEl.textContent = kktp2 ? kktpStatText(n, rent2) : '';
          kktpEl.style.color = kktp2 ? kktpStatColor(n, rent2) : 'var(--text-secondary)';
        });
      } else {
        const predChipsEl = el('asmt-sum-pred-chips');
        if (predChipsEl) {
          wireChips(predChipsEl, false, selVal => {
            const kktp2   = getKktpItems()[0];
            const rent2   = kktp2 ? getRentang(kktp2) : null;
            const autoN2  = rent2 ? nilaiTengah(selVal, rent2) : null;
            const nilaiEl = el('asmt-sum-pred-nilai');
            const kktpEl  = el('asmt-sum-kktp');
            if (nilaiEl) nilaiEl.textContent = autoN2 != null ? String(autoN2) : '—';
            if (kktpEl) {
              kktpEl.textContent = autoN2 != null && kktp2 ? kktpStatText(autoN2, rent2) : '';
              kktpEl.style.color = autoN2 != null ? kktpStatColor(autoN2, rent2) : 'var(--text-secondary)';
            }
          });
        }
      }

      wireChips(el('asmt-sum-tl'), false);
    }

    function renderSumPage() {
      const names   = el('asmt-sum-names');
      const nav     = el('asmt-sum-nav');
      const pageLbl = el('asmt-sum-page-lbl');
      const dots    = el('asmt-sum-dots');
      if (!names) return;
      const total = _roster.length;
      const pages = Math.ceil(total / PAGE_SIZE) || 1;
      _sumPage    = Math.max(0, Math.min(_sumPage, pages - 1));
      const slice = _roster.slice(_sumPage * PAGE_SIZE, (_sumPage + 1) * PAGE_SIZE);
      names.innerHTML = slice.map(s => {
        const isAct  = s.id === _sumActiveSid;
        const hasVal = _sumNilai[s.id]?.nilai != null || _sumNilai[s.id]?.predikat != null;
        return `<button type="button" data-sum-sid="${esc(s.id)}"
          style="padding:.3rem .7rem;border-radius:1rem;font-size:var(--fs-caption);cursor:pointer;
          border:1.5px solid ${isAct ? 'var(--gold)' : hasVal ? 'rgba(255,255,255,.4)' : 'var(--border-subtle,rgba(255,255,255,.18))'};
          background:${isAct ? 'var(--gold)' : 'transparent'};
          color:${isAct ? 'var(--text-on-gold,#000)' : hasVal ? 'var(--text-primary)' : 'var(--text-secondary)'}">
          ${esc(s.nama)}${hasVal ? ' ✓' : ''}</button>`;
      }).join('');
      names.querySelectorAll('[data-sum-sid]').forEach(btn => {
        btn.addEventListener('click', () => {
          flushSumActive();
          _sumActiveSid = btn.dataset.sumSid;
          renderSumPage();
        });
      });
      if (pages > 1) {
        nav.style.display = 'flex';
        if (pageLbl) pageLbl.textContent = `halaman ${_sumPage + 1}/${pages}`;
        const prevBtn = el('asmt-sum-prev');
        const nextBtn = el('asmt-sum-next');
        if (prevBtn) prevBtn.disabled = _sumPage === 0;
        if (nextBtn) nextBtn.disabled = _sumPage === pages - 1;
      } else {
        nav.style.display = 'none';
      }
      if (dots) {
        dots.innerHTML = pages > 1
          ? Array.from({length: pages}, (_, i) =>
              `<span style="width:.5rem;height:.5rem;border-radius:50%;display:inline-block;
              background:${i === _sumPage ? 'var(--gold)' : 'var(--border-subtle,rgba(255,255,255,.3))'}"></span>`
            ).join('')
          : '';
      }
      if (_sumActiveSid && !slice.some(s => s.id === _sumActiveSid)) _sumActiveSid = null;
      renderSumInput();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    function getKktpItems() {
      const tpId = el('asmt-tp-sel')?.value || null;
      return tpId ? _tpList.filter(t => t.parent_id === tpId && t.tipe === 'KKTP') : [];
    }

    // ── Wire TP change ────────────────────────────────────────────────────────
    el('asmt-tp-sel').addEventListener('change', () => { renderSumInput(); });

    // ── Wire pagination buttons ───────────────────────────────────────────────
    el('asmt-sum-prev')?.addEventListener('click', () => {
      flushSumActive(); _sumPage--; renderSumPage();
    });
    el('asmt-sum-next')?.addEventListener('click', () => {
      flushSumActive(); _sumPage++; renderSumPage();
    });

    // ── Initial render ────────────────────────────────────────────────────────
    if (selJenis === 'SUMATIF') renderSumPage();

    // ── Save ─────────────────────────────────────────────────────────────────
    el('btn-asmt-save').addEventListener('click', async () => {
      const errEl     = el('asmt-err');
      const instrBody = collectBodyInstrumen(bodyInstrWrap, selTeknik, selInstrumen);
      const payload = {
        tp_kktp_id:    el('asmt-tp-sel').value || null,
        jenis:         selJenis,
        teknik:        el('asmt-teknik-sel').value || null,
        instrumen:     el('asmt-instr-sel')?.value || null,
        tujuan:        el('asmt-tujuan').value.trim() || null,
        konten:        instrBody || null,
        refleksi_guru: el('asmt-refleksi').value.trim() || null,
        is_visible_siswa: !!el('asmt-vis-siswa')?.checked,
        is_visible_ortu:  !!el('asmt-vis-ortu')?.checked,
      };
      if (_nilaiSedangDisimpan) return;
      _nilaiSedangDisimpan = true;
      const btnSave   = el('btn-asmt-save');
      const labelAsli = btnSave.textContent;
      btnSave.disabled    = true;
      btnSave.textContent = 'Menyimpan…';
      errEl.style.display = 'none';
      try {
        await SipApi.updateAssessment(editId, payload);
        _asmts = _asmts.map(a => a.id === editId ? { ...a, ...payload } : a);

        const kktpItems  = getKktpItems();
        const gagalNilai = [];
        const gagalGrup  = [];
        if (selJenis === 'SUMATIF') {
          flushSumActive();
          for (const [sid, vals] of Object.entries(_sumNilai)) {
            const kosong = vals.nilai == null && !vals.predikat;
            // Kotak kosong tidak selalu berarti "lewati". Bila siswa itu sudah
            // punya baris hasil, mengosongkannya adalah perintah hapus dari guru
            // -- nilai null harus benar-benar terkirim, kalau tidak nilai lama
            // bertahan di DB dan tak ada cara menghapusnya lewat UI.
            //
            // Yang dilewati hanya siswa yang belum punya baris: bagi mereka kosong
            // berarti "memang belum dinilai", dan menulis baris null cuma menambah
            // baris kosong yang tidak pernah diminta siapa pun.
            if (kosong && !_rowUpserted.has(sid)) continue;
            const kktp       = kktpItems[0];
            const resPayload = { nilai: vals.nilai ?? null, tindak_lanjut: vals.tl || null };
            if (kosong) {
              // Nilai dihapus: kktp_tercapai ikut dikosongkan, bukan dijadikan
              // false. False berarti "sudah dinilai dan belum tercapai" -- klaim
              // yang tidak lagi punya dasar setelah nilainya dihapus.
              resPayload.kktp_tercapai = null;
            } else if (kktp) {
              const p = vals.nilai != null ? getPredikat(vals.nilai, getRentang(kktp)) : (vals.predikat || null);
              resPayload.kktp_tercapai = p === 'BSH' || p === 'SB';
            }
            try {
              await SipApi.upsertAssessmentResult(_cId, _tId, editId, sid, resPayload);
              _rowUpserted.add(sid);
            } catch { gagalNilai.push(sid); }
          }
        } else {
          const srows = el('pai-modal-box').querySelectorAll('.pai-srow');
          for (const srow of srows) {
            const sid        = srow.dataset.sid;
            const resPayload = buildResultPayload(srow, selJenis, kktpItems);
            if (selJenis === 'DIAGNOSTIK' && resPayload.grup_diferensiasi) {
              try {
                await SipApi.upsertStudentGroup(_cId, sid, resPayload.grup_diferensiasi);
                _sGroups[sid] = resPayload.grup_diferensiasi;
              } catch { gagalGrup.push(sid); }
            }
            try { await SipApi.upsertAssessmentResult(_cId, _tId, editId, sid, resPayload); }
            catch { gagalNilai.push(sid); }
          }
        }
        // Modal sengaja dibiarkan terbuka: nilai yang sudah diketik masih ada di
        // layar, jadi guru dapat menekan Simpan lagi tanpa mengetik ulang.
        if (gagalNilai.length || gagalGrup.length) {
          throw new Error(pesanGagalSimpan(gagalNilai, gagalGrup));
        }

        // Hasil sumatif berubah, jadi rekap yang sudah tersimpan untuk TP itu
        // tidak lagi mencerminkannya. Dihapus supaya guru menghitung ulang.
        let peringatanRekap = '';
        if (selJenis === 'SUMATIF' && payload.tp_kktp_id) {
          try {
            await hapusRekapTp(payload.tp_kktp_id);
          } catch (e) {
            console.error('gagal menghapus rekap basi', e);
            peringatanRekap = ' Rekap lama gagal dihapus — hitung ulang di Rekap Penilaian.';
          }
        }
        closeModal();
        renderAsmtList();
        toast('Penilaian berhasil diperbarui.' + peringatanRekap);
      } catch (err) {
        errEl.textContent = err.message || 'Gagal menyimpan';
        errEl.style.display = '';
        btnSave.disabled = false;
      } finally {
        _nilaiSedangDisimpan = false;
        btnSave.textContent = labelAsli;
      }
    });

    openModal();
  }

  async function confirmDeleteAsmt(id) {
    const item = _asmts.find(a => a.id === id);
    if (!item || !confirm('Hapus penilaian ini? Semua hasil siswa akan ikut terhapus.')) return;
    try {
      await SipApi.deleteAssessment(id);
      _asmts = _asmts.filter(a => a.id !== id);
      // Rekap TP ini dihitung dari hasil penilaian yang barusan hilang.
      // Membiarkannya berarti menyimpan angka yang sumbernya sudah tidak ada.
      let peringatan = '';
      if (item.jenis === 'SUMATIF' && item.tp_kktp_id) {
        try {
          await hapusRekapTp(item.tp_kktp_id);
        } catch (e) {
          // Penilaiannya sudah terhapus; menyatakan seluruh operasi gagal di
          // sini akan berbohong. Cukup beri tahu apa yang masih perlu dibereskan.
          console.error('gagal menghapus rekap basi', e);
          peringatan = ' Rekap lama gagal dihapus — hitung ulang di Rekap Penilaian.';
        }
      }
      renderAsmtList();
      toast('Penilaian dihapus.' + peringatan);
    } catch (err) {
      toast('Gagal menghapus: ' + (err.message || ''), false);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ISI PENILAIAN — helpers untuk 42 pola wireframe
  // ══════════════════════════════════════════════════════════════════════════════

  function siswaPickerHtml(pickerId) {
    const opts = _roster.map(s =>
      `<option value="${esc(s.id)}">${esc(s.nama)}</option>`
    ).join('');
    return `<div class="pai-sw-picker" style="margin-top:.35rem">
  <div class="pai-sw-chips" style="display:flex;flex-wrap:wrap;gap:.3rem;
    min-height:1.25rem;margin-bottom:.3rem"></div>
  ${_roster.length
    ? `<select class="pai-sw-sel" style="${inputCss('font-size:var(--fs-caption)')}">
        <option value="">+ Pilih siswa</option>${opts}
      </select>`
    : `<span style="color:var(--text-secondary);font-size:var(--fs-caption)">
        Belum ada siswa</span>`}
</div>`;
  }

  function chipSiswaHtml(sid, nama) {
    return `<span class="pai-sw-chip" data-sid="${esc(sid)}"
      style="display:inline-flex;align-items:center;gap:.25rem;padding:.15rem .5rem;
      border-radius:1rem;background:var(--gold);color:var(--text-on-gold,#000);
      font-size:var(--fs-caption);cursor:pointer" title="Klik untuk hapus">
      ${esc(nama)} ×</span>`;
  }

  function aspekRowHtml(idx) {
    return `<div class="pai-aspek-row" data-aspek="${idx}"
      style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
      border-radius:.5rem;padding:.625rem .75rem;margin-bottom:.5rem">
  <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.625rem">
    <label style="font-size:var(--fs-caption);color:var(--text-secondary);
      white-space:nowrap">Aspek ${idx + 1}:</label>
    <input class="aspek-nama" type="text" placeholder="Nama aspek…"
      style="${inputCss('flex:1')}">
    <button type="button" class="btn-del-aspek"
      style="background:transparent;border:none;cursor:pointer;font-size:.875rem;
      color:var(--text-secondary);padding:.2rem .35rem;border-radius:.25rem;
      opacity:.7" title="Hapus aspek">✕</button>
  </div>
  ${PREDIKAT_RUBRIK.map(p => `
  <div class="pai-pred-block" style="padding:.5rem 0;
    border-top:1px solid var(--border-subtle,rgba(255,255,255,.08))">
    <div style="font-size:var(--fs-caption);font-weight:600;margin-bottom:.3rem">
      ${esc(p.lbl)}</div>
    <textarea class="predikat-desk predikat-desk-${esc(p.val)}" rows="2"
      placeholder="Deskripsi deskriptor… (opsional)"
      style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
    <div style="font-size:var(--fs-caption);color:var(--text-secondary);
      margin:.25rem 0 .1rem">Siswa:</div>
    ${siswaPickerHtml(`aspek-${idx}-${p.val}`)}
  </div>`).join('')}
</div>`;
  }

  function checklistItemHtml(idx) {
    return `<div class="pai-item-row" data-item="${idx}"
      style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
      border-radius:.5rem;padding:.5rem .75rem;margin-bottom:.375rem">
  <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.375rem">
    <label style="font-size:var(--fs-caption);color:var(--text-secondary);
      white-space:nowrap">Item ${idx + 1}:</label>
    <input class="item-nama" type="text" placeholder="Deskripsi item…"
      style="${inputCss('flex:1')}">
    <button type="button" class="btn-del-item"
      style="background:transparent;border:none;cursor:pointer;font-size:.875rem;
      color:var(--text-secondary);padding:.2rem .35rem;border-radius:.25rem;
      opacity:.7" title="Hapus item">✕</button>
  </div>
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);
    margin-bottom:.1rem">Siswa yang memenuhi:</div>
  ${siswaPickerHtml(`item-${idx}`)}
</div>`;
  }

  function observasiAspekHtml(idx) {
    return `<div class="pai-obs-aspek" data-aspek="${idx}"
      style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
      border-radius:.5rem;padding:.625rem .75rem;margin-bottom:.5rem">
  <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.375rem">
    <label style="font-size:var(--fs-caption);color:var(--text-secondary);
      white-space:nowrap">Aspek ${idx + 1}:</label>
    <input class="obs-aspek-nama" type="text" placeholder="Nama aspek observasi…"
      style="${inputCss('flex:1')}">
    <button type="button" class="btn-del-obs-aspek"
      style="background:transparent;border:none;cursor:pointer;font-size:.875rem;
      color:var(--text-secondary);padding:.2rem .35rem;border-radius:.25rem;
      opacity:.7" title="Hapus aspek">✕</button>
  </div>
  <div style="margin-bottom:.375rem">
    <div style="font-size:var(--fs-caption);color:var(--text-secondary);
      margin-bottom:.2rem">Indikator (opsional):</div>
    <input class="obs-indikator" type="text" placeholder="Tuliskan indikator…"
      style="${inputCss()}">
  </div>
  ${TINGKAT_OBS.map(t => `
  <div style="padding:.375rem 0;
    border-top:1px solid var(--border-subtle,rgba(255,255,255,.08))">
    <div style="font-size:var(--fs-caption);font-weight:600;margin-bottom:.25rem">
      ${esc(t)}:</div>
    ${siswaPickerHtml(`obs-${idx}-${t.replace(/\s/g, '_')}`)}
  </div>`).join('')}
</div>`;
  }

  function anekdotCatatanHtml(idx, modePerSiswa) {
    const siswaOpts = _roster.map(s =>
      `<option value="${esc(s.id)}">${esc(s.nama)}</option>`
    ).join('');
    return `<div class="pai-anekdot-row" data-catatan="${idx}"
      style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
      border-radius:.5rem;padding:.5rem .75rem;margin-bottom:.375rem">
  <div style="display:flex;justify-content:space-between;align-items:center;
    margin-bottom:.375rem">
    <span style="font-size:var(--fs-caption);font-weight:600">
      Catatan ${idx + 1}</span>
    <button type="button" class="btn-del-catatan"
      style="background:transparent;border:none;cursor:pointer;font-size:.875rem;
      color:var(--text-secondary);padding:.2rem .35rem;border-radius:.25rem;
      opacity:.7" title="Hapus catatan">✕</button>
  </div>
  ${modePerSiswa
    ? `<div style="margin-bottom:.375rem">
        ${fieldLbl('Siswa')}
        <select class="anekdot-siswa-sel"
          style="${inputCss('font-size:var(--fs-caption)')}">
          <option value="">— Pilih siswa —</option>${siswaOpts}
        </select>
      </div>`
    : `<div style="margin-bottom:.375rem">
        <div style="font-size:var(--fs-caption);color:var(--text-secondary);
          margin-bottom:.25rem">Siswa yang terlibat:</div>
        ${siswaPickerHtml(`anekdot-${idx}-siswa`)}
      </div>`}
  <div style="margin-bottom:.375rem">
    ${fieldLbl('Deskripsi kejadian')}
    <textarea class="anekdot-deskripsi" rows="2" placeholder="Tuliskan kejadian…"
      style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
  </div>
  <div>
    ${fieldLbl('Interpretasi (opsional)')}
    <textarea class="anekdot-interpretasi" rows="2"
      placeholder="Tuliskan interpretasi opsional…"
      style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
  </div>
</div>`;
  }

  function pgSoalHtml(idx) {
    return `<div class="pai-pg-soal" data-soal="${idx}"
      style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
      border-radius:.5rem;padding:.5rem .75rem;margin-bottom:.375rem">
  <div style="display:flex;justify-content:space-between;align-items:center;
    margin-bottom:.375rem">
    <span style="font-size:var(--fs-caption);font-weight:600">Soal ${idx + 1}</span>
    <button type="button" class="btn-del-pg-soal"
      style="background:transparent;border:none;cursor:pointer;font-size:.875rem;
      color:var(--text-secondary);padding:.2rem .35rem;border-radius:.25rem;
      opacity:.7" title="Hapus soal">✕</button>
  </div>
  <div style="margin-bottom:.375rem">
    ${fieldLbl('Pertanyaan (opsional)')}
    <textarea class="pg-pertanyaan" rows="2" placeholder="Tuliskan pertanyaan…"
      style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
  </div>
  <div style="margin-bottom:.375rem">
    ${fieldLbl('Kunci jawaban')}
    <select class="pg-kunci" style="${inputCss('font-size:var(--fs-caption)')}">
      ${['A','B','C','D'].map(k => `<option value="${k}">${k}</option>`).join('')}
    </select>
  </div>
  <div style="margin-bottom:.25rem">
    <div style="font-size:var(--fs-caption);color:var(--text-secondary);
      margin-bottom:.2rem">Siswa menjawab benar:</div>
    ${siswaPickerHtml(`pg-${idx}-benar`)}
  </div>
  <div>
    <div style="font-size:var(--fs-caption);color:var(--text-secondary);
      margin-bottom:.2rem">Siswa menjawab salah:</div>
    ${siswaPickerHtml(`pg-${idx}-salah`)}
  </div>
</div>`;
  }

  function uraianSoalHtml(idx) {
    const skorRows = _roster.map(s => `
<div class="uraian-srow" data-sid="${esc(s.id)}"
  style="display:flex;align-items:center;gap:.5rem;padding:.25rem 0">
  <span style="flex:1;font-size:var(--fs-caption)">${esc(s.nama)}</span>
  <input type="number" class="uraian-skor" min="0" placeholder="Skor"
    style="${inputCss('width:5rem;font-size:var(--fs-caption);text-align:center')}">
</div>`).join('');
    return `<div class="pai-uraian-soal" data-soal="${idx}"
      style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
      border-radius:.5rem;padding:.5rem .75rem;margin-bottom:.375rem">
  <div style="display:flex;justify-content:space-between;align-items:center;
    margin-bottom:.375rem">
    <span style="font-size:var(--fs-caption);font-weight:600">Soal ${idx + 1}</span>
    <button type="button" class="btn-del-uraian-soal"
      style="background:transparent;border:none;cursor:pointer;font-size:.875rem;
      color:var(--text-secondary);padding:.2rem .35rem;border-radius:.25rem;
      opacity:.7" title="Hapus soal">✕</button>
  </div>
  <div style="margin-bottom:.375rem">
    ${fieldLbl('Pertanyaan (opsional)')}
    <textarea class="uraian-pertanyaan" rows="2" placeholder="Tuliskan pertanyaan…"
      style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
  </div>
  <div style="display:flex;gap:.5rem;margin-bottom:.375rem">
    <div style="flex:0 0 8rem">
      ${fieldLbl('Skor maksimal')}
      <input type="number" class="uraian-skor-maks" min="0" value="10"
        style="${inputCss('font-size:var(--fs-caption)')}">
    </div>
  </div>
  <div style="margin-bottom:.375rem">
    ${fieldLbl('Rubrik opsional')}
    <textarea class="uraian-rubrik" rows="2"
      placeholder="Tuliskan kriteria penilaian…"
      style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
  </div>
  <div>
    <div style="font-size:var(--fs-caption);color:var(--text-secondary);
      margin-bottom:.25rem">Input skor per siswa:</div>
    <div class="uraian-skor-rows">${skorRows}</div>
  </div>
</div>`;
  }

  function konteksPrefixHtml(teknik) {
    if (teknik === 'PENUGASAN') return `
<div style="margin-bottom:.5rem">
  ${fieldLbl('Deskripsi tugas (opsional)')}
  <textarea id="pai-konteks-1" rows="2" placeholder="Tuliskan deskripsi tugas…"
    style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
</div>`;
    if (teknik === 'PROYEK') return `
<div style="margin-bottom:.5rem">
  ${fieldLbl('Nama proyek (opsional)')}
  <input type="text" id="pai-konteks-1" placeholder="Tuliskan nama proyek…"
    style="${inputCss()}">
  <div style="margin-top:.375rem">
    ${fieldLbl('Deskripsi (opsional)')}
    <textarea id="pai-konteks-2" rows="2" placeholder="Tuliskan deskripsi proyek…"
      style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
  </div>
</div>`;
    if (teknik === 'PORTOFOLIO') return `
<div style="margin-bottom:.5rem">
  ${fieldLbl('Tema portofolio (opsional)')}
  <input type="text" id="pai-konteks-1" placeholder="Tuliskan tema…"
    style="${inputCss()}">
  <div style="margin-top:.375rem">
    ${fieldLbl('Periode (opsional)')}
    <input type="text" id="pai-konteks-2" placeholder="Tuliskan periode…"
      style="${inputCss()}">
  </div>
</div>`;
    if (teknik === 'UNJUK_KERJA') return `
<div style="margin-bottom:.5rem">
  ${fieldLbl('Deskripsi unjuk kerja (opsional)')}
  <textarea id="pai-konteks-1" rows="2" placeholder="Tuliskan deskripsi…"
    style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
</div>`;
    return '';
  }

  function addBtnHtml(cls, label) {
    return `<button type="button" class="${esc(cls)}"
      style="margin-top:.5rem;font-size:var(--fs-caption);background:transparent;
      border:1.5px dashed var(--border-subtle,rgba(255,255,255,.3));
      color:var(--text-secondary);border-radius:.375rem;cursor:pointer;
      padding:.35rem .75rem;width:100%">${esc(label)}</button>`;
  }

  function renderBodyInstrumen(teknik, instrumen, container) {
    if (!container) return;
    let inner = '';

    if (teknik === 'OBSERVASI') {
      if (instrumen === 'Lembar Observasi') {
        inner = `<div id="pai-obs-aspeks">${observasiAspekHtml(0)}</div>
${addBtnHtml('btn-tambah-obs-aspek', '+ Tambah aspek observasi')}`;
      } else if (instrumen === 'Catatan Anekdot') {
        inner = `<div style="margin-bottom:.5rem">
  ${fieldLbl('Mode')}
  <select id="pai-anekdot-mode" style="${inputCss()}">
    <option value="per_siswa">Per Siswa</option>
    <option value="per_kejadian">Per Kejadian</option>
  </select>
</div>
<div id="pai-anekdot-rows">${anekdotCatatanHtml(0, true)}</div>
${addBtnHtml('btn-tambah-catatan', '+ Tambah catatan')}`;
      } else if (instrumen === 'Checklist') {
        inner = `<div id="pai-cl-items">${checklistItemHtml(0)}</div>
${addBtnHtml('btn-tambah-item', '+ Tambah item')}`;
      }
    } else if (teknik === 'TES') {
      inner = ['Menjawab dengan baik', 'Menjawab sebagian', 'Belum bisa menjawab'].map((dsk, i) => `
<div class="pai-tl-dsk-block" data-dsk="${i}"
  style="padding:.5rem 0;border-top:1px solid var(--border-subtle,rgba(255,255,255,.08))">
  <div style="font-size:var(--fs-caption);font-weight:600;margin-bottom:.25rem">
    ${esc(dsk)}:</div>
  ${siswaPickerHtml(`tes-dsk-${i}`)}
</div>`).join('');
    } else if (teknik === 'TES_LISAN') {
      if (instrumen === 'Wawancara') {
        inner = `<div style="margin-bottom:.5rem">
  ${fieldLbl('Topik wawancara (opsional)')}
  <input type="text" id="pai-tl-topik" placeholder="Tuliskan topik…"
    style="${inputCss()}">
</div>
${['Menjawab dengan baik', 'Menjawab sebagian', 'Belum bisa menjawab'].map((dsk, i) => `
<div class="pai-tl-dsk-block" data-dsk="${i}"
  style="padding:.5rem 0;border-top:1px solid var(--border-subtle,rgba(255,255,255,.08))">
  <div style="font-size:var(--fs-caption);font-weight:600;margin-bottom:.25rem">
    ${esc(dsk)}:</div>
  ${siswaPickerHtml(`tl-waw-${i}`)}
</div>`).join('')}`;
      } else {
        const topikLabel = instrumen === 'Monolog' ? 'Topik monolog (opsional)' : 'Topik dialog (opsional)';
        inner = `<div style="margin-bottom:.5rem">
  ${fieldLbl(topikLabel)}
  <input type="text" id="pai-tl-topik" placeholder="Tuliskan topik…"
    style="${inputCss()}">
</div>
${PREDIKAT_RUBRIK.map((p, i) => `
<div class="pai-tl-pred-block" data-pred="${esc(p.val)}"
  style="padding:.5rem 0;border-top:1px solid var(--border-subtle,rgba(255,255,255,.08))">
  <div style="font-size:var(--fs-caption);font-weight:600;margin-bottom:.3rem">
    ${esc(p.lbl)}</div>
  <textarea class="tl-pred-desk tl-pred-desk-${esc(p.val)}" rows="2"
    placeholder="Deskripsi deskriptor… (opsional)"
    style="${inputCss('resize:vertical;font-size:var(--fs-caption)')}"></textarea>
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);
    margin:.25rem 0 .1rem">Siswa:</div>
  ${siswaPickerHtml(`tl-${i}-${p.val}`)}
</div>`).join('')}`;
      }
    } else if (['PENUGASAN','PROYEK','PORTOFOLIO','UNJUK_KERJA'].includes(teknik)) {
      const prefix = konteksPrefixHtml(teknik);
      if (instrumen === 'Rubrik') {
        inner = `${prefix}
<div id="pai-rubrik-aspeks">${aspekRowHtml(0)}</div>
${addBtnHtml('btn-tambah-aspek', '+ Tambah aspek')}`;
      } else if (instrumen === 'Checklist') {
        inner = `${prefix}
<div id="pai-cl-items">${checklistItemHtml(0)}</div>
${addBtnHtml('btn-tambah-item', '+ Tambah item')}`;
      }
    }

    container.innerHTML = inner
      ? `<div style="background:var(--bg-elevated,rgba(255,255,255,.04));
          border-radius:.5rem;padding:.75rem">
          <div style="font-size:var(--fs-caption);font-weight:700;color:var(--gold);
            text-transform:uppercase;letter-spacing:.07em;margin-bottom:.5rem">
            Isi Penilaian</div>
          ${inner}</div>`
      : '';
  }

  function wireBodyInstrumen(container) {
    if (!container) return;

    container.addEventListener('change', e => {
      // Siswa picker: pilih siswa → tambah chip
      if (e.target.classList.contains('pai-sw-sel')) {
        const sid    = e.target.value;
        if (!sid) return;
        const picker = e.target.closest('.pai-sw-picker');
        if (!picker) return;
        if (picker.querySelector(`.pai-sw-chip[data-sid="${sid}"]`)) {
          e.target.value = '';
          return;
        }
        const stu = _roster.find(r => r.id === sid);
        if (!stu) return;
        picker.querySelector('.pai-sw-chips')
          ?.insertAdjacentHTML('beforeend', chipSiswaHtml(sid, stu.nama));
        // Eksklusif: TES & TES_LISAN — satu siswa hanya boleh di satu deskriptor/predikat
        const isEksklusif = picker.closest('.pai-tl-dsk-block, .pai-tl-pred-block');
        if (isEksklusif) {
          container.querySelectorAll('.pai-sw-picker').forEach(otherPicker => {
            if (otherPicker === picker) return;
            const dupChip = otherPicker.querySelector(`.pai-sw-chip[data-sid="${sid}"]`);
            if (dupChip) {
              const dupOpt = otherPicker.querySelector(`.pai-sw-sel option[value="${sid}"]`);
              if (dupOpt) dupOpt.style.display = '';
              dupChip.remove();
            }
          });
        }
        const opt = e.target.querySelector(`option[value="${sid}"]`);
        if (opt) opt.style.display = 'none';
        e.target.value = '';
        return;
      }

      // Anekdot mode toggle → re-render catatan rows
      if (e.target.id === 'pai-anekdot-mode') {
        const modePerSiswa = e.target.value === 'per_siswa';
        const rowsDiv = container.querySelector('#pai-anekdot-rows');
        if (!rowsDiv) return;
        const n = rowsDiv.querySelectorAll('.pai-anekdot-row').length || 1;
        rowsDiv.innerHTML = Array.from({ length: n }, (_, i) =>
          anekdotCatatanHtml(i, modePerSiswa)
        ).join('');
      }
    });

    container.addEventListener('click', e => {
      // Chip siswa: klik → hapus
      const chip = e.target.closest('.pai-sw-chip');
      if (chip && container.contains(chip)) {
        const sid    = chip.dataset.sid;
        const picker = chip.closest('.pai-sw-picker');
        if (picker) {
          const opt = picker.querySelector(`.pai-sw-sel option[value="${sid}"]`);
          if (opt) opt.style.display = '';
        }
        chip.remove();
        return;
      }

      const tgt = e.target.closest('button');
      if (!tgt) return;

      if (tgt.classList.contains('btn-tambah-aspek')) {
        const d = container.querySelector('#pai-rubrik-aspeks');
        if (d) d.insertAdjacentHTML('beforeend',
          aspekRowHtml(d.querySelectorAll('.pai-aspek-row').length));
        return;
      }
      if (tgt.classList.contains('btn-del-aspek')) {
        tgt.closest('.pai-aspek-row')?.remove(); return;
      }
      if (tgt.classList.contains('btn-tambah-item')) {
        const d = container.querySelector('#pai-cl-items');
        if (d) d.insertAdjacentHTML('beforeend',
          checklistItemHtml(d.querySelectorAll('.pai-item-row').length));
        return;
      }
      if (tgt.classList.contains('btn-del-item')) {
        tgt.closest('.pai-item-row')?.remove(); return;
      }
      if (tgt.classList.contains('btn-tambah-obs-aspek')) {
        const d = container.querySelector('#pai-obs-aspeks');
        if (d) d.insertAdjacentHTML('beforeend',
          observasiAspekHtml(d.querySelectorAll('.pai-obs-aspek').length));
        return;
      }
      if (tgt.classList.contains('btn-del-obs-aspek')) {
        tgt.closest('.pai-obs-aspek')?.remove(); return;
      }
      if (tgt.classList.contains('btn-tambah-catatan')) {
        const d   = container.querySelector('#pai-anekdot-rows');
        const mode = container.querySelector('#pai-anekdot-mode')?.value;
        if (d) d.insertAdjacentHTML('beforeend',
          anekdotCatatanHtml(d.querySelectorAll('.pai-anekdot-row').length,
            !mode || mode === 'per_siswa'));
        return;
      }
      if (tgt.classList.contains('btn-del-catatan')) {
        tgt.closest('.pai-anekdot-row')?.remove(); return;
      }
      if (tgt.classList.contains('btn-tambah-pg-soal')) {
        const d = container.querySelector('#pai-pg-soals');
        if (d) d.insertAdjacentHTML('beforeend',
          pgSoalHtml(d.querySelectorAll('.pai-pg-soal').length));
        return;
      }
      if (tgt.classList.contains('btn-del-pg-soal')) {
        tgt.closest('.pai-pg-soal')?.remove(); return;
      }
      if (tgt.classList.contains('btn-tambah-uraian-soal')) {
        const d = container.querySelector('#pai-uraian-soals');
        if (d) d.insertAdjacentHTML('beforeend',
          uraianSoalHtml(d.querySelectorAll('.pai-uraian-soal').length));
        return;
      }
      if (tgt.classList.contains('btn-del-uraian-soal')) {
        tgt.closest('.pai-uraian-soal')?.remove(); return;
      }
      if (tgt.classList.contains('btn-tambah-mix-pg')) {
        const d = container.querySelector('#pai-mix-pg-soals');
        if (d) d.insertAdjacentHTML('beforeend',
          pgSoalHtml(d.querySelectorAll('.pai-pg-soal').length));
        return;
      }
      if (tgt.classList.contains('btn-tambah-mix-ur')) {
        const d = container.querySelector('#pai-mix-ur-soals');
        if (d) d.insertAdjacentHTML('beforeend',
          uraianSoalHtml(d.querySelectorAll('.pai-uraian-soal').length));
        return;
      }
    });
  }

  function prefillBodyInstrumen(container, konten, teknik, instrumen) {
    if (!container || !konten || !teknik || !instrumen) return;

    function fillPicker(pickerEl, sids) {
      if (!pickerEl || !Array.isArray(sids)) return;
      const chips = pickerEl.querySelector('.pai-sw-chips');
      const sel   = pickerEl.querySelector('.pai-sw-sel');
      if (!chips) return;
      for (const sid of sids) {
        const stu = _roster.find(r => r.id === sid);
        if (!stu) continue;
        if (chips.querySelector(`.pai-sw-chip[data-sid="${sid}"]`)) continue;
        chips.insertAdjacentHTML('beforeend', chipSiswaHtml(sid, stu.nama));
        if (sel) {
          const opt = sel.querySelector(`option[value="${sid}"]`);
          if (opt) opt.style.display = 'none';
        }
      }
    }

    if (teknik === 'OBSERVASI') {
      if (instrumen === 'Lembar Observasi' && Array.isArray(konten.aspeks)) {
        const aspekEls = container.querySelectorAll('.pai-obs-aspek');
        konten.aspeks.forEach((a, i) => {
          const el = aspekEls[i];
          if (!el) return;
          const nameIn = el.querySelector('.obs-aspek-nama');
          if (nameIn) nameIn.value = a.nama || '';
          const indIn = el.querySelector('.obs-indikator');
          if (indIn) indIn.value = a.indikator || '';
          const pickers = el.querySelectorAll('.pai-sw-picker');
          fillPicker(pickers[0], a.terlihat_jelas);
          fillPicker(pickers[1], a.terlihat);
          fillPicker(pickers[2], a.belum_terlihat);
        });
      } else if (instrumen === 'Catatan Anekdot') {
        const modeEl = container.querySelector('#pai-anekdot-mode');
        if (modeEl && konten.mode) modeEl.value = konten.mode;
        const modePerSiswa = (konten.mode || 'per_siswa') === 'per_siswa';

        if (Array.isArray(konten.catatan) && konten.catatan.length > 0) {
          const rowsDiv = container.querySelector('#pai-anekdot-rows');
          if (rowsDiv) {
            rowsDiv.innerHTML = konten.catatan
              .map((_, i) => anekdotCatatanHtml(i, modePerSiswa)).join('');
            konten.catatan.forEach((c, i) => {
              const row = rowsDiv.querySelectorAll('.pai-anekdot-row')[i];
              if (!row) return;
              const deskEl = row.querySelector('.anekdot-deskripsi');
              if (deskEl) deskEl.value = c.deskripsi || '';
              const interEl = row.querySelector('.anekdot-interpretasi');
              if (interEl) interEl.value = c.interpretasi || '';
              if (modePerSiswa) {
                const siswaEl = row.querySelector('.anekdot-siswa-sel');
                if (siswaEl && c.siswa) siswaEl.value = c.siswa;
              } else {
                fillPicker(row.querySelector('.pai-sw-picker'), c.siswa);
              }
            });
          }
        }
      } else if (instrumen === 'Checklist' && Array.isArray(konten.items)) {
        const itemsDiv = container.querySelector('#pai-cl-items');
        if (itemsDiv) {
          itemsDiv.innerHTML = konten.items
            .map((_, i) => checklistItemHtml(i)).join('');
          konten.items.forEach((it, i) => {
            const row = itemsDiv.querySelectorAll('.pai-item-row')[i];
            if (!row) return;
            const namaEl = row.querySelector('.item-nama');
            if (namaEl) namaEl.value = it.nama || '';
            fillPicker(row.querySelector('.pai-sw-picker'), it.siswa);
          });
        }
      }
    } else if (teknik === 'TES' && Array.isArray(konten.deskriptor)) {
      const blocks = container.querySelectorAll('.pai-tl-dsk-block');
      konten.deskriptor.forEach((d, i) => {
        fillPicker(blocks[i]?.querySelector('.pai-sw-picker'), d.siswa);
      });
    } else if (teknik === 'TES_LISAN') {
      const topikEl = container.querySelector('#pai-tl-topik');
      if (topikEl && konten.topik) topikEl.value = konten.topik;
      if (instrumen === 'Wawancara' && Array.isArray(konten.deskriptor)) {
        const blocks = container.querySelectorAll('.pai-tl-dsk-block');
        konten.deskriptor.forEach((d, i) => {
          fillPicker(blocks[i]?.querySelector('.pai-sw-picker'), d.siswa);
        });
      } else if (Array.isArray(konten.predikat)) {
        const predPickers = Array.from(
          container.querySelectorAll('.pai-tl-pred-block .pai-sw-picker')
        );
        konten.predikat.forEach((p, i) => {
          const deskEl = container.querySelector(`.tl-pred-desk-${p.val}`);
          if (deskEl) deskEl.value = p.deskripsi || '';
          fillPicker(predPickers[i], p.siswa);
        });
      }
    } else if (['PENUGASAN','PROYEK','PORTOFOLIO','UNJUK_KERJA'].includes(teknik)) {
      const k1 = container.querySelector('#pai-konteks-1');
      if (k1 && konten.konteks1) k1.value = konten.konteks1;
      const k2 = container.querySelector('#pai-konteks-2');
      if (k2 && konten.konteks2) k2.value = konten.konteks2;
      if (instrumen === 'Rubrik' && Array.isArray(konten.aspeks)) {
        const aspeksDiv = container.querySelector('#pai-rubrik-aspeks');
        if (aspeksDiv) {
          aspeksDiv.innerHTML = konten.aspeks.map((_, i) => aspekRowHtml(i)).join('');
          konten.aspeks.forEach((a, i) => {
            const row = aspeksDiv.querySelectorAll('.pai-aspek-row')[i];
            if (!row) return;
            const namaEl = row.querySelector('.aspek-nama');
            if (namaEl) namaEl.value = a.nama || '';
            const pickers = row.querySelectorAll('.pai-sw-picker');
            (a.predikat || []).forEach((p, j) => {
              const deskEl = row.querySelector(`.predikat-desk-${p.val}`);
              if (deskEl) deskEl.value = p.deskripsi || '';
              fillPicker(pickers[j], p.siswa);
            });
          });
        }
      } else if (instrumen === 'Checklist' && Array.isArray(konten.items)) {
        const itemsDiv = container.querySelector('#pai-cl-items');
        if (itemsDiv) {
          itemsDiv.innerHTML = konten.items.map((_, i) => checklistItemHtml(i)).join('');
          konten.items.forEach((it, i) => {
            const row = itemsDiv.querySelectorAll('.pai-item-row')[i];
            if (!row) return;
            const namaEl = row.querySelector('.item-nama');
            if (namaEl) namaEl.value = it.nama || '';
            fillPicker(row.querySelector('.pai-sw-picker'), it.siswa);
          });
        }
      }
    }
  }

  function collectBodyInstrumen(container, teknik, instrumen) {
    if (!container || !teknik || !instrumen) return null;
    const data = {};

    function getSiswaOfPicker(pickerEl) {
      return Array.from(pickerEl?.querySelectorAll('.pai-sw-chip') ?? [])
        .map(c => c.dataset.sid).filter(Boolean);
    }

    if (teknik === 'OBSERVASI') {
      if (instrumen === 'Lembar Observasi') {
        data.aspeks = Array.from(container.querySelectorAll('.pai-obs-aspek')).map(a => {
          const pickers = a.querySelectorAll('.pai-sw-picker');
          return {
            nama:          a.querySelector('.obs-aspek-nama')?.value.trim() || '',
            indikator:     a.querySelector('.obs-indikator')?.value.trim()  || null,
            terlihat_jelas: getSiswaOfPicker(pickers[0]),
            terlihat:       getSiswaOfPicker(pickers[1]),
            belum_terlihat: getSiswaOfPicker(pickers[2]),
          };
        });
      } else if (instrumen === 'Catatan Anekdot') {
        const mode = container.querySelector('#pai-anekdot-mode')?.value || 'per_siswa';
        data.mode   = mode;
        data.catatan = Array.from(container.querySelectorAll('.pai-anekdot-row')).map(r => ({
          siswa: mode === 'per_siswa'
            ? (r.querySelector('.anekdot-siswa-sel')?.value || null)
            : getSiswaOfPicker(r.querySelector('.pai-sw-picker')),
          deskripsi:    r.querySelector('.anekdot-deskripsi')?.value.trim()    || '',
          interpretasi: r.querySelector('.anekdot-interpretasi')?.value.trim() || null,
        }));
      } else if (instrumen === 'Checklist') {
        data.items = Array.from(container.querySelectorAll('.pai-item-row')).map(r => ({
          nama:  r.querySelector('.item-nama')?.value.trim() || '',
          siswa: getSiswaOfPicker(r.querySelector('.pai-sw-picker')),
        }));
      }
    } else if (teknik === 'TES') {
      const labels = ['Menjawab dengan baik', 'Menjawab sebagian', 'Belum bisa menjawab'];
      data.deskriptor = Array.from(container.querySelectorAll('.pai-tl-dsk-block')).map((b, i) => ({
        label: labels[i] ?? '',
        siswa: getSiswaOfPicker(b.querySelector('.pai-sw-picker')),
      }));
    } else if (teknik === 'TES_LISAN') {
      data.topik = container.querySelector('#pai-tl-topik')?.value.trim() || null;
      if (instrumen === 'Wawancara') {
        const labels = ['Menjawab dengan baik', 'Menjawab sebagian', 'Belum bisa menjawab'];
        data.deskriptor = Array.from(container.querySelectorAll('.pai-tl-dsk-block')).map((b, i) => ({
          label: labels[i] ?? '',
          siswa: getSiswaOfPicker(b.querySelector('.pai-sw-picker')),
        }));
      } else {
        data.predikat = PREDIKAT_RUBRIK.map((p, i) => ({
          val:      p.val,
          label:    p.lbl,
          deskripsi: container.querySelector(`.tl-pred-desk-${p.val}`)?.value.trim() || null,
          siswa:    getSiswaOfPicker(
            Array.from(container.querySelectorAll('.pai-tl-pred-block .pai-sw-picker'))[i]
          ),
        }));
      }
    } else if (['PENUGASAN','PROYEK','PORTOFOLIO','UNJUK_KERJA'].includes(teknik)) {
      data.konteks1 = container.querySelector('#pai-konteks-1')?.value.trim() || null;
      data.konteks2 = container.querySelector('#pai-konteks-2')?.value.trim() || null;
      if (instrumen === 'Rubrik') {
        data.aspeks = Array.from(container.querySelectorAll('.pai-aspek-row')).map(a => ({
          nama: a.querySelector('.aspek-nama')?.value.trim() || '',
          predikat: PREDIKAT_RUBRIK.map((p, i) => ({
            val:      p.val,
            label:    p.lbl,
            deskripsi: a.querySelector(`.predikat-desk-${p.val}`)?.value.trim() || null,
            siswa:    getSiswaOfPicker(a.querySelectorAll('.pai-sw-picker')[i]),
          })),
        }));
      } else if (instrumen === 'Checklist') {
        data.items = Array.from(container.querySelectorAll('.pai-item-row')).map(r => ({
          nama:  r.querySelector('.item-nama')?.value.trim() || '',
          siswa: getSiswaOfPicker(r.querySelector('.pai-sw-picker')),
        }));
      }
    }

    return Object.keys(data).length ? data : null;
  }

  // ── buildResultPayload — ekstrak payload per-siswa dari DOM row ──────────────
  function namaSiswa(sid) {
    return _roster.find(s => s.id === sid)?.nama || 'siswa tanpa nama';
  }

  // Ringkasan kegagalan penyimpanan per siswa.
  //
  // Sebelumnya kegagalan ini ditelan `catch {}` kosong: guru mengisi nilai satu
  // kelas, jaringan putus di tengah, lalu tetap melihat toast "berhasil" —
  // dan baru tahu saat membuka kembali tabnya. Nama siswanya disebut supaya
  // jelas baris mana yang perlu diulang, dibatasi tiga agar tidak meluber.
  function pesanGagalSimpan(gagalNilai, gagalGrup) {
    const bagian = [];
    if (gagalNilai.length) {
      const nama   = gagalNilai.map(namaSiswa);
      const tampil = nama.slice(0, 3).join(', ');
      const sisa   = nama.length - 3;
      bagian.push(
        `Gagal menyimpan nilai untuk ${nama.length} siswa ` +
        `(${tampil}${sisa > 0 ? `, dan ${sisa} lainnya` : ''}).`);
    }
    if (gagalGrup.length) {
      bagian.push(`Gagal menyimpan grup diferensiasi untuk ${gagalGrup.length} siswa.`);
    }
    bagian.push('Penilaiannya sendiri sudah tersimpan. Silakan coba simpan lagi.');
    return bagian.join(' ');
  }

  function buildResultPayload(srow, jenis, kktpItems) {
    const payload = {};
    if (jenis === 'DIAGNOSTIK') {
      const chips = srow.querySelector('.stu-status-chips');
      const st    = chips ? chipVal(chips) : null;
      payload.status  = st;
      payload.catatan = srow.querySelector('.stu-catatan')?.value.trim() || null;
      if (st) payload.grup_diferensiasi = STATUS_GRUP[st];
    } else if (jenis === 'FORMATIF') {
      const chips = srow.querySelector('.stu-status-chips');
      payload.status        = chips ? chipVal(chips) : null;
      payload.umpan_balik   = srow.querySelector('.stu-umpan-balik')?.value.trim()   || null;
      payload.tindak_lanjut = srow.querySelector('.stu-tindak-lanjut')?.value.trim() || null;
    } else {
      const raw = srow.querySelector('.stu-nilai')?.value;
      const val = raw !== '' ? parseFloat(raw) : null;
      payload.nilai         = isNaN(val) ? null : val;
      payload.tindak_lanjut = chipVal(srow.querySelector('.stu-tl-chips')) || null;
      const kktp = kktpItems[0];
      if (kktp && val != null && !isNaN(val)) {
        const p = getPredikat(val, getRentang(kktp));
        payload.kktp_tercapai = p === 'BSH' || p === 'SB';
      }
    }
    return payload;
  }

  // ── openAsmtCreateModal — modal tambah penilaian (42 pola wireframe) ─────────
  function openAsmtCreateModal() {
    const isWali = _roleGuru === 'WALI_KELAS_SD';
    let selJenis  = 'FORMATIF';
    let selTeknik    = '';
    let selInstrumen = '';
    let selMapel     = _selMapel ?? _classroomMapelKey ?? MAPEL_SD[0]; // hanya dipakai jika isWali

    // helper: bangun opsi TP berdasarkan mapel yang dipilih (jika wali)
    function buildTpOptHtml() {
      const candidates = _tpList.filter(t => {
        if (t.tipe !== 'TP') return false;
        if (!isWali) return true;
        // TP tanpa mapel (data lama) → tetap muncul di semua mapel
        return !t.mapel || t.mapel === selMapel;
      });
      return [
        `<option value="">— Opsional —</option>`,
        ...candidates.map(t => {
          const hasKktp = _tpList.some(k => k.parent_id === t.id && k.tipe === 'KKTP');
          return `<option value="${t.id}">${esc(t.judul)} ${hasKktp ? '✓' : '⚠'}</option>`;
        }),
      ].join('');
    }

    const teknikOptHtml = ['', 'OBSERVASI', 'TES', 'PENUGASAN', 'PROYEK', 'PORTOFOLIO', 'UNJUK_KERJA', 'TES_LISAN']
      .map(t => `<option value="${t}">${t ? teknikLbl(t) : '— Teknik (opsional) —'}</option>`)
      .join('');

    const mapelChipsHtml = isWali
      ? `<div>
          ${fieldLbl('Mata Pelajaran')}
          <select id="asmt-mapel-sel" style="${inputCss()}">
            ${MAPEL_SD.map(m => `<option value="${esc(m)}"${m === selMapel ? ' selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </div>`
      : '';

    el('pai-modal-box').innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
  <h3 style="margin:0;color:var(--gold)">Tambah Penilaian</h3>
  <button data-action="close-modal"
    style="background:transparent;border:none;cursor:pointer;font-size:1.25rem;
    padding:.2rem .35rem;border-radius:.25rem;line-height:1;opacity:.7">×</button>
</div>
<div style="display:flex;flex-direction:column;gap:.875rem">
  ${mapelChipsHtml}
  <div>
    ${fieldLbl('Tujuan penilaian')}
    <textarea id="asmt-tujuan" rows="2"
      style="${inputCss('resize:vertical')}"
      placeholder="Apa yang ingin diketahui/dipantau?"></textarea>
  </div>
  <div>
    ${fieldLbl('TP yang dinilai')}
    <select id="asmt-tp-sel" style="${inputCss()}">${buildTpOptHtml()}</select>
  </div>
  <div>
    ${fieldLbl('Jenis penilaian')}
    <select id="asmt-jenis-sel" style="${inputCss()}">
      ${['DIAGNOSTIK', 'FORMATIF', 'SUMATIF'].map(j => `<option value="${j}"${selJenis === j ? ' selected' : ''}>${JENIS_LBL[j]}</option>`).join('')}
    </select>
  </div>
  <div>
    ${fieldLbl('Teknik')}
    <select id="asmt-teknik-sel" style="${inputCss()}">${teknikOptHtml}</select>
  </div>
  <div id="asmt-instr-row" style="display:none">
    ${fieldLbl('Instrumen')}
    <select id="asmt-instr-sel" style="${inputCss()}">
      <option value="">— Pilih —</option>
    </select>
  </div>
  <div id="asmt-body-instr-wrap" class="pai-body-instr-wrap"></div>
  <div id="asmt-output-wrap" style="${selJenis === 'SUMATIF' ? '' : 'display:none'}">
    <div style="font-size:var(--fs-caption);font-weight:700;color:var(--gold);
      text-transform:uppercase;letter-spacing:.07em;margin-bottom:.5rem">Catat Nilai</div>
    <div id="asmt-sum-names" style="display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.375rem"></div>
    <div id="asmt-sum-nav"
      style="display:none;align-items:center;gap:.5rem;margin-bottom:.375rem">
      <button type="button" id="asmt-sum-prev"
        style="background:transparent;border:1px solid var(--border-subtle,rgba(255,255,255,.18));
        color:var(--text-secondary);border-radius:.3rem;padding:.15rem .5rem;cursor:pointer;
        font-size:var(--fs-caption)">←</button>
      <span id="asmt-sum-page-lbl"
        style="font-size:var(--fs-caption);color:var(--text-secondary)"></span>
      <button type="button" id="asmt-sum-next"
        style="background:transparent;border:1px solid var(--border-subtle,rgba(255,255,255,.18));
        color:var(--text-secondary);border-radius:.3rem;padding:.15rem .5rem;cursor:pointer;
        font-size:var(--fs-caption)">→</button>
    </div>
    <div id="asmt-sum-dots"
      style="display:flex;gap:.35rem;margin-bottom:.625rem;min-height:.625rem"></div>
    <div id="asmt-sum-input"
      style="display:none;border:1px solid var(--border-subtle,rgba(255,255,255,.18));
      border-radius:.4rem;padding:.625rem .75rem"></div>
  </div>
  <div>
    ${fieldLbl('Refleksi guru (opsional)')}
    <textarea id="asmt-refleksi" rows="2"
      style="${inputCss('resize:vertical')}"
      placeholder="Catatan refleksi…"></textarea>
  </div>
  ${visPenilaianHtml(null, selJenis)}
  <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:.25rem">
    <button data-action="close-modal"
      style="min-height:var(--btn-h);background:transparent;color:var(--gold);
      border:1.5px solid var(--gold-border);font-size:var(--fs-ui);
      padding:0 var(--btn-px);border-radius:var(--btn-r);cursor:pointer">Batal</button>
    <button id="btn-asmt-save"
      style="padding:.5rem 1.25rem;background:var(--gold);
      color:var(--text-on-gold,#000);border:none;border-radius:.375rem;
      font-weight:600;cursor:pointer">Simpan Penilaian</button>
  </div>
  <div id="asmt-err"
    style="color:#e74c3c;font-size:var(--fs-caption);display:none"></div>
</div>`;

    const bodyInstrWrap = el('asmt-body-instr-wrap');
    wireBodyInstrumen(bodyInstrWrap);

    // ── Wire Mapel dropdown (WALI_KELAS_SD only) → cascade filter TP dropdown ──
    if (isWali) {
      el('asmt-mapel-sel')?.addEventListener('change', function () {
        selMapel = this.value;
        el('asmt-tp-sel').innerHTML = buildTpOptHtml();
      });
    }

    // ── Wire Jenis dropdown ──────────────────────────────────────────────
    el('asmt-jenis-sel').addEventListener('change', function () {
      selJenis = this.value;
      const outputWrap = el('asmt-output-wrap');
      if (selJenis === 'SUMATIF') {
        if (outputWrap) outputWrap.style.display = '';
        bodyInstrWrap.innerHTML = '';
        renderSumPage();
      } else {
        if (outputWrap) outputWrap.style.display = 'none';
        renderBodyInstrumen(selTeknik, selInstrumen, bodyInstrWrap);
      }
    });

    // ── Wire Teknik cascade → instrumen → body instrumen ─────────────────
    el('asmt-teknik-sel').addEventListener('change', function () {
      selTeknik    = this.value;
      selInstrumen = '';
      const opts     = selTeknik ? (INSTRUMEN_MAP[selTeknik] || []) : [];
      const instrRow = el('asmt-instr-row');
      const instrSel = el('asmt-instr-sel');
      if (opts.length) {
        instrSel.innerHTML = `<option value="">— Pilih —</option>` +
          opts.map(i => `<option value="${i}">${i}</option>`).join('');
        instrRow.style.display = '';
        instrSel.onchange = function () {
          selInstrumen = this.value;
          if (selJenis !== 'SUMATIF')
            renderBodyInstrumen(selTeknik, selInstrumen, bodyInstrWrap);
        };
      } else {
        instrRow.style.display = 'none';
      }
      if (selJenis === 'SUMATIF') {
        bodyInstrWrap.innerHTML = '';
        flushSumActive();
        _sumActiveSid = null;
        renderSumPage();
      } else {
        renderBodyInstrumen(selTeknik, '', bodyInstrWrap);
      }
    });

    // ── SUMATIF pagination state ─────────────────────────────────────────
    const PAGE_SIZE   = 5;
    let _sumPage      = 0;
    let _sumActiveSid = null;
    const _sumNilai   = {};
    // Mulai kosong: penilaiannya belum ada, jadi belum ada baris hasil sama
    // sekali. Simpan pertama mengisinya; percobaan simpan berikutnya di modal
    // yang sama (row sudah terbuat) memakainya untuk mengenali baris yang ada.
    const _rowUpserted = new Set();

    function flushSumActive() {
      if (!_sumActiveSid) return;
      const tlEl  = el('asmt-sum-tl');
      const isTes = !selTeknik || selTeknik === 'TES';
      if (isTes) {
        const nilaiEl = el('asmt-sum-nilai');
        const raw     = nilaiEl?.value;
        const n       = raw !== '' && raw != null ? parseFloat(raw) : null;
        _sumNilai[_sumActiveSid] = {
          nilai: isNaN(n) ? null : n,
          tl:    tlEl ? chipVal(tlEl) : null,
        };
      } else {
        const predChipsEl = el('asmt-sum-pred-chips');
        const selPred     = predChipsEl ? chipVal(predChipsEl) : null;
        const kktp        = getKktpItems()[0];
        const rent        = kktp ? getRentang(kktp) : null;
        const autoN       = selPred && rent ? nilaiTengah(selPred, rent) : null;
        _sumNilai[_sumActiveSid] = {
          predikat: selPred,
          nilai:    autoN,
          tl:       tlEl ? chipVal(tlEl) : null,
        };
      }
    }

    function renderSumInput() {
      const inputEl = el('asmt-sum-input');
      if (!_sumActiveSid) { if (inputEl) inputEl.style.display = 'none'; return; }
      const stu   = _roster.find(r => r.id === _sumActiveSid);
      const vals  = _sumNilai[_sumActiveSid] ?? {};
      const kktp  = getKktpItems()[0];
      const rent  = kktp ? getRentang(kktp) : null;
      const isTes = !selTeknik || selTeknik === 'TES';

      const namaHtml = `<div style="font-size:var(--fs-ui);font-weight:600;margin-bottom:.5rem">
        ${esc(stu?.nama ?? '')}</div>`;

      let valorHtml;
      if (isTes) {
        const kktpColor = kktp && vals.nilai != null ? kktpStatColor(vals.nilai, rent) : 'var(--text-secondary)';
        const kktpStr   = kktp && vals.nilai != null ? kktpStatText(vals.nilai, rent) : '';
        valorHtml = `
<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.375rem">
  <input type="number" id="asmt-sum-nilai" min="0" max="100" step="0.5"
    placeholder="Nilai 0–100"
    value="${vals.nilai != null ? String(vals.nilai) : ''}"
    style="${inputCss('width:7rem;font-size:var(--fs-caption)')}">
  <span id="asmt-sum-kktp"
    style="font-size:var(--fs-caption);color:${kktpColor}">${kktpStr}</span>
</div>`;
      } else {
        const selPred   = vals.predikat ?? null;
        const autoN     = selPred && rent ? nilaiTengah(selPred, rent) : null;
        const kktpColor = autoN != null ? kktpStatColor(autoN, rent) : 'var(--text-secondary)';
        const kktpStr   = kktp
          ? (autoN != null ? kktpStatText(autoN, rent) : 'Pilih predikat')
          : '';
        valorHtml = `
<div style="margin-bottom:.375rem">
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.25rem">Predikat:</div>
  <div id="asmt-sum-pred-chips" style="display:flex;flex-wrap:wrap;gap:.35rem">
    ${PREDIKAT_ORDER.map(p => chipHtml(p, p, selPred === p)).join('')}
  </div>
  <div style="margin-top:.375rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
    <span style="font-size:var(--fs-caption);color:var(--text-secondary)">Nilai:</span>
    <span id="asmt-sum-pred-nilai"
      style="font-size:var(--fs-ui);font-weight:600;min-width:2rem">
      ${autoN != null ? autoN : '—'}</span>
    <span id="asmt-sum-kktp"
      style="font-size:var(--fs-caption);color:${kktpColor}">${kktpStr}</span>
  </div>
</div>`;
      }

      const tlHtml = `
<div>
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.25rem">
    Tindak lanjut:</div>
  <div id="asmt-sum-tl" style="display:flex;flex-wrap:wrap;gap:.35rem">
    ${[['PENGAYAAN','Pengayaan'],['PENGUATAN','Penguatan'],['PENDAMPINGAN','Pendampingan']].map(([v,l]) => chipHtml(v, l, vals.tl === v)).join('')}
  </div>
</div>`;

      inputEl.innerHTML = namaHtml + valorHtml + tlHtml;
      inputEl.style.display = '';

      if (isTes) {
        el('asmt-sum-nilai')?.addEventListener('input', function () {
          const kktp2  = getKktpItems()[0];
          const kktpEl = el('asmt-sum-kktp');
          if (!kktpEl) return;
          const n     = this.value === '' ? null : parseFloat(this.value);
          const rent2 = kktp2 ? getRentang(kktp2) : null;
          kktpEl.textContent = kktp2 ? kktpStatText(n, rent2) : '';
          kktpEl.style.color = kktp2 ? kktpStatColor(n, rent2) : 'var(--text-secondary)';
        });
      } else {
        const predChipsEl = el('asmt-sum-pred-chips');
        if (predChipsEl) {
          wireChips(predChipsEl, false, selVal => {
            const kktp2   = getKktpItems()[0];
            const rent2   = kktp2 ? getRentang(kktp2) : null;
            const autoN2  = rent2 ? nilaiTengah(selVal, rent2) : null;
            const nilaiEl = el('asmt-sum-pred-nilai');
            const kktpEl  = el('asmt-sum-kktp');
            if (nilaiEl) nilaiEl.textContent = autoN2 != null ? String(autoN2) : '—';
            if (kktpEl) {
              kktpEl.textContent = autoN2 != null && kktp2 ? kktpStatText(autoN2, rent2) : '';
              kktpEl.style.color = autoN2 != null ? kktpStatColor(autoN2, rent2) : 'var(--text-secondary)';
            }
          });
        }
      }

      wireChips(el('asmt-sum-tl'), false);
    }

    function renderSumPage() {
      const names   = el('asmt-sum-names');
      const nav     = el('asmt-sum-nav');
      const pageLbl = el('asmt-sum-page-lbl');
      const dots    = el('asmt-sum-dots');
      if (!names) return;
      const total = _roster.length;
      const pages = Math.ceil(total / PAGE_SIZE) || 1;
      _sumPage    = Math.max(0, Math.min(_sumPage, pages - 1));
      const slice = _roster.slice(_sumPage * PAGE_SIZE, (_sumPage + 1) * PAGE_SIZE);
      names.innerHTML = slice.map(s => {
        const isAct  = s.id === _sumActiveSid;
        const hasVal = _sumNilai[s.id]?.nilai != null || _sumNilai[s.id]?.predikat != null;
        return `<button type="button" data-sum-sid="${esc(s.id)}"
          style="padding:.3rem .7rem;border-radius:1rem;font-size:var(--fs-caption);cursor:pointer;
          border:1.5px solid ${isAct ? 'var(--gold)' : hasVal ? 'rgba(255,255,255,.4)' : 'var(--border-subtle,rgba(255,255,255,.18))'};
          background:${isAct ? 'var(--gold)' : 'transparent'};
          color:${isAct ? 'var(--text-on-gold,#000)' : hasVal ? 'var(--text-primary)' : 'var(--text-secondary)'}">
          ${esc(s.nama)}${hasVal ? ' ✓' : ''}</button>`;
      }).join('');
      names.querySelectorAll('[data-sum-sid]').forEach(btn => {
        btn.addEventListener('click', () => {
          flushSumActive();
          _sumActiveSid = btn.dataset.sumSid;
          renderSumPage();
        });
      });
      if (pages > 1) {
        nav.style.display = 'flex';
        if (pageLbl) pageLbl.textContent = `halaman ${_sumPage + 1}/${pages}`;
        const prevBtn = el('asmt-sum-prev');
        const nextBtn = el('asmt-sum-next');
        if (prevBtn) prevBtn.disabled = _sumPage === 0;
        if (nextBtn) nextBtn.disabled = _sumPage === pages - 1;
      } else {
        nav.style.display = 'none';
      }
      if (dots) {
        dots.innerHTML = pages > 1
          ? Array.from({length: pages}, (_, i) =>
              `<span style="width:.5rem;height:.5rem;border-radius:50%;display:inline-block;
              background:${i === _sumPage ? 'var(--gold)' : 'var(--border-subtle,rgba(255,255,255,.3))'}"></span>`
            ).join('')
          : '';
      }
      if (_sumActiveSid && !slice.some(s => s.id === _sumActiveSid)) _sumActiveSid = null;
      renderSumInput();
    }

    // ── Helpers ──────────────────────────────────────────────────────────
    function getKktpItems() {
      const tpId = el('asmt-tp-sel')?.value || null;
      return tpId ? _tpList.filter(t => t.parent_id === tpId && t.tipe === 'KKTP') : [];
    }

    // ── Wire TP change ───────────────────────────────────────────────────
    el('asmt-tp-sel').addEventListener('change', () => { renderSumInput(); });

    // ── Wire pagination buttons ──────────────────────────────────────────
    el('asmt-sum-prev')?.addEventListener('click', () => {
      flushSumActive(); _sumPage--; renderSumPage();
    });
    el('asmt-sum-next')?.addEventListener('click', () => {
      flushSumActive(); _sumPage++; renderSumPage();
    });

    // Nilai input + TL chips diwire per-render di renderSumInput()

    // ── Initial render ────────────────────────────────────────────────────
    if (selJenis === 'SUMATIF') renderSumPage();

    // ── Save ─────────────────────────────────────────────────────────────
    // Penilaian yang sudah terbuat pada percobaan sebelumnya. Modal kini tetap
    // terbuka bila ada baris nilai yang gagal, sehingga Simpan dapat ditekan
    // lagi — tanpa penanda ini, percobaan kedua akan membuat penilaian kedua.
    let _rowTerbuat = null;
    el('btn-asmt-save').addEventListener('click', async () => {
      const errEl     = el('asmt-err');
      const instrBody = collectBodyInstrumen(bodyInstrWrap, selTeknik, selInstrumen);
      const payload = {
        tp_kktp_id:    el('asmt-tp-sel').value || null,
        jenis:         selJenis,
        teknik:        selTeknik || null,
        instrumen:     selInstrumen || null,
        tujuan:        el('asmt-tujuan').value.trim() || null,
        konten:        instrBody || null,
        refleksi_guru: el('asmt-refleksi').value.trim() || null,
        is_visible_siswa: !!el('asmt-vis-siswa')?.checked,
        is_visible_ortu:  !!el('asmt-vis-ortu')?.checked,
      };
      if (_nilaiSedangDisimpan) return;
      _nilaiSedangDisimpan = true;
      const btnSave   = el('btn-asmt-save');
      const labelAsli = btnSave.textContent;
      btnSave.disabled    = true;
      btnSave.textContent = 'Menyimpan…';
      errEl.style.display = 'none';
      try {
        let row = _rowTerbuat;
        if (!row) {
          row = await SipApi.createAssessment(_cId, _tId, payload);
          _rowTerbuat = row;
          _asmts.push(row);
        }
        const kktpItems  = getKktpItems();
        const gagalNilai = [];
        const gagalGrup  = [];
        if (selJenis === 'SUMATIF') {
          flushSumActive();
          for (const [sid, vals] of Object.entries(_sumNilai)) {
            const kosong = vals.nilai == null && !vals.predikat;
            // Kotak kosong tidak selalu berarti "lewati". Bila siswa itu sudah
            // punya baris hasil, mengosongkannya adalah perintah hapus dari guru
            // -- nilai null harus benar-benar terkirim, kalau tidak nilai lama
            // bertahan di DB dan tak ada cara menghapusnya lewat UI.
            //
            // Yang dilewati hanya siswa yang belum punya baris: bagi mereka kosong
            // berarti "memang belum dinilai", dan menulis baris null cuma menambah
            // baris kosong yang tidak pernah diminta siapa pun.
            if (kosong && !_rowUpserted.has(sid)) continue;
            const kktp       = kktpItems[0];
            const resPayload = { nilai: vals.nilai ?? null, tindak_lanjut: vals.tl || null };
            if (kosong) {
              // Nilai dihapus: kktp_tercapai ikut dikosongkan, bukan dijadikan
              // false. False berarti "sudah dinilai dan belum tercapai" -- klaim
              // yang tidak lagi punya dasar setelah nilainya dihapus.
              resPayload.kktp_tercapai = null;
            } else if (kktp) {
              const p = vals.nilai != null ? getPredikat(vals.nilai, getRentang(kktp)) : (vals.predikat || null);
              resPayload.kktp_tercapai = p === 'BSH' || p === 'SB';
            }
            try {
              await SipApi.upsertAssessmentResult(_cId, _tId, row.id, sid, resPayload);
              _rowUpserted.add(sid);
            } catch { gagalNilai.push(sid); }
          }
        } else {
          const srows = el('pai-modal-box').querySelectorAll('.pai-srow');
          for (const srow of srows) {
            const sid        = srow.dataset.sid;
            const resPayload = buildResultPayload(srow, selJenis, kktpItems);
            if (selJenis === 'DIAGNOSTIK' && resPayload.grup_diferensiasi) {
              try {
                await SipApi.upsertStudentGroup(_cId, sid, resPayload.grup_diferensiasi);
                _sGroups[sid] = resPayload.grup_diferensiasi;
              } catch { gagalGrup.push(sid); }
            }
            try { await SipApi.upsertAssessmentResult(_cId, _tId, row.id, sid, resPayload); }
            catch { gagalNilai.push(sid); }
          }
        }
        // Modal dibiarkan terbuka supaya nilai yang sudah diketik tidak hilang.
        // Penilaiannya sendiri sudah terbuat, jadi menekan Simpan lagi hanya
        // mengulang baris nilainya — upsert, bukan sisipan ganda.
        if (gagalNilai.length || gagalGrup.length) {
          throw new Error(pesanGagalSimpan(gagalNilai, gagalGrup));
        }
        // Sama seperti modal edit: menyimpan hasil sumatif membuat rekap lama
        // untuk TP itu basi. Relevan di sini karena modal ini bisa disimpan dua
        // kali, dan penilaiannya bisa memakai TP yang sudah punya rekap.
        let peringatanRekap = '';
        if (selJenis === 'SUMATIF' && row.tp_kktp_id) {
          try {
            await hapusRekapTp(row.tp_kktp_id);
          } catch (e) {
            console.error('gagal menghapus rekap basi', e);
            peringatanRekap = ' Rekap lama gagal dihapus — hitung ulang di Rekap Penilaian.';
          }
        }
        closeModal();
        renderAsmtList();
        toast('Penilaian berhasil dibuat.' + peringatanRekap);
      } catch (err) {
        errEl.textContent = err.message || 'Gagal menyimpan';
        errEl.style.display = '';
        btnSave.disabled = false;
      } finally {
        _nilaiSedangDisimpan = false;
        btnSave.textContent = labelAsli;
      }
    });

    openModal();
  }

  function studentRowHtml(student, res, jenis, kktpItems) {
    const grup = _sGroups[student.id] ?? res.grup_diferensiasi ?? '';
    const grupBadge = grup
      ? `<span style="font-size:.65rem;padding:.15rem .45rem;border-radius:.25rem;
          background:var(--gold);color:var(--text-on-gold,#000);font-weight:700">
          Grup ${grup}</span>`
      : '';

    let inputs = '';
    if (jenis === 'DIAGNOSTIK') {
      const stChips = ['PAHAM', 'BELUM_PAHAM', 'PERLU_PERHATIAN']
        .map(s => chipHtml(s, STATUS_LBL[s], res.status === s)).join('');
      inputs = `
<div class="stu-status-chips" style="display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:.4rem">
  ${stChips}
</div>
<input type="text" class="stu-catatan" placeholder="Catatan… (opsional)"
  value="${esc(res.catatan ?? '')}"
  style="${inputCss('font-size:var(--fs-caption);margin-top:.25rem')}">
<div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-top:.25rem">
  ${grup
    ? `Grup: <strong>${grup}</strong>`
    : 'Grup otomatis: A (Paham) / B (Belum Paham) / C (Perlu Perhatian)'}
</div>`;
    } else if (jenis === 'FORMATIF') {
      const stChips = ['TERCAPAI', 'BERKEMBANG', 'PERLU_DUKUNGAN']
        .map(s => chipHtml(s, STATUS_FORMATIF_LBL[s], res.status === s)).join('');
      inputs = `
<div class="stu-status-chips" style="display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:.4rem">
  ${stChips}
</div>
<input type="text" class="stu-umpan-balik" placeholder="Umpan balik… (opsional)"
  value="${esc(res.umpan_balik ?? '')}"
  style="${inputCss('font-size:var(--fs-caption);margin-top:.25rem')}">
<input type="text" class="stu-tindak-lanjut" placeholder="Tindak lanjut… (opsional)"
  value="${esc(res.tindak_lanjut ?? '')}"
  style="${inputCss('font-size:var(--fs-caption);margin-top:.25rem')}">`;
    } else {
      const kktp      = kktpItems[0];
      const rentang   = kktp ? getRentang(kktp) : null;
      const kktpColor = kktp ? kktpStatColor(res.nilai ?? null, rentang) : 'var(--text-secondary)';
      const kktpStr   = kktp ? kktpStatText(res.nilai ?? null, rentang)  : 'KKTP —';
      inputs = `
<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.4rem">
  <input type="number" class="stu-nilai" min="0" max="100" step="0.5"
    value="${res.nilai ?? ''}" placeholder="Nilai 0–100"
    style="${inputCss('width:7rem;font-size:var(--fs-caption)')}">
  ${kktp ? `<span class="stu-kktp-stat"
      style="font-size:var(--fs-caption);color:${kktpColor}">
      ${kktpStr}
    </span>` : ''}
</div>
<div style="margin-top:.375rem">
  <div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.25rem">
    Tindak lanjut:</div>
  <div class="stu-tl-chips" style="display:flex;flex-wrap:wrap;gap:.35rem">
    ${[['PENGAYAAN','Pengayaan'],['PENGUATAN','Penguatan'],['PENDAMPINGAN','Pendampingan']]
      .map(([v,l]) => chipHtml(v, l, res.tindak_lanjut === v)).join('')}
  </div>
</div>`;
    }

    return `
<div class="pai-srow" data-sid="${student.id}"
  style="border:1px solid var(--border-subtle,rgba(255,255,255,.12));
  border-radius:.4rem;padding:.625rem .75rem;margin-bottom:.375rem">
  <div style="display:flex;justify-content:space-between;
      align-items:center;margin-bottom:.375rem">
    <span style="font-size:var(--fs-ui);font-weight:var(--fw-medium,500)">
      ${esc(student.nama)}</span>
    ${grupBadge}
  </div>
  ${inputs}
</div>`;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 4 — Rekap Penilaian
  // ══════════════════════════════════════════════════════════════════════════════

  async function renderRecap() {
    const c = el('pai-recap-wrap');
    if (!c) return;
    // Semester dan tahun ajaran kini turunan kalender, bukan pilihan guru.
    // Dipatok ulang setiap panel dibuka supaya tidak ada nilai sisa dari
    // classroom sebelumnya yang bertahan diam-diam.
    _rcSemester   = DEFAULT_SEMESTER;
    _rcTahun      = DEFAULT_YEAR;
    _rcHasil      = null;
    _rcPage1      = 0;
    _rcPage2      = 0;
    _renderRecapShell(c);
  }

  function _renderRecapShell(c) {
    const isWali = _roleGuru === 'WALI_KELAS_SD';
    if (isWali && !_rcMapelUserSet) _rcMapel = _selMapel || MAPEL_SD[0];

    // Daftar teknik dan instrumen mengikuti jenis yang sedang dipilih. Kalau ia
    // tetap dikunci ke SUMATIF, guru yang membuka rekap Formatif akan disuguhi
    // pilihan teknik yang tidak satu pun cocok dengan datanya.
    const allJenis  = _asmts.filter(a => a.jenis === _rcJenis);
    const teknikSet = [...new Set(allJenis.map(a => a.teknik).filter(Boolean))];
    const instrSet  = _rcTeknik
      ? [...new Set(allJenis.filter(a => a.teknik === _rcTeknik).map(a => a.instrumen).filter(Boolean))]
      : [];

    const sel = (v, cur) => v === cur ? ' selected' : '';
    const capLbl = t => `<div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-bottom:.3rem">${t}</div>`;

    let html = `<div style="display:flex;flex-direction:column;gap:.6rem;margin-bottom:.75rem">`;

    // Jenis penilaian. Ditaruh paling atas karena ia yang menentukan arti
    // seluruh filter di bawahnya.
    html += `<div>${capLbl('Jenis penilaian')}
      <select id="rc-jenis" style="${inputCss('max-width:14rem')}">
        ${['SUMATIF','FORMATIF','DIAGNOSTIK'].map(j =>
          `<option value="${j}"${sel(j,_rcJenis)}>${esc(JENIS_LBL[j])}</option>`).join('')}
      </select></div>`;

    // Semester + tahun ajaran — label, bukan isian.
    //
    // Keduanya turunan kalender dan tidak lagi bisa diubah guru. Sebagai kendali
    // keduanya menyesatkan: semester selalu terbuka di '1' meski Januari–Juni
    // seharusnya semester 2, dan tahun ajaran adalah kotak teks bebas yang satu
    // salah ketik saja membuat rekap kosong tanpa sebab yang terlihat.
    const nilaiLbl = t => `<div style="font-size:var(--fs-ui);font-weight:600;
      color:var(--text-primary);padding:.15rem 0;white-space:nowrap">${esc(t)}</div>`;
    html += `<div style="display:flex;gap:1.5rem;flex-wrap:wrap;align-items:flex-end">
      <div>${capLbl('Semester')}${nilaiLbl('Semester ' + _rcSemester)}</div>
      <div>${capLbl('Tahun Ajaran')}${nilaiLbl(_rcTahun)}</div>
    </div>`;

    // Mapel (WALI_KELAS_SD only)
    if (isWali) {
      html += `<div>${capLbl('Mata Pelajaran')}
        <select id="rc-mapel" style="${inputCss('max-width:18rem')}">
          ${MAPEL_SD.map(m => `<option value="${esc(m)}"${sel(m,_rcMapel)}>${esc(m)}</option>`).join('')}
        </select></div>`;
    }

    // Teknik
    html += `<div>${capLbl('Teknik')}
      <select id="rc-teknik" style="${inputCss('max-width:14rem')}">
        <option value="">Semua teknik</option>
        ${teknikSet.map(t => `<option value="${esc(t)}"${sel(t,_rcTeknik)}>${esc(teknikLbl(t))}</option>`).join('')}
      </select></div>`;

    // Instrumen (hanya jika teknik dipilih)
    if (_rcTeknik && instrSet.length) {
      html += `<div>${capLbl('Instrumen')}
        <select id="rc-instrumen" style="${inputCss('max-width:14rem')}">
          <option value="">Semua instrumen</option>
          ${instrSet.map(i => `<option value="${esc(i)}"${sel(i,_rcInstrumen)}>${esc(i)}</option>`).join('')}
        </select></div>`;
    }

    html += `</div><div id="rc-content"><div style="color:var(--text-secondary);font-size:var(--fs-caption);padding:.5rem 0">Memuat…</div></div>`;
    c.innerHTML = html;

    // Wire filter events
    // Ganti jenis membatalkan teknik dan instrumen: keduanya milik jenis lama
    // dan hampir pasti tidak ada di jenis baru, sehingga kalau dibiarkan
    // hasilnya kosong tanpa sebab yang terlihat oleh guru.
    c.querySelector('#rc-jenis')?.addEventListener('change', function () {
      _rcJenis = this.value;
      _rcTeknik = null; _rcInstrumen = null;
      _rcPage1 = _rcPage2 = _rcPageF = _rcPageD = 0; _rcHasil = null;
      _renderRecapShell(c);
    });
    // Tidak ada handler untuk semester dan tahun ajaran: keduanya label sekarang.
    c.querySelector('#rc-mapel')?.addEventListener('change', function () {
      _rcMapel = this.value; _rcMapelUserSet = true; _rcPage1 = _rcPage2 = _rcPageF = _rcPageD = 0; _rcHasil = null; _loadRecapContent();
    });
    c.querySelector('#rc-teknik')?.addEventListener('change', function () {
      _rcTeknik = this.value || null; _rcInstrumen = null; _rcPage1 = _rcPage2 = _rcPageF = _rcPageD = 0; _rcHasil = null;
      _renderRecapShell(c); _loadRecapContent();
    });
    c.querySelector('#rc-instrumen')?.addEventListener('change', function () {
      _rcInstrumen = this.value || null; _rcPage1 = _rcPage2 = _rcPageF = _rcPageD = 0; _rcHasil = null; _loadRecapContent();
    });

    _loadRecapContent();
  }

  async function _loadRecapContent() {
    const cc = el('rc-content');
    if (!cc) return;
    cc.innerHTML = `<div style="color:var(--text-secondary);font-size:var(--fs-caption);padding:.5rem 0">Memuat…</div>`;

    // Percabangan mengikuti bentuk yang sudah dipakai buildResultPayload() dan
    // studentRowHtml(): dua cabang bernama lalu SUMATIF sebagai cabang terakhir.
    // Jalur SUMATIF di bawah tidak diubah sedikit pun.
    if (_rcJenis === 'FORMATIF' || _rcJenis === 'DIAGNOSTIK') {
      const items = _rcJenis === 'FORMATIF'
        ? _getFilteredFormatifs()
        : _getFilteredDiagnostiks();
      if (!items.length) {
        cc.innerHTML = `<p style="color:var(--text-secondary);font-size:var(--fs-caption)">
          Belum ada penilaian ${esc(JENIS_LBL[_rcJenis])} untuk filter yang dipilih.</p>`;
        return;
      }
      if (!_roster.length) {
        cc.innerHTML = `<p style="color:var(--text-secondary);font-size:var(--fs-caption)">
          Tidak ada siswa di kelas ini.</p>`;
        return;
      }
      const hasil = await Promise.all(
        items.map(a => SipApi.getAssessmentResults(a.id).catch(() => []))
      );
      if (_rcJenis === 'FORMATIF') _renderRecapFormatif(cc, items, hasil);
      else                         _renderRecapDiagnostik(cc, items, hasil);
      return;
    }

    const sumatifs = _getFilteredSumatifs();
    if (!sumatifs.length) {
      cc.innerHTML = `<p style="color:var(--text-secondary);font-size:var(--fs-caption)">
        Belum ada penilaian Sumatif untuk filter yang dipilih.</p>`;
      return;
    }
    if (!_roster.length) {
      cc.innerHTML = `<p style="color:var(--text-secondary);font-size:var(--fs-caption)">
        Tidak ada siswa di kelas ini.</p>`;
      return;
    }

    const allResults = await Promise.all(
      sumatifs.map(a => SipApi.getAssessmentResults(a.id).catch(() => []))
    );
    const curIds = sumatifs.map(a => a.id).join(',');
    if (curIds !== _rcLastSumatifIds) { _rcBobots = sumatifs.map(() => 0); _rcLastSumatifIds = curIds; }
    _renderRecapContent(cc, sumatifs, allResults);
  }

  // Penyaring bersama untuk ketiga jenis. Isinya sama persis dengan
  // _getFilteredSumatifs() sebelum perubahan ini; yang dulu tertanam sebagai
  // literal 'SUMATIF' kini menjadi parameter. Ditulis satu kali supaya aturan
  // semester/tahun/mapel tidak perlu dirawat di tiga tempat -- berkas ini sudah
  // punya cukup banyak blok kembar.
  function _getFilteredJenis(jenis) {
    const isWali = _roleGuru === 'WALI_KELAS_SD';
    return _asmts.filter(a => {
      if (a.jenis !== jenis) return false;
      if (_rcTeknik && a.teknik !== _rcTeknik) return false;
      if (_rcInstrumen && a.instrumen !== _rcInstrumen) return false;
      // Penilaian tanpa TP tidak bisa diketahui semesternya — tidak lolos filter.
      if (!a.tp_kktp_id) return false;
      if (a.tp_kktp_id) {
        const tp = _tpList.find(t => t.id === a.tp_kktp_id);
        if (tp) {
          if (tp.semester != null && String(tp.semester) !== String(_rcSemester)) return false;
          if (_rcTahun && tp.academic_year && tp.academic_year !== _rcTahun) return false;
          if (isWali && _rcMapel && tp.mapel && tp.mapel !== _rcMapel) return false;
        }
      }
      return true;
    });
  }

  function _getFilteredSumatifs()    { return _getFilteredJenis('SUMATIF');    }
  function _getFilteredFormatifs()   { return _getFilteredJenis('FORMATIF');   }
  function _getFilteredDiagnostiks() { return _getFilteredJenis('DIAGNOSTIK'); }

  // Rangka bersama rekap FORMATIF dan DIAGNOSTIK. Keduanya menampilkan matriks
  // siswa x penilaian dengan kepala kolom, penomoran, dan paginasi yang sama;
  // yang berbeda hanya isi selnya. Ditulis sekali lalu dibedakan lewat selHtml()
  // supaya tidak lahir sepasang blok kembar baru -- berkas ini sudah punya tujuh.
  //
  // Di sini TIDAK ADA kotak "Tentukan Nilai Akhir" dan TIDAK ADA tombol Simpan.
  // Keduanya milik SUMATIF. Metode rata/bobot/terbaik adalah aritmetika, sedang
  // status Formatif dan Diagnostik hanya kategori berurut -- merata-ratakan
  // "Berkembang" dengan "Tercapai" tidak punya arti, dan angka apa pun yang
  // dipakai untuk mewakilinya adalah keputusan pedagogis yang belum diambil
  // siapa pun. Datanya sendiri sudah tersimpan di assessment_results sejak guru
  // mengisinya, jadi tidak ada yang perlu disimpan ulang dari panel ini.
  function _renderRecapMatriks(cc, items, allResults, opts) {
    const { prefix, judul, page, setPage, selHtml } = opts;

    // grid[i][student_id] = baris hasil milik penilaian ke-i, atau undefined
    const grid = items.map((_, i) => {
      const m = {};
      (allResults[i] ?? []).forEach(r => { m[r.student_id] = r; });
      return m;
    });

    // Kepala kolom dua baris. Baris atas mengikuti bentuk rekap Sumatif -- nomor
    // urut penilaian lalu judul TP yang dipendekkan. Baris bawah menyebut teknik
    // dan instrumennya: tanpa itu dua penilaian atas TP yang sama tampak sebagai
    // kolom kembar yang tidak bisa dibedakan guru.
    const colHeaders = items.map((a, i) => {
      const tp  = a.tp_kktp_id ? _tpList.find(t => t.id === a.tp_kktp_id) : null;
      const jud = tp ? (tp.judul || '') : '';
      const label = jud ? (jud.length > 10 ? jud.slice(0, 10) + '…' : jud) : '—';
      const sub = [_rcTeknikSingkat(a.teknik), _rcInstrumenSingkat(a.instrumen)]
        .filter(Boolean).join(' | ');
      return { kode: `${prefix}${i + 1}-${label}`, sub: sub || '—' };
    });

    const thBase = `padding:.4rem .5rem;font-size:var(--fs-caption);white-space:nowrap;text-align:left`;
    const thSt   = `${thBase};border-bottom:2px solid var(--gold)`;
    // Baris atas tidak diberi garis emas -- garisnya hanya di bawah baris kedua,
    // supaya kedua baris terbaca sebagai satu kepala kolom, bukan dua.
    const thTop  = thBase;
    const tdSt = `padding:.4rem .5rem;font-size:var(--fs-ui);border-bottom:1px solid var(--border-subtle,rgba(255,255,255,.08));vertical-align:top`;

    const totalPages = Math.ceil(_roster.length / RC_PAGE_SIZE);
    const cur        = Math.min(page, Math.max(0, totalPages - 1));
    const pageRoster = _roster.slice(cur * RC_PAGE_SIZE, (cur + 1) * RC_PAGE_SIZE);

    const rows = pageRoster.map((stu, idx) => {
      const no    = cur * RC_PAGE_SIZE + idx + 1;
      // items[ci] adalah objek penilaiannya sendiri -- termasuk konten, teknik,
      // dan instrumen. Diteruskan ke selHtml supaya penyaji sel bisa membaca
      // hasil yang tersimpan di assessments.konten, bukan hanya yang ada di
      // assessment_results.
      const cells = items.map((a, ci) =>
        `<td style="${tdSt}">${selHtml(grid[ci][stu.id], a, stu.id)}</td>`).join('');
      return `<tr>
        <td style="${tdSt};text-align:center;color:var(--text-secondary)">${no}</td>
        <td style="${tdSt}">${esc(stu.nama)}</td>${cells}</tr>`;
    }).join('');

    const headCells1 = colHeaders.map(h =>
      `<th style="${thTop};text-align:center" title="${esc(h.kode)}">${esc(h.kode)}</th>`).join('');
    const headCells2 = colHeaders.map(h =>
      `<th style="${thSt};text-align:center;font-weight:400;color:var(--text-secondary)"
         title="${esc(h.sub)}">${esc(h.sub)}</th>`).join('');

    const pagHtml = totalPages > 1
      ? `<div style="display:flex;align-items:center;justify-content:center;gap:.75rem;margin-top:.5rem;font-size:var(--fs-caption)">
          <button data-rcm-pag data-dir="-1"${cur === 0 ? ' disabled' : ''} style="padding:.2rem .6rem;cursor:pointer">←</button>
          <span>Hal. ${cur + 1}/${totalPages}</span>
          <button data-rcm-pag data-dir="1"${cur === totalPages - 1 ? ' disabled' : ''} style="padding:.2rem .6rem;cursor:pointer">→</button>
        </div>` : '';

    // Kolomnya memuat status ditambah satu atau dua baris teks bebas, jadi
    // jatahnya lebih lebar daripada 80px milik kolom angka rekap Sumatif.
    cc.innerHTML = `
<div style="margin-bottom:.25rem">
  <div style="font-size:var(--fs-caption);font-weight:600;color:var(--gold);
    text-transform:uppercase;letter-spacing:.04em;margin-bottom:.4rem">${esc(judul)}</div>
  <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
    <table style="width:100%;border-collapse:collapse;min-width:${130 + items.length * 150}px">
      <thead>
        <tr>
          <th rowspan="2" style="${thSt};text-align:center;width:2.5rem;vertical-align:bottom">No</th>
          <th rowspan="2" style="${thSt};vertical-align:bottom">Nama Siswa</th>${headCells1}
        </tr>
        <tr>${headCells2}</tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  ${pagHtml}
</div>`;

    cc.querySelectorAll('[data-rcm-pag]').forEach(btn => {
      btn.addEventListener('click', function () {
        if (this.disabled) return;
        const dir  = parseInt(this.dataset.dir, 10);
        const next = Math.max(0, Math.min(totalPages - 1, cur + dir));
        setPage(next);
        _renderRecapMatriks(cc, items, allResults, { ...opts, page: next });
      });
    });
  }

  // Sel kosong ditulis '—', bukan 0 atau string kosong: siswa yang belum dinilai
  // harus terbaca berbeda dari siswa yang sudah dinilai.
  const RC_SEL_KOSONG = `<span style="color:var(--text-secondary)">—</span>`;

  // Singkatan khusus baris kedua kepala kolom, yang sempit. Ia sengaja berbeda
  // dari teknikLbl(): 'Tes Tertulis' dan 'Observasi' terlalu panjang untuk kolom
  // selebar ini, sementara di dropdown filter keduanya justru harus utuh.
  // Teknik di luar daftar jatuh kembali ke teknikLbl() -- tidak ada logika
  // penamaan yang ditulis dua kali di sini.
  const TEKNIK_SINGKAT = {
    TES: 'Tes', TES_LISAN: 'Tes Lisan', OBSERVASI: 'Obs', PENUGASAN: 'Penugasan',
    PROYEK: 'Proyek', PORTOFOLIO: 'Portofolio', UNJUK_KERJA: 'Unjuk Kerja',
  };
  function _rcTeknikSingkat(t)   { return t ? (TEKNIK_SINGKAT[t] ?? teknikLbl(t)) : ''; }
  function _rcInstrumenSingkat(i) { return !i ? '' : (i.length > 12 ? i.slice(0, 12) + '…' : i); }

  // Hasil dari assessments.konten. extractHasilDiagForm() memakai '-' sebagai
  // penanda "tidak ada", jadi nilai itu diterjemahkan ke null di sini supaya
  // pemanggilnya cukup memeriksa kebenaran biasa.
  function _rcHasilKonten(asmt, sid) {
    if (!asmt) return null;
    const h = extractHasilDiagForm(asmt.konten, asmt.teknik, asmt.instrumen, sid);
    return (h && h !== '-') ? h : null;
  }

  function _rcBarisTeks(teks, label) {
    if (!teks) return '';
    return `<div style="font-size:var(--fs-caption);color:var(--text-secondary);margin-top:.2rem">
      ${label ? `<span style="opacity:.75">${esc(label)}</span> ` : ''}${esc(teks)}</div>`;
  }

  function _renderRecapFormatif(cc, formatifs, allResults) {
    _renderRecapMatriks(cc, formatifs, allResults, {
      prefix: 'F',
      judul:  'Daftar Capaian Formatif',
      page:   _rcPageF,
      setPage: n => { _rcPageF = n; },
      // Urutannya sama dengan diagnostik: status dari assessment_results dibaca
      // LEBIH DULU, konten hanya dipakai kalau status kosong. Formatif berbasis
      // chip per siswa memang mengisi kolom status, dan "Tercapai" lebih terbaca
      // daripada rangkuman konten yang panjang.
      //
      // Fallback ke konten tetap diperlukan: untuk teknik TES, TES_LISAN, dan
      // OBSERVASI kolom status tidak pernah terisi -- hasilnya tersimpan di
      // assessments.konten -- sehingga tanpa fallback itu tabel menampilkan '—'
      // untuk penilaian yang sebenarnya sudah lengkap.
      //
      // Label status dibaca dari STATUS_FORMATIF_LBL yang sudah dipakai
      // Section 2. Nilai tak dikenal ditampilkan apa adanya supaya tidak muncul
      // sebagai "undefined" di layar.
      //
      // Umpan balik dan tindak lanjut tetap dibaca dari assessment_results:
      // keduanya diisi lewat kotak teks di Section 2 dan memang tinggal di sana.
      // r bisa undefined untuk penilaian berbasis konten, jadi diakses opsional.
      selHtml: (r, asmt, sid) => {
        const hasil = (r?.status
          ? (STATUS_FORMATIF_LBL[r.status] ?? r.status)
          : null) ?? _rcHasilKonten(asmt, sid);
        const isi = (hasil ? `<div style="font-weight:600">${esc(hasil)}</div>` : '')
          + _rcBarisTeks(r?.umpan_balik,   'Umpan balik:')
          + _rcBarisTeks(r?.tindak_lanjut, 'Tindak lanjut:');
        return isi || RC_SEL_KOSONG;
      },
    });
  }

  function _renderRecapDiagnostik(cc, diagnostiks, allResults) {
    _renderRecapMatriks(cc, diagnostiks, allResults, {
      prefix: 'D',
      judul:  'Daftar Capaian Diagnostik',
      page:   _rcPageD,
      setPage: n => { _rcPageD = n; },
      // Grup diferensiasi diambil dari baris hasil penilaian itu sendiri, bukan
      // dari _sGroups: _sGroups menyimpan grup siswa yang berlaku sekarang,
      // sedangkan kolom di sini mewakili satu penilaian tertentu di masa lalu.
      //
      // Urutannya penting: status dari assessment_results dibaca LEBIH DULU.
      // Diagnostik berbasis chip per siswa memang mengisi kolom itu, dan
      // labelnya lebih ringkas daripada rangkuman konten. extractHasilDiagForm()
      // baru dipakai kalau status memang kosong -- yakni pada teknik yang
      // menyimpan hasilnya di assessments.konten.
      selHtml: (r, asmt, sid) => {
        const st    = r?.status ? (STATUS_LBL[r.status] ?? r.status) : null;
        const grup  = r?.grup_diferensiasi || '';
        const utama = st ?? _rcHasilKonten(asmt, sid);
        const kepala = (utama || grup)
          ? `<div style="display:flex;align-items:center;gap:.35rem;flex-wrap:wrap">
              ${utama ? `<span style="font-weight:600">${esc(utama)}</span>` : ''}
              ${grup ? `<span style="font-size:.65rem;padding:.15rem .45rem;border-radius:.25rem;
                background:var(--gold);color:var(--text-on-gold,#000);font-weight:700">Grup ${esc(grup)}</span>` : ''}
            </div>` : '';
        const isi = kepala + _rcBarisTeks(r?.catatan, 'Catatan:');
        return isi || RC_SEL_KOSONG;
      },
    });
  }

  function _renderRecapContent(cc, sumatifs, allResults) {
    if (!_rcHasil) _rcPage2 = 0; // jika tidak ada hasil, page2 selalu mulai dari 0
    // nilaiGrid[i][studentId] = nilai angka | null
    const nilaiGrid = sumatifs.map((_, i) => {
      const map = {};
      (allResults[i] ?? []).forEach(r => { map[r.student_id] = r.nilai ?? null; });
      return map;
    });

    // Header kolom: S{n}-{short judul TP} atau S{n}-—
    const colHeaders = sumatifs.map((a, i) => {
      const tp = a.tp_kktp_id ? _tpList.find(t => t.id === a.tp_kktp_id) : null;
      const label = tp ? (tp.judul.length > 10 ? tp.judul.slice(0, 10) + '…' : tp.judul) : '—';
      return `S${i + 1}-${label}`;
    });

    const thSt = `padding:.4rem .5rem;border-bottom:2px solid var(--gold);font-size:var(--fs-caption);white-space:nowrap;text-align:left`;
    const tdSt = `padding:.4rem .5rem;font-size:var(--fs-ui);border-bottom:1px solid var(--border-subtle,rgba(255,255,255,.08))`;

    // ── DAFTAR NILAI SUMATIF ────────────────────────────────────────────────
    const totalPages1 = Math.ceil(_roster.length / RC_PAGE_SIZE);
    const pageRoster  = _roster.slice(_rcPage1 * RC_PAGE_SIZE, (_rcPage1 + 1) * RC_PAGE_SIZE);

    const valueRows = pageRoster.map((s, idx) => {
      const no    = _rcPage1 * RC_PAGE_SIZE + idx + 1;
      const cells = sumatifs.map((_, ci) => {
        const n = nilaiGrid[ci][s.id];
        // Sel kosong ditulis '--', bukan 0: siswa yang belum dinilai harus
        // terbaca berbeda dari siswa yang benar-benar mendapat nilai nol.
        return `<td style="${tdSt};text-align:center">${n != null ? n : RC_SEL_KOSONG}</td>`;
      }).join('');
      return `<tr>
        <td style="${tdSt};text-align:center;color:var(--text-secondary)">${no}</td>
        <td style="${tdSt}">${esc(s.nama)}</td>${cells}</tr>`;
    }).join('');

    const colHeaderCells = colHeaders.map(h =>
      `<th style="${thSt};text-align:center" title="${esc(h)}">${esc(h)}</th>`
    ).join('');

    const pag1Html = totalPages1 > 1
      ? `<div style="display:flex;align-items:center;justify-content:center;gap:.75rem;margin-top:.5rem;font-size:var(--fs-caption)">
          <button data-rc-pag="1" data-dir="-1"${_rcPage1 === 0 ? ' disabled' : ''} style="padding:.2rem .6rem;cursor:pointer">←</button>
          <span>Hal. ${_rcPage1 + 1}/${totalPages1}</span>
          <button data-rc-pag="1" data-dir="1"${_rcPage1 === totalPages1 - 1 ? ' disabled' : ''} style="padding:.2rem .6rem;cursor:pointer">→</button>
        </div>` : '';

    // ── TENTUKAN NILAI AKHIR ────────────────────────────────────────────────
    const isBobot    = _rcMetode === 'bobot';
    const totalBobot = _rcBobots.reduce((a, b) => a + (parseFloat(b) || 0), 0);
    const bobotValid = Math.abs(totalBobot - 100) < 0.01;

    // Total global 100% belum cukup. Nilai akhir dihitung PER kelompok TP, dan
    // kelompok yang seluruh bobotnya nol tidak punya pembagi — _hitungNilaiSiswa
    // mengembalikan 0 untuk semua siswanya, lalu 0 itu tersimpan ke grade_recap
    // seolah nilai sungguhan. Bobot bisa berjumlah 100 secara global sambil
    // meninggalkan satu TP kosong: dua TP, 100% ditaruh semua di TP-A.
    //
    // Dihitung dari sumatifs + _rcBobots, BUKAN dari _rcHasil. Keduanya sudah
    // tersedia sebelum tombol Hitung ditekan, sehingga Hitung pun bisa dikunci;
    // kalau menunggu _rcHasil, Hitung sudah terlanjur berjalan.
    //
    // Pengelompokannya sama dengan _hitungNilaiAkhir: kunci tp_kktp_id, sumatif
    // tanpa TP diabaikan karena memang tidak pernah ikut dihitung.
    const tpNolBobot = [];
    if (isBobot) {
      const grupBobot = {};
      sumatifs.forEach((a, i) => {
        if (!a.tp_kktp_id) return;
        if (!grupBobot[a.tp_kktp_id]) grupBobot[a.tp_kktp_id] = [];
        grupBobot[a.tp_kktp_id].push(i);
      });
      for (const [tpId, idxs] of Object.entries(grupBobot)) {
        const totalGrup = idxs.reduce((t, i) => t + (parseFloat(_rcBobots[i]) || 0), 0);
        if (totalGrup <= 0) {
          const tp = _tpList.find(t => t.id === tpId);
          tpNolBobot.push(tp ? (tp.judul || tp.konten || '—') : '—');
        }
      }
    }
    // TP tanpa satu pun KKTP tidak bisa menghasilkan predikat: _hitungNilaiAkhir
    // mengembalikan null, dan _simpanRecap menulis kktp_tercapai null. Yang
    // tersimpan lalu berupa angka tanpa penilaian ketercapaian sama sekali —
    // rekap yang secara teknis ada tapi tidak menjawab pertanyaan pokoknya.
    //
    // Hanya Simpan yang dikunci, bukan Hitung: melihat angkanya lebih dulu justru
    // membantu guru memutuskan rentang KKTP yang pantas.
    const tpTanpaKktp = [];
    for (const tpId of [...new Set(sumatifs.map(a => a.tp_kktp_id).filter(Boolean))]) {
      if (_tpList.some(t => t.parent_id === tpId && t.tipe === 'KKTP')) continue;
      const tp = _tpList.find(t => t.id === tpId);
      tpTanpaKktp.push(tp ? (tp.judul || tp.konten || '—') : '—');
    }
    const tanpaKktpHtml = tpTanpaKktp.length ? `
  <div style="margin-top:.5rem;font-size:var(--fs-caption);color:#c0392b">
    TP berikut belum memiliki KKTP: ${esc(tpTanpaKktp.join(', '))}. Tambahkan KKTP
    lebih dulu sebelum menyimpan rekap — tanpa itu predikat tidak bisa
    ditentukan.</div>` : '';

    // Dipakai dua kali: di bawah kotak bobot (tempat guru memperbaikinya) dan
    // di samping tombol Simpan (tempat ia menyadari sesuatu terkunci).
    const grupNolHtml = tpNolBobot.length ? `
  <div style="margin-top:.5rem;font-size:var(--fs-caption);color:#c0392b">
    Seluruh bobot TP berikut masih 0%, sehingga nilai akhirnya akan menjadi 0:
    ${esc(tpNolBobot.join(', '))}. Beri bobot pada salah satu sumatif TP itu
    lebih dulu.</div>` : '';

    const bobotRowsHtml = isBobot
      ? `<div style="display:flex;flex-direction:column;gap:.35rem;margin:-.25rem 0 .25rem 1.25rem">
          ${sumatifs.map((_, i) => `<div style="display:flex;align-items:center;gap:.5rem;font-size:var(--fs-caption)">
            <span style="min-width:3.5rem;max-width:8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(colHeaders[i])}</span>
            <input type="number" id="rc-bobot-${i}" min="0" max="100" step="1"
              value="${_rcBobots[i] ?? 0}" style="${inputCss('flex:1 1 0;min-width:3.5rem;text-align:center')}"> <span>%</span>
          </div>`).join('')}
          <div style="font-size:var(--fs-caption);color:${bobotValid ? 'var(--success,#2d6a4f)' : '#c0392b'}">
            ${bobotValid
              ? `Total bobot: ${totalBobot}% ✓`
              : `Total bobot harus 100%. Saat ini: ${totalBobot}%`}
          </div>${grupNolHtml}</div>` : '';

    // Menghitung DAN menyimpan sama-sama terkunci selama bobotnya belum tepat.
    // Sebelumnya hanya tombol Hitung yang dikunci, sehingga guru dapat menekan
    // Hitung saat bobot masih 100%, mengubah salah satu angkanya, lalu tetap
    // menyimpan rekap yang tidak lagi sesuai dengan bobot di layar.
    //
    // Keduanya juga terkunci saat ada sumber kritis yang gagal dimuat: nilai
    // akhir dihitung dari grid yang mungkin bolong, dan menyimpannya berarti
    // menulis angka salah ke grade_recap.
    //
    // Kelompok TP berbobot nol mengunci keduanya juga: angkanya akan 0 dan 0 itu
    // tak bisa dibedakan dari nilai yang benar-benar nol setelah tersimpan.
    const bobotDis   = isBobot && !bobotValid;
    const grupNolDis = tpNolBobot.length > 0;
    const hitungDis  = bobotDis || grupNolDis || !!_loadError;
    // Simpan punya satu kunci tambahan: hasil yang sudah dihitung tapi tidak
    // menyisakan satu kelompok TP pun tidak punya apa-apa untuk disimpan —
    // _simpanRecap akan berputar nol kali dan melaporkan "0 entri" seolah sukses.
    const simpanDis  = hitungDis || tpTanpaKktp.length > 0
      || !!(_rcHasil && _rcHasil.groups.length === 0);
    const metodeHtml = `
<div style="margin-top:.75rem;background:var(--bg-card,#1e1e1e);border-radius:.5rem;
  padding:.75rem;border:1px solid var(--border-subtle,rgba(255,255,255,.12))">
  <div style="font-size:var(--fs-caption);font-weight:600;color:var(--gold);
    margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.04em">Tentukan Nilai Akhir</div>
  <div style="display:flex;flex-direction:column;gap:.35rem;margin-bottom:.4rem">
    ${[['rata','Rata-rata'],['bobot','Bobot per sumatif'],['terbaik','Nilai terbaik']].map(([v,l]) =>
      `<label style="display:flex;align-items:flex-start;gap:.5rem;cursor:pointer;font-size:var(--fs-ui)">
        <input type="radio" name="rc-metode" value="${v}"${_rcMetode === v ? ' checked' : ''}
          style="margin-top:.15rem;accent-color:var(--gold)"> <span>${l}</span></label>`).join('')}
  </div>
  ${bobotRowsHtml}
  <button id="rc-btn-hitung"${hitungDis ? ' disabled' : ''}
    style="margin-top:.5rem;min-height:var(--btn-h);background:${hitungDis ? 'var(--border-subtle,rgba(255,255,255,.18))' : 'var(--gold)'};
    color:${hitungDis ? 'var(--text-secondary)' : 'var(--text-on-gold)'};font-weight:var(--fw-medium);
    font-size:var(--fs-ui);padding:0 var(--btn-px);border-radius:var(--btn-r);border:none;
    cursor:${hitungDis ? 'default' : 'pointer'};width:100%">Hitung Nilai Akhir</button>
</div>`;

    // ── HASIL NILAI AKHIR ────────────────────────────────────────────────────
    let hasilHtml = '';
    if (_rcHasil) {
      // Setiap blok memuat SELURUH siswa, jadi jumlah halamannya sama untuk semua
      // blok. Satu indeks halaman dipakai bersama: halaman 1 berarti siswa 1–5 di
      // semua TP sekaligus, sehingga capaian satu siswa lintas TP terbaca dalam
      // satu layar. Efek sampingnya menguntungkan — _rcPage2 tetap angka biasa,
      // jadi sembilan tempat yang menyetel ulangnya tidak perlu disentuh.
      const totalPages2 = Math.ceil(_roster.length / RC_PAGE_SIZE) || 1;
      const cur2        = Math.min(_rcPage2, totalPages2 - 1);

      const blokHtml = _rcHasil.groups.map(g => {
        const pageRows = g.rows.slice(cur2 * RC_PAGE_SIZE, (cur2 + 1) * RC_PAGE_SIZE);
        const trs = pageRows.map((row, idx) => {
          const no        = cur2 * RC_PAGE_SIZE + idx + 1;
          const predColor = (row.predikat === 'BSH' || row.predikat === 'SB')
            ? 'var(--success,#2d6a4f)' : row.predikat ? '#c0392b' : 'var(--text-secondary)';
          return `<tr>
            <td style="${tdSt};text-align:center;color:var(--text-secondary)">${no}</td>
            <td style="${tdSt}">${esc(row.nama)}</td>
            <td style="${tdSt};text-align:center;font-weight:600">${row.nilaiAkhir.toFixed(1)}</td>
            <td style="${tdSt};text-align:center;font-weight:600;color:${predColor}">${esc(row.predikat || '—')}</td>
          </tr>`;
        }).join('');
        return `
  <div style="margin-bottom:.75rem">
    <div style="font-size:var(--fs-caption);font-weight:600;color:var(--text-primary);
      margin-bottom:.35rem">Nilai Akhir TP: ${esc(g.judul || '—')}</div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;min-width:280px">
        <thead><tr>
          <th style="${thSt};text-align:center">No</th>
          <th style="${thSt}">Nama Siswa</th>
          <th style="${thSt};text-align:center">Nilai Akhir</th>
          <th style="${thSt};text-align:center">Predikat</th>
        </tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </div>
  </div>`;
      }).join('');

      // Semua sumatif terpilih ternyata tanpa TP: tidak ada satu pun blok yang
      // bisa dibangun, dan tidak ada pula yang bisa disimpan.
      const kosongHtml = _rcHasil.groups.length ? '' : `
  <div style="font-size:var(--fs-caption);color:var(--text-secondary)">
    Tidak ada sumatif yang terikat pada TP, jadi nilai akhir tidak bisa dihitung.
    Kaitkan penilaian ke sebuah TP lebih dulu di Section 2.</div>`;

      const pag2Html = totalPages2 > 1
        ? `<div style="display:flex;align-items:center;justify-content:center;gap:.75rem;margin-top:.5rem;font-size:var(--fs-caption)">
            <button data-rc-pag="2" data-dir="-1"${cur2 === 0 ? ' disabled' : ''} style="padding:.2rem .6rem;cursor:pointer">←</button>
            <span>Hal. ${cur2 + 1}/${totalPages2} — berlaku untuk semua TP</span>
            <button data-rc-pag="2" data-dir="1"${cur2 === totalPages2 - 1 ? ' disabled' : ''} style="padding:.2rem .6rem;cursor:pointer">→</button>
          </div>` : '';

      // Jumlah yang dilewati disebut terang-terangan: guru harus tahu ada nilai
      // yang tidak ikut dihitung, bukan menemukannya sendiri dari selisih angka.
      const lewatHtml = _rcHasil.skipped > 0 ? `
  <div style="margin-top:.5rem;font-size:var(--fs-caption);color:var(--text-secondary)">
    ${_rcHasil.skipped} sumatif tanpa TP dilewati — nilainya tidak ikut dihitung
    dan tidak akan tersimpan.</div>` : '';

      hasilHtml = `
<div style="margin-top:.75rem;background:var(--bg-card,#1e1e1e);border-radius:.5rem;
  padding:.75rem;border:1px solid var(--border-subtle,rgba(255,255,255,.12))">
  <div style="font-size:var(--fs-caption);font-weight:600;color:var(--gold);
    margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.04em">Hasil Nilai Akhir</div>
  ${blokHtml}${kosongHtml}
  ${pag2Html}
  ${lewatHtml}
  ${bobotDis ? `<div style="margin-top:.75rem;font-size:var(--fs-caption);color:#c0392b">
    Total bobot harus 100%. Saat ini: ${totalBobot}%</div>` : ''}
  ${grupNolHtml}
  ${tanpaKktpHtml}
  <button id="rc-btn-simpan"${simpanDis ? ' disabled' : ''}
    style="margin-top:.5rem;min-height:var(--btn-h);
    background:${simpanDis ? 'var(--border-subtle,rgba(255,255,255,.18))' : 'var(--gold)'};
    color:${simpanDis ? 'var(--text-secondary)' : 'var(--text-on-gold)'};
    font-weight:var(--fw-medium);font-size:var(--fs-ui);
    padding:0 var(--btn-px);border-radius:var(--btn-r);border:none;
    cursor:${simpanDis ? 'default' : 'pointer'};width:100%">
    Simpan Rekap</button>
</div>`;
    }

    // Render
    cc.innerHTML = `
<div style="margin-bottom:.25rem">
  <div style="font-size:var(--fs-caption);font-weight:600;color:var(--gold);
    text-transform:uppercase;letter-spacing:.04em;margin-bottom:.4rem">Daftar Nilai Sumatif</div>
  <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
    <table style="width:100%;border-collapse:collapse;min-width:${130 + sumatifs.length * 80}px">
      <thead><tr>
        <th style="${thSt};text-align:center;width:2.5rem">No</th>
        <th style="${thSt}">Nama Siswa</th>${colHeaderCells}
      </tr></thead>
      <tbody>${valueRows}</tbody>
    </table>
  </div>
  ${pag1Html}
</div>
${metodeHtml}${hasilHtml}`;

    // Wire events — listener metode pada cc sendiri agar survive innerHTML replacement
    if (_rcMetodeListener) cc.removeEventListener('change', _rcMetodeListener);
    _rcMetodeListener = function (e) {
      if (e.target.name !== 'rc-metode') return;
      _rcMetode = e.target.value; _rcHasil = null; _rcPage2 = 0; _renderRecapContent(cc, sumatifs, allResults);
    };
    cc.addEventListener('change', _rcMetodeListener);

    if (isBobot) {
      sumatifs.forEach((_, i) => {
        cc.querySelector(`#rc-bobot-${i}`)?.addEventListener('input', function () {
          _rcBobots[i] = parseFloat(this.value) || 0;
          _rcHasil = null;
          _renderRecapContent(cc, sumatifs, allResults);
          // Render ulang mengganti seluruh isi cc, termasuk kotak yang sedang
          // diketik — fokusnya ikut hilang. Tanpa dikembalikan, ketikan kedua
          // tidak pernah sampai dan bobot dua digit mustahil dimasukkan.
          const baru = cc.querySelector(`#rc-bobot-${i}`);
          if (baru) {
            baru.focus();
            // Kursor ditaruh di akhir. input[type=number] menolak
            // setSelectionRange di sebagian browser, jadi kegagalannya diabaikan
            // — fokusnya sendiri sudah cukup untuk melanjutkan mengetik.
            try { baru.setSelectionRange(baru.value.length, baru.value.length); }
            catch { /* tidak didukung browser ini */ }
          }
        });
      });
    }

    cc.querySelector('#rc-btn-hitung')?.addEventListener('click', () => {
      _rcHasil = _hitungNilaiAkhir(sumatifs, nilaiGrid);
      _rcPage2 = 0;
      _renderRecapContent(cc, sumatifs, allResults);
    });

    cc.querySelectorAll('[data-rc-pag]').forEach(btn => {
      btn.addEventListener('click', function () {
        if (this.disabled) return;
        const which = this.dataset.rcPag;
        const dir   = parseInt(this.dataset.dir, 10);
        const max1  = totalPages1 - 1;
        // Setiap blok TP memuat seluruh siswa, jadi batas halamannya diukur dari
        // panjang roster — bukan dari jumlah baris _rcHasil, yang kini berlipat
        // sebanyak kelompok TP-nya.
        const max2  = _rcHasil ? Math.ceil(_roster.length / RC_PAGE_SIZE) - 1 : 0;
        if (which === '1') _rcPage1 = Math.max(0, Math.min(max1, _rcPage1 + dir));
        else               _rcPage2 = Math.max(0, Math.min(max2, _rcPage2 + dir));
        _renderRecapContent(cc, sumatifs, allResults);
      });
    });

    cc.querySelector('#rc-btn-simpan')?.addEventListener('click', () => _simpanRecap(sumatifs, nilaiGrid));
  }

  // Fungsi bersama untuk hitung nilai satu siswa — dipakai tampil DAN simpan agar identik.
  // indices: array indeks sumatifs yang relevan; bobots: array bobot global (_rcBobots).
  //
  // Normalisasi bobot sengaja tinggal DI SINI, bukan di pemanggilnya. Layar dan
  // simpan sama-sama lewat fungsi ini dengan indices per kelompok TP yang sama,
  // jadi menaruhnya di sini membuat keduanya mustahil berbeda. Kalau ia ditaruh
  // di _hitungNilaiAkhir saja, angka di layar akan ternormalisasi sementara yang
  // tersimpan tidak — persis perpecahan yang sedang diperbaiki.
  function _hitungNilaiSiswa(sid, indices, nilaiGrid, metode, bobots) {
    if (metode === 'rata') {
      const vals = indices.map(i => nilaiGrid[i][sid] ?? 0);
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    } else if (metode === 'bobot') {
      // bobots[] berindeks GLOBAL, sementara indices hanya sebagian — satu
      // kelompok TP. Bobot subset itu hampir tidak pernah berjumlah 100, jadi
      // pembaginya adalah jumlah bobot kelompok ini, bukan 100 mati.
      //
      // Tanpa itu: 4 sumatif berbobot 25 dibagi ke 2 TP, siswa bernilai 80
      // semua, tiap TP menghasilkan 40 — bukan 80, dan bukan skala 0–100 lagi.
      const totalBobotGrup = indices.reduce((t, i) => t + (bobots[i] || 0), 0);
      // Seluruh bobot kelompok ini nol: tidak ada yang bisa dinormalisasi.
      // Hasilnya 0, bukan NaN — pembagian nol tidak boleh bocor ke layar.
      if (!totalBobotGrup) return 0;
      return indices.reduce((sum, i) =>
        sum + (nilaiGrid[i][sid] ?? 0) * (bobots[i] || 0) / totalBobotGrup, 0);
    } else {
      return Math.max(...indices.map(i => nilaiGrid[i][sid] ?? 0));
    }
  }

  // Pengelompokannya PERSIS sama dengan _simpanRecap: kunci tp_kktp_id, sumatif
  // tanpa TP dibuang, dan KKTP dipilih yang semesternya cocok dengan filter lalu
  // jatuh ke KKTP pertama.
  //
  // Sebelum ini layar menghitung SATU nilai agregat lintas seluruh TP dengan SATU
  // KKTP — TP pertama yang kebetulan punya anak KKTP, semester diabaikan — sedang
  // yang tersimpan dihitung per TP dengan KKTP masing-masing. Predikat di layar
  // karena itu bisa berbeda dari predikat yang masuk ke grade_recap.
  function _hitungNilaiAkhir(sumatifs, nilaiGrid) {
    const tpGroups = {};
    let skipped = 0;
    sumatifs.forEach((a, i) => {
      // Sumatif tanpa TP tidak bisa diketahui KKTP-nya, jadi tidak punya predikat
      // dan tidak akan tersimpan. Dibuang di sini juga supaya layar tidak
      // menjanjikan angka yang tidak akan pernah masuk DB.
      if (!a.tp_kktp_id) { skipped++; return; }
      if (!tpGroups[a.tp_kktp_id]) tpGroups[a.tp_kktp_id] = [];
      tpGroups[a.tp_kktp_id].push(i);
    });

    const groups = Object.entries(tpGroups).map(([tpId, indices]) => {
      const tp      = _tpList.find(t => t.id === tpId);
      const kktpAll = _tpList.filter(t => t.parent_id === tpId && t.tipe === 'KKTP');
      const kktp    = kktpAll.find(k => String(k.semester) === String(_rcSemester)) ?? kktpAll[0] ?? null;
      const rows = _roster.map(s => {
        const nilaiAkhir = _hitungNilaiSiswa(s.id, indices, nilaiGrid, _rcMetode, _rcBobots);
        const predikat   = kktp ? getPredikat(nilaiAkhir, getRentang(kktp)) : null;
        return { id: s.id, nama: s.nama, nilaiAkhir, predikat };
      });
      return { tpId, judul: tp ? (tp.judul || tp.konten || '') : '', rows };
    });

    return { groups, skipped };
  }

  async function _simpanRecap(sumatifs, nilaiGrid) {
    if (_nilaiSedangDisimpan) return;
    _nilaiSedangDisimpan = true;
    const btn = el('rc-btn-simpan');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
    try {
      // Kelompokkan sumatif by tp_kktp_id
      const tpGroups = {};
      sumatifs.forEach((a, i) => {
        const key = a.tp_kktp_id ?? '__null__';
        if (!tpGroups[key]) tpGroups[key] = [];
        tpGroups[key].push(i);
      });

      let saved = 0; let skipped = 0;
      for (const [tpId, indices] of Object.entries(tpGroups)) {
        if (tpId === '__null__') { skipped += indices.length; continue; }
        // Pilih KKTP yang semesternya sesuai filter; fallback ke KKTP pertama jika tidak ada.
        const kktpAll = _tpList.filter(t => t.parent_id === tpId && t.tipe === 'KKTP');
        const kktp    = kktpAll.find(k => String(k.semester) === String(_rcSemester)) ?? kktpAll[0] ?? null;

        for (const s of _roster) {
          // Gunakan fungsi bersama agar nilai yang disimpan identik dengan yang ditampilkan
          const nilaiAkhir = _hitungNilaiSiswa(s.id, indices, nilaiGrid, _rcMetode, _rcBobots);
          const predikat      = kktp ? getPredikat(nilaiAkhir, getRentang(kktp)) : null;
          const kktp_tercapai = predikat ? (predikat === 'BSH' || predikat === 'SB') : null;
          await SipApi.upsertGradeRecap(
            _cId, s.id, tpId, _rcSemester, _rcTahun,
            { nilai_akhir: parseFloat(nilaiAkhir.toFixed(2)), kktp_tercapai, deskripsi_capaian: null }
          );
          saved++;
        }
      }

      let msg = `Rekap disimpan (${saved} entri).`;
      if (skipped > 0) msg += ` ${skipped} sumatif tanpa TP dilewati.`;
      toast(msg);
    } catch (err) {
      toast('Gagal menyimpan rekap: ' + (err.message || ''), false);
    } finally {
      _nilaiSedangDisimpan = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan Rekap'; }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // DOMContentLoaded — tab wiring (self-contained, no window export)
  // ══════════════════════════════════════════════════════════════════════════════

  document.addEventListener('DOMContentLoaded', () => {
    const tabPenilaian   = document.getElementById('tab-penilaian');
    const panelPenilaian = document.getElementById('panel-penilaian');
    if (!tabPenilaian || !panelPenilaian) return;

    const otherTabs = ['tab-siswa', 'tab-jadwal', 'tab-catatan', 'tab-rancang']
      .map(id => document.getElementById(id)).filter(Boolean);

    tabPenilaian.addEventListener('click', async () => {
      // Dibaca strip bantuan di classroom.js untuk memutuskan petunjuk mana yang
      // ditampilkan. Tab ini satu-satunya dari lima yang melewatkannya, sehingga
      // currentTab mewarisi nilai tab sebelumnya dan guru yang menekan strip
      // dari sini menerima panduan tab yang salah — lengkap dan meyakinkan,
      // tentang tab yang bukan sedang ia buka. Entri HELP_CONTENT['penilaian']
      // sudah ada sejak awal; yang hilang cuma sambungannya.
      //
      // Diletakkan sebagai pernyataan pertama, sama seperti keempat tab lain.
      window.currentTab = 'penilaian';

      otherTabs.forEach(t => t.classList.remove('active'));
      tabPenilaian.classList.add('active');
      document.querySelectorAll('[id^="panel-"]').forEach(p => { p.style.display = 'none'; });
      panelPenilaian.style.display = '';
      const _cId = new URLSearchParams(window.location.search).get('id');
      if (_cId) try { localStorage.setItem('sip_tab_' + _cId, 'penilaian'); } catch (_) {}

      if (!_loaded) {
        // Tier gate — server authoritative; cache hanya diisi ulang oleh RPC.
        let _ts = null;
        try { _ts = await window.api.getTrialStatus(); } catch (_) {}
        if (_ts && _ts.status === 'EXPIRED') {
          panelPenilaian.innerHTML =
            '<div class="upgrade-tier-banner">' +
            '<strong>Akun Tidak Aktif</strong>' +
            '<p>Akun Anda tidak aktif. Hubungi admin untuk mengaktifkan kembali.</p>' +
            '</div>';
          return;
        }
        // Tab Penilaian terbuka untuk semua tier. Hanya tab Rancang yang
        // dibatasi Guru Pro; gate tier di sini sengaja dihapus.

        const { data: { session } } = await client.auth.getSession();
        if (!session) return;
        const cId = new URLSearchParams(window.location.search).get('id');
        if (!cId) return;
        const { data: prof } = await client
          .from('profiles').select('id, role_guru').eq('user_id', session.user.id).single();
        if (!prof) return;
        _roleGuru = prof.role_guru ?? null;
        await initAssessmentTab(cId, prof.id);
      }
    });

    otherTabs.forEach(t => {
      t.addEventListener('click', () => {
        tabPenilaian.classList.remove('active');
        panelPenilaian.style.display = 'none';
      });
    });

    const cId = new URLSearchParams(window.location.search).get('id');
    if (cId) {
      const saved = localStorage.getItem('sip_tab_' + cId);
      if (saved === 'penilaian') tabPenilaian.click();
    }
  });

  // ─── Download Excel — 4 sheet ────────────────────────────────────────────────

  // Kembalikan string deskriptor hasil penilaian untuk satu siswa dari konten JSONB.
  // Mengembalikan '-' jika siswa tidak dinilai atau format tidak dikenal.
  function extractHasilDiagForm(konten, teknik, instrumen, siswaId) {
    if (!konten || !teknik || !siswaId) return '-';
    try {
      const k = typeof konten === 'string' ? JSON.parse(konten) : konten;
      const TES_LABELS = ['Menjawab dengan baik', 'Menjawab sebagian', 'Belum bisa menjawab'];

      if (teknik === 'OBSERVASI') {
        if (instrumen === 'Lembar Observasi' && Array.isArray(k.aspeks)) {
          const hasil = [];
          for (const a of k.aspeks) {
            const nama = a.nama || '';
            if (Array.isArray(a.terlihat_jelas) && a.terlihat_jelas.includes(siswaId))
              hasil.push(`${nama}: Terlihat jelas`);
            else if (Array.isArray(a.terlihat) && a.terlihat.includes(siswaId))
              hasil.push(`${nama}: Terlihat`);
            else if (Array.isArray(a.belum_terlihat) && a.belum_terlihat.includes(siswaId))
              hasil.push(`${nama}: Belum terlihat`);
          }
          return hasil.length ? hasil.join('; ') : '-';
        }
        if (instrumen === 'Catatan Anekdot' && Array.isArray(k.catatan)) {
          const catatan = k.catatan.filter(c =>
            c.siswa === siswaId || (Array.isArray(c.siswa) && c.siswa.includes(siswaId))
          );
          if (!catatan.length) return '-';
          return catatan.map(c => [c.deskripsi, c.interpretasi].filter(Boolean).join(' | ')).join('; ');
        }
        if (instrumen === 'Checklist' && Array.isArray(k.items)) {
          const checkedItems = k.items
            .filter(it => Array.isArray(it.siswa) && it.siswa.includes(siswaId))
            .map(it => it.nama || '');
          return checkedItems.length ? checkedItems.join('; ') : '-';
        }
      }

      if (teknik === 'TES' && Array.isArray(k.deskriptor)) {
        for (let i = 0; i < k.deskriptor.length; i++) {
          if (Array.isArray(k.deskriptor[i].siswa) && k.deskriptor[i].siswa.includes(siswaId))
            return TES_LABELS[i] ?? `Deskriptor ${i + 1}`;
        }
        return '-';
      }

      if (teknik === 'TES_LISAN') {
        if (instrumen === 'Wawancara' && Array.isArray(k.deskriptor)) {
          for (let i = 0; i < k.deskriptor.length; i++) {
            if (Array.isArray(k.deskriptor[i].siswa) && k.deskriptor[i].siswa.includes(siswaId))
              return TES_LABELS[i] ?? `Deskriptor ${i + 1}`;
          }
          return '-';
        }
        // Monolog / Dialog — konten.predikat
        if (Array.isArray(k.predikat)) {
          for (const p of k.predikat) {
            if (Array.isArray(p.siswa) && p.siswa.includes(siswaId))
              return `${p.val ?? ''}${p.deskripsi ? ': ' + p.deskripsi : ''}`;
          }
          return '-';
        }
      }

      if (['PENUGASAN', 'PROYEK', 'PORTOFOLIO', 'UNJUK_KERJA'].includes(teknik)) {
        if (instrumen === 'Rubrik' && Array.isArray(k.aspeks)) {
          const hasil = [];
          for (const a of k.aspeks) {
            if (!Array.isArray(a.predikat)) continue;
            for (const p of a.predikat) {
              if (Array.isArray(p.siswa) && p.siswa.includes(siswaId))
                hasil.push(`${a.nama || ''}: ${p.val ?? ''}${p.deskripsi ? ' – ' + p.deskripsi : ''}`);
            }
          }
          return hasil.length ? hasil.join('; ') : '-';
        }
        if (instrumen === 'Checklist' && Array.isArray(k.items)) {
          const checked = k.items
            .filter(it => Array.isArray(it.siswa) && it.siswa.includes(siswaId))
            .map(it => it.nama || '');
          return checked.length ? checked.join('; ') : '-';
        }
      }
    } catch (_) { /* parse error */ }
    return '-';
  }

  async function downloadPenilaianExcel() {
    const XLSX = window.XLSX;
    if (!XLSX) { alert('Library Excel tidak tersedia.'); return; }
    // Lapis kedua di belakang tombol yang sudah di-disable: unduhan atas data
    // yang tidak lengkap menghasilkan berkas yang tampak sah padahal bolong.
    if (_loadError) {
      alert('Sebagian data gagal dimuat, jadi isi Excel bisa tidak lengkap. '
        + 'Muat ulang dulu lewat tombol di atas.');
      return;
    }

    const btn = el('btn-unduh-excel-penilaian');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Menyiapkan…'; }

    try {
      const wb = XLSX.utils.book_new();

      // ── Filter aktif di layar ─────────────────────────────────────────────
      // Unduhan mengikuti apa yang sedang ditampilkan, bukan seluruh isi kelas.
      // Mapel hanya menyaring untuk guru wali kelas SD; guru mapel tidak punya
      // dropdown itu sehingga _selMapel tetap null dan seluruh baris ikut.
      const isWali = _roleGuru === 'WALI_KELAS_SD';

      // Sama persis dengan penyaring Section 1: KKTP ikut induknya, dan TP tanpa
      // mapel dianggap berlaku untuk semua mapel.
      function tpLolosFilter(tp) {
        if (!isWali || !_selMapel) return true;
        const induk = tp.parent_id ? _tpList.find(t => t.id === tp.parent_id) : tp;
        return !induk || !induk.mapel || induk.mapel === _selMapel;
      }

      // Sama persis dengan penyaring Section 2: penilaian tanpa TP selalu ikut.
      function asmtLolosFilter(a) {
        if (!isWali || !_selMapel) return true;
        if (!a.tp_kktp_id) return true;
        const tp = _tpList.find(t => t.id === a.tp_kktp_id);
        return !tp || !tp.mapel || tp.mapel === _selMapel;
      }

      const tpTerpilih   = _tpList.filter(tpLolosFilter);
      const asmtTerpilih = _asmts.filter(asmtLolosFilter);

      // ── Sheet 1: Perencanaan Penilaian ────────────────────────────────────
      const s1rows = [['Tipe', 'Judul/Konten', 'Semester', 'Tahun Ajaran', 'BB', 'MB', 'BSH', 'SB']];
      for (const tp of tpTerpilih) {
        if (tp.tipe === 'KKTP') {
          const r = tp.rentang ?? DEFAULT_RENTANG;
          s1rows.push([
            'KKTP',
            // Deskripsi KKTP disimpan di kolom judul, bukan konten: form TP
            // menulis konten: null untuk tipe KKTP dan melabeli field judul
            // sebagai 'Deskripsi'. Membaca konten di sini selalu menghasilkan
            // kolom kosong.
            tp.judul ?? '',
            '',
            '',
            r.BB ? `${r.BB[0]}–${r.BB[1]}` : '',
            r.MB ? `${r.MB[0]}–${r.MB[1]}` : '',
            r.BSH ? `${r.BSH[0]}–${r.BSH[1]}` : '',
            r.SB  ? `${r.SB[0]}–${r.SB[1]}`  : '',
          ]);
        } else {
          s1rows.push([
            tp.tipe,
            tp.tipe === 'CP' ? (tp.konten ?? '') : (tp.judul ?? ''),
            tp.tipe === 'CP' ? '' : (tp.semester ?? ''),
            tp.academic_year ?? '',
            '', '', '', '',
          ]);
        }
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s1rows), 'Perencanaan Penilaian');

      // ── Helper: parse konten JSONB ────────────────────────────────────────
      function parseKonten(raw) {
        if (!raw) return null;
        if (typeof raw !== 'string') return raw;
        try { return JSON.parse(raw); } catch { return null; }
      }

      // ── Sheet 2–3: Diagnostik & Formatif — format melebar ─────────────────
      // Semester dan tahun ajaran dibaca dari TP induknya, mengikuti filter Rekap.
      //
      // Satu aturan _getFilteredJenis() sengaja TIDAK ditiru: di layar, penilaian
      // tanpa TP dibuang karena semesternya tak bisa diketahui. Di unduhan itu
      // salah — penilaian tanpa TP tetap punya hasil yang sudah diisi guru, dan
      // membuangnya membuat sheet tampak kosong tanpa sebab yang terlihat.
      // Diagnostik paling sering kena: asesmen awal lazim dibuat sebelum TP ada,
      // dan kolom tp_kktp_id memang boleh null (lihat form penilaian).
      //
      // Penjaga _rcTahun di bawah kini sisa dari masa ketika semester dan tahun
      // ajaran adalah pilihan guru dan bisa belum terisi. Sejak keduanya menjadi
      // turunan kalender, initPenilaian selalu mengisinya lebih dulu, jadi cabang
      // itu tidak akan pernah tercapai. Dibiarkan sebagai penjaga, bukan jalur.
      //
      // Akibatnya unduhan SELALU tersaring ke semester berjalan — termasuk saat
      // guru mengunduh tanpa pernah membuka panel Rekap. Itu memang bawaan dari
      // keputusan bahwa hanya ada satu semester berjalan.
      function asmtLolosSemester(a) {
        if (!_rcTahun) return true;
        if (!a.tp_kktp_id) return true;
        const tp = _tpList.find(t => t.id === a.tp_kktp_id);
        if (!tp) return true;
        if (tp.semester != null && String(tp.semester) !== String(_rcSemester)) return false;
        if (tp.academic_year && tp.academic_year !== _rcTahun) return false;
        return true;
      }

      const diagAsmts = asmtTerpilih.filter(a => a.jenis === 'DIAGNOSTIK' && asmtLolosSemester(a));
      const formAsmts = asmtTerpilih.filter(a => a.jenis === 'FORMATIF'   && asmtLolosSemester(a));
      const sumAsmts  = asmtTerpilih.filter(a => a.jenis === 'SUMATIF'    && asmtLolosSemester(a));

      // Kepala kolom tiga baris:
      //   1. kode penilaian — {prefix}{n}-{judul TP}, ringkas, untuk ditunjuk
      //   2. teknik dan instrumen — tanpa ini dua penilaian atas TP yang sama
      //      tampak sebagai kolom kembar yang tidak bisa dibedakan guru
      //   3. deskripsi TP utuh — judul TP di baris 1 biasanya cuma "TP 1", yang
      //      tidak memberi tahu guru isi TP-nya apa
      //
      // Baris 3 ditulis penuh tanpa dipendekkan: di layar kolomnya sempit
      // sehingga judul dipotong 10 huruf, di Excel tidak ada batas itu.
      function buildWideSheet(asmts, prefix, jenis, allResults) {
        // Sheet tanpa satu pun kolom penilaian tampak seperti bug: yang terlihat
        // guru cuma No dan Nama Siswa, tanpa petunjuk apa pun. Kalimatnya sama
        // dengan yang dipakai rekap di layar saat filternya tidak menyisakan apa-apa.
        if (!asmts.length) {
          return [
            ['No', 'Nama Siswa'],
            ['', `Belum ada penilaian ${JENIS_LBL[jenis]} untuk filter yang dipilih.`],
          ];
        }

        // Siapkan metadata per penilaian
        const meta = asmts.map((a, i) => {
          const tp  = a.tp_kktp_id ? _tpList.find(t => t.id === a.tp_kktp_id) : null;
          const jud = tp ? (tp.judul || '') : '';
          const sub = [teknikLbl(a.teknik), a.instrumen].filter(Boolean).join(' | ');
          return {
            a,
            konten: parseKonten(a.konten),
            kode:   `${prefix}${i + 1}-${jud || '—'}`,
            sub:    sub || '—',
            // Deskripsi TP. Jatuh kembali ke judul bila TP belum punya konten;
            // kosong bila penilaiannya memang tidak terikat TP mana pun.
            desk:   tp ? (tp.konten || tp.judul || '') : '',
            // Baris hasil per siswa, dikunci student_id -- idiom yang sama
            // dengan sumMeta di sheet Sumatif.
            resMap: Object.fromEntries((allResults?.[i] ?? []).map(r => [r.student_id, r])),
          };
        });

        const rows = [
          ['No', 'Nama Siswa', ...meta.map(m => m.kode)],
          ['',   '',           ...meta.map(m => m.sub)],
          ['',   '',           ...meta.map(m => m.desk)],
        ];
        // Urutannya sama dengan rekap di layar: status dari assessment_results
        // dibaca LEBIH DULU, konten hanya dipakai kalau status kosong.
        //
        // Cadangan ke konten tetap perlu: teknik TES, TES_LISAN, dan OBSERVASI
        // tidak pernah mengisi kolom status -- hasilnya tinggal di
        // assessments.konten -- sehingga tanpa cadangan itu sel tampil '-'
        // untuk penilaian yang sebenarnya sudah lengkap.
        //
        // _rcHasilKonten() dipakai apa adanya, bukan ditulis ulang, supaya
        // Excel dan layar tidak bisa berbeda tafsir soal apa itu 'kosong'.
        const STATUS_MAP = jenis === 'FORMATIF' ? STATUS_FORMATIF_LBL : STATUS_LBL;
        function selTeks(m, sid) {
          const r     = m.resMap[sid];
          const st    = r?.status ? (STATUS_MAP[r.status] ?? r.status) : null;
          const utama = st ?? _rcHasilKonten(m.a, sid);
          // Grup diferensiasi hanya milik Diagnostik. Ia bisa berdiri sendiri
          // tanpa status, persis seperti di layar.
          const grup  = jenis === 'DIAGNOSTIK' ? (r?.grup_diferensiasi || '') : '';
          if (!utama) return grup ? `Grup ${grup}` : '-';
          return grup ? `${utama} (Grup ${grup})` : utama;
        }

        _roster.forEach((siswa, idx) => {
          const row = [idx + 1, siswa.nama];
          for (const m of meta) {
            row.push(selTeks(m, siswa.id));
          }
          rows.push(row);
        });
        return rows;
      }

      // Hasil per siswa untuk ketiga jenis diambil sekali, bersamaan.
      // Diagnostik dan Formatif sebelumnya tidak diambil sama sekali: selnya
      // hanya membaca assessments.konten, sehingga penilaian berbasis chip per
      // siswa -- yang menyimpan hasilnya di assessment_results -- tampil '-'
      // di Excel padahal terisi di layar.
      //
      // Satu Promise.all untuk ketiganya, bukan tiga gelombang berurutan:
      // jumlah permintaannya sama, tapi tidak saling menunggu. Promise.all([])
      // menghasilkan [], jadi jenis yang kosong tidak perlu dijaga terpisah.
      const ambilHasil = list =>
        Promise.all(list.map(a => SipApi.getAssessmentResults(a.id).catch(() => [])));
      const [diagAllRes, formAllRes, sumAllRes] = await Promise.all([
        ambilHasil(diagAsmts), ambilHasil(formAsmts), ambilHasil(sumAsmts),
      ]);

      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildWideSheet(diagAsmts, 'D', 'DIAGNOSTIK', diagAllRes)), 'Diagnostik');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildWideSheet(formAsmts, 'F', 'FORMATIF', formAllRes)), 'Formatif');

      // ── Sheet 4: Sumatif — format melebar (3 kolom per penilaian) ─────────
      const sumMeta = sumAsmts.map((a, i) => {
        const tp    = a.tp_kktp_id ? _tpList.find(t => t.id === a.tp_kktp_id) : null;
        const kktp0 = tp ? _tpList.find(k => k.parent_id === tp.id && k.tipe === 'KKTP') : null;
        const jud   = tp ? (tp.judul || '') : '';
        const sub   = [teknikLbl(a.teknik), a.instrumen].filter(Boolean).join(' | ');
        const resMap = Object.fromEntries((sumAllRes[i] ?? []).map(r => [r.student_id, r]));
        return {
          a, kktp0, resMap,
          kode: `S${i + 1}-${jud || '—'}`,
          sub:  sub || '—',
          desk: tp ? (tp.konten || tp.judul || '') : '',
        };
      });

      // Kepala kolom mengikuti pola buildWideSheet, ditambah satu baris terakhir
      // berisi nama medan. Sebelumnya keempat medan itu memikul seluruh label di
      // satu baris — "Nilai (1. PENUGASAN-Rubrik (TP 1))" — sehingga label yang
      // sama terulang empat kali dan kolomnya melebar tanpa guna.
      //
      // Kode, teknik, dan deskripsi diulang di keempat kolom satu penilaian
      // dengan sengaja: aoa_to_sheet tidak menggabung sel, jadi kalau tiga
      // kolom terakhir dikosongkan pembaca kehilangan penanda kelompoknya.
      const SUM_FIELDS = ['Nilai', 'Predikat', 'Tindak Lanjut', 'Refleksi Guru'];
      // Pola sama dengan buildWideSheet: sheet tanpa satu pun kolom penilaian
      // tampak seperti bug kalau yang terlihat guru cuma empat baris kepala
      // kolom kosong. Kalimatnya pun sama supaya ketiga sheet berbunyi seragam.
      let sumRows;
      if (!sumAsmts.length) {
        sumRows = [
          ['No', 'Nama Siswa'],
          ['', `Belum ada penilaian ${JENIS_LBL.SUMATIF} untuk filter yang dipilih.`],
        ];
      } else {
        sumRows = [
          ['No', 'Nama Siswa', ...sumMeta.flatMap(m => SUM_FIELDS.map(() => m.kode))],
          ['',   '',           ...sumMeta.flatMap(m => SUM_FIELDS.map(() => m.sub))],
          ['',   '',           ...sumMeta.flatMap(m => SUM_FIELDS.map(() => m.desk))],
          ['',   '',           ...sumMeta.flatMap(() => SUM_FIELDS)],
        ];
        _roster.forEach((siswa, idx) => {
          const row = [idx + 1, siswa.nama];
          for (const m of sumMeta) {
            const r = m.resMap[siswa.id];
            const nilai = r?.nilai ?? '-';
            const predikat = (r?.nilai != null && m.kktp0)
              ? getPredikat(r.nilai, getRentang(m.kktp0)) : '-';
            row.push(nilai, predikat, r?.tindak_lanjut ?? '-', m.a.refleksi_guru ?? '-');
          }
          sumRows.push(row);
        });
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sumRows), 'Sumatif');

      // ── Sheet 5: Rekap Penilaian ──────────────────────────────────────────
      const s5rows = [['Semester', 'Tahun Ajaran', 'TP', 'Nama Siswa', 'Nilai Akhir', 'Predikat', 'KKTP Tercapai']];

      // Ikuti semester dan tahun ajaran berjalan. Cabang penyapu di bawah — dulu
      // dipakai saat _rcTahun masih bisa null karena Rekap belum pernah dibuka —
      // kini tidak akan pernah tercapai: initPenilaian selalu mengisi keduanya
      // dari kalender. Dibiarkan sebagai penjaga, bukan jalur yang hidup.
      const semesters = _rcTahun ? [String(_rcSemester)] : ['1', '2'];
      const years     = _rcTahun
        ? [_rcTahun]
        : (() => {
            const y = [...new Set(_tpList.map(t => t.academic_year).filter(Boolean))];
            return y.length ? y : [DEFAULT_YEAR];
          })();

      let hasRecap = false;
      for (const sem of semesters) {
        for (const yr of years) {
          const rows = await SipApi.getGradeRecap(_cId, sem, yr).catch(() => []);
          for (const r of rows) {
            const tp = _tpList.find(t => t.id === r.tp_kktp_id);
            // Rekap milik TP yang tersaring keluar tidak ikut diunduh.
            if (tp && !tpLolosFilter(tp)) continue;
            hasRecap = true;
            const siswa = _roster.find(s => s.id === r.student_id);
            // Predikat mengikuti rentang KKTP milik TP-nya; DEFAULT_RENTANG hanya
            // dipakai bila TP itu belum punya KKTP sama sekali.
            const kktp    = tp ? _tpList.find(t => t.parent_id === tp.id && t.tipe === 'KKTP') : null;
            const rentang = kktp ? getRentang(kktp) : DEFAULT_RENTANG;
            s5rows.push([
              sem, yr,
              tp ? (tp.judul || tp.konten || '') : '',
              siswa?.nama ?? r.student_id,
              r.nilai_akhir ?? '',
              r.nilai_akhir != null ? getPredikat(r.nilai_akhir, rentang) : '',
              r.kktp_tercapai === true ? 'Ya' : r.kktp_tercapai === false ? 'Tidak' : '',
            ]);
          }
        }
      }
      if (!hasRecap) s5rows.push(['', '', '', 'Belum ada rekap tersimpan', '', '', '']);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s5rows), 'Rekap Penilaian');

      // ── Unduh ─────────────────────────────────────────────────────────────
      const nama  = (window._classroomName || 'Kelas').replace(/[\\/:*?"<>|]/g, '_');
      const tanggal = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Penilaian_${nama}_${tanggal}.xlsx`);
    } catch (err) {
      console.error('downloadPenilaianExcel error:', err);
      alert('Gagal mengunduh Excel: ' + (err.message ?? err));
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '⬇ Unduh Excel'; }
    }
  }

}());
