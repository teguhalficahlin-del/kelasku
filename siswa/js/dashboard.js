const db = window.supabaseClient;

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
    .select('classrooms(id, name, subject, classroom_code, teacher_id)')
    .eq('profile_id', profileId);
  if (error) throw error;
  return data.map(row => row.classrooms).filter(Boolean);
}

async function getGuruName(teacherId) {
  const { data, error } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', teacherId)
    .single();
  if (error) return '—';
  return data.full_name;
}

function renderCard(classroom, guruName) {
  const card = document.createElement('div');
  card.className = 'classroom-card';
  card.innerHTML = `
    <div class="card-header">
      <span class="card-name">${classroom.name}</span>
      <span class="card-code">${classroom.classroom_code}</span>
    </div>
    <div class="card-subject">${classroom.subject ?? ''}</div>
    <div class="card-teacher">Guru: ${guruName}</div>
  `;
  return card;
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

  for (const classroom of classrooms) {
    const guruName = await getGuruName(classroom.teacher_id);
    list.appendChild(renderCard(classroom, guruName));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await db.auth.signOut();
    window.location.href = 'index.html';
  });

  init();
});
