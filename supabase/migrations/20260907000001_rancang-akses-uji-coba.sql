-- 20260907000001_rancang-akses-uji-coba.sql
-- Akses uji coba Tab Rancang, terpisah dari tier berbayar.
--
-- Spesifikasi perilaku lengkap: docs/SPEC-AKSES-UJI-COBA-RANCANG.md
--
-- MASALAHNYA. Tab Rancang dijaga role_guru = 'GURU_MAPEL_UMUM_SMK' DAN
-- tier = 'GURU_PRO'. Untuk membuka uji coba bagi beberapa guru, satu-satunya
-- cara sebelum migration ini adalah menaikkan tier mereka — dan itu menabrak
-- tiga hal sekaligus:
--
--   1. Tier naik berarti "sudah membayar". fn_activate_guru menyetel
--      activated_at dan expires_at = NOW() + 365 hari. Guru uji coba akan
--      tercatat sebagai pelanggan berbayar selama setahun.
--   2. Tidak ada jalan kembali yang sah. TIER-AND-LIFECYCLE.md §3 menyatakan
--      tidak ada downgrade maupun kembali ke TRIAL — padahal
--      BACKLOG-GO-LIVE-RANCANG.md §4 menetapkan tiga tanda yang MEMBATALKAN
--      pembukaan bertahap. Rencana yang mensyaratkan bisa ditutup, di atas
--      mekanisme yang tidak bisa ditutup.
--   3. Pagarnya sudah pernah ditembus. Satu akun hari ini bertier GURU_PRO
--      dengan activated_at KOSONG dan masa berlaku 12 hari, bukan 365 —
--      keadaan yang mustahil dihasilkan fn_activate_guru.
--
-- Akarnya satu: "sedang uji coba" dan "sudah membayar" diwakili satu kolom.
-- Pada tiga guru itu bisa ditambal; pada ribuan guru ia jadi dinding.
--
-- IDEMPOTEN: IF NOT EXISTS pada tabel dan indeks, OR REPLACE pada fungsi.
-- TIDAK ADA DML terhadap data yang sudah ada. Tidak ada kolom yang diubah.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tabel daftar uji coba
-- ---------------------------------------------------------------------------
-- KENAPA TABEL, BUKAN KOLOM BOOLEAN DI profiles.
--
-- Kolom hanya menyimpan "ya/tidak". Tabel menyimpan KAPAN dan KENAPA — dan
-- justru jejak itu yang dijaga fn_protect_profile_security_fields, yang
-- pesannya menyebut bahaya perpanjangan manual "tanpa jejak". Menutup gerbang
-- berarti menghapus baris; alasannya tetap terbaca sampai saat itu.
--
-- Menaruhnya di profiles juga akan menyeret kolom baru ini ke dalam trigger
-- proteksi yang sama, sehingga Romo tidak bisa mengubahnya lewat jalur biasa.
CREATE TABLE IF NOT EXISTS public.rancang_akses_uji_coba (
  profile_id     uuid PRIMARY KEY
                 REFERENCES public.profiles(id) ON DELETE CASCADE,
  ditambahkan_at timestamptz NOT NULL DEFAULT now(),
  alasan         text NOT NULL,
  catatan        text,
  CONSTRAINT rancang_akses_uji_coba_alasan_tidak_kosong
    CHECK (length(btrim(alasan)) > 0)
);

COMMENT ON TABLE public.rancang_akses_uji_coba IS
  'Guru yang boleh memakai Tab Rancang tanpa tier GURU_PRO. Bukan status bayar. '
  'Menghapus baris = menutup akses; karya guru tidak ikut terhapus.';

-- ---------------------------------------------------------------------------
-- 2. RLS: default-deny total
-- ---------------------------------------------------------------------------
-- Tabel ini SENGAJA tidak punya satu pun policy. Postgres default-deny berarti
-- authenticated dan anon tidak bisa membaca, apalagi memasukkan dirinya sendiri.
-- Sejalan dengan AGENT_RULES §5: policy yang hilang bukan otomatis kerentanan —
-- di sini ia justru penjaganya.
--
-- Hanya service_role (bypass RLS) dan admin DB yang menyentuh tabel ini.
ALTER TABLE public.rancang_akses_uji_coba ENABLE ROW LEVEL SECURITY;

-- Pertahanan berlapis: Supabase memberi GRANT ALL di level tabel untuk tabel
-- baru. RLS sudah cukup menahan, tapi mencabut grant-nya membuat niatnya
-- terbaca dari privilege, bukan hanya dari ketiadaan policy.
REVOKE ALL ON public.rancang_akses_uji_coba FROM anon;
REVOKE ALL ON public.rancang_akses_uji_coba FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. fn_guru_rancang_eligible() — tambah satu cabang, jangan longgarkan peran
-- ---------------------------------------------------------------------------
-- Syarat PERAN tetap wajib dan tidak disentuh. Daftar uji coba tidak boleh
-- menjadi jalan pintas yang membuka Rancang untuk peran yang belum didukung —
-- itu akan mengubah gerbang keamanan, bukan sekadar melonggarkan tier.
--
-- Membaca tabel ber-RLS dari dalam fungsi SECURITY DEFINER adalah pola yang
-- benar di proyek ini; EXISTS mentah di dalam policy justru yang dilarang
-- AGENT_RULES §5, karena akan dievaluasi dengan visibilitas si pemanggil.
--
-- Kesembilan policy rancang_eligible_* TIDAK disentuh — mereka memanggil fungsi
-- ini, jadi ikut berubah sendiri.
CREATE OR REPLACE FUNCTION public.fn_guru_rancang_eligible()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT p.role_guru = 'GURU_MAPEL_UMUM_SMK'
        AND (
          p.tier = 'GURU_PRO'
          OR EXISTS (
            SELECT 1 FROM rancang_akses_uji_coba u
            WHERE u.profile_id = p.id
          )
        )
     FROM profiles p
     WHERE p.id = fn_current_profile_id()),
    false)
$function$;

-- Grant diulang meski CREATE OR REPLACE mempertahankannya — supaya migration
-- ini tetap benar kalau dijalankan di database yang fungsinya belum ada.
GRANT  EXECUTE ON FUNCTION public.fn_guru_rancang_eligible() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_guru_rancang_eligible() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_guru_rancang_eligible() FROM PUBLIC;

COMMIT;
