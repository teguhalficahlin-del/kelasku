-- 20260823000014_sec-cm-teacher-id-integrity-trigger.sql
-- Paksa classroom_members.teacher_id selalu sama dengan pemilik kelasnya.
--
-- Kolom itu didenormalisasi (ADR-001 mensyaratkannya untuk RLS), tetapi tidak
-- ada satu pun constraint yang mengikatnya ke classrooms.teacher_id untuk
-- classroom_id yang sama. FK-nya hanya menuntut "uuid profil yang ada" -- profil
-- siapa pun. Padahal pol_cm_guru_select berbunyi
-- USING (teacher_id = fn_current_profile_id()): nilai yang salah di kolom ini
-- langsung berarti guru yang salah bisa membaca barisnya.
--
-- SEC-002 (20260823000012) menutup jalur penulisan dari klien, jadi hari ini
-- hanya service_role yang menyisipkan. Trigger ini menjaga lapis berikutnya:
-- kebenaran kolomnya tidak lagi bergantung pada kedisiplinan pemanggil.
--
-- KENAPA AUTO-CORRECT, BUKAN RAISE KETIKA TIDAK COCOK:
--
-- Nilai yang benar dapat diturunkan sepenuhnya dari classroom_id, jadi menuntut
-- pemanggil menebaknya dengan benar hanya menambah cara untuk gagal tanpa
-- menambah keamanan. Ada pula bug laten yang ikut tertutup: generate-akun jalur
-- ortu mengirim `clRow?.teacher_id ?? null` (generate-akun/index.ts:251) --
-- kalau pembacaan classrooms gagal, NULL dikirim ke kolom NOT NULL dan
-- penyisipannya tertolak. Dengan trigger ini nilainya diisi dari sumber yang
-- benar, dan pembuatan akun ortu tidak lagi bergantung pada satu query tambahan
-- yang bisa meleset.
--
-- Konsekuensi yang disengaja: nilai teacher_id yang dikirim pemanggil selalu
-- diabaikan, bukan divalidasi. Kolom ini menjadi turunan, bukan masukan.
--
-- Berlaku untuk INSERT DAN UPDATE. Tanpa cabang UPDATE, baris yang tadinya benar
-- masih bisa dibelokkan sesudahnya -- persis bentuk serangan yang ditutup di
-- sisi INSERT.
--
-- Diperiksa sebelum apply: nol baris dengan teacher_id menyimpang, jadi tidak
-- ada data lama yang perlu diperbaiki dan migrasi ini tidak menyentuh baris
-- mana pun yang sudah ada.
--
-- Idempoten: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS sebelum CREATE.

CREATE OR REPLACE FUNCTION fn_cm_sync_teacher_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pemilik uuid;
BEGIN
  -- SECURITY DEFINER supaya pembacaan classrooms di sini tidak tunduk pada RLS
  -- pemanggil. Tanpa itu, penyisip yang tidak berhak MEMBACA kelas tujuan akan
  -- menerima v_pemilik NULL dan tertolak dengan pesan "classroom tidak
  -- ditemukan" -- menyesatkan, dan membocorkan keberadaan kelas lewat perbedaan
  -- pesan galat.
  SELECT teacher_id INTO v_pemilik
  FROM classrooms
  WHERE id = NEW.classroom_id;

  IF v_pemilik IS NULL THEN
    RAISE EXCEPTION 'Classroom % tidak ditemukan', NEW.classroom_id;
  END IF;

  NEW.teacher_id := v_pemilik;
  RETURN NEW;
END;
$$;

-- Fungsi trigger tidak pernah dipanggil langsung; ia dijalankan sistem saat
-- trigger menyala, dan pencabutan EXECUTE tidak menghalangi itu.
REVOKE EXECUTE ON FUNCTION fn_cm_sync_teacher_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_cm_sync_teacher_id() FROM anon;
REVOKE EXECUTE ON FUNCTION fn_cm_sync_teacher_id() FROM authenticated;

DROP TRIGGER IF EXISTS trg_cm_sync_teacher_id ON classroom_members;

CREATE TRIGGER trg_cm_sync_teacher_id
  BEFORE INSERT OR UPDATE ON classroom_members
  FOR EACH ROW
  EXECUTE FUNCTION fn_cm_sync_teacher_id();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.classroom_members'::regclass
      AND tgname  = 'trg_cm_sync_teacher_id'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_cm_sync_teacher_id tidak terpasang di classroom_members';
  END IF;
END;
$$;
