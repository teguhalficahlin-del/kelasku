-- Migration: 20260806000005_assessment-rpc.sql
-- Tujuan: RPC utama fitur penilaian
-- Idempotent: CREATE OR REPLACE
-- Prereq: 20260806000003 + 20260806000004 (tabel + RLS sudah ada)
-- ORTU isolation: via classroom_members.linked_student_id

-- ============================================================
-- RPC 1: fn_calculate_grade_summary
-- Hitung nilai akhir per siswa, UPSERT ke grade_summaries
-- Hanya bisa dipanggil guru pemilik classroom
-- ============================================================
CREATE OR REPLACE FUNCTION fn_calculate_grade_summary(
  p_classroom_id  UUID,
  p_academic_year VARCHAR(9),
  p_semester      INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_settings      RECORD;
  v_student       RECORD;
  v_sumatif_avg   NUMERIC(5,2);
  v_formatif_avg  NUMERIC(5,2);
  v_nilai_akhir   NUMERIC(5,2);
  v_updated_count INTEGER := 0;
BEGIN
  -- Guard: hanya guru pemilik classroom
  IF NOT fn_is_classroom_owner(p_classroom_id) THEN
    RAISE EXCEPTION 'Akses ditolak';
  END IF;

  -- Ambil grading_settings
  SELECT * INTO v_settings
  FROM grading_settings
  WHERE classroom_id  = p_classroom_id
    AND academic_year = p_academic_year
    AND semester      = p_semester;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grading_settings tidak ditemukan untuk classroom, tahun, dan semester ini';
  END IF;

  -- Iterasi per siswa yang terdaftar di classroom
  FOR v_student IN
    SELECT cm.profile_id AS student_id
    FROM classroom_members cm
    WHERE cm.classroom_id = p_classroom_id
      AND cm.member_role  = 'SISWA'
  LOOP
    -- Hitung rata-rata sumatif (is_void = false)
    SELECT AVG(a.nilai_angka)
      INTO v_sumatif_avg
      FROM tp_assessments a
      JOIN learning_objectives lo
        ON lo.learning_objective_id = a.learning_objective_id
     WHERE a.classroom_id = p_classroom_id
       AND a.student_id   = v_student.student_id
       AND a.tipe         = 'SUMATIF'
       AND a.is_void      = false
       AND lo.academic_year = p_academic_year
       AND lo.semester      = p_semester;

    -- Hitung rata-rata formatif (is_void = false)
    SELECT AVG(a.nilai_angka)
      INTO v_formatif_avg
      FROM tp_assessments a
      JOIN learning_objectives lo
        ON lo.learning_objective_id = a.learning_objective_id
     WHERE a.classroom_id = p_classroom_id
       AND a.student_id   = v_student.student_id
       AND a.tipe         = 'FORMATIF'
       AND a.is_void      = false
       AND lo.academic_year = p_academic_year
       AND lo.semester      = p_semester;

    -- Kalkulasi nilai_akhir
    IF NOT v_settings.is_formatif_included OR v_sumatif_avg IS NULL THEN
      -- Formatif tidak dihitung, atau tidak ada data sumatif sama sekali
      v_nilai_akhir := v_sumatif_avg;
    ELSIF v_settings.metode_formatif = 'KONTEKS_SAJA' THEN
      -- Formatif hanya konteks, nilai akhir = sumatif saja
      v_nilai_akhir := v_sumatif_avg;
    ELSE
      -- BOBOT: gabungkan sumatif + formatif sesuai bobot
      v_nilai_akhir := ROUND(
        (COALESCE(v_sumatif_avg, 0) * v_settings.bobot_sumatif +
         COALESCE(v_formatif_avg, 0) * v_settings.bobot_formatif) / 100.0,
        2
      );
    END IF;

    -- UPSERT ke grade_summaries
    INSERT INTO grade_summaries (
      classroom_id, student_id, teacher_id,
      academic_year, semester,
      nilai_akhir, is_auto_calculate, last_calculated_at,
      created_at, updated_at
    )
    VALUES (
      p_classroom_id, v_student.student_id, fn_current_profile_id(),
      p_academic_year, p_semester,
      v_nilai_akhir, true, now(),
      now(), now()
    )
    ON CONFLICT (classroom_id, student_id, academic_year, semester)
    DO UPDATE SET
      nilai_akhir        = EXCLUDED.nilai_akhir,
      is_auto_calculate  = true,
      last_calculated_at = now(),
      updated_at         = now();

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'updated', v_updated_count);
END;
$$;

