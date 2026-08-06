const db   = window.supabaseClient;
const DAYS = ['SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];

// ---- Attendance helpers ----
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
async function getMyAttendance(classroomId, studentId, fromDate, toDate) {
  const { data } = await db.from('attendance')
    .select('tanggal,status,schedules(start_time,end_time)')
    .eq('classroom_id', classroomId)
    .eq('student_id', studentId)
    .gte('tanggal', fromDate)
    .lte('tanggal', toDate)
    .order('tanggal', { ascending: false });
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
function renderAttendanceSection(classroomId, studentId) {
  const wrap = document.createElement('div');
  wrap.className = 'att-section';

  const PAGE_SIZE = 10;
  let currentPreset = 'hari';
  let _rows = [];
  let _page = 1;

  wrap.innerHTML =
    `<div class="att-title">Kehadiran</div>` +
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
    _rows = await getMyAttendance(classroomId, studentId, from, to);
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
    .select('id, full_name, nis')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data;
}

async function getClassrooms(profileId) {
  const { data, error } = await db
    .from('classroom_roster')
    .select('nama_ortu, classrooms(id, name, subject, classroom_code, teacher_id)')
    .eq('profile_id', profileId);
  if (error) throw error;
  return data
    .filter(row => row.classrooms)
    .map(row => ({ classroom: row.classrooms, nama_ortu: row.nama_ortu || null }));
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

async function getGuruName(teacherId) {
  if (!teacherId) return '—';
  const { data, error } = await db
    .rpc('fn_lookup_profile_name', { p_profile_id: teacherId });
  if (error || !data) return '—';
  return data;
}

function renderCard(classroom, guruName, namaOrtu, schedules, studentId) {
  const card = document.createElement('div');
  card.className = 'classroom-card';
  card.innerHTML =
    '<div class="card-header">' +
      '<span class="card-name">'    + escHtml(classroom.name)             + '</span>' +
      '<span class="card-code">'    + escHtml(classroom.classroom_code)   + '</span>' +
    '</div>' +
    '<div class="card-subject">'  + escHtml(classroom.subject ?? '')    + '</div>' +
    '<div class="card-teacher">Guru: ' + escHtml(guruName) +
      (namaOrtu ? '<br>Ortu: ' + escHtml(namaOrtu) : '') +
    '</div>';
  card.appendChild(renderScheduleSection(schedules));
  if (studentId) card.appendChild(renderAttendanceSection(classroom.id, studentId));
  if (studentId) card.appendChild(renderNotesSection(classroom.id, studentId));
  if (studentId) card.appendChild(renderGradesSection(classroom.id, studentId));
  return card;
}

async function getMyNotes(classroomId, studentId) {
  const { data } = await db.from('student_notes')
    .select('id, content, is_visible_to_student, is_visible_to_parent, created_at')
    .eq('classroom_id', classroomId)
    .eq('student_id', studentId)
    .eq('is_visible_to_student', true)
    .order('created_at', { ascending: false });
  return data || [];
}

function renderNotesSection(classroomId, studentId) {
  const wrap = document.createElement('div');
  wrap.className = 'notes-section';

  const title = document.createElement('div');
  title.className = 'sch-section-title';
  title.textContent = 'Catatan dari Guru';
  wrap.appendChild(title);

  const body = document.createElement('div');
  body.innerHTML = '<p class="att-empty">Memuat…</p>';
  wrap.appendChild(body);

  getMyNotes(classroomId, studentId).then(rows => {
    if (rows.length === 0) {
      body.innerHTML = '<p class="att-empty">Belum ada catatan untukmu.</p>';
      return;
    }
    const MONTH_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    body.innerHTML = rows.map(n => {
      const d = new Date(n.created_at);
      const tgl = `${d.getDate()} ${MONTH_ID[d.getMonth()]} ${d.getFullYear()}`;
      const vis = n.is_visible_to_parent ? '👨‍👩‍👦 Siswa &amp; Ortu' : '🎓 Siswa saja';
      return `<div class="note-item">
        <div class="note-item-meta">${escHtml(tgl)} · <span style="font-size:.8rem;color:var(--color-text-muted)">${vis}</span></div>
        <div class="note-item-content">${escHtml(n.content)}</div>
      </div>`;
    }).join('');
  });

  return wrap;
}

async function getMyGrades(classroomId, studentId) {
  const { data } = await db.from('student_grades')
    .select('id, judul, nilai_angka, deskripsi, academic_year, semester')
    .eq('classroom_id', classroomId)
    .eq('student_id', studentId)
    .eq('is_published', true)
    .order('academic_year', { ascending: false })
    .order('semester', { ascending: false })
    .order('judul');
  return data || [];
}

function renderGradesSection(classroomId, studentId) {
  const wrap = document.createElement('div');
  wrap.className = 'notes-section';

  const title = document.createElement('div');
  title.className = 'sch-section-title';
  title.textContent = 'Nilai';
  wrap.appendChild(title);

  const body = document.createElement('div');
  body.innerHTML = '<p class="att-empty">Memuat…</p>';
  wrap.appendChild(body);

  getMyGrades(classroomId, studentId).then(rows => {
    if (rows.length === 0) {
      body.innerHTML = '';
      return;
    }
    body.innerHTML =
      '<div class="sg-table-wrap"><table class="sg-table"><thead><tr>' +
      '<th>Tahun Ajaran</th><th>Sem</th><th>Judul</th><th>Nilai</th><th>Deskripsi</th>' +
      '</tr></thead><tbody>' +
      rows.map(g =>
        `<tr>` +
        `<td>${escHtml(g.academic_year)}</td>` +
        `<td>${escHtml(g.semester)}</td>` +
        `<td>${escHtml(g.judul)}</td>` +
        `<td>${g.nilai_angka != null ? escHtml(g.nilai_angka) : '—'}</td>` +
        `<td>${g.deskripsi ? escHtml(g.deskripsi) : '—'}</td>` +
        `</tr>`
      ).join('') +
      '</tbody></table></div>';
  });

  return wrap;
}

function renderEmpty() {
  const el = document.createElement('p');
  el.className = 'empty-state';
  el.textContent = 'Belum ada classroom. Minta kode dari guru Anda.';
  return el;
}

async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  let profile;
  try {
    profile = await getProfile(session.user.id);
  } catch {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('siswa-name').textContent = profile.full_name;

  const list = document.getElementById('classroom-list');

  let classrooms;
  try {
    classrooms = await getClassrooms(profile.id);
  } catch {
    list.innerHTML = '<p class="error-msg">Gagal memuat data classroom.</p>';
    return;
  }

  if (classrooms.length === 0) {
    list.appendChild(renderEmpty());
    return;
  }

  for (const { classroom, nama_ortu } of classrooms) {
    const [guruName, schedules] = await Promise.all([
      getGuruName(classroom.teacher_id),
      getSchedules(classroom.id),
    ]);
    list.appendChild(renderCard(classroom, guruName, nama_ortu, schedules, profile.id));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await db.auth.signOut();
    window.location.href = 'index.html';
  });

  init();
});
