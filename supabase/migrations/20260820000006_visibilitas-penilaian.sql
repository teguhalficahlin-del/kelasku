-- Kontrol visibilitas per penilaian.
--
-- Sebelumnya tidak ada kendali sama sekali: setiap hasil penilaian yang guru
-- simpan langsung terlihat siswa dan ortu, termasuk hasil DIAGNOSTIK yang
-- sebenarnya alat kerja guru untuk mengelompokkan siswa (grup_diferensiasi),
-- bukan bahan yang perlu dibaca siswa.
--
-- Kendali diletakkan pada tabel assessments (per penilaian), bukan pada tiap
-- baris nilai — guru memutuskan sekali untuk satu penilaian.

BEGIN;

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS is_visible_siswa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_visible_ortu  boolean NOT NULL DEFAULT false;

-- Penilaian yang sudah ada dianggap sudah diumumkan, agar nilai yang kini
-- tampil di portal tidak mendadak hilang setelah migration ini.
UPDATE assessments SET is_visible_siswa = true, is_visible_ortu = true;

-- ── RLS assessments ────────────────────────────────────────────────────────
-- Portal memakai embed 'assessments!inner(...)', sehingga menyembunyikan baris
-- assessments otomatis menggugurkan baris hasilnya juga.
DROP POLICY IF EXISTS as_siswa_select ON assessments;
CREATE POLICY as_siswa_select ON assessments
  FOR SELECT TO authenticated
  USING (fn_is_classroom_member(classroom_id) AND is_visible_siswa = true);

DROP POLICY IF EXISTS as_ortu_select ON assessments;
CREATE POLICY as_ortu_select ON assessments
  FOR SELECT TO authenticated
  USING (
    is_visible_ortu = true
    AND EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.profile_id       = fn_current_profile_id()
        AND cm.member_role      = 'ORTU'::member_role
        AND cm.linked_student_id IS NOT NULL
        AND cm.classroom_id     = assessments.classroom_id
    )
  );

-- ── RLS assessment_results ─────────────────────────────────────────────────
-- Digate juga secara langsung, supaya kendali tidak dapat ditembus dengan
-- meminta assessment_results tanpa embed.
DROP POLICY IF EXISTS ar_siswa_select ON assessment_results;
CREATE POLICY ar_siswa_select ON assessment_results
  FOR SELECT TO authenticated
  USING (
    fn_is_classroom_member(classroom_id)
    AND student_id IN (SELECT fn_current_roster_ids())
    AND EXISTS (
      SELECT 1 FROM assessments a
      WHERE a.id = assessment_results.assessment_id
        AND a.is_visible_siswa = true
    )
  );

DROP POLICY IF EXISTS ar_ortu_select ON assessment_results;
CREATE POLICY ar_ortu_select ON assessment_results
  FOR SELECT TO authenticated
  USING (
    student_id IN (SELECT fn_child_roster_ids())
    AND EXISTS (
      SELECT 1 FROM assessments a
      WHERE a.id = assessment_results.assessment_id
        AND a.is_visible_ortu = true
    )
  );

COMMIT;

-- Catatan: guru tidak terpengaruh — policy pemilik classroom terpisah dan tidak
-- menyentuh kedua kolom ini.
