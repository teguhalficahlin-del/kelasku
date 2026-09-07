# Akses uji coba Tab Rancang — spesifikasi perilaku

> Disusun 7 September 2026 pada HEAD `33e2f3c`. **SUDAH DIIMPLEMENTASIKAN**
> di `1cb4cf9` (migration `20260907000001` + perubahan klien), disetujui Romo
> lebih dulu sesuai §21.3 CLAUDE.md.
>
> Dipilih Romo dari tiga pilihan yang diajukan setelah ditemukan pertentangan
> antara rencana go-live dan `docs/TIER-AND-LIFECYCLE.md`.

---

## 1. Masalah yang diselesaikan

Tab Rancang dijaga dua syarat: `role_guru = 'GURU_MAPEL_UMUM_SMK'` **DAN**
`tier = 'GURU_PRO'`. Untuk membuka uji coba bagi beberapa guru, satu-satunya
cara hari ini adalah menaikkan tier mereka — dan itu menabrak tiga hal:

1. **Tier naik berarti "sudah membayar".** `fn_activate_guru` menyetel
   `activated_at` dan `expires_at = NOW() + 365 hari`. Guru uji coba akan
   tercatat sebagai pelanggan berbayar selama setahun.

2. **Tidak ada jalan kembali yang sah.** `TIER-AND-LIFECYCLE.md` §3:
   *"Tidak ada downgrade… maupun kembali ke `TRIAL`."* Padahal
   `BACKLOG-GO-LIVE-RANCANG.md` §4 menetapkan tiga tanda yang **membatalkan**
   bertahap jadi tutup lagi. Rencana yang mensyaratkan bisa ditutup, di atas
   mekanisme yang tidak bisa ditutup.

3. **Pagarnya sudah pernah ditembus.** Akun `parentingtangguh@gmail.com`
   (Roni Satria S.Pd) hari ini bertier `GURU_PRO` dengan `activated_at` KOSONG
   dan `expires_at` 19 September 2026 — bukan 365 hari. Keadaan itu tidak
   mungkin dihasilkan `fn_activate_guru`. Ia lahir dari UPDATE langsung.

Akar semuanya satu: **"sedang uji coba" dan "sudah membayar" diwakili satu
kolom.** Pada tiga guru hal itu bisa ditambal. Pada ribuan guru ia menjadi
dinding — setiap kohor baru menuntut menandai orang sebagai pembayar, dan
menutupnya menuntut menembus pagar.

---

## 2. Perilaku yang diinginkan — dalam bahasa pengguna

**Ketika Romo memasukkan seorang guru ke daftar uji coba:**
guru itu melihat tab Rancang Pembelajaran muncul di kelasnya pada kunjungan
berikutnya. Statusnya di halaman profil tetap berbunyi masa percobaan — karena
memang begitu keadaannya. Ia tidak ditagih, tidak tercatat membayar.

**Ketika Romo mencoret seorang guru dari daftar:**
tab Rancang hilang lagi pada kunjungan berikutnya. Modul dan ATP yang sudah ia
buat **tetap ada dan tetap bisa dibaca serta diunduh** — yang tertutup hanya
hak menyusun yang baru. Tidak ada data yang hilang.

**Ketika masa percobaan guru itu habis:**
tab Rancang ikut tertutup, sama seperti seluruh fitur lain. Daftar uji coba
tidak memperpanjang umur akun — itu urusan yang berbeda (lihat §6).

**Bagi guru yang sudah membayar (`GURU_PRO`):**
tidak ada yang berubah sama sekali.

---

## 3. Bentuk teknisnya

### 3a. Tabel baru `rancang_akses_uji_coba`

| Kolom | Keterangan |
|---|---|
| `profile_id` | PK, FK ke `profiles(id)` ON DELETE CASCADE |
| `ditambahkan_at` | `timestamptz NOT NULL DEFAULT now()` |
| `alasan` | `text NOT NULL` — kenapa guru ini dimasukkan |
| `catatan` | `text` — opsional |

**Kenapa tabel, bukan kolom boolean di `profiles`.** Kolom hanya menyimpan
"ya/tidak"; tabel menyimpan **kapan dan kenapa**. Justru jejak itu yang dijaga
`fn_protect_profile_security_fields` — komentarnya menyebut bahaya "perpanjangan
manual berkali-kali tanpa jejak". Menutup gerbang = menghapus baris, dan
`ditambahkan_at` tetap tercatat di log kalau diperlukan.

**RLS: default-deny total.** Tabel ini punya RLS aktif dan **nol policy** untuk
`authenticated` maupun `anon`. Postgres default-deny berarti guru tidak bisa
membaca, apalagi menambahkan dirinya sendiri. Hanya `service_role` dan admin DB
yang menyentuhnya. Ini sejalan dengan AGENT_RULES §5: policy yang hilang bukan
kerentanan — di sini justru ia penjaganya.

