const db = window.supabaseClient;

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

async function getProfileName(profileId) {
  if (!profileId) return '—';
  const { data, error } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', profileId)
    .single();
  if (error) return '—';
  return data.full_name;
}

function renderCard(classroom, guruName, siswaNama) {
  const card = document.createElement('div');
  card.className = 'classroom-card';
  card.innerHTML = `
    <div class="card-header">
      <span class="card-name">${classroom.name}</span>
      <span class="card-code">${classroom.classroom_code}</span>
    </div>
    <div class="card-subject">${classroom.subject ?? ''}</div>
    <div class="card-teacher">Guru: ${guruName}</div>
    <div class="card-student">Siswa dipantau: ${siswaNama}</div>
  `;
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
    const [guruName, siswaNama] = await Promise.all([
      getProfileName(classroom.teacher_id),
      getProfileName(row.linked_student_id),
    ]);
    list.appendChild(renderCard(classroom, guruName, siswaNama));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await db.auth.signOut();
    window.location.href = 'index.html';
  });

  init();
});