GRANT EXECUTE ON FUNCTION fn_calculate_grade_summary(UUID, VARCHAR, INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_calculate_grade_summary(UUID, VARCHAR, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION fn_calculate_grade_summary(UUID, VARCHAR, INTEGER) FROM PUBLIC;

-- ============================================================
-- RPC 2: fn_get_grade_summary
-- Ambil rekap nilai sesuai role pemanggil
-- GURU: semua siswa + breakdown TP
-- SISWA: diri sendiri + hanya jika published
-- ORTU: anak yang dipantau + hanya jika published
-- ============================================================
CREATE OR REPLACE FUNCTION fn_get_grade_summary(
  p_classroom_id  UUID,
  p_academic_year VARCHAR(9),
  p_semester      INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_role   TEXT;
  v_caller_id     UUID;
  v_result        JSONB := '[]'::JSONB;
  v_student       RECORD;
  v_summary       RECORD;
  v_breakdown     JSONB;
  v_student_rows  JSONB := '[]'::JSONB;
BEGIN
  v_caller_id := fn_current_profile_id();

  SELECT role INTO v_caller_role
  FROM profiles
  WHERE id = v_caller_id;

  IF v_caller_role = 'GURU' THEN
    -- Guard: hanya guru pemilik classroom
    IF NOT fn_is_classroom_owner(p_classroom_id) THEN
      RAISE EXCEPTION 'Akses ditolak';
    END IF;

    -- Ambil semua siswa di classroom
    FOR v_student IN
      SELECT cm.profile_id AS student_id, p.full_name
      FROM classroom_members cm
      JOIN profiles p ON p.id = cm.profile_id
      WHERE cm.classroom_id = p_classroom_id
        AND cm.member_role  = 'SISWA'
      ORDER BY p.full_name
    LOOP
      SELECT * INTO v_summary
      FROM grade_summaries
      WHERE classroom_id  = p_classroom_id
        AND student_id    = v_student.student_id
        AND academic_year = p_academic_year
        AND semester      = p_semester;

      -- Breakdown nilai per TP
      SELECT jsonb_agg(
        jsonb_build_object(
          'kode_tp',       lo.kode_tp,
          'deskripsi_tp',  lo.deskripsi_tp,
          'avg_sumatif',   AVG(a.nilai_angka) FILTER (WHERE a.tipe = 'SUMATIF' AND a.is_void = false),
          'avg_formatif',  AVG(a.nilai_angka) FILTER (WHERE a.tipe = 'FORMATIF' AND a.is_void = false)
        ) ORDER BY lo.urutan
      )
      INTO v_breakdown
      FROM learning_objectives lo
      LEFT JOIN tp_assessments a
        ON a.learning_objective_id = lo.learning_objective_id
       AND a.student_id            = v_student.student_id
       AND a.is_void               = false
      WHERE lo.classroom_id  = p_classroom_id
        AND lo.academic_year = p_academic_year
        AND lo.semester      = p_semester;

      v_student_rows := v_student_rows || jsonb_build_object(
        'student_id',        v_student.student_id,
        'nama',              v_student.full_name,
        'nilai_akhir',       CASE WHEN v_summary IS NULL THEN NULL ELSE v_summary.nilai_akhir END,
        'predikat',          CASE WHEN v_summary IS NULL THEN NULL ELSE v_summary.predikat END,
        'deskripsi_naratif', CASE WHEN v_summary IS NULL THEN NULL ELSE v_summary.deskripsi_naratif END,
        'published_at',      CASE WHEN v_summary IS NULL THEN NULL ELSE v_summary.published_at END,
        'breakdown',         COALESCE(v_breakdown, '[]'::JSONB)
      );
    END LOOP;

    RETURN v_student_rows;

  ELSIF v_caller_role = 'SISWA' THEN
    -- Guard: harus member classroom
    IF NOT fn_is_classroom_member(p_classroom_id) THEN
      RAISE EXCEPTION 'Akses ditolak';
    END IF;

    SELECT * INTO v_summary
    FROM grade_summaries
    WHERE classroom_id  = p_classroom_id
      AND student_id    = v_caller_id
      AND academic_year = p_academic_year
      AND semester      = p_semester
      AND published_at  IS NOT NULL;

    IF NOT FOUND THEN
      RETURN '[]'::JSONB;
    END IF;

    SELECT jsonb_agg(
      jsonb_build_object(
        'kode_tp',       lo.kode_tp,
        'deskripsi_tp',  lo.deskripsi_tp,
        'avg_sumatif',   AVG(a.nilai_angka) FILTER (WHERE a.tipe = 'SUMATIF' AND a.is_void = false),
        'avg_formatif',  AVG(a.nilai_angka) FILTER (WHERE a.tipe = 'FORMATIF' AND a.is_void = false)
      ) ORDER BY lo.urutan
    )
    INTO v_breakdown
    FROM learning_objectives lo
    LEFT JOIN tp_assessments a
      ON a.learning_objective_id = lo.learning_objective_id
     AND a.student_id            = v_caller_id
     AND a.is_void               = false
    WHERE lo.classroom_id  = p_classroom_id
      AND lo.academic_year = p_academic_year
      AND lo.semester      = p_semester;

    RETURN jsonb_build_array(jsonb_build_object(
      'student_id',        v_caller_id,
      'nama',              (SELECT full_name FROM profiles WHERE id = v_caller_id),
      'nilai_akhir',       v_summary.nilai_akhir,
      'predikat',          v_summary.predikat,
      'deskripsi_naratif', v_summary.deskripsi_naratif,
      'published_at',      v_summary.published_at,
      'breakdown',         COALESCE(v_breakdown, '[]'::JSONB)
    ));

  ELSIF v_caller_role = 'ORTU' THEN
    -- Iterasi semua anak yang dipantau ortu ini di classroom tersebut
    FOR v_student IN
      SELECT cm.linked_student_id AS student_id, p.full_name
      FROM classroom_members cm
      JOIN profiles p ON p.id = cm.linked_student_id
      WHERE cm.classroom_id = p_classroom_id
        AND cm.profile_id   = v_caller_id
        AND cm.member_role  = 'ORTU'
      ORDER BY p.full_name
    LOOP
      SELECT * INTO v_summary
      FROM grade_summaries
      WHERE classroom_id  = p_classroom_id
        AND student_id    = v_student.student_id
        AND academic_year = p_academic_year
        AND semester      = p_semester
        AND published_at  IS NOT NULL;

      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      SELECT jsonb_agg(
        jsonb_build_object(
          'kode_tp',       lo.kode_tp,
          'deskripsi_tp',  lo.deskripsi_tp,
          'avg_sumatif',   AVG(a.nilai_angka) FILTER (WHERE a.tipe = 'SUMATIF' AND a.is_void = false),
          'avg_formatif',  AVG(a.nilai_angka) FILTER (WHERE a.tipe = 'FORMATIF' AND a.is_void = false)
        ) ORDER BY lo.urutan
      )
      INTO v_breakdown
      FROM learning_objectives lo
      LEFT JOIN tp_assessments a
        ON a.learning_objective_id = lo.learning_objective_id
       AND a.student_id            = v_student.student_id
       AND a.is_void               = false
      WHERE lo.classroom_id  = p_classroom_id
        AND lo.academic_year = p_academic_year
        AND lo.semester      = p_semester;

      v_student_rows := v_student_rows || jsonb_build_object(
        'student_id',        v_student.student_id,
        'nama',              v_student.full_name,
        'nilai_akhir',       v_summary.nilai_akhir,
        'predikat',          v_summary.predikat,
        'deskripsi_naratif', v_summary.deskripsi_naratif,
        'published_at',      v_summary.published_at,
        'breakdown',         COALESCE(v_breakdown, '[]'::JSONB)
      );
    END LOOP;

    RETURN v_student_rows;

  ELSE
    RAISE EXCEPTION 'Role tidak dikenali';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_get_grade_summary(UUID, VARCHAR, INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_get_grade_summary(UUID, VARCHAR, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION fn_get_grade_summary(UUID, VARCHAR, INTEGER) FROM PUBLIC;

-- ============================================================
-- RPC 3: fn_get_cp_for_subject
-- Ambil Capaian Pembelajaran dari core schema berdasarkan nama mapel
-- ============================================================
CREATE OR REPLACE FUNCTION fn_get_cp_for_subject(
  p_subject_name VARCHAR,
  p_grade_level  SMALLINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_subject_id    UUID;
  v_cp_umum       TEXT;
  v_elements      JSONB;
  v_confidence    TEXT;
BEGIN
  -- Cari subject_id via mapping, prioritas HIGH → MEDIUM → LOW
  SELECT m.core_subject_id, m.confidence
    INTO v_subject_id, v_confidence
    FROM core.subject_name_mapping m
   WHERE m.is_active = true
     AND LOWER(p_subject_name) ILIKE LOWER(m.kode_pattern)
     AND (
       p_grade_level IS NULL
       OR m.grade_level IS NULL
       OR m.grade_level = p_grade_level
     )
   ORDER BY
     CASE m.confidence
       WHEN 'HIGH'   THEN 1
       WHEN 'MEDIUM' THEN 2
       WHEN 'LOW'    THEN 3
       ELSE 4
     END
   LIMIT 1;

  IF v_subject_id IS NULL THEN
    RETURN jsonb_build_object(
      'subject_name', p_subject_name,
      'cp_umum',      NULL,
      'elements',     '[]'::JSONB
    );
  END IF;

  -- Ambil cp_umum dari capaian_pembelajaran (aktif)
  SELECT cp.cp_umum INTO v_cp_umum
  FROM core.capaian_pembelajaran cp
  JOIN core.subject_phases sp ON sp.subject_phase_id = cp.subject_phase_id
  WHERE sp.subject_id = v_subject_id
    AND cp.is_active  = true
  ORDER BY cp.display_order
  LIMIT 1;

  -- Ambil elements
  SELECT jsonb_agg(
    jsonb_build_object(
      'element_id',    e.element_id,
      'nama_elemen',   e.nama_elemen,
      'deskripsi_cp',  e.deskripsi_cp,
      'element_order', e.element_order
    ) ORDER BY e.element_order
  )
  INTO v_elements
  FROM core.cp_elements e
  JOIN core.capaian_pembelajaran cp ON cp.cp_id = e.cp_id
  JOIN core.subject_phases sp ON sp.subject_phase_id = cp.subject_phase_id
  WHERE sp.subject_id = v_subject_id
    AND cp.is_active  = true
    AND e.is_active   = true;

  RETURN jsonb_build_object(
    'subject_name', p_subject_name,
    'cp_umum',      v_cp_umum,
    'elements',     COALESCE(v_elements, '[]'::JSONB)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_get_cp_for_subject(VARCHAR, SMALLINT) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_get_cp_for_subject(VARCHAR, SMALLINT) FROM anon;
REVOKE EXECUTE ON FUNCTION fn_get_cp_for_subject(VARCHAR, SMALLINT) FROM PUBLIC;

-- ============================================================
-- RPC 4: fn_check_element_duplicate
-- Cek apakah element_id sudah dipakai di LO lain dalam classroom yang sama
-- ============================================================
CREATE OR REPLACE FUNCTION fn_check_element_duplicate(
  p_element_id   UUID,
  p_classroom_id UUID,
  p_lo_id        UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_existing_kode TEXT;
BEGIN
  SELECT lo.kode_tp INTO v_existing_kode
  FROM learning_objectives lo
  WHERE lo.classroom_id = p_classroom_id
    AND lo.element_id   = p_element_id
    AND (p_lo_id IS NULL OR lo.learning_objective_id != p_lo_id)
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'is_duplicate',      true,
      'existing_kode_tp',  v_existing_kode
    );
  ELSE
    RETURN jsonb_build_object(
      'is_duplicate',      false,
      'existing_kode_tp',  NULL
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_check_element_duplicate(UUID, UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_check_element_duplicate(UUID, UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION fn_check_element_duplicate(UUID, UUID, UUID) FROM PUBLIC;
