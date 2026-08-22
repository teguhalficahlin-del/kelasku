# /sip-audit-tenant — Audit Classroom Isolation

Jika prompt yang memanggil command ini sudah mendefinisikan instruksi spesifik untuk poin ini, ikuti instruksi prompt — command ini hanya berlaku untuk poin yang tidak didefinisikan eksplisit.

---

## Tujuan
Mencari query frontend yang mengakses tabel tanpa filter `classroom_id` — potensi kebocoran data antar classroom.

## Langkah

### 1. Grep Query Tanpa Filter classroom_id
```bash
grep -rn "supabase\.from\|\.from(" guru/js/ siswa/js/ ortu/js/ --include="*.js" \
  | grep -v "classroom_id\|auth\|profiles\|fn_\|\.rpc(" \
  | sort
```
Tampilkan output verbatim.

### 2. Analisis Setiap Hasil
Untuk setiap baris hasil grep:

**a. Identifikasi:**
- Nama file + nomor baris
- Tabel yang di-query
- Method yang dipakai (`.select()`, `.insert()`, `.update()`, `.delete()`)

**b. Cek Konteks (±5 baris):**
Baca file di sekitar baris tersebut. Apakah ada filter `classroom_id` di:
- Baris sebelumnya (chained query)
- Variabel yang di-pass ke query
- RLS policy yang meng-handle isolasi (catat nama policy-nya)

**c. Verdict:**
- **AMAN** — ada filter `classroom_id` eksplisit, atau tabel di-protect penuh oleh RLS SECURITY DEFINER
- **PERLU AUDIT** — tidak ada filter eksplisit dan tidak ada konfirmasi RLS menutup akses

### 3. Ringkasan
Tampilkan tabel ringkasan:
```
File | Baris | Tabel | Verdict | Catatan
```

## Output
Semua output verbatim. **STOP** — jangan modifikasi file apapun. Laporan ini untuk review, bukan eksekusi otomatis.

## Catatan Konteks MIClass
- Tenant anchor: `classroom_id` (bukan `school_id`)
- Portal yang diaudit: `guru/js/`, `siswa/js/`, `ortu/js/`
- Fungsi RLS helper: `fn_is_classroom_owner()`, `fn_is_classroom_member()`, `fn_current_profile_id()`
- Query via `.rpc()` dianggap aman karena isolasi ada di dalam fungsi SECURITY DEFINER
