// Penyiapan data untuk test yang butuh keadaan tertentu di database.
//
// Dipakai test absensi: panel "Absensi Hari Ini" hanya berisi sesi bila kelas
// punya jadwal untuk hari ini, dan tombolnya hanya hidup selama sesi
// berlangsung (atau satu jam sesudahnya). Menggantungkan test pada jadwal
// sungguhan berarti ia hanya berjalan pada jam tertentu di hari tertentu —
// selebihnya melewatkan diri, dan regresi bisa lolos berhari-hari.
//
// Maka jadwalnya dibuat sendiri, dipakai, lalu dibuang.
//
// PENTING — ini menulis ke kelas SUNGGUHAN. Karena itu setiap baris yang dibuat
// diberi penanda di kolom note, dan penyiapan selalu menyapu sisa penanda itu
// lebih dulu: kalau satu run mati sebelum sempat membersihkan (job timeout,
// dibatalkan), sisanya tidak menumpuk dan tidak menjadi jadwal palsu permanen
// di layar guru.
//
// URL dan kunci di bawah adalah nilai publik yang memang sudah ada di dalam
// repo (shared/js/supabase.js) dan dikirim ke setiap browser pengunjung.
// Kredensial yang sesungguhnya tetap hanya lewat environment.

const SUPABASE_URL = 'https://teccdzetrdjowqemnuuc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7T4Y9_ty5cN6_NIZ4TalXA_ByYNtSwG';

export const PENANDA_JADWAL = 'PLAYWRIGHT_TEST_SCHEDULE';

// Penanda untuk penilaian yang dibuat test. Disimpan di kolom tujuan, yang
// memang teks bebas dan tampil sebagai judul penilaian di portal.
export const PENANDA_PENILAIAN = 'PLAYWRIGHT_TEST_ASSESSMENT';

// schedules.day_of_week hanya menerima enam hari kerja; Ahad tidak ada.
const NAMA_HARI = ['AHAD', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];

/** Nama hari ini menurut UTC — sama dengan yang dipakai runner CI. */
export function hariIniUtc() {
  return NAMA_HARI[new Date().getUTCDay()];
}

