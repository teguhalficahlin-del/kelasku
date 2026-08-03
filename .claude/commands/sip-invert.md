# /sip-invert — Skenario Gagal Sebelum Eksekusi

Jika prompt yang memanggil command ini sudah mendefinisikan instruksi spesifik untuk poin ini, ikuti instruksi prompt — command ini hanya berlaku untuk poin yang tidak didefinisikan eksplisit.

---

## Tujuan
Memetakan semua skenario kegagalan sebelum perubahan dieksekusi. Gunakan sebelum migration, refaktor RLS, atau perubahan yang menyentuh data production.

## Penggunaan
```
/sip-invert <deskripsi perubahan>
```

## Langkah
Jawab setiap poin secara eksplisit dengan mekanisme konkret. **Kutip SQL atau kode yang relevan** — jangan jawab abstrak.

### 1. Apa yang Bisa Salah?
Buat daftar failure mode yang paling mungkin terjadi jika perubahan ini diterapkan. Untuk setiap failure mode:
- Kondisi pemicu
- Data atau user yang terdampak
- Cara mendeteksi setelah terjadi

### 2. Silent Failure
Skenario di mana perubahan **kelihatan sukses padahal sebagian gagal**:
- Query yang mereturn 0 rows tanpa error (tapi harusnya ada rows)
- RLS policy yang memblokir operasi tanpa melempar exception
- Edge Function yang return 200 tapi tidak menulis ke DB
- Trigger atau constraint yang di-skip karena urutan eksekusi

### 3. Race Condition / Double-Submit
- Apakah ada window di mana dua request bisa memodifikasi record yang sama secara bersamaan?
- Apakah `classroom_members` insert bisa terjadi dua kali untuk user yang sama?
- Apakah ada operasi read-modify-write tanpa `FOR UPDATE` lock?

### 4. Migration Data (jika relevan)
- Baris dengan nilai lama dan baru bercampur selama transaksi berlangsung?
- Konflik nilai jika constraint baru ditambahkan ke data existing?
- Estimasi waktu eksekusi — apakah bisa menyebabkan lock timeout?
- Apakah ada data yang tidak bisa di-backfill (NULL di kolom NOT NULL)?

### 5. Tipe Kolom & Operator
- Apakah operator yang dipakai valid untuk tipe kolom sebenarnya? (misal: `=` pada UUID vs text, `>` pada timestamp)
- Apakah ada implicit cast yang bisa menyebabkan index tidak digunakan?
- Apakah perbandingan `classroom_id` menggunakan UUID literal atau string?

## Output
Laporan lengkap verbatim. **STOP** — jangan apply apapun setelah command ini. Tunggu konfirmasi eksplisit dari user.
