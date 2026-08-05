const db   = window.supabaseClient;
const DAYS = ['SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU'];

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
  title.textContent = 'Jadwal';
  div.appendChild(title);

  activeDays.forEach(day => {
    const group = document.createElement('div');
    group.className = 'sch-day-group';

    const dayEl = document.createElement('div');
    dayEl.className = 'sch-day-name';
    dayEl.textContent = dayLabel(day);
    group.appendChild(dayEl);

    byDay[day].forEach(s => {
      const slot = document.createElement('div');
      slot.className = 'sch-slot';

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

      group.appendChild(slot);
    });

    div.appendChild(group);
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

function renderCard(classroom, guruName, siswaNama, schedules) {
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
    list.appendChild(renderCard(classroom, guruName, siswaNama, schedules));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await db.auth.signOut();
    window.location.href = 'index.html';
  });

  init();
});
