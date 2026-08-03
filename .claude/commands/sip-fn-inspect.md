# /sip-fn-inspect — Inspeksi Fungsi PostgreSQL

Jika prompt yang memanggil command ini sudah mendefinisikan instruksi spesifik untuk poin ini, ikuti instruksi prompt — command ini hanya berlaku untuk poin yang tidak didefinisikan eksplisit.

---

## Tujuan
Membaca definisi lengkap fungsi PostgreSQL dari database Supabase yang ter-link. Wajib dijalankan sebelum `CREATE OR REPLACE FUNCTION` pada fungsi yang sudah ada.

## Penggunaan
```
/sip-fn-inspect <nama_fungsi>
```

## Langkah

### 1. Ambil OID
```sql
SELECT oid, proname, prosecdef
FROM pg_proc
WHERE proname = '<nama_fungsi>';
```
Tampilkan verbatim. Jika tidak ditemukan → laporkan "fungsi tidak ada di database", STOP.

### 2. Tampilkan Definisi Lengkap
```sql
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = '<nama_fungsi>';
```
Tampilkan verbatim — jangan disingkat, jangan diparafrase.

### 3. Verifikasi SECURITY DEFINER
- Cek kolom `prosecdef` dari langkah 1 (true = SECURITY DEFINER).
- Jika SECURITY DEFINER: verifikasi ada `REVOKE EXECUTE ... FROM PUBLIC` dan `REVOKE EXECUTE ... FROM anon` di migration yang membuat fungsi ini.
- Jika REVOKE tidak ditemukan di migration → catat sebagai **TEMUAN KEAMANAN**.

### 4. Cek Caller di Frontend
```bash
grep -rn "<nama_fungsi>" guru/js/ siswa/js/ ortu/js/ --include="*.js"
```
Tampilkan verbatim. Untuk setiap hasil: catat file, baris, dan konteks pemanggilan.

### 5. Signature & Calling Convention
Dari definisi di langkah 2, ekstrak dan tampilkan:
- Parameter input (nama + tipe)
- Return type
- Cara dipanggil dari frontend (`.rpc('<nama_fungsi>', { ... })`)

## Output
Semua output verbatim. **STOP** — jangan lakukan modifikasi apapun pada fungsi tanpa instruksi eksplisit user.
