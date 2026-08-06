const db   = window.supabaseClient;
const DAYS = ['SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];

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
function renderChildAttendanceSection(classroomId, studentId, siswaNama) {
  const wrap = document.createElement('div');
  wrap.className = 'att-section';

  const PAGE_SIZE = 10;
  let currentPreset = 'bulan';
  const uid = classroomId.slice(0,8);
  let _rows = [];
  let _page = 1;

  wrap.innerHTML =
    `<div class="att-title">Kehadiran ${escHtml(siswaNama)}</div>` +
    `<div class="att-filters">` +
      ['hari','minggu','bulan','semester','custom'].map(p =>
        `<button class="att-preset${p===currentPreset?' active':''}" data-preset="${p}">${
          p==='hari'?'Hari ini':p==='minggu'?'Minggu ini':p==='bulan'?'Bulan ini':p==='semester'?'Semester ini':'Custom'
        }</button>`
      ).join('') +
    `</div>` +
    `<div class="att-custom-range" style="display:none">` +
      `<label>Dari <input type="date" class="att-date-inp" id="att-from-${uid}"></label>` +
      `<label>Sampai <input type="date" class="att-date-inp" id="att-to-${uid}"></label>` +
      `<button class="att-apply">Terapkan</button>` +
    `</div>` +
    `<div class="att-body"><p class="att-empty">Memuat…</p></div>`;

  const bodyEl      = wrap.querySelector('.att-body');
  const customRange = wrap.querySelector('.att-custom-range');

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
    _rows = await getChildAttendance(classroomId, studentId, from, to);
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
      if (currentPreset === 'custom') { customRange.style.display = ''; }
      else { customRange.style.display = 'none'; const [f,t] = _getPresetRange(currentPreset); refresh(f,t); }
    });
  });

  wrap.querySelector('.att-apply').addEventListener('click', () => {
    const f = wrap.querySelector(`#att-from-${uid}`).value;
    const t = wrap.querySelector(`#att-to-${uid}`).value;
    if (f && t && f <= t) { _page = 1; refresh(f, t); }
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
    .select('id, full_name')
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

function renderCard(classroom, guruName, siswaNama, schedules, linkedStudentId) {
  const card = document.createElement('div');
  card.className = 'classroom-card';
  card.innerHTML =
    '<div class="card-header">' +
      '<span class="card-name">'    + escHtml(classroom.name)             + '</span>' +
      '<span class="card-code">'    + escHtml(classroom.classroom_code)   + '</span>' +
    '</div>' +
    '<div class="card-subject">'   + escHtml(classroom.subject ?? '')    + '</div>' +
    '<div class="card-teacher">Guru: '          + escHtml(guruName)      + '</div>' +
    '<div class="card-student">Siswa dipantau: ' + escHtml(siswaNama)    + '</div>';
  card.appendChild(renderScheduleSection(schedules));
  if (linkedStudentId) card.appendChild(renderChildAttendanceSection(classroom.id, linkedStudentId, siswaNama));
  return card;
}

function renderEmpty() {
  const el = document.createElement('p');
  el.className = 'empty-state';
  el.textContent = 'Belum ada classroom. Daftar menggunakan kode dari guru.';
  return el;
}

async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }

  let profile;
  try {
    profile = await getProfile(session.user.id);
  } catch {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('ortu-name').textContent = profile.full_name;

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

  for (const row of members) {
    const classroom = row.classrooms;
    if (!classroom) continue;
    const [guruName, siswaNama, schedules] = await Promise.all([
      getProfileName(classroom.teacher_id),
      getProfileName(row.linked_student_id),
      getSchedules(classroom.id),
    ]);
    list.appendChild(renderCard(classroom, guruName, siswaNama, schedules, row.linked_student_id));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await db.auth.signOut();
    window.location.href = 'index.html';
  });

  init();
});
