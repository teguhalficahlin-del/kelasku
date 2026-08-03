# /sip-migration-check — Validasi Migration Sebelum Apply

Jika prompt yang memanggil command ini sudah mendefinisikan instruksi spesifik untuk poin ini, ikuti instruksi prompt — command ini hanya berlaku untuk poin yang tidak didefinisikan eksplisit.

---

## Tujuan
Menjalankan checklist keamanan sebelum migration di-push ke Supabase. Wajib sebelum `supabase db push --linked`.

## Langkah

### 1. Cek SECURITY DEFINER
Scan file migration yang akan di-push untuk kata kunci `SECURITY DEFINER`.
- Jika ditemukan: verifikasi ada baris `REVOKE EXECUTE ... FROM PUBLIC` **dan** `REVOKE EXECUTE ... FROM anon`.
- Jika salah satu REVOKE tidak ada → catat sebagai **BLOCKER**, jangan lanjut ke push.

### 2. Cek Idempotency
Verifikasi setiap DDL menggunakan pola aman:
- `CREATE TABLE IF NOT EXISTS`
- `CREATE OR REPLACE FUNCTION`
- `CREATE INDEX IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`

Jika ada DDL tanpa guard ini → catat sebagai **WARNING**.

### 3. Inspeksi Fungsi Existing (jika ada fungsi yang di-replace)
Untuk setiap fungsi yang di-`CREATE OR REPLACE`, jalankan `/sip-fn-inspect <nama_fungsi>` untuk:
- Memastikan signature tidak berubah secara breaking.
- Memastikan caller di `guru/js/`, `siswa/js/`, `ortu/js/` masih kompatibel.

### 4. Estimasi Dampak (jika ada UPDATE/DELETE massal)
Jika migration mengandung `UPDATE` atau `DELETE` tanpa `WHERE` yang spesifik:
```sql
EXPLAIN ANALYZE <query UPDATE/DELETE>;
```
Tampilkan verbatim. Estimasi rows terdampak wajib dilaporkan sebelum push.

### 5. Checklist 5 Poin
Jawab setiap poin secara eksplisit (ya/tidak + alasan singkat):

- [ ] **Side effect ke classroom lain?** — Apakah ada query yang bisa memodifikasi data di classroom yang bukan milik guru yang sedang aktif?
- [ ] **Idempotent?** — Semua DDL menggunakan `IF NOT EXISTS` / `OR REPLACE`?
- [ ] **REVOKE dua lapis jika SECURITY DEFINER?** — Ada `REVOKE FROM PUBLIC` + `REVOKE FROM anon`?
- [ ] **Diff verbatim sudah direview?** — File migration sudah dibaca dan ditampilkan lengkap?
- [ ] **Risiko data loss?** — Ada `DROP`, `TRUNCATE`, atau `DELETE` tanpa backup plan?

## Output
Tampilkan hasil setiap langkah verbatim. **STOP** setelah checklist selesai — tunggu konfirmasi eksplisit dari user sebelum menjalankan push.