async function api(path, { token, method = 'GET', body, prefer } = {}) {
  const res = await fetch(SUPABASE_URL + path, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + (token || SUPABASE_KEY),
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const teks = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${teks.slice(0, 300)}`);
  }
  return teks ? JSON.parse(teks) : null;
}

/** Access token guru uji, dari kredensial environment. */
export async function tokenGuru() {
  const data = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: {
      email:    process.env.TEST_GURU_EMAIL,
      password: process.env.TEST_GURU_PASSWORD,
    },
  });
  return data.access_token;
}

/** Kelas uji, dikenali lewat kode kelas dari environment. */
export async function kelasUji(token) {
  const kode = encodeURIComponent(process.env.TEST_KODE_KELAS);
  const rows = await api(
    `/rest/v1/classrooms?classroom_code=eq.${kode}&select=id,teacher_id,name`,
    { token });
  if (!rows.length) throw new Error('Kelas dengan kode itu tidak ditemukan: ' + process.env.TEST_KODE_KELAS);
  return rows[0];
}

/** Buang semua jadwal bertanda uji di kelas ini — termasuk sisa run sebelumnya. */
export async function bersihkanJadwalUji(token, classroomId) {
  await api(
    `/rest/v1/schedules?classroom_id=eq.${classroomId}&note=eq.${PENANDA_JADWAL}`,
    { token, method: 'DELETE' });
}

/**
 * Satu baris roster di kelas ini, dicari lewat NIS.
 *
 * NIS-nya dipangkas lebih dulu: nilainya datang dari GitHub Secrets, dan spasi
 * atau baris baru yang ikut terbawa saat menempel tidak terlihat di mana pun —
 * pencarian gagal tanpa petunjuk apa pun tentang sebabnya.
 */
export async function rosterByNis(token, classroomId, nis) {
  const bersih = String(nis ?? '').trim();
  const rows = await api(
    `/rest/v1/classroom_roster?classroom_id=eq.${classroomId}` +
    `&nis=eq.${encodeURIComponent(bersih)}&select=id,full_name,profile_id`,
    { token });
  if (!rows.length) {
    // Sebutkan berapa baris yang ADA di kelas ini. Tanpa itu, kegagalan ini
    // tidak dapat dibedakan antara "NIS salah" dan "kelasnya salah", dan
    // nilainya sendiri disensor GitHub sehingga tidak bisa dibaca dari log.
    const semua = await api(
      `/rest/v1/classroom_roster?classroom_id=eq.${classroomId}&select=nis`,
      { token });
    throw new Error(
      `Roster dengan NIS itu tidak ditemukan di kelas uji. ` +
      `Panjang NIS yang dicari: ${bersih.length} karakter. ` +
      `Kelas ini punya ${semua.length} baris roster. ` +
      `Periksa nilai TEST_SISWA2_NIS dan pastikan siswa kedua memang ada di ` +
      `kelas ber-kode TEST_KODE_KELAS.`);
  }
  return rows[0];
}

/**
 * Buang semua penilaian bertanda uji di kelas ini — termasuk sisa run
 * sebelumnya. Baris assessment_results ikut terhapus lewat FK ON DELETE
 * CASCADE (20260820000005), jadi tidak perlu disapu terpisah.
 */
export async function bersihkanPenilaianUji(token, classroomId) {
  await api(
    `/rest/v1/assessments?classroom_id=eq.${classroomId}&tujuan=eq.${PENANDA_PENILAIAN}`,
    { token, method: 'DELETE' });
}

/**
 * Satu penilaian bertanda uji, beserta satu baris nilai untuk baris roster
 * yang ditunjuk.
 *
 * Tanpa ini test negatif menjadi hampa: kalau siswa kedua memang belum punya
 * nilai apa pun, hasil kosong akan muncul juga seandainya RLS dicabut, dan
 * testnya lulus tanpa membuktikan apa-apa.
 *
 * Sengaja dibuat terlihat siswa dan ortu. Kalau tersembunyi, hasil kosong bisa
 * datang dari gate visibilitas — bukan dari pembatasan per siswa yang justru
 * ingin diuji.
 */
export async function buatPenilaianUji(token, kelas, rosterId) {
  const asmt = (await api('/rest/v1/assessments', {
    token,
    method: 'POST',
    prefer: 'return=representation',
    body: {
      classroom_id:     kelas.id,
      teacher_id:       kelas.teacher_id,
      jenis:            'SUMATIF',
      tujuan:           PENANDA_PENILAIAN,
      is_visible_siswa: true,
      is_visible_ortu:  true,
    },
  }))[0];

  await api('/rest/v1/assessment_results', {
    token,
    method: 'POST',
    prefer: 'return=representation',
    body: {
      assessment_id: asmt.id,
      classroom_id:  kelas.id,
      teacher_id:    kelas.teacher_id,
      student_id:    rosterId,
      nilai:         88,
    },
  });

  return asmt.id;
}

/**
 * Baca assessment_results untuk satu baris roster memakai token apa pun.
 *
 * Sengaja memanggil REST langsung, bukan lewat halaman: yang diuji adalah apa
 * yang server izinkan dibaca oleh sebuah sesi, bukan apa yang klien pilih untuk
 * ditampilkan. Penyaring di klien tidak ikut campur di sini.
 */
export async function nilaiRosterMentah(token, classroomId, rosterId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/assessment_results` +
    `?classroom_id=eq.${classroomId}&student_id=eq.${rosterId}&select=id,nilai`,
    { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token } });
  return { status: res.status, body: await res.json() };
}

/**
 * Jadwal sepanjang hari untuk hari ini (UTC), supaya sesinya selalu berstatus
 * AKTIF kapan pun CI berjalan. Mengembalikan id-nya agar test dapat menyasar
 * sesi ini saja lewat .abs-session[data-schedule-id], bukan jadwal nyata milik
 * guru yang kebetulan ada di hari yang sama.
 */
export async function buatJadwalHariIni(token, kelas) {
  const rows = await api('/rest/v1/schedules', {
    token,
    method: 'POST',
    prefer: 'return=representation',
    body: {
      classroom_id: kelas.id,
      teacher_id:   kelas.teacher_id,
      day_of_week:  hariIniUtc(),
      start_time:   '00:00:00',
      end_time:     '23:59:00',
      is_active:    true,
      note:         PENANDA_JADWAL,
    },
  });
  return rows[0].id;
}
