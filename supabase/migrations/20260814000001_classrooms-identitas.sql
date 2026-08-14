-- Tambah kolom identitas rancang ke tabel classrooms
-- Sudah diterapkan di remote — file ini hanya untuk sinkronisasi lokal

ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS jenjang TEXT;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS bidang_keahlian TEXT;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS program_keahlian TEXT;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS mapel_key TEXT;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS elemen_terpilih JSONB;

CREATE INDEX IF NOT EXISTS idx_classrooms_jenjang ON classrooms(jenjang);
CREATE INDEX IF NOT EXISTS idx_classrooms_mapel_key ON classrooms(mapel_key);
