# /sip-deploy — Urutan Deploy yang Aman

Jika prompt yang memanggil command ini sudah mendefinisikan instruksi spesifik untuk poin ini, ikuti instruksi prompt — command ini hanya berlaku untuk poin yang tidak didefinisikan eksplisit.

---

## Tujuan
Memastikan urutan deploy dijalankan dengan benar — tidak ada langkah yang di-skip, tidak ada push tanpa konfirmasi eksplisit.

## Prasyarat
Sebelum menjalankan command ini, pastikan `/sip-migration-check` sudah selesai dan user sudah memberi konfirmasi.

## Langkah (wajib berurutan)

### Langkah 1 — Dry Run (WAJIB, tidak boleh di-skip)
```bash
supabase db push --linked --dry-run
```
Tampilkan output verbatim.

Verifikasi:
- Hanya migration yang dimaksud yang muncul di output
- Tidak ada "drift detected" yang tidak terduga
- Tidak ada migration dari branch lain yang ikut masuk

**STOP di sini — tunggu konfirmasi eksplisit dari user sebelum lanjut ke Langkah 2.**

---

### Langkah 2 — Push Migration (setelah konfirmasi)
```bash
supabase db push --linked
```
Tampilkan output verbatim. Jika ada error → STOP, laporkan, jangan lanjut.

---

### Langkah 3 — Deploy Edge Function (jika ada perubahan)
Hanya jalankan jika ada Edge Function yang berubah dalam sesi ini.
```bash
supabase functions deploy <nama-fungsi> --project-ref teccdzetrdjowqemnuuc
```
Tampilkan output verbatim untuk setiap fungsi yang di-deploy.

---

### Langkah 4 — Push ke GitHub (urutan TERAKHIR)
```bash
git push origin main
```
Tampilkan output verbatim.

## Aturan Keras
- **TIDAK ADA** `git push` sebelum `supabase db push --linked` selesai sukses
- **TIDAK ADA** `supabase db push --linked` tanpa dry-run terlebih dahulu
- **TIDAK ADA** push tanpa konfirmasi eksplisit user setelah dry-run
- Jika ada langkah yang gagal → STOP, laporkan, tunggu instruksi
