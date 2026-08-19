-- ─────────────────────────────────────────────────────────────────────────────
-- 20260819000004_fix_fn_artifact_is_usable_case.sql
--
-- BUG: fn_artifact_is_usable SELALU mengembalikan FALSE.
--
--     SELECT p_status IN ('generated','confirmed') AND p_needs_update = false;
--
--   Literalnya huruf kecil, sedangkan rancang_artifact_version_states.
--   lifecycle_status seluruhnya huruf besar. Hitungan di DB saat fix ini dibuat:
--     CONFIRMED  2
--     GENERATED 10
--   Tidak satu pun cocok, sehingga fungsi ini tidak pernah bernilai TRUE.
--
-- DAMPAK — dua konsumen, keduanya jadi mati diam-diam:
--   1. fn_phase2c_all_meetings_usable → selalu FALSE meskipun semua MEETING_PLAN
--      sudah usable. Gate ini yang membuat phase2-followup membalas 409 pada
--      generate_follow_up.
--   2. fn_rpm_ready_for_class → selalu FALSE, sehingga Step 8 Runtime tidak
--      pernah terbuka betapapun lengkapnya pipeline.
--
--   Kolom rancang_artifact_version_states.usable (diisi fn_phase2b_recompute_usable)
--   memakai logika terpisah dan nilainya BENAR — itulah sebabnya pipeline state
--   melaporkan usable=true sementara kedua gate di atas melaporkan false.
--   Ketidakcocokan dua sumber kebenaran inilah yang menyamarkan bug ini.
--
-- FIX: bandingkan tanpa peduli besar-kecil huruf, plus lindungi dari NULL.
--   upper() dipilih ketimbang sekadar mengganti literal menjadi huruf besar,
--   supaya baris lama berhuruf kecil (bila ada) tetap tertangani.
--
-- Idempotent: CREATE OR REPLACE. Fungsi IMMUTABLE, tidak ada DDL tabel, tidak
-- ada perubahan data. Grant tidak diubah (fungsi ini tidak SECURITY DEFINER).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_artifact_is_usable(
  p_status       text,
  p_needs_update boolean
) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT upper(p_status) IN ('GENERATED','CONFIRMED')
     AND COALESCE(p_needs_update, false) = false;
$fn$;
