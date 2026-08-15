-- Migration: 20260815000007_tp-kktp-fix-mapel-inherit.sql
-- Tujuan: Hapus KKTP yang mapel-nya tidak sesuai mapel parent TP-nya
--         (akibat bug dropdown — guru memilih TP dari mapel yang salah).
-- Root cause: JS tidak memfilter dropdown TP induk by mapel aktif, sehingga
--             guru memilih "TP 1 Bahasa Indonesia" saat sedang di mode Matematika.
--             Baris kotor ini identik (judul, parent_id) dengan KKTP BI yang sah —
--             UPDATE tidak bisa dilakukan karena constraint duplicate.
--             Solusi: DELETE — baris ini adalah duplikat yang salah tempat.
--
-- Baris yang dihapus:
--   id: 7cebb431-3cfd-41ad-a4ec-d23ee1389c04
--   judul: "Menulis teks narasi sederhana dengan struktur yang runtut"
--   kktp_mapel: Matematika  →  parent.mapel: Bahasa Indonesia (inkonsisten)

BEGIN;

DELETE FROM tp_kktp AS k
USING  tp_kktp AS p
WHERE  k.parent_id = p.id
  AND  k.tipe      = 'KKTP'
  AND  k.mapel IS DISTINCT FROM p.mapel;

COMMIT;
