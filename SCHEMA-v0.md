# SCHEMA-v0 — SIP Mandiri
# Rancangan Database

Versi: 0.1 (Draft)
Tanggal: 30 Juli 2026
Status: REVIEW

---

## 1. PRINSIP DESAIN

### Tenant Isolation
- Tidak ada `school_id` — tidak ada entitas sekolah
- Isolasi per classroom: setiap baris data terhubung ke `classroom_id`
- Setiap tabel fitur menyimpan `teacher_id` sebagai denormalisasi untuk efisiensi RLS
- RLS anchor: `teacher_id = fn_current_profile_id()` untuk guru, `classroom_id` membership untuk siswa/ortu

### Mengapa denormalisasi `teacher_id`?
JOIN di dalam USING clause RLS dievaluasi per baris dan tidak bisa memanfaatkan
index secara optimal. Menyimpan `teacher_id` langsung di tabel fitur membuat
RLS policy menjadi simple equality check — lebih cepat dan lebih aman.

### Role System
Hanya 3 role:
```
GURU   → owner classroom, full access ke data classroom sendiri
SISWA  → member classroom, read-only terbatas
ORTU   → linked ke siswa, read-only terbatas
```

---

## 2. ENTITY RELATIONSHIP

```
profiles (1) ──────────────────── (*) classrooms
    │                                      │
    │ (siswa)                              │
    └──── (*) classroom_members ────────── ┘
                    │
                    │ (ortu linked ke siswa)
    profiles (ortu) ┘

classrooms (1) ──── (*) student_notes
classrooms (1) ──── (*) guidance_sessions
classrooms (1) ──── (*) forum_posts
forum_posts (1) ─── (*) forum_comments
classrooms (1) ──── (*) schedules
```

---

## 3. DEFINISI TABEL

### 3.1 `profiles`
Satu baris per user — guru, siswa, dan ortu semua di sini.

```sql
CREATE TABLE profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     text NOT NULL,
  role          text NOT NULL CHECK (role IN ('GURU', 'SISWA', 'ORTU')),
  email         text,
  phone         text,
  avatar_url    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

---

### 3.2 `classrooms`
Satu classroom dimiliki tepat satu guru.

```sql
CREATE TABLE classrooms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  subject         text,
  classroom_code  text NOT NULL UNIQUE DEFAULT upper(substr(md5(random()::text), 1, 8)),
  is_archived     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

**Catatan:**
- `classroom_code` adalah kode yang dibagikan ke siswa/ortu untuk join
- `is_archived` = true → classroom tidak aktif, data tetap tersimpan
- Satu guru bisa punya banyak classroom (K2)

---

### 3.3 `classroom_members`
Jembatan many-to-many antara siswa/ortu dengan classroom.

```sql
CREATE TYPE member_role AS ENUM ('SISWA', 'ORTU');

CREATE TABLE classroom_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id    uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES profiles(id),  -- denormalisasi RLS
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_role     member_role NOT NULL,
  linked_student_id uuid REFERENCES profiles(id),  -- diisi jika member_role = ORTU
  joined_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (classroom_id, profile_id),
  CHECK (member_role != 'ORTU' OR linked_student_id IS NOT NULL)
);
```

**Catatan:**
- `linked_student_id` wajib diisi jika `member_role = ORTU` — menunjuk profil siswa yang dituju
- `teacher_id` disimpan di sini untuk RLS efisien (guru verifikasi membership siswa di classroomnya)
- Satu siswa bisa join banyak classroom (K3) — UNIQUE hanya di (classroom_id, profile_id)

---

### 3.4 `student_notes`
Catatan guru per siswa, per classroom.

```sql
CREATE TABLE student_notes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id          uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id            uuid NOT NULL REFERENCES profiles(id),  -- denormalisasi RLS
  student_id            uuid NOT NULL REFERENCES profiles(id),
  content               text NOT NULL,
  is_visible_to_student boolean NOT NULL DEFAULT false,
  is_visible_to_parent  boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
```

---

### 3.5 `guidance_sessions`
Rekaman sesi pembinaan — selalu private, hanya guru yang bisa lihat.

