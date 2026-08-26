-- fn_upsert_assessment_batch — simpan hasil penilaian satu kelas dalam satu
-- panggilan, satu transaksi.
--
-- Sebelum ini modal Penilaian mengirim satu request PostgREST per siswa. Untuk
-- kelas 30 siswa itu 30 request berurutan: lambat, dan separuh jalan bisa putus
-- sehingga sebagian siswa tersimpan dan sebagian tidak. Fungsi ini membuat
-- seluruh baris berhasil bersama atau batal bersama.
--
-- Catatan bentuk (menyimpang dari draf awal, mengikuti keadaan tabel yang
-- sebenarnya di project teccdzetrdjowqemnuuc):
--   * conflict target = (assessment_id, student_id) — satu-satunya UNIQUE di
--     tabel ini, bukan tiga kolom.
--   * teacher_id ADA di tabel dan NOT NULL tanpa default, jadi tidak bisa
--     dihilangkan dari INSERT. Ia tidak diambil dari klien melainkan dibaca
--     dari classrooms.teacher_id di dalam fungsi — signature tetap tiga
--     parameter, dan nilainya tidak bisa dipalsukan pemanggil.
--   * kolom jenis / semester / tahun_ajaran TIDAK ada di assessment_results;
--     ketiganya dihilangkan. Semester dan tahun ajaran melekat pada baris
--     assessments, bukan pada hasil per siswa.
--
-- Kunci absen vs kunci bernilai null dibedakan, sama seperti perilaku
-- .upsert() PostgREST yang digantikan. Klien memakai perbedaan itu dengan
-- sengaja: mengirim kktp_tercapai:null berarti "kosongkan", sedangkan tidak
-- mengirim kuncinya sama sekali berarti "jangan sentuh". Kalau semua kolom
-- ditimpa EXCLUDED tanpa syarat, menyimpan nilai sumatif akan menghapus
-- catatan dan umpan balik yang tidak pernah ditampilkan di modal itu.

CREATE OR REPLACE FUNCTION fn_upsert_assessment_batch(
  p_classroom_id  uuid,
  p_assessment_id uuid,
  p_rows          jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row        jsonb;
  v_teacher_id uuid;
BEGIN
  IF NOT fn_is_classroom_owner(p_classroom_id) THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows harus berupa array JSON' USING ERRCODE = '22023';
  END IF;

  -- Kepemilikan classroom sudah dicek, tapi assessment_id datang terpisah dari
  -- klien. Tanpa cek ini seorang guru bisa menitipkan id penilaian milik
  -- classroom lain dan menulis hasil ke sana lewat classroom_id miliknya.
  PERFORM 1 FROM assessments
   WHERE id = p_assessment_id AND classroom_id = p_classroom_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Penilaian tidak ditemukan di classroom ini' USING ERRCODE = '42501';
  END IF;

  SELECT teacher_id INTO v_teacher_id FROM classrooms WHERE id = p_classroom_id;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO assessment_results (
      classroom_id, teacher_id, assessment_id, student_id,
      nilai, tindak_lanjut, kktp_tercapai,
      status, umpan_balik, catatan, grup_diferensiasi,
      updated_at
    ) VALUES (
      p_classroom_id,
      v_teacher_id,
      p_assessment_id,
      (v_row->>'student_id')::uuid,
      NULLIF(v_row->>'nilai', '')::numeric,
      NULLIF(v_row->>'tindak_lanjut', ''),
      (v_row->>'kktp_tercapai')::boolean,
      NULLIF(v_row->>'status', ''),
      NULLIF(v_row->>'umpan_balik', ''),
      NULLIF(v_row->>'catatan', ''),
      NULLIF(v_row->>'grup_diferensiasi', ''),
      now()
    )
    ON CONFLICT (assessment_id, student_id) DO UPDATE SET
      nilai = CASE WHEN v_row ? 'nilai'
                   THEN EXCLUDED.nilai ELSE assessment_results.nilai END,
      tindak_lanjut = CASE WHEN v_row ? 'tindak_lanjut'
                   THEN EXCLUDED.tindak_lanjut ELSE assessment_results.tindak_lanjut END,
      kktp_tercapai = CASE WHEN v_row ? 'kktp_tercapai'
                   THEN EXCLUDED.kktp_tercapai ELSE assessment_results.kktp_tercapai END,
      status = CASE WHEN v_row ? 'status'
                   THEN EXCLUDED.status ELSE assessment_results.status END,
      umpan_balik = CASE WHEN v_row ? 'umpan_balik'
                   THEN EXCLUDED.umpan_balik ELSE assessment_results.umpan_balik END,
      catatan = CASE WHEN v_row ? 'catatan'
                   THEN EXCLUDED.catatan ELSE assessment_results.catatan END,
      grup_diferensiasi = CASE WHEN v_row ? 'grup_diferensiasi'
                   THEN EXCLUDED.grup_diferensiasi ELSE assessment_results.grup_diferensiasi END,
      updated_at = now();
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_upsert_assessment_batch(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_upsert_assessment_batch(uuid, uuid, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_upsert_assessment_batch(uuid, uuid, jsonb) TO authenticated;
