-- Migration: tambah kolom elemen_terpilih ke rancang_profil
-- dan update fn_upsert_rancang_profil agar menyimpan kolom baru
-- Dibuat: 2026-08-17

-- ── Tambah kolom ──────────────────────────────────────────────────────────────
ALTER TABLE rancang_profil
  ADD COLUMN IF NOT EXISTS elemen_terpilih TEXT[] NOT NULL DEFAULT '{}';

-- ── fn_upsert_rancang_profil — update agar include elemen_terpilih ──────────
CREATE OR REPLACE FUNCTION fn_upsert_rancang_profil(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid;
  v_row rancang_profil;
BEGIN
  v_pid := fn_current_profile_id();

  INSERT INTO rancang_profil (
    profile_id,
    jenjang, peran, mapel_list, mapel, mapel_key,
    bidang_keahlian, program_keahlian,
    elemen_terpilih,
    kelas, fase, jam_per_minggu,
    semester_list,
    nama_guru, nip_guru, nama_kepsek, nip_kepsek,
    tahun_ajaran, kota,
    is_locked
  ) VALUES (
    v_pid,
    p_payload->>'jenjang',
    NULLIF(p_payload->>'peran', ''),
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(p_payload->'mapel_list') x),
      '{}'
    ),
    p_payload->>'mapel',
    p_payload->>'mapel_key',
    NULLIF(p_payload->>'bidang_keahlian', ''),
    NULLIF(p_payload->>'program_keahlian', ''),
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(p_payload->'elemen_terpilih') x),
      '{}'
    ),
    p_payload->>'kelas',
    p_payload->>'fase',
    NULLIF(p_payload->>'jam_per_minggu', '')::integer,
    COALESCE(
      (SELECT array_agg(x) FROM jsonb_array_elements_text(p_payload->'semester_list') x),
      '{}'
    ),
    NULLIF(p_payload->>'nama_guru', ''),
    NULLIF(p_payload->>'nip_guru', ''),
    NULLIF(p_payload->>'nama_kepsek', ''),
    NULLIF(p_payload->>'nip_kepsek', ''),
    NULLIF(p_payload->>'tahun_ajaran', ''),
    NULLIF(p_payload->>'kota', ''),
    COALESCE((p_payload->>'is_locked')::boolean, false)
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    jenjang          = EXCLUDED.jenjang,
    peran            = EXCLUDED.peran,
    mapel_list       = EXCLUDED.mapel_list,
    mapel            = EXCLUDED.mapel,
    mapel_key        = EXCLUDED.mapel_key,
    bidang_keahlian  = EXCLUDED.bidang_keahlian,
    program_keahlian = EXCLUDED.program_keahlian,
    elemen_terpilih  = EXCLUDED.elemen_terpilih,
    kelas            = EXCLUDED.kelas,
    fase             = EXCLUDED.fase,
    jam_per_minggu   = EXCLUDED.jam_per_minggu,
    semester_list    = EXCLUDED.semester_list,
    nama_guru        = EXCLUDED.nama_guru,
    nip_guru         = EXCLUDED.nip_guru,
    nama_kepsek      = EXCLUDED.nama_kepsek,
    nip_kepsek       = EXCLUDED.nip_kepsek,
    tahun_ajaran     = EXCLUDED.tahun_ajaran,
    kota             = EXCLUDED.kota,
    is_locked        = EXCLUDED.is_locked
  RETURNING * INTO v_row;

  -- Update role_guru di profiles jika dikirim
  IF (p_payload->>'role_guru') IS NOT NULL THEN
    UPDATE profiles
    SET role_guru = p_payload->>'role_guru'
    WHERE id = v_pid;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_upsert_rancang_profil(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_upsert_rancang_profil(jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION fn_upsert_rancang_profil(jsonb) TO authenticated;
