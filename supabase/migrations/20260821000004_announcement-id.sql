-- 20260821000004_announcement-id.sql
-- BUG-REG-1: identitas pengumuman yang eksplisit.
--
-- Pengumuman kelas disimpan sebagai satu baris student_notes per siswa
-- (fan-out). Sebelumnya baris-baris itu dikembalikan menjadi satu kartu di
-- layar dengan heuristik: isi sama + visibilitas sama + created_at sama
-- sampai detik. Dua catatan individual yang kebetulan cocok pada ketiganya
-- salah digabung — edit/hapus lalu mengenai keduanya sekaligus.
--
-- Kolom ini memberi setiap fan-out satu identitas batch. Catatan individual
-- tetap NULL, termasuk seluruh baris lama — keduanya diperlakukan sebagai
-- catatan tunggal oleh UI, sama seperti sebelumnya.
--
-- Tidak ada perubahan RLS: kolom ikut policy tabel yang sudah ada.

ALTER TABLE student_notes
  ADD COLUMN IF NOT EXISTS announcement_id uuid;

-- Partial index: hanya baris pengumuman yang pernah difilter lewat kolom ini.
CREATE INDEX IF NOT EXISTS idx_student_notes_announcement
  ON student_notes (announcement_id)
  WHERE announcement_id IS NOT NULL;
