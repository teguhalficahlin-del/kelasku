-- fn_update_program_keahlian: guru memperbarui program_keahlian di rancang_settings
-- via chat flow (konfirmasi atau koreksi). SECURITY DEFINER agar UPDATE tidak
-- membutuhkan policy RLS tambahan di rancang_settings.

CREATE OR REPLACE FUNCTION public.fn_update_program_keahlian(
  p_classroom_id     UUID,
  p_program_keahlian TEXT,
  p_bidang_keahlian  TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT fn_is_classroom_owner(p_classroom_id) THEN
    RAISE EXCEPTION 'Akses ditolak'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE rancang_settings
  SET
    program_keahlian = p_program_keahlian,
    bidang_keahlian  = COALESCE(p_bidang_keahlian, bidang_keahlian),
    updated_at       = NOW()
  WHERE classroom_id = p_classroom_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data rancang_settings untuk kelas ini belum ada'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION
  public.fn_update_program_keahlian(UUID, TEXT, TEXT)
FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION
  public.fn_update_program_keahlian(UUID, TEXT, TEXT)
FROM anon;

GRANT EXECUTE ON FUNCTION
  public.fn_update_program_keahlian(UUID, TEXT, TEXT)
TO authenticated;