```sql
CREATE TABLE guidance_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id    uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES profiles(id),  -- denormalisasi RLS
  student_id      uuid NOT NULL REFERENCES profiles(id),
  session_date    date NOT NULL,
  duration_minutes int,
  summary         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

**Catatan:**
- Tidak ada kolom `is_visible_*` — selalu private by design (aturan bisnis #4)
- RLS hanya beri akses ke `teacher_id = auth.uid()`

---

### 3.6 `forum_posts`
Posting guru ke seluruh anggota classroom. Hanya guru pemilik classroom yang bisa membuat posting.

```sql
CREATE TABLE forum_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id    uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES profiles(id),  -- pemilik posting sekaligus RLS anchor
  title           text,
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

---

### 3.7 `forum_comments`
Komentar pada posting forum — bisa dari guru, siswa, atau ortu.

```sql
CREATE TABLE forum_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES classrooms(id), -- denormalisasi RLS
  teacher_id  uuid NOT NULL REFERENCES profiles(id),    -- denormalisasi RLS
  author_id   uuid NOT NULL REFERENCES profiles(id),
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

---

### 3.8 `schedules`
Jadwal per classroom.

```sql
CREATE TABLE schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id    uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  teacher_id      uuid NOT NULL REFERENCES profiles(id),  -- denormalisasi RLS
  day_of_week     text NOT NULL CHECK (day_of_week IN
                    ('SENIN','SELASA','RABU','KAMIS','JUMAT','SABTU')),
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  subject         text,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_time_order CHECK (end_time > start_time)
);
```

---

## 4. RLS POLICIES

### Fungsi Helper

```sql
-- Ambil profile_id dari user yang sedang login
CREATE OR REPLACE FUNCTION fn_current_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM profiles WHERE user_id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION fn_current_profile_id FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_current_profile_id FROM anon;
GRANT EXECUTE ON FUNCTION fn_current_profile_id TO authenticated;

-- Cek apakah user login adalah guru pemilik classroom
CREATE OR REPLACE FUNCTION fn_is_classroom_owner(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM classrooms
    WHERE id = p_classroom_id
      AND teacher_id = fn_current_profile_id()
  )
$$;
REVOKE EXECUTE ON FUNCTION fn_is_classroom_owner FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_is_classroom_owner FROM anon;
GRANT EXECUTE ON FUNCTION fn_is_classroom_owner TO authenticated;

-- Cek apakah user login adalah member classroom (siswa atau ortu)
CREATE OR REPLACE FUNCTION fn_is_classroom_member(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM classroom_members
    WHERE classroom_id = p_classroom_id
      AND profile_id = fn_current_profile_id()
  )
$$;
REVOKE EXECUTE ON FUNCTION fn_is_classroom_member FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_is_classroom_member FROM anon;
GRANT EXECUTE ON FUNCTION fn_is_classroom_member TO authenticated;
```

---

### Fungsi Trigger

```sql
-- Auto-update kolom updated_at setiap kali baris diubah
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- Terapkan ke semua tabel yang punya kolom updated_at
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_classrooms_updated_at
  BEFORE UPDATE ON classrooms
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_student_notes_updated_at
  BEFORE UPDATE ON student_notes
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_guidance_sessions_updated_at
  BEFORE UPDATE ON guidance_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_forum_posts_updated_at
  BEFORE UPDATE ON forum_posts
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_forum_comments_updated_at
  BEFORE UPDATE ON forum_comments
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
```

**Catatan:** `classroom_members` dan `schedules` tidak punya kolom `updated_at` — tidak perlu trigger.

---

### Policy Matrix

| Tabel | Guru (owner) | Siswa (member) | Ortu (member) |
|-------|-------------|----------------|---------------|
| `classrooms` | CRUD classroom sendiri | SELECT jika member | SELECT jika member |
| `classroom_members` | SELECT semua member di classroomnya | SELECT diri sendiri | SELECT diri sendiri |
| `student_notes` | CRUD semua catatan di classroomnya | SELECT jika `is_visible_to_student = true` AND tentang dirinya | SELECT jika `is_visible_to_parent = true` AND tentang anaknya |
| `guidance_sessions` | CRUD semua sesi di classroomnya | ❌ tidak ada akses | ❌ tidak ada akses |
| `forum_posts` | CRUD semua posting di classroomnya | SELECT + INSERT komentar | SELECT + INSERT komentar |
| `forum_comments` | CRUD semua komentar | SELECT + INSERT di classroom yang diikuti | SELECT + INSERT di classroom yang diikuti |
| `schedules` | CRUD jadwal classroomnya | SELECT jika member | SELECT jika member |

---

### Contoh SQL RLS — `student_notes` (reference pattern)

```sql
ALTER TABLE student_notes ENABLE ROW LEVEL SECURITY;

