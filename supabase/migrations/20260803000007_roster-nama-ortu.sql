-- Tambah kolom nama_ortu ke classroom_roster (opsional, diisi guru saat input manual atau upload)
ALTER TABLE classroom_roster
  ADD COLUMN IF NOT EXISTS nama_ortu TEXT;
