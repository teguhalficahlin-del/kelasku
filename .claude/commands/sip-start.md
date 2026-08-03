# /sip-start — Ritual Pembuka Sesi

Jika prompt yang memanggil command ini sudah mendefinisikan instruksi spesifik untuk poin ini, ikuti instruksi prompt — command ini hanya berlaku untuk poin yang tidak didefinisikan eksplisit.

---

## Tujuan
Verifikasi konteks sesi sebelum mengerjakan apapun. Wajib dijalankan di awal setiap sesi SIP Mandiri.

## Langkah (jalankan berurutan, tampilkan output verbatim)

### 1. Verifikasi Working Directory
```bash
pwd
```
Output wajib mengandung `"SIP Mandiri"`. Jika tidak → **STOP**, laporkan ke user, jangan lanjut.

### 2. Status Git
```bash
git log --oneline -5
git status --short
```
Tampilkan verbatim.

### 3. Daftar Migration Terbaru
```bash
ls supabase/migrations/ | tail -5
```
Tampilkan verbatim. Jika folder tidak ada, catat sebagai temuan.

### 4. Cocokkan HEAD
Bandingkan HEAD live (dari `git log` di atas) dengan HEAD yang tercatat di `CLAUDE.md`.
- Jika sama → lanjut.
- Jika berbeda → tampilkan gap, catat sebagai temuan, **jangan STOP** kecuali ada konflik serius.

## Output
Tampilkan semua output di atas dalam satu blok laporan. Kemudian **STOP** — tunggu instruksi user sebelum mengerjakan apapun.
