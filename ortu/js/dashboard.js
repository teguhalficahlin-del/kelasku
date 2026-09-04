const db   = window.supabaseClient;
const DAYS = ['SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];
let _ortuProfileId = null;
let _ortuProfile   = null;

// ---- Attendance helpers (ortu) ----
function _todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _getPresetRange(preset) {
  const now = new Date(); const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (preset === 'hari') return [_todayStr(), _todayStr()];
  if (preset === 'minggu') {
    const day = now.getDay(); const diff = day === 0 ? -6 : 1 - day;
    return [_dateToStr(new Date(y,m,d+diff)), _dateToStr(new Date(y,m,d+diff+6))];
  }
  if (preset === 'bulan') return [`${y}-${String(m+1).padStart(2,'0')}-01`, _dateToStr(new Date(y,m+1,0))];
  if (preset === 'semester') return m >= 6 ? [`${y}-07-01`,`${y}-12-31`] : [`${y}-01-01`,`${y}-06-30`];
  return [_todayStr(), _todayStr()];
}
async function getChildAttendance(classroomId, studentId, fromDate, toDate) {
  const { data, error } = await db.from('attendance')
    .select('tanggal,status,schedules(start_time,end_time)')
    .eq('classroom_id', classroomId)
    .eq('student_id', studentId)
    .gte('tanggal', fromDate)
    .lte('tanggal', toDate)
    .order('tanggal', { ascending: false });
  if (error) { console.error('getChildAttendance', error); return []; }
  return data || [];
}
function _buildAttSummary(rows) {
  const c = { HADIR:0, SAKIT:0, IZIN:0, ALPHA:0 };
  rows.forEach(r => { if (c[r.status] !== undefined) c[r.status]++; });
  return c;
}
function _renderAttSummary(c, total) {
  const pct = n => total ? Math.round(n/total*100) : 0;
  return `<div class="att-sum-grid">` +
    `<div class="att-sum-card att-sum-hadir"><div class="att-sum-label">Hadir</div><div class="att-sum-num">${c.HADIR}</div><div class="att-sum-pct">${pct(c.HADIR)}%</div></div>` +
    `<div class="att-sum-card att-sum-sakit"><div class="att-sum-label">Sakit</div><div class="att-sum-num">${c.SAKIT}</div><div class="att-sum-pct">${pct(c.SAKIT)}%</div></div>` +
    `<div class="att-sum-card att-sum-izin"><div class="att-sum-label">Izin</div><div class="att-sum-num">${c.IZIN}</div><div class="att-sum-pct">${pct(c.IZIN)}%</div></div>` +
    `<div class="att-sum-card att-sum-alpha"><div class="att-sum-label">Alpha</div><div class="att-sum-num">${c.ALPHA}</div><div class="att-sum-pct">${pct(c.ALPHA)}%</div></div>` +
  `</div>`;
}
function _renderAttTable(rows) {
  if (!rows.length) return '<p class="att-empty">Belum ada data absensi dalam rentang ini.</p>';
  const MONTH_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const STATUS_LABEL = { HADIR:'Hadir', SAKIT:'Sakit', IZIN:'Izin', ALPHA:'Alpha' };
  const STATUS_CLASS = { HADIR:'att-row-h', SAKIT:'att-row-s', IZIN:'att-row-i', ALPHA:'att-row-a' };
  return `<div class="att-table-wrap"><table class="att-table"><thead><tr><th>Tanggal</th><th>Jam</th><th>Status</th></tr></thead><tbody>` +
    rows.map(r => {
      const [yr,mo,dy] = r.tanggal.split('-').map(Number);
      const tgl = `${dy} ${MONTH_ID[mo-1]} ${yr}`;
      const jam = r.schedules ? `${String(r.schedules.start_time).slice(0,5)}–${String(r.schedules.end_time).slice(0,5)}` : '—';
      return `<tr class="${STATUS_CLASS[r.status]||''}"><td>${escHtml(tgl)}</td><td>${escHtml(jam)}</td><td>${STATUS_LABEL[r.status]||r.status}</td></tr>`;
    }).join('') +
  `</tbody></table></div>`;
}
function renderChildAttendanceSection(classroomId, studentId, siswaNama) {
  const wrap = document.createElement('div');
  wrap.className = 'att-section';

  const PAGE_SIZE = 10;
  let currentPreset = 'hari';
  let _rows = [];
  let _page = 1;

  wrap.innerHTML =
    `<div class="att-title">Kehadiran ${escHtml(siswaNama)}</div>` +
    `<div class="att-filters">` +
      ['hari','minggu','bulan','semester'].map(p =>
        `<button class="att-preset${p===currentPreset?' active':''}" data-preset="${p}">${
          p==='hari'?'Hari ini':p==='minggu'?'Minggu ini':p==='bulan'?'Bulan ini':'Semester ini'
        }</button>`
      ).join('') +
    `</div>` +
    `<div class="att-body"><p class="att-empty">Memuat…</p></div>`;

  const bodyEl = wrap.querySelector('.att-body');

  function renderPage() {
    const total = _rows.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (_page > totalPages) _page = totalPages;
    const slice = _rows.slice((_page-1)*PAGE_SIZE, _page*PAGE_SIZE);
    let html = total > 0 ? _renderAttSummary(_buildAttSummary(_rows), total) : '';
    html += _renderAttTable(slice);
    if (total > PAGE_SIZE) {
      html += `<div class="att-pagination">` +
        `<button class="att-pg-btn" data-dir="-1"${_page===1?' disabled':''}>←</button>` +
        `<span class="att-pg-label">Hal. ${_page} / ${totalPages}</span>` +
        `<button class="att-pg-btn" data-dir="1"${_page===totalPages?' disabled':''}>→</button>` +
      `</div>`;
    }
    bodyEl.innerHTML = html;
    bodyEl.querySelectorAll('.att-pg-btn').forEach(b => {
      b.addEventListener('click', () => { _page += Number(b.dataset.dir); renderPage(); });
    });
  }

  async function refresh(from, to) {
    bodyEl.innerHTML = '<p class="att-empty">Memuat…</p>';
    try {
      _rows = await getChildAttendance(classroomId, studentId, from, to);
    } catch (err) {
      console.error('attendance', err);
      bodyEl.innerHTML = '<p class="att-empty">Gagal memuat data. Coba muat ulang halaman.</p>';
      return;
    }
    renderPage();
  }

  const [f0, t0] = _getPresetRange(currentPreset);
  refresh(f0, t0);

  wrap.querySelectorAll('.att-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.att-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPreset = btn.dataset.preset;
      _page = 1;
      const [f,t] = _getPresetRange(currentPreset);
      refresh(f,t);
    });
  });

  return wrap;
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtTime(t) { return t ? String(t).slice(0,5) : ''; }
function dayLabel(d) { return d[0] + d.slice(1).toLowerCase(); }

async function getProfile(userId) {
  const { data, error } = await db
    .from('profiles')
    .select('id, full_name, role')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data;
}