### 3b. `fn_guru_rancang_eligible()` diperluas

Bentuk sekarang:

```sql
SELECT COALESCE(
  (SELECT p.role_guru = 'GURU_MAPEL_UMUM_SMK'
      AND p.tier      = 'GURU_PRO'
   FROM profiles p WHERE p.id = fn_current_profile_id()),
  false)
```

Menjadi: syarat peran **tetap wajib**, syarat tier **atau** terdaftar di uji coba.

```sql
SELECT COALESCE(
  (SELECT p.role_guru = 'GURU_MAPEL_UMUM_SMK'
      AND (p.tier = 'GURU_PRO'
           OR EXISTS (SELECT 1 FROM rancang_akses_uji_coba u
                      WHERE u.profile_id = p.id))
   FROM profiles p WHERE p.id = fn_current_profile_id()),
  false)
```

Fungsi ini sudah `SECURITY DEFINER`, jadi membaca tabel ber-RLS dari dalamnya
adalah pola yang benar — bukan `EXISTS` mentah di dalam policy, yang dilarang
AGENT_RULES §5.

**Syarat peran sengaja tidak dilonggarkan.** Daftar uji coba tidak boleh menjadi
jalan pintas yang membuka Rancang untuk peran yang belum didukung.

Kesembilan policy `rancang_eligible_*` **tidak disentuh** — mereka memanggil
fungsi ini, jadi ikut berubah sendiri.

### 3c. Klien berhenti menebak, mulai bertanya

`guru/js/rancang-chat.js:3603` dan `:3632` hari ini menghitung ulang aturannya
sendiri:

```js
var _tierSalah = !!_ts && _ts.tier !== 'GURU_PRO';
var _roleSalah = _role !== RANCANG_ROLE;
```

Aturannya disalin di dua tempat di klien, sekali lagi di fungsi DB. Tiga salinan
dari satu aturan; menambah daftar uji coba berarti menyunting ketiganya, dan
yang terlewat akan menyimpang diam-diam.

Diganti dengan memanggil fungsi yang sudah ada — ia sudah
`GRANT EXECUTE ... TO authenticated`:

```js
const { data: berhak } = await client.rpc('fn_guru_rancang_eligible');
```

Satu sumber kebenaran untuk ketiga lapisan. Ini perbaikan tersendiri, terlepas
dari daftar uji coba.

**Pesan penolakan tetap dibedakan** antara tier dan peran seperti sekarang —
guru yang salah peran tidak boleh dibujuk membayar.

---

## 4. Yang TIDAK berubah

- Tidak ada perubahan pada `profiles`, `tier`, `expires_at`, atau
  `fn_activate_guru`. Semantik tier tetap: `GURU_PRO` berarti sudah membayar.
- Tidak ada perubahan pada `trial_guard_*` — akun kedaluwarsa tetap terkunci.
- Tidak ada perubahan pada kesembilan policy `rancang_eligible_*`.
- Data ATP dan Modul milik guru mana pun tidak disentuh. Policy SELECT tidak
  diubah, jadi mencoret guru dari daftar tidak pernah menghilangkan karyanya.
- Edge Function `generate-atp` dan `generate-modul` tidak memeriksa tier sama
  sekali hari ini (nol kemunculan) — penjaganya RLS. Jadi tidak ada EF yang
  perlu di-deploy.

---

## 5. Cara membuka dan menutup

Membuka, satu baris per guru:

```sql
INSERT INTO public.rancang_akses_uji_coba (profile_id, alasan)
SELECT p.id, 'Kohor uji coba pertama Tab Rancang, September 2026'
FROM public.profiles p JOIN auth.users u ON u.id = p.user_id
WHERE u.email = 'alamat@contoh.com';
```

Menutup:

```sql
DELETE FROM public.rancang_akses_uji_coba
WHERE profile_id IN (
  SELECT p.id FROM public.profiles p JOIN auth.users u ON u.id = p.user_id
  WHERE u.email = 'alamat@contoh.com');
```

Berlaku pada kunjungan berikutnya guru — tidak ada cache di sisi server.

---

## 6. Yang spesifikasi ini SENGAJA tidak selesaikan

**Masa berlaku akun.** `trial_guard_*` menjaga ketiga tabel Rancang juga, jadi
guru uji coba tetap terkunci begitu `expires_at` lewat. Per hari ini:

| Guru | Masa percobaan habis | Panjang uji coba yang didapat |
|---|---|---|
| Hafsah Isykarima | 7 Oktober 2026 | ± 1 bulan |
| Pemdes | 18 September 2026 | 11 hari |
| Roni Satria (Romo) | 19 September 2026 | 12 hari |

