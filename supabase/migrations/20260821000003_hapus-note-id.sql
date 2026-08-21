-- Pisahkan Catatan dan Pesan sepenuhnya: buang kolom note_id.
--
-- Keputusan produk: Catatan dan Pesan adalah dua fitur terpisah. Catatan milik
-- guru dan hanya dibaca siswa/ortu; Pesan adalah kanal dua arah guru-ortu yang
-- tidak terikat catatan mana pun. Kolom note_id di parent_messages berasal dari
-- desain lama yang menggabungkan keduanya.
--
-- Kolom itu ternyata sudah mati sejak awal: ditulis tetapi tidak pernah dibaca,
-- dan ketiga titik pemanggilan di portal guru maupun ortu selalu mengirim NULL.
-- Pemeriksaan data sebelum migrasi ini: 6 baris, 0 di antaranya punya note_id.
-- Jadi tidak ada informasi yang hilang.
--
-- Yang berbahaya justru FK-nya: ON DELETE CASCADE ke student_notes berarti
-- menghapus satu catatan ikut menghapus permanen seluruh percakapan orang tua
-- yang tertaut padanya. Selama ini belum pernah meledak karena note_id selalu
-- NULL — ranjau yang menunggu ada kode yang mengisinya.
--
-- fn_pm_guard_kolom ditulis ulang di sini, bukan dengan menyunting migrasi
-- 20260821000001 yang sudah ter-apply ke remote.

BEGIN;

-- 1. Tulis ulang trigger lebih dulu, supaya tidak pernah ada jendela waktu di
--    mana fungsinya menyebut kolom yang sudah tidak ada.
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
  -- Setiap kolom disebut satu per satu dengan sengaja: kolom baru yang kelak
  -- ditambahkan otomatis TIDAK masuk allowlist, sehingga default-nya menolak.
  IF NEW.id                IS DISTINCT FROM OLD.id
     OR NEW.classroom_id      IS DISTINCT FROM OLD.classroom_id
     OR NEW.teacher_id        IS DISTINCT FROM OLD.teacher_id
     OR NEW.student_id        IS DISTINCT FROM OLD.student_id
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

REVOKE EXECUTE ON FUNCTION fn_pm_guard_kolom() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_pm_guard_kolom() FROM anon;

-- 2. Buang FK CASCADE, index, lalu kolomnya.
--    DROP COLUMN sebenarnya membuang FK dan index sekaligus; ketiganya ditulis
--    eksplisit agar maksudnya terbaca dan migrasi tetap idempoten.
ALTER TABLE parent_messages
  DROP CONSTRAINT IF EXISTS parent_messages_note_id_fkey;

DROP INDEX IF EXISTS idx_parent_messages_note;

ALTER TABLE parent_messages
  DROP COLUMN IF EXISTS note_id;

COMMIT;
