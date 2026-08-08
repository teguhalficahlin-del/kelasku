-- Fix T1: ai_ortu_select hanya berlaku untuk member_role = 'ORTU'
-- Policy lama menggunakan fn_is_classroom_member yang tidak filter role,
-- sehingga SISWA bisa membaca item is_visible_ortu=true.

BEGIN;

DROP POLICY IF EXISTS ai_ortu_select ON assessment_items;

CREATE POLICY ai_ortu_select ON assessment_items FOR SELECT
  TO authenticated
  USING (
    is_visible_ortu = true
    AND EXISTS (
      SELECT 1 FROM classroom_members cm
      WHERE cm.classroom_id = assessment_items.classroom_id
        AND cm.profile_id = fn_current_profile_id()
        AND cm.member_role = 'ORTU'
    )
  );

COMMIT;