Memperpanjang masa percobaan adalah **keputusan yang berbeda**, dan arsitektur
saat ini sengaja tidak menyediakan jalurnya — `fn_activate_guru` menolak `TRIAL`
justru untuk mencegah perpanjangan diam-diam.

Kalau Romo menginginkan uji coba sebulan penuh untuk ketiganya, yang dibutuhkan
adalah fungsi tersendiri — misalnya `fn_perpanjang_trial(profile_id, sampai,
alasan)` yang mencatat alasannya, bukan UPDATE langsung. Itu spesifikasi
terpisah dan tidak dikerjakan di sini.

**Akun Romo yang tidak konsisten.** `GURU_PRO` tanpa `activated_at` dan hanya
berlaku 12 hari. Perlu diputuskan tersendiri: dibiarkan, atau diluruskan lewat
`fn_activate_guru` sehingga menjadi 365 hari dengan jejak aktivasi.

---

## 7. Risiko

| Risiko | Penilaian |
|---|---|
| Guru menambahkan dirinya ke daftar | Tidak bisa — RLS default-deny, nol policy untuk `authenticated` |
| Daftar uji coba membuka Rancang untuk peran lain | Tidak bisa — syarat `role_guru` tetap wajib |
| Klien dan DB menyimpang | Justru berkurang: tiga salinan aturan jadi satu |
| Karya guru hilang saat ditutup | Tidak — hanya hak tulis yang dicabut, SELECT tidak diubah |
| Migration merusak akses `GURU_PRO` yang ada | Perlu diuji `BEGIN…ROLLBACK` lebih dulu; syarat lama dipertahankan utuh sebagai cabang `OR` |

---

## 8. Definisi selesai

- [x] Migration diuji `BEGIN…ROLLBACK` — 8 pemeriksaan lulus, rollback
      diperiksa tidak meninggalkan sisa. Dry-run bersih, lalu diterapkan;
      tujuh objek diverifikasi ada di produksi.
- [x] Keamanan dibuktikan **langsung**, bukan lewat `npm run test:tenant`
      (menuntut access token, dan token adalah kredensial yang tidak diminta
      lewat percakapan). Ketiga percobaan penembusan ditolak `42501` di lapisan
      privilege, sebelum RLS sempat dievaluasi: `anon` baca, `authenticated`
      baca, `authenticated` tulis.
- [x] Cabang uji coba diuji dengan **menyamar sebagai JWT guru TRIAL sungguhan**
      (Nursamsi) di dalam transaksi ber-ROLLBACK: `false` → daftarkan → `true`
      → coret → `false`. Data guru itu tidak berubah sedikit pun. Menguji lewat
      peramban justru menguji lapisan yang salah — pelajaran yang sama dengan
      penutupan Test 8.4–8.5.
- [x] Guru `GURU_PRO` tidak kehilangan akses — diperiksa sebelum dan sesudah,
      dan dikonfirmasi Romo di peramban: tab Rancang masih muncul.
- [x] `docs/TIER-AND-LIFECYCLE.md` dan `docs/BACKLOG-GO-LIVE-RANCANG.md`
      diperbarui di `daee7ba`.

---

## 9. Keadaan akhir 7 September 2026

**Daftar uji coba KOSONG, dan itu disengaja.**

Ketiga guru kohor pertama akhirnya dibuka lewat `fn_activate_guru` → `GURU_PRO`
berlaku sampai 7 September 2027, bukan lewat daftar ini. Keputusan Romo, diambil
setelah konsekuensinya dipaparkan: jalur tier menandai mereka sebagai pelanggan
berbayar dan tidak punya jalan kembali yang sah, tapi ia satu-satunya jalur resmi
yang **sekaligus memperpanjang umur akun** — dan tanpa itu uji coba Pemdes
berhenti 18 September, sebelas hari setelah dimulai.

Dua baris yang sempat dimasukkan lalu dihapus, karena tabel ini berarti "boleh
pakai **tanpa** berbayar" dan pernyataan itu tidak lagi benar untuk mereka.

**Mekanismenya tetap terpasang dan sudah terbukti bekerja.** Kohor berikutnya
bisa dibuka tanpa menandai siapa pun sebagai pembayar, dan ditutup dengan satu
`DELETE`. Yang dibangun di sini bukan untuk tiga orang — ia untuk kohor kedua
dan seterusnya, saat menutup kembali menjadi hal yang benar-benar dibutuhkan.

Satu perbaikan di dalamnya berdiri sendiri, terlepas dari daftar uji coba:
**klien berhenti menghitung ulang aturan gerbang.** Tiga salinan aturan jadi
satu.
