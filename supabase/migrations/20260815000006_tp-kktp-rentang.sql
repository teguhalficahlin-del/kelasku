-- Tambah kolom rentang (JSONB) ke tp_kktp untuk 4 predikat KKTP
-- Kolom batas_bawah & batas_atas dipertahankan untuk kompatibilitas data lama
BEGIN;

ALTER TABLE tp_kktp
  ADD COLUMN IF NOT EXISTS rentang JSONB DEFAULT
    '{"BB":[0,54],"MB":[55,69],"BSH":[70,84],"SB":[85,100]}';

COMMIT;