async function getClassroomMembers(profileId) {
  const { data, error } = await db
    .from('classroom_members')
    .select('classroom_id, linked_student_id, classrooms(id, name, subject, classroom_code, teacher_id)')
    .eq('profile_id', profileId)
    .eq('member_role', 'ORTU');
  if (error) throw error;
  return data;
}

async function getSchedules(classroomId) {
  const { data, error } = await db
    .from('schedules')
    .select('day_of_week,start_time,end_time,is_active,inactive_reason')
    .eq('classroom_id', classroomId)
    .order('day_of_week').order('start_time');
  if (error) return [];
  return data || [];
}

function renderScheduleSection(schedules) {
  const byDay = {};
  DAYS.forEach(d => { byDay[d] = []; });
  schedules.forEach(s => { if (byDay[s.day_of_week]) byDay[s.day_of_week].push(s); });

  const activeDays = DAYS.filter(d => byDay[d].length > 0);
  const div = document.createElement('div');
  div.className = 'card-schedules';

  if (activeDays.length === 0) {
    div.innerHTML = '<span class="sch-empty-msg">Belum ada jadwal.</span>';
    return div;
  }

  const title = document.createElement('div');
  title.className = 'sch-section-title';
  title.textContent = 'Jadwal Belajar';
  div.appendChild(title);

  activeDays.forEach(day => {
    byDay[day].forEach(s => {
      const slot = document.createElement('div');
      slot.className = 'sch-slot';

      const dayEl = document.createElement('span');
      dayEl.className = 'sch-day-name';
      dayEl.textContent = dayLabel(day);
      slot.appendChild(dayEl);

      const timeEl = document.createElement('span');
      timeEl.className   = 'sch-slot-time';
      timeEl.textContent = fmtTime(s.start_time) + ' – ' + fmtTime(s.end_time);
      slot.appendChild(timeEl);

      const badge = document.createElement('span');
      badge.className   = s.is_active ? 'badge-aktif' : 'badge-nonaktif';
      badge.textContent = s.is_active ? 'Aktif' : 'Nonaktif';
      slot.appendChild(badge);

      if (!s.is_active && s.inactive_reason) {
        const reason = document.createElement('span');
        reason.className   = 'sch-reason';
        reason.textContent = s.inactive_reason;
        slot.appendChild(reason);
      }

      div.appendChild(slot);
    });
  });

  return div;
}

async function getProfileName(profileId) {
  if (!profileId) return '—';
  const { data, error } = await db
    .rpc('fn_lookup_profile_name', { p_profile_id: profileId });
  if (error || !data) return '—';
  return data;
}

function renderCard(classroom, guruName, siswaNama, schedules, linkedStudentId, namaAnakSekelas) {
  const card = document.createElement('div');
  card.className = 'classroom-card';
  card.innerHTML =
    '<div class="card-header">' +
      '<span class="card-name">'    + escHtml(classroom.name)             + '</span>' +
      '<span class="card-code">'    + escHtml(classroom.classroom_code)   + '</span>' +
    '</div>' +
    '<div class="card-subject">'   + escHtml(classroom.subject ?? '')    + '</div>' +
    '<div class="card-teacher">Guru: '          + escHtml(guruName)      + '</div>' +
    '<div class="card-student">Siswa: ' + escHtml(siswaNama)             + '</div>';
  card.appendChild(renderScheduleSection(schedules));
  if (linkedStudentId) card.appendChild(renderChildAttendanceSection(classroom.id, linkedStudentId, siswaNama));
  if (linkedStudentId) card.appendChild(renderChildNotesSection(classroom, linkedStudentId));
  if (linkedStudentId) card.appendChild(renderPesanGuruSection(classroom, linkedStudentId));
  if (linkedStudentId) card.appendChild(
    renderChildGradesSection(classroom.id, linkedStudentId, siswaNama, namaAnakSekelas));
  card.appendChild(renderForumSection(classroom, linkedStudentId));
  return card;
}

async function getChildNotes(classroomId, linkedStudentId) {
  const { data, error } = await db.from('student_notes')
    .select('id, content, is_visible_to_student, is_visible_to_parent, created_at, announcement_id')
    .eq('classroom_id', classroomId)
    .eq('student_id', linkedStudentId)
    .eq('is_visible_to_parent', true)
    .order('created_at', { ascending: false });
  if (error) { console.error('getChildNotes', error); return []; }
  return data || [];
}