-- Guru: full CRUD untuk catatan di classroom miliknya
CREATE POLICY pol_notes_guru_all ON student_notes
  FOR ALL
  TO authenticated
  USING (teacher_id = fn_current_profile_id())
  WITH CHECK (teacher_id = fn_current_profile_id());

-- Siswa: SELECT catatan tentang dirinya yang di-flag visible
CREATE POLICY pol_notes_siswa_select ON student_notes
  FOR SELECT
  TO authenticated
  USING (
    is_visible_to_student = true
    AND student_id = fn_current_profile_id()
    AND fn_is_classroom_member(classroom_id)
  );

-- Ortu: SELECT catatan tentang anak yang di-link, yang di-flag visible ke ortu
CREATE POLICY pol_notes_ortu_select ON student_notes
  FOR SELECT
  TO authenticated
  USING (
    is_visible_to_parent = true
    AND fn_is_classroom_member(classroom_id)
    AND EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.classroom_id = student_notes.classroom_id
        AND cm.profile_id = fn_current_profile_id()
        AND cm.member_role = 'ORTU'
        AND cm.linked_student_id = student_notes.student_id
    )
  );
```

**Catatan:** Pola yang sama digunakan untuk semua tabel lain — ganti nama tabel, kolom visibilitas, dan kondisi member sesuai Policy Matrix di atas.

---

## 5. INDEXES

```sql
-- Lookup cepat profil dari user_id (auth)
CREATE INDEX idx_profiles_user_id ON profiles(user_id);

-- Lookup classroom oleh guru
CREATE INDEX idx_classrooms_teacher_id ON classrooms(teacher_id);

-- Lookup join kode classroom
CREATE INDEX idx_classrooms_code ON classrooms(classroom_code);

-- Lookup member per classroom
CREATE INDEX idx_classroom_members_classroom ON classroom_members(classroom_id);
CREATE INDEX idx_classroom_members_profile ON classroom_members(profile_id);

-- Lookup catatan per siswa
CREATE INDEX idx_notes_student ON student_notes(student_id);
CREATE INDEX idx_notes_classroom ON student_notes(classroom_id);

-- Lookup sesi pembinaan per siswa
CREATE INDEX idx_guidance_student ON guidance_sessions(student_id);

-- Lookup forum per classroom
CREATE INDEX idx_forum_posts_classroom ON forum_posts(classroom_id);
CREATE INDEX idx_forum_comments_post ON forum_comments(post_id);

-- Lookup jadwal per classroom
CREATE INDEX idx_schedules_classroom ON schedules(classroom_id);

-- Lookup ortu via linked_student_id (untuk RLS ortu)
CREATE INDEX idx_classroom_members_linked_student
  ON classroom_members(linked_student_id)
  WHERE linked_student_id IS NOT NULL;

-- Filter catatan yang visible ke siswa / ortu (partial index)
CREATE INDEX idx_notes_visible_student
  ON student_notes(classroom_id)
  WHERE is_visible_to_student = true;

CREATE INDEX idx_notes_visible_parent
  ON student_notes(classroom_id)
  WHERE is_visible_to_parent = true;
```

---

## 6. KEPUTUSAN DESAIN YANG DISENGAJA

| Keputusan | Alasan |
|-----------|--------|
| Tidak ada `school_id` | Guru daftar mandiri, tidak terikat institusi |
| `teacher_id` denormalisasi di setiap tabel | RLS efisien tanpa JOIN |
| `guidance_sessions` selalu private | Catatan pembinaan sensitif, tidak boleh dibagikan |
| `classroom_code` sebagai kode join | Lebih user-friendly dari UUID |
| Arsip bukan hapus | Data historis harus tetap tersimpan |
| `linked_student_id` di `classroom_members` | Ortu bisa linked ke siswa spesifik di classroom yang sama |
| Tidak ada tabel `schools` | Sesuai konsep mandiri — tidak ada koordinasi institusi |
