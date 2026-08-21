-- Kunci kolom pesan guru dari penyuntingan oleh orang tua.
--
-- Masalah: policy pm_ortu_update_read membatasi BARIS (hanya pesan
-- author_role='GURU' tentang anaknya) tetapi tidak membatasi KOLOM. RLS memang
-- tidak mengenal batas kolom, dan REVOKE UPDATE (kolom) juga tidak menolong
-- karena Supabase memberi GRANT ALL di level tabel untuk tabel baru.
-- Akibatnya ortu dapat memanggil PostgREST langsung dan mengubah `content`
-- pesan guru — riwayat percakapan jadi tidak dapat dipercaya sebagai bukti.
--
-- Perbaikan: trigger BEFORE UPDATE dengan allowlist default-deny, sesuai
-- AGENT_WORKING_RULES.md §5. Pemilik classroom (guru) tidak dibatasi; pihak
-- lain yang lolos RLS hanya boleh mengubah read_at. Setiap kolom disebut satu
-- per satu dengan sengaja: kolom baru yang kelak ditambahkan otomatis TIDAK
-- masuk allowlist, sehingga default-nya menolak, bukan mengizinkan.

BEGIN;

CREATE OR REPLACE FUNCTION fn_pm_guard_kolom()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guru pemilik classroom: tidak dibatasi (policy pm_guru_all sudah mengurung
  -- dia ke classroom miliknya sendiri).
  IF fn_is_classroom_owner(OLD.classroom_id) THEN
    RETURN NEW;
  END IF;

  -- Selain pemilik (dalam praktiknya: ortu) — hanya read_at yang boleh berubah.
  IF NEW.id                IS DISTINCT FROM OLD.id
     OR NEW.classroom_id      IS DISTINCT FROM OLD.classroom_id
     OR NEW.teacher_id        IS DISTINCT FROM OLD.teacher_id
     OR NEW.student_id        IS DISTINCT FROM OLD.student_id
     OR NEW.note_id           IS DISTINCT FROM OLD.note_id
     OR NEW.author_profile_id IS DISTINCT FROM OLD.author_profile_id
     OR NEW.author_role       IS DISTINCT FROM OLD.author_role
     OR NEW.content           IS DISTINCT FROM OLD.content
     OR NEW.created_at        IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'hanya kolom read_at yang dapat diubah pada pesan ini'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Fungsi trigger tidak dipanggil langsung oleh klien, dan PostgreSQL tidak
-- memeriksa EXECUTE untuk fungsi trigger. Revoke tetap dipasang sebagai
-- pertahanan berlapis sesuai AGENT_WORKING_RULES.md §5.
REVOKE EXECUTE ON FUNCTION fn_pm_guard_kolom() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_pm_guard_kolom() FROM anon;

DROP TRIGGER IF EXISTS trg_pm_guard_kolom ON parent_messages;
CREATE TRIGGER trg_pm_guard_kolom
  BEFORE UPDATE ON parent_messages
  FOR EACH ROW
  EXECUTE FUNCTION fn_pm_guard_kolom();

COMMIT;