// ---- Pesan ortu <-> guru ----------------------------------------------------
// Kanal dua arah yang berdiri sendiri, terpisah penuh dari Catatan. Catatan
// milik guru dan hanya dibaca; Pesan tidak terikat catatan mana pun.
async function getChildMessages(classroomId, studentId) {
  const { data, error } = await db.from('parent_messages')
    .select('id, author_role, content, created_at, read_at')
    .eq('classroom_id', classroomId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getChildMessages', error); return []; }
  return data || [];
}

async function kirimPesanOrtu(classroom, studentId, content) {
  const { data, error } = await db.from('parent_messages')
    .insert({
      classroom_id:      classroom.id,
      teacher_id:        classroom.teacher_id,
      student_id:        studentId,
      author_profile_id: _ortuProfileId,
      author_role:       'ORTU',
      content,
    })
    .select('id, author_role, content, created_at, read_at')
    .single();
  if (error) throw error;
  return data;
}

function pesanItemHtml(m) {
  const dariGuru = m.author_role === 'GURU';
  const nama  = dariGuru ? 'Guru' : 'Anda';
  const warna = dariGuru ? 'var(--gold)' : 'var(--color-text-muted)';
  const tgl   = fmtTgl(String(m.created_at).slice(0, 10));
  return `<div class="note-item" style="border-left:2px solid ${warna};padding-left:.6rem;margin-top:.4rem">
    <div class="note-item-meta"><strong style="color:${warna}">${nama}</strong> · ${escHtml(tgl)}</div>
    <div class="note-item-content">${escHtml(m.content)}</div>
  </div>`;
}

// Kotak tulis pesan. onKirim menerima teks dan mengembalikan Promise.
function komposerHtml(idKotak, placeholder, labelTombol) {
  return `<div style="margin-top:.5rem">
    <textarea id="${idKotak}" rows="2" maxlength="1000" placeholder="${escHtml(placeholder)}"
      class="portal-textarea"></textarea>
    <div style="display:flex;align-items:center;gap:.5rem;margin-top:.35rem">
      <button type="button" id="${idKotak}-btn"
        style="padding:.35rem .9rem;border:none;border-radius:.35rem;background:var(--gold);
        color:var(--text-on-gold,#000);font-weight:600;cursor:pointer">${escHtml(labelTombol)}</button>
      <span id="${idKotak}-msg" style="font-size:.8rem;color:var(--color-text-muted)"></span>
    </div>
  </div>`;
}

// Status ditulis lewat pencarian ulang berdasarkan id, bukan lewat referensi
// yang ditangkap saat pemasangan listener. Alasannya: onKirim yang berhasil
// memanggil render(), dan render() mengganti seluruh isi seksi — elemen yang
// tadinya dipegang sudah terlepas dari dokumen. Menulis ke elemen terlepas
// tidak menghasilkan error apa pun, hanya diam: orang tua menekan Kirim dan
// tidak pernah melihat satu pun konfirmasi.
function tulisStatus(idKotak, teks) {
  const el = document.getElementById(idKotak + '-msg');
  if (el) el.textContent = teks;
}

function wireKomposer(idKotak, onKirim) {
  const ta  = document.getElementById(idKotak);
  const btn = document.getElementById(idKotak + '-btn');
  if (!ta || !btn) return;
  btn.addEventListener('click', async () => {
    const teks = ta.value.trim();
    if (!teks) { tulisStatus(idKotak, 'Pesan tidak boleh kosong.'); return; }
    btn.disabled = true;
    tulisStatus(idKotak, 'Mengirim…');
    try {
      await onKirim(teks);
      // Kotak tulis yang baru sudah kosong dengan sendirinya; yang perlu
      // dipastikan hanyalah konfirmasinya sampai ke layar.
      tulisStatus(idKotak, 'Terkirim.');
    } catch (err) {
      console.error('kirim pesan', err);
      tulisStatus(idKotak, 'Gagal mengirim. Coba lagi.');
    } finally {
      // Tombol yang lama mungkin sudah terlepas; yang menerima klik berikutnya
      // adalah tombol hasil render ulang, dan tombol itu lahir dalam keadaan
      // aktif. Baris ini tetap dipertahankan untuk jalur gagal, yang tidak
      // memicu render ulang.
      btn.disabled = false;
    }
  });
}

// Seksi pesan mandiri: percakapan yang tidak menempel pada catatan tertentu.
// Jadikan satu seksi dapat dilipat, default tertutup.
// Kartu classroom di layar HP jadi ringkas; pembaca membuka bagian yang
// ingin dilihat saja. Menerima beberapa elemen isi karena sebagian seksi
// punya baris keterangan di atas badannya.
function pasangCollapse(title, ...isi) {
  const arrow = document.createElement('span');
  arrow.textContent = '▶';
  arrow.style.cssText = 'float:right;font-size:.8em;opacity:.7';
  title.appendChild(arrow);
  title.style.cursor = 'pointer';
  title.setAttribute('role', 'button');
  title.setAttribute('tabindex', '0');
  title.setAttribute('aria-expanded', 'false');

  isi.forEach(el => { if (el) el.style.display = 'none'; });

  function toggle() {
    const tertutup = isi[0] && isi[0].style.display === 'none';
    isi.forEach(el => { if (el) el.style.display = tertutup ? '' : 'none'; });
    arrow.textContent = tertutup ? '▼' : '▶';
    title.setAttribute('aria-expanded', tertutup ? 'true' : 'false');
  }

  title.addEventListener('click', toggle);
  title.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
}

function renderPesanGuruSection(classroom, studentId) {
  const wrap = document.createElement('div');
  wrap.className = 'notes-section';

  const title = document.createElement('div');
  title.className = 'sch-section-title';
  title.textContent = 'Pesan';
  wrap.appendChild(title);

  const body = document.createElement('div');
  body.innerHTML = '<p class="att-empty">Memuat…</p>';
  wrap.appendChild(body);

  pasangCollapse(title, body);

  let _belumDibaca = 0;

  function updateBadge(n) {
    title.querySelector('.badge-unread')?.remove();
    if (n > 0) {
      const b = document.createElement('span');
      b.className = 'badge-unread';
      b.textContent = n;
      title.appendChild(b);
    }
  }

  // Mark as read when user opens section
  title.addEventListener('click', () => {
    setTimeout(async () => {
      if (title.getAttribute('aria-expanded') === 'true' && _belumDibaca > 0) {
        _belumDibaca = 0;
        updateBadge(0);
        try {
          await db.from('parent_messages')
            .update({ read_at: new Date().toISOString() })
            .eq('classroom_id', classroom.id)
            .eq('student_id', studentId)
            .eq('author_role', 'GURU')
            .is('read_at', null);
        } catch (_) { /* silent — RLS mungkin belum izinkan */ }
      }
    }, 0);
  });

  const idKotak = `pesan-${classroom.id}`;

  function render(rows) {
    const daftar = rows.length
      ? rows.map(pesanItemHtml).join('')
      : '<p class="att-empty">Belum ada pesan. Gunakan kotak di bawah untuk menghubungi guru — misalnya bila anak Anda berhalangan hadir.</p>';
    body.innerHTML = daftar + komposerHtml(idKotak, 'Tulis pesan untuk guru…', 'Kirim');
    wireKomposer(idKotak, async (teks) => {
      const baru = await kirimPesanOrtu(classroom, studentId, teks);
      rows.push(baru);
      render(rows);
    });
  }

  getChildMessages(classroom.id, studentId)
    .then(rows => {
      _belumDibaca = rows.filter(m => m.author_role === 'GURU' && !m.read_at).length;
      updateBadge(_belumDibaca);
      render(rows);
    })
    .catch(err => {
      console.error('pesan', err);
      body.innerHTML = '<p class="att-empty">Gagal memuat pesan. Coba muat ulang halaman.</p>';
    });

  return wrap;
}

function renderChildNotesSection(classroom, linkedStudentId) {
  const wrap = document.createElement('div');
  wrap.className = 'notes-section';

  const title = document.createElement('div');
  title.className = 'sch-section-title';
  title.textContent = 'Catatan dari Guru';
  wrap.appendChild(title);

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:.8rem;color:var(--color-text-muted);margin-bottom:.35rem';
  hint.textContent = 'Catatan bersifat satu arah. Untuk menanggapi, gunakan bagian Pesan di bawah.';
  wrap.appendChild(hint);

  const body = document.createElement('div');
  body.innerHTML = '<p class="att-empty">Memuat…</p>';
  wrap.appendChild(body);

  pasangCollapse(title, hint, body);

  getChildNotes(classroom.id, linkedStudentId).then(rows => {
    if (rows.length === 0) {
      body.innerHTML = '<p class="att-empty">Belum ada catatan untuk anak Anda.</p>';
      return;
    }
    body.innerHTML = rows.map(n => {
      const tgl = fmtTgl(n.created_at.slice(0, 10));
      const vis = n.is_visible_to_student ? '👨‍👩‍👦 Siswa &amp; Ortu' : '👨‍👩‍👧 Ortu saja';
      // Pengumuman kelas dikirim ke seluruh kelas sekaligus; tanpa penanda,
      // isinya terbaca seolah ditujukan kepada satu siswa ini saja.
      const badge = n.announcement_id
        ? '<div class="note-badge-pengumuman">📢 Pengumuman Kelas</div>'
        : '';
      return `<div class="note-item">
        ${badge}
        <div class="note-item-meta">${escHtml(tgl)} · <span style="font-size:.8rem;color:var(--color-text-muted)">${vis}</span></div>
        <div class="note-item-content">${escHtml(n.content)}</div>
      </div>`;
    }).join('');
  }).catch(err => {
    console.error('notes', err);
    body.innerHTML = '<p class="att-empty">Gagal memuat data. Coba muat ulang halaman.</p>';
  });

  return wrap;
}

// ── Forum ortu: lihat posting guru (is_visible_to_ortu) + posting sendiri ────
// Ortu bisa membuat posting + komentar di posting guru

async function getForumPosts(classroomId) {
  const { data, error } = await db.from('forum_posts')
    .select('id, title, content, author_id, author_role, is_visible_to_student, created_at')
    .eq('classroom_id', classroomId)
    .order('created_at', { ascending: false });
  if (error) { console.error('getForumPosts ortu', error); return []; }
  return data || [];
}

async function getForumComments(postId) {
  const { data, error } = await db.from('forum_comments')
    .select('id, author_id, content, created_at, profiles!author_id(full_name, role)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getForumComments', error); return []; }
  return data || [];
}

async function kirimForumPost(classroom, content, title, visibleToStudent) {
  const { data, error } = await db.from('forum_posts')
    .insert({
      classroom_id:          classroom.id,
      author_id:             _ortuProfileId,
      author_role:           'ORTU',
      content,
      title:                 title || null,
      is_visible_to_student: visibleToStudent,
    })
    .select('id, title, content, author_id, author_role, is_visible_to_student, created_at')
    .single();
  if (error) throw error;
  return data;
}

async function kirimForumKomentar(postId, classroom, content) {
  const { data, error } = await db.from('forum_comments')
    .insert({
      post_id:      postId,
      classroom_id: classroom.id,
      teacher_id:   classroom.teacher_id,
      author_id:    _ortuProfileId,
      content,
    })
    .select('id, author_id, content, created_at, profiles!author_id(full_name, role)')
    .single();
  if (error) throw error;
  return data;
}

function renderForumSection(classroom, linkedStudentId) {
  const classroomId = classroom.id;
  const wrap = document.createElement('div');
  wrap.className = 'notes-section';

  const title = document.createElement('div');
  title.className = 'sch-section-title';
  title.textContent = 'Forum';
  wrap.appendChild(title);

  const body = document.createElement('div');
  body.innerHTML = '<p class="att-empty">Memuat…</p>';
  wrap.appendChild(body);
  pasangCollapse(title, body);

  function komenHtml(c) {
    const nama  = c.profiles?.full_name || '—';
    const label = (c.profiles?.role === 'GURU') ? 'Guru' : 'Ortu';
    const isMine = c.author_id === _ortuProfileId;
    const tgl   = fmtTgl(String(c.created_at).slice(0, 10));
    return `<div class="forum-comment" data-cid="${escHtml(c.id)}">
      <div class="note-item-meta">
        <strong>${escHtml(nama)}</strong> (${escHtml(label)}) · ${escHtml(tgl)}
      </div>
      <div class="note-item-content">${escHtml(c.content)}</div>
    </div>`;
  }

  function postHtml(p) {
    const tgl    = fmtTgl(String(p.created_at).slice(0, 10));
    const isMine = p.author_id === _ortuProfileId;
    const label  = isMine ? 'Postingan Anda' : 'Guru';
    const visBadge = isMine && p.is_visible_to_student
      ? ' <span style="font-size:.75rem;color:var(--gold)">(tampil ke anak)</span>' : '';
    return `<div class="note-item forum-post-ortu" data-pid="${escHtml(p.id)}">
      <div class="note-item-meta"><strong>${escHtml(label)}</strong> · ${escHtml(tgl)}${visBadge}</div>
      ${p.title ? `<div style="font-weight:600;margin-bottom:.2rem">${escHtml(p.title)}</div>` : ''}
      <div class="note-item-content" style="margin-bottom:.4rem">${escHtml(p.content)}</div>
      <div class="forum-comments-ortu" id="fclist-${escHtml(p.id)}">
        <p class="att-empty" style="font-size:.8rem">Memuat komentar…</p>
      </div>
      <div class="forum-komentar-form" data-pid="${escHtml(p.id)}" style="margin-top:.35rem">
        <textarea rows="2" maxlength="500" placeholder="Tulis komentar…"
          class="portal-textarea"></textarea>
        <button type="button" style="margin-top:.25rem;padding:.3rem .7rem;
          background:var(--gold);color:var(--text-on-gold,#000);border:none;
          border-radius:.4rem;cursor:pointer;font-family:inherit;font-size:.85rem">Kirim</button>
        <span class="forum-komentar-status" style="font-size:.8rem;color:var(--color-text-muted);margin-left:.4rem"></span>
      </div>
    </div>`;
  }

  function wireKomenForms(posts) {
    posts.forEach(p => {
      const listEl = document.getElementById('fclist-' + p.id);
      if (!listEl) return;
      getForumComments(p.id).then(comments => {
        listEl.innerHTML = comments.length
          ? comments.map(komenHtml).join('')
          : '<p class="att-empty" style="font-size:.8rem">Belum ada komentar.</p>';
      }).catch(() => {
        listEl.innerHTML = '<p class="att-empty" style="font-size:.8rem">Gagal memuat komentar.</p>';
      });

      const form   = body.querySelector(`.forum-komentar-form[data-pid="${p.id}"]`);
      if (!form) return;
      const ta     = form.querySelector('textarea');
      const btn    = form.querySelector('button');
      const status = form.querySelector('.forum-komentar-status');
      btn.addEventListener('click', async () => {
        const teks = ta.value.trim();
        if (!teks) return;
        btn.disabled = true;
        status.textContent = 'Mengirim…';
        try {
          const c = await kirimForumKomentar(p.id, classroom, teks);
          ta.value = '';
          const noComment = listEl.querySelector('.att-empty');
          if (noComment) noComment.remove();
          listEl.insertAdjacentHTML('beforeend', komenHtml(c));
          status.textContent = '';
        } catch (err) {
          status.textContent = 'Gagal: ' + err.message;
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  // Form buat posting baru
  const formWrap = document.createElement('div');
  formWrap.style.cssText = 'margin-bottom:.75rem;';
  formWrap.innerHTML = `
    <details style="background:var(--bg-card,rgba(255,255,255,.04));border-radius:.4rem;padding:.5rem .75rem;border:1px solid var(--color-border,rgba(255,255,255,.12))">
      <summary style="cursor:pointer;font-size:.9rem;font-weight:600;list-style:none">+ Tulis Posting Baru</summary>
      <div style="margin-top:.5rem;display:flex;flex-direction:column;gap:.4rem">
        <input type="text" id="forum-ortu-title-${classroomId}" placeholder="Judul (opsional)" maxlength="200"
          class="portal-input">
        <textarea id="forum-ortu-content-${classroomId}" rows="3" maxlength="2000" required
          placeholder="Tulis pesan untuk guru…"
          class="portal-textarea" style="margin-top:.35rem"></textarea>
        <label style="font-size:.85rem;display:flex;align-items:center;gap:.4rem">
          <input type="checkbox" id="forum-ortu-vis-${classroomId}">
          Tampilkan juga ke anak saya
        </label>
        <div style="display:flex;align-items:center;gap:.6rem">
          <button type="button" id="forum-ortu-kirim-${classroomId}"
            style="padding:.35rem .8rem;background:var(--gold);color:var(--text-on-gold,#000);
            border:none;border-radius:.4rem;cursor:pointer;font-family:inherit;font-size:.9rem">Kirim Posting</button>
          <span id="forum-ortu-status-${classroomId}" style="font-size:.8rem;color:var(--color-text-muted)"></span>
        </div>
      </div>
    </details>`;
  body.insertAdjacentElement('afterbegin', formWrap);

  // Pasang listener form posting
  setTimeout(() => {
    const btn    = document.getElementById('forum-ortu-kirim-' + classroomId);
    const taEl   = document.getElementById('forum-ortu-content-' + classroomId);
    const titEl  = document.getElementById('forum-ortu-title-' + classroomId);
    const visEl  = document.getElementById('forum-ortu-vis-' + classroomId);
    const stEl   = document.getElementById('forum-ortu-status-' + classroomId);
    if (!btn || !taEl) return;
    btn.addEventListener('click', async () => {
      const teks = taEl.value.trim();
      if (!teks) return;
      btn.disabled = true;
      stEl.textContent = 'Mengirim…';
      try {
        const p = await kirimForumPost(classroom, teks, titEl?.value.trim(), visEl?.checked || false);
        taEl.value = '';
        if (titEl) titEl.value = '';
        if (visEl) visEl.checked = false;
        stEl.textContent = 'Posting berhasil dikirim!';
        // prepend ke daftar
        const listContainer = body.querySelector('.forum-posts-list');
        if (listContainer) {
          listContainer.insertAdjacentHTML('afterbegin', postHtml(p));
          wireKomenForms([p]);
        }
        setTimeout(() => { stEl.textContent = ''; }, 2500);
      } catch (err) {
        stEl.textContent = 'Gagal: ' + err.message;
      } finally {
        btn.disabled = false;
      }
    });
  }, 0);

  // Muat daftar posting
  getForumPosts(classroomId).then(posts => {
    const listContainer = document.createElement('div');
    listContainer.className = 'forum-posts-list';
    if (!posts.length) {
      listContainer.innerHTML = '<p class="att-empty">Belum ada posting di forum ini.</p>';
    } else {
      listContainer.innerHTML = posts.map(postHtml).join('');
      wireKomenForms(posts);
    }
    body.appendChild(listContainer);
  }).catch(err => {
    console.error('forum ortu', err);
    body.appendChild(Object.assign(document.createElement('p'), {
      className: 'att-empty',
      textContent: 'Gagal memuat forum. Coba muat ulang halaman.'
    }));
  });

  return wrap;
}

// Skema penilaian v2: assessment_items sudah di-DROP dan digantikan tp_kktp,
// yang memiliki kolom sama persis. Portal tidak ikut dimigrasikan saat itu,
// sehingga seksi ini selalu gagal diam-diam.
async function getChildItems(classroomId) {
  const { data, error } = await db.from('tp_kktp')
    .select('id, judul, tipe, konten, urutan, academic_year, semester')
    .eq('classroom_id', classroomId)
    .eq('is_visible_ortu', true)
    .eq('is_active', true)
    .order('urutan', { ascending: true });
  if (error) { console.error('getChildItems', error); return []; }
  return data || [];
}

function fmtTgl(s) {
  if (!s) return null;
  const p = s.split('-');
  return `${p[2]}/${p[1]}/${p[0].slice(2)}`;
}
function gradePredikat(n) {
  if (n == null) return null;
  if (n >= 81) return ['Sangat Baik', 'var(--success)'];
  if (n >= 61) return ['Baik', 'var(--success)'];
  if (n >= 41) return ['Cukup', 'var(--warning)'];
  return ['Perlu Bimbingan', 'var(--danger)'];
}
const JENIS_BADGE = {
  DIAGNOSTIK_NK: { label: 'D-NK', bg: 'var(--gold-muted)', color: 'var(--gold)' },
  DIAGNOSTIK_K:  { label: 'D-K',  bg: 'var(--gold-muted)', color: 'var(--gold)' },
  FORMATIF:      { label: 'F',    bg: 'var(--warning-bg)', color: 'var(--warning)' },
  SUMATIF:       { label: 'S',    bg: 'var(--success-bg)', color: 'var(--success)' },
};
const TL_COLOR = { PENGAYAAN: 'var(--success)', PENGUATAN: 'var(--warning)', PENDAMPINGAN: 'var(--danger)' };

// Skema penilaian v2: student_grades sudah di-DROP, digantikan assessment_results.
// student_id berisi id baris classroom_roster, bukan id profil, dan ortu tidak
// punya policy baca apa pun ke classroom_roster. Terjemahannya diambil lewat
// fn_child_roster_ids() — fungsi SECURITY DEFINER yang sama dengan yang dipakai
// policy ar_ortu_select, dan sudah di-GRANT EXECUTE ke authenticated.
// fn_child_profile_ids() sengaja TIDAK dipakai di sini: ia mengembalikan
// profiles(id), ruang uuid yang berbeda, sehingga tidak akan cocok satu baris pun.
async function getChildRosterIds() {
  const { data, error } = await db.rpc('fn_child_roster_ids');
  if (error) { console.error('getChildRosterIds', error); return []; }
  return (data || []).map(r => (typeof r === 'string' ? r : r.fn_child_roster_ids));
}

// Pembatasan sebenarnya tetap di RLS (ar_ortu_select: student_id IN
// fn_child_roster_ids() + gate is_visible_ortu). Filter .in() di bawah adalah
// lapis kedua yang eksplisit.
//
// student_id ikut diambil supaya baris dapat dikelompokkan per anak. Nilainya
// adalah id baris classroom_roster — bukan id profil — sehingga ia hanya bisa
// dipakai untuk MEMISAHKAN kelompok, bukan untuk menamainya. Ortu tidak punya
// policy baca apa pun ke classroom_roster (hanya pol_roster_guru_all dan
// pol_roster_siswa_select yang ada), jadi terjemahan roster -> profil tidak
// tersedia di sisi klien. Akibatnya lihat renderChildGradesSection.
async function getChildGrades(classroomId) {
  const rosterIds = await getChildRosterIds();
  if (!rosterIds.length) return [];
  const { data, error } = await db.from('assessment_results')
    .select('id, student_id, nilai, catatan, umpan_balik, tindak_lanjut, assessments!inner(jenis, teknik, tujuan, created_at)')
    .eq('classroom_id', classroomId)
    .in('student_id', rosterIds)
    .order('created_at', { ascending: false });
  if (error) { console.error('getChildGrades', error); return []; }
  // Dinormalkan ke bentuk lama agar renderer di bawah tidak perlu diubah.
  return (data || []).map(r => ({
    id:            r.id,
    student_id:    r.student_id,
    nilai_angka:   r.nilai,
    deskripsi:     r.umpan_balik || r.catatan || '',
    tindak_lanjut: r.tindak_lanjut,
    assessments: {
      jenis:   r.assessments?.jenis,
      judul:   r.assessments?.tujuan || 'Penilaian',
      teknik:  r.assessments?.teknik,
      tanggal: String(r.assessments?.created_at || '').slice(0, 10),
    },
  }));
}

const TIPE_CLASS = { CP: 'badge-cp', TP: 'badge-tp', KKTP: 'badge-kktp', NILAI: 'badge-nilai', LAINNYA: 'badge-lainnya' };

// namaAnak      : nama anak pemilik kartu ini
// namaAnakSekelas: nama SEMUA anak ortu ini yang berada di classroom yang sama
//
// Dua parameter terakhir ada karena satu hal yang tidak dapat diselesaikan di
// sisi klien: assessment_results.student_id berisi id baris classroom_roster,
// sedangkan kartu hanya memegang id profil anak (classroom_members
// .linked_student_id). Ortu tidak boleh membaca classroom_roster, dan
// fn_child_roster_ids() mengembalikan uuid polos tanpa pasangan profilnya, jadi
// tidak ada cara menerjemahkan satu ke yang lain dari sini.
//
// Selama ortu hanya punya SATU anak di classroom ini — keadaan yang berlaku bagi
// hampir semua ortu — penyaring .eq('classroom_id') sudah membuat hasilnya
// persis milik anak itu, dan judulnya dapat menyebut namanya dengan pasti.
//
// Bila ada LEBIH DARI SATU anak di classroom yang sama, baris-baris itu memang
// terbagi menjadi beberapa kelompok student_id, tetapi tidak ada yang dapat
// memberi tahu kelompok mana milik anak yang mana. Sebelumnya keadaan ini
// ditampilkan seolah-olah seluruhnya milik anak pemilik kartu — yaitu nilai anak
// A muncul di bawah nama anak B. Kini justru itu yang dihindari: judulnya
// menyatakan terus terang bahwa nilainya gabungan dan menyebut kedua namanya,
// sehingga tidak ada satu angka pun yang dilekatkan pada anak yang keliru.
function renderChildGradesSection(classroomId, studentId, namaAnak, namaAnakSekelas) {
  const namaLain  = (namaAnakSekelas || []).filter(Boolean);
  const gabungan  = namaLain.length > 1;
  const namaJudul = namaAnak || 'anak Anda';

  const wrap = document.createElement('div');
  wrap.className = 'notes-section';

  const title = document.createElement('div');
  title.className = 'sch-section-title';
  title.textContent = 'Penilaian';
  wrap.appendChild(title);

  const body = document.createElement('div');
  body.innerHTML = '<p class="att-empty">Memuat…</p>';
  wrap.appendChild(body);

  pasangCollapse(title, body);

  Promise.all([getChildItems(classroomId), getChildGrades(classroomId)]).then(([items, grades]) => {
    let html = '';

    if (items.length > 0) {
      html += `<div style="font-size:var(--fs-caption);font-weight:var(--fw-semibold);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:.5rem;">Dokumen Penilaian</div>`;
      html += items.map(item => {
        const cls = TIPE_CLASS[item.tipe] || 'badge-lainnya';
        return `<div style="padding:.625rem 0;border-bottom:1px solid var(--border);">` +
          `<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.25rem;">` +
          `<span class="badge-tipe ${cls}">${escHtml(item.tipe)}</span>` +
          `<span style="font-weight:var(--fw-semibold);color:var(--text-primary);">${escHtml(item.judul)}</span>` +
          `</div>` +
          (item.konten ? `<p class="pai-konten" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${escHtml(item.konten)}</p>` : '') +
          `</div>`;
      }).join('');
    }

    if (grades.length > 0) {
      if (items.length > 0) html += `<div style="margin-top:.875rem;"></div>`;

      // Header nama anak, selalu ada — supaya pembaca tidak perlu menebak nilai
      // ini milik siapa, termasuk saat ia menggulir kartu demi kartu.
      const judulNilai = gabungan
        ? `Nilai — ${namaLain.join(' & ')}`
        : `Nilai — ${namaJudul}`;
      html += `<div style="font-size:var(--fs-caption);font-weight:var(--fw-semibold);color:var(--gold);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:.5rem;">${escHtml(judulNilai)}</div>`;

      if (gabungan) {
        html += `<p style="font-size:var(--fs-caption);color:var(--text-muted);margin:0 0 .5rem;">` +
          `Anda memiliki lebih dari satu anak di kelas ini. Daftar di bawah memuat nilai mereka ` +
          `bersama-sama dan belum dapat dipisahkan per anak, jadi jangan menganggap seluruhnya ` +
          `milik satu orang. Tanyakan kepada guru bila perlu rincian per anak.</p>`;
      }

      html += grades.map(g => {
        const asmt = g.assessments;
        const badge = JENIS_BADGE[asmt.jenis] || { label: asmt.jenis, bg: 'var(--gold-muted)', color: 'var(--gold)' };
        const isSumatif = asmt.jenis === 'SUMATIF';
        let nilaiHtml = '';
        if (isSumatif && g.nilai_angka != null) {
          const pred = gradePredikat(g.nilai_angka);
          nilaiHtml = `<div style="text-align:right;flex-shrink:0;">` +
            `<span style="font-weight:var(--fw-semibold);color:var(--gold);">${escHtml(String(g.nilai_angka))}</span>` +
            (pred ? ` <span style="font-size:var(--fs-caption);color:${pred[1]};">${escHtml(pred[0])}</span>` : '') +
            `</div>`;
        }
        const meta = [asmt.teknik, fmtTgl(asmt.tanggal)].filter(Boolean).join(' · ');
        let tlHtml = '';
        if (g.tindak_lanjut) {
          const tlLabel = g.tindak_lanjut.charAt(0) + g.tindak_lanjut.slice(1).toLowerCase();
          tlHtml = `<span style="color:${TL_COLOR[g.tindak_lanjut] || 'var(--text-muted)'};font-weight:var(--fw-semibold);font-size:var(--fs-caption);">${escHtml(tlLabel)}</span>`;
        }
        const showDesk = !isSumatif && g.deskripsi;
        return `<div style="padding:.625rem 0;border-bottom:1px solid var(--border);">` +
          `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;margin-bottom:.2rem;">` +
            `<div style="display:flex;align-items:center;gap:.5rem;flex:1;min-width:0;">` +
              `<span style="flex-shrink:0;padding:.15rem .4rem;border-radius:.25rem;font-size:var(--fs-caption);font-weight:var(--fw-semibold);background:${badge.bg};color:${badge.color};">${escHtml(badge.label)}</span>` +
              `<span style="font-weight:var(--fw-semibold);color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(asmt.judul)}</span>` +
            `</div>` +
            nilaiHtml +
          `</div>` +
          (meta || tlHtml ?
            `<div style="display:flex;justify-content:space-between;align-items:center;font-size:var(--fs-caption);color:var(--text-muted);">` +
              `<span>${meta ? escHtml(meta) : ''}</span>` +
              tlHtml +
            `</div>` : '') +
          (showDesk ? `<p class="pai-konten" style="margin-top:.25rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;color:var(--text-secondary);font-size:var(--fs-caption);">${escHtml(g.deskripsi)}</p>` : '') +
          `</div>`;
      }).join('');
    }

    if (!html) {
      body.innerHTML = '<p class="att-empty">Belum ada penilaian yang dipublikasikan.</p>';
      return;
    }

    body.innerHTML = html;

    body.querySelectorAll('.pai-konten').forEach(p => {
      if (p.scrollHeight > p.offsetHeight) {
        const btn = document.createElement('button');
        btn.textContent = 'Selengkapnya ▼';
        btn.style.cssText = 'background:none;border:none;color:var(--gold);font-size:var(--fs-caption);cursor:pointer;padding:0;margin-top:var(--space-xs);display:block;font-family:inherit;';
        let expanded = false;
        btn.addEventListener('click', () => {
          expanded = !expanded;
          if (expanded) {
            p.style.display = 'block';
            p.style.overflow = 'visible';
            p.style.webkitLineClamp = 'unset';
            btn.textContent = 'Sembunyikan ▲';
          } else {
            p.style.display = '-webkit-box';
            p.style.overflow = 'hidden';
            p.style.webkitLineClamp = '3';
            btn.textContent = 'Selengkapnya ▼';
          }
        });
        p.after(btn);
      }
    });
  }).catch(err => {
    console.error('grades', err);
    body.innerHTML = '<p class="att-empty">Gagal memuat data. Coba muat ulang halaman.</p>';
  });

  return wrap;
}

function renderProfilSection(profile) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="profil-section">
      <div class="profil-title">Profil Saya</div>
      <div class="profil-field">
        <div class="profil-label">Nama</div>
        <div class="profil-value" id="pv-nama-ortu">${escHtml(profile.full_name)}</div>
      </div>
      <hr class="profil-divider">
      <div class="profil-sub">Ubah Nama</div>
      <input type="text" class="portal-input" id="pf-nama-ortu" value="${escHtml(profile.full_name)}" maxlength="100" placeholder="Nama baru" autocomplete="off">
      <button type="button" class="btn-profil-save" id="btn-pf-nama-ortu">Simpan Nama</button>
      <span class="profil-status" id="pf-nama-ortu-status"></span>
      <hr class="profil-divider">
      <div class="profil-sub">Ubah PIN</div>
      <input type="password" class="portal-input" id="pf-pin-ortu" maxlength="6" inputmode="numeric" pattern="[0-9]*" placeholder="PIN baru (6 angka)" autocomplete="new-password" style="margin-bottom:.4rem">
      <input type="password" class="portal-input" id="pf-pin-ortu-konfirm" maxlength="6" inputmode="numeric" pattern="[0-9]*" placeholder="Konfirmasi PIN baru" autocomplete="new-password">
      <button type="button" class="btn-profil-save" id="btn-pf-pin-ortu">Simpan PIN</button>
      <span class="profil-status" id="pf-pin-ortu-status"></span>
    </div>`;

  wrap.querySelector('#btn-pf-nama-ortu').addEventListener('click', async () => {
    const nama   = wrap.querySelector('#pf-nama-ortu').value.trim();
    const status = wrap.querySelector('#pf-nama-ortu-status');
    if (!nama) { status.textContent = 'Nama tidak boleh kosong.'; return; }
    status.textContent = 'Menyimpan…';
    try {
      const { error } = await db.from('profiles').update({ full_name: nama }).eq('id', profile.id);
      if (error) throw error;
      profile.full_name = nama;
      wrap.querySelector('#pv-nama-ortu').textContent = nama;
      document.getElementById('ortu-name').textContent = nama;
      status.textContent = 'Nama berhasil diperbarui.';
    } catch (err) {
      status.textContent = 'Gagal: ' + err.message;
    }
  });

  wrap.querySelector('#btn-pf-pin-ortu').addEventListener('click', async () => {
    const pinBaru    = wrap.querySelector('#pf-pin-ortu').value.trim();
    const pinKonfirm = wrap.querySelector('#pf-pin-ortu-konfirm').value.trim();
    const status     = wrap.querySelector('#pf-pin-ortu-status');
    if (!pinBaru) { status.textContent = 'PIN tidak boleh kosong.'; return; }
    if (!/^\d{6}$/.test(pinBaru)) { status.textContent = 'PIN harus 6 digit angka.'; return; }
    if (pinBaru !== pinKonfirm) { status.textContent = 'Konfirmasi PIN tidak cocok.'; return; }
    status.textContent = 'Menyimpan…';
    try {
      const { error } = await db.auth.updateUser({ password: pinBaru });
      if (error) throw error;
      wrap.querySelector('#pf-pin-ortu').value = '';
      wrap.querySelector('#pf-pin-ortu-konfirm').value = '';
      status.textContent = 'PIN berhasil diperbarui.';
    } catch (err) {
      status.textContent = 'Gagal: ' + err.message;
    }
  });

  return wrap;
}

function renderEmpty() {
  const el = document.createElement('p');
  el.className = 'empty-state';
  el.textContent = 'Belum ada classroom yang terhubung ke akun Anda. Hubungi guru untuk menautkan akun ini.';
  return el;
}

async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }

  let profile;
  try {
    profile = await getProfile(session.user.id);
  } catch (err) {
    // JANGAN signOut di sini — lihat catatan yang sama di portal siswa.
    // Kegagalan sesaat tidak boleh menghapus sesi yang masih sah.
    console.error('[ortu] gagal memuat profil:', err);
    document.getElementById('classroom-list').innerHTML =
      '<div class="error-msg" style="text-align:center">' +
      '<p>Gagal memuat data. Periksa koneksi internet Anda.</p>' +
      '<button id="btn-coba-lagi" style="margin-top:.75rem;padding:.5rem 1.25rem;border:none;' +
      'border-radius:.35rem;background:var(--gold);color:var(--text-on-gold,#000);' +
      'font-weight:600;cursor:pointer">Coba lagi</button></div>';
    document.getElementById('btn-coba-lagi')
      ?.addEventListener('click', function () { window.location.reload(); });
    return;
  }

  _ortuProfileId = profile.id;
  _ortuProfile   = profile;
  document.getElementById('ortu-name').textContent = session.user.user_metadata?.nama || profile.full_name;

  if (profile.role !== 'ORTU') {
    document.getElementById('classroom-list').innerHTML = '<p class="error-msg">Portal ini khusus untuk orang tua/wali. Silakan buka portal yang sesuai.</p>';
    return;
  }

  const list = document.getElementById('classroom-list');

  let members;
  try {
    members = await getClassroomMembers(profile.id);
  } catch {
    list.innerHTML = '<p class="error-msg">Gagal memuat data classroom.</p>';
    return;
  }

  if (!members || members.length === 0) {
    list.appendChild(renderEmpty());
    return;
  }

  // Dimuat paralel, mengikuti pola yang sudah dipakai portal guru. Sebelumnya
  // tiga permintaan per kelas dijalankan berurutan di dalam loop: orang tua
  // dengan tiga anak menunggu sembilan permintaan berantai sebelum kartu
  // terakhir muncul.
  //
  // Slot kosong dibuat lebih dulu dalam urutan aslinya, lalu diisi begitu
  // datanya tiba — urutan kartu tidak ikut berubah mengikuti kecepatan jaringan.
  const baris = members.filter(row => row.classrooms);

  // Nama setiap anak diambil sekali di muka, bukan sekali per kartu. Selain
  // menghapus permintaan berulang untuk anak yang sama, ini yang memungkinkan
  // sebuah kartu mengetahui SIAPA SAJA anak ortu ini yang sekelas dengannya —
  // pengetahuan yang tidak dimiliki kartu itu sendiri, dan yang dibutuhkan
  // renderChildGradesSection untuk memberi judul yang jujur.
  //
  // allSettled, bukan all: satu nama yang gagal dimuat tidak boleh menjatuhkan
  // seluruh halaman. Yang gagal jatuh ke '—', sama seperti perilaku
  // getProfileName sendiri.
  const idAnak   = [...new Set(baris.map(r => r.linked_student_id).filter(Boolean))];
  const namaAnak = new Map();
  (await Promise.allSettled(idAnak.map(id => getProfileName(id))))
    .forEach((hasil, i) => {
      namaAnak.set(idAnak[i], hasil.status === 'fulfilled' ? hasil.value : '—');
    });

  // classroom_id -> daftar nama anak ortu ini di kelas itu. Panjangnya 1 bagi
  // hampir semua ortu; lebih dari 1 hanya bila dua anak berada di kelas yang
  // sama, dan justru kasus itulah yang perlu ditandai.
  const anakPerKelas = new Map();
  baris.forEach(row => {
    const kls = row.classrooms.id;
    if (!anakPerKelas.has(kls)) anakPerKelas.set(kls, []);
    anakPerKelas.get(kls).push(namaAnak.get(row.linked_student_id) || '—');
  });

  const slot = baris.map(() => {
    const d = document.createElement('div');
    d.innerHTML = '<p class="att-empty">Memuat…</p>';
    list.appendChild(d);
    return d;
  });

  async function isiSlot(i) {
    const row       = baris[i];
    const classroom = row.classrooms;
    slot[i].innerHTML = '<p class="att-empty">Memuat…</p>';
    try {
      // Nama anak sudah ada di peta yang disiapkan di atas, jadi yang tersisa
      // per kartu hanya nama guru dan jadwalnya.
      const [guruName, schedules] = await Promise.all([
        getProfileName(classroom.teacher_id),
        getSchedules(classroom.id),
      ]);
      const siswaNama = namaAnak.get(row.linked_student_id) || '—';
      slot[i].replaceChildren(
        renderCard(classroom, guruName, siswaNama, schedules, row.linked_student_id,
                   anakPerKelas.get(classroom.id) || [siswaNama]));
    } catch (err) {
      // Gagal satu kelas tidak menjatuhkan kelas lain, dan tombol coba lagi
      // hanya memuat ulang kartu ini — bukan seluruh halaman.
      console.error('classroom', classroom.id, err);
      slot[i].innerHTML =
        '<div class="error-msg">Gagal memuat kelas ' + escHtml(classroom.name || '') + '. ' +
        '<button type="button" class="btn-muat-ulang-kartu">Coba lagi</button></div>';
      slot[i].querySelector('.btn-muat-ulang-kartu')
        .addEventListener('click', function () { isiSlot(i); });
    }
  }

  await Promise.allSettled(baris.map((_, i) => isiSlot(i)));
}

// ── Sesi berakhir ──────────────────────────────────────────────────────────
// autoRefreshToken sudah menyala di ortu/js/supabase.js, jadi perpanjangan token
// berjalan sendiri selama refresh token-nya masih sah. Yang belum tertangani
// adalah saat perpanjangan itu GAGAL — refresh token kedaluwarsa atau dicabut.
// Supabase menjawabnya dengan membuang sesi dan memancarkan SIGNED_OUT, dan
// sebelum ini tidak ada yang mendengarkan: halaman tetap terbuka seolah masih
// masuk, sementara setiap permintaan berikutnya ditolak. Karena pengambil data
// di berkas ini menelan galat menjadi daftar kosong, kegagalan itu tampak
// seperti "belum ada data" — persis kegagalan diam-diam yang harus dihindari.
//
// SIGNED_OUT juga terpancar saat pengguna menekan Keluar. Keduanya harus
// dibedakan: yang satu hasil keputusan pengguna dan tidak perlu penjelasan apa
// pun, yang satu lagi terjadi kepada pengguna dan perlu dijelaskan. Penanda di
// bawah yang membedakannya.
//
// Kembarannya ada di siswa/js/dashboard.js. Sengaja disalin, bukan diangkat ke
// shared/: kedua portal memakai instance Supabase yang berbeda dengan storageKey
// masing-masing, dan berkas di shared/ kini hanya dimuat portal guru.
let _keluarSengaja = false;

function tandaiSesiBerakhir() {
  // Saklar, bukan pesan. Teksnya ditanam di halaman login, mengikuti keputusan
  // yang sudah dinyatakan di guru/js/guru.js: sessionStorage dapat diisi apa saja
  // oleh siapa pun yang membuka konsol, jadi isinya tidak pernah menjadi teks
  // yang dirender — ia hanya menentukan tampil atau tidak.
  //
  // Key-nya sengaja BUKAN sip_pesan_login milik portal guru. sessionStorage satu
  // ruang untuk seluruh origin, sementara key itu sudah berarti "semester baru
  // saja direset". Memakainya ulang akan membuat halaman login guru mengumumkan
  // reset semester kepada ortu yang sesinya sekadar kedaluwarsa.
  try { sessionStorage.setItem('sip_pesan_sesi', '1'); } catch (_) {}

  // replace, bukan href: dashboard yang sudah tidak berwenang tidak perlu
  // tertinggal di riwayat, supaya tombol Kembali tidak mengantar pengguna balik
  // ke halaman yang setiap permintaannya pasti ditolak.
  window.location.replace('index.html');
}

db.auth.onAuthStateChange(function (event) {
  if (event !== 'SIGNED_OUT') return;
  if (_keluarSengaja) return;      // pengguna sendiri yang menekan Keluar
  tandaiSesiBerakhir();
});

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-logout').addEventListener('click', async () => {
    _keluarSengaja = true;
    await db.auth.signOut({ scope: 'global' });
    window.location.href = 'index.html';
  });

  // Bottom nav
  const navBeranda = document.getElementById('nav-beranda');
  const navProfil  = document.getElementById('nav-profil');
  const listEl     = document.getElementById('classroom-list');
  const profilEl   = document.getElementById('panel-profil');

  navBeranda.addEventListener('click', () => {
    navBeranda.classList.add('active');
    navProfil.classList.remove('active');
    listEl.style.display   = '';
    profilEl.style.display = 'none';
  });

  navProfil.addEventListener('click', () => {
    navProfil.classList.add('active');
    navBeranda.classList.remove('active');
    listEl.style.display   = 'none';
    profilEl.style.display = '';
    if (!profilEl.hasChildNodes() && _ortuProfile) {
      profilEl.appendChild(renderProfilSection(_ortuProfile));
    }
  });

  init();
});
