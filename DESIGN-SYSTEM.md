# DESIGN-SYSTEM.md — SIP Mandiri
# Standar Visual yang Mengikat Semua Portal

Dokumen ini adalah satu-satunya sumber kebenaran untuk desain SIP Mandiri.
Claude Code WAJIB membaca dokumen ini sebelum menyentuh file CSS atau HTML apapun.
Setiap deviasi dari dokumen ini harus dilaporkan dan dikonfirmasi sebelum dieksekusi.

---

## 1. PALET WARNA

### Warna Dasar
```css
--bg-base:      #0A0A0F;   /* Background utama — near-black */
--bg-surface:   #13131A;   /* Card, panel, form */
--bg-elevated:  #1C1C26;   /* Modal, dropdown, overlay */
--bg-overlay:   rgba(10,10,15,0.88); /* Glassmorphism overlay */

--gold:         #D4AF37;   /* Accent utama — gold klasik elegan */
--gold-hover:   #B8960C;   /* Gold saat hover */
--gold-muted:   rgba(212,175,55,0.15); /* Background badge/banner gold */
--gold-border:  rgba(212,175,55,0.3);  /* Border dengan nuansa gold */

--text-on-gold: #0A0A0F;   /* Teks di atas gold — hitam, kontras tinggi */
--text-primary:   #F5F0E8; /* Teks utama — warm white */
--text-secondary: #A89880; /* Teks sekunder — warm muted */
--text-muted:     #6B5F50; /* Teks sangat muted */

--border:       rgba(212,175,55,0.12); /* Border halus bernuansa gold */
--border-strong: rgba(212,175,55,0.25); /* Border lebih tegas */

--success:      #10B981;
--success-bg:   rgba(16,185,129,0.15);
--danger:       #F87171;
--danger-bg:    rgba(248,113,113,0.15);
--warning:      #FBBF24;
--warning-bg:   rgba(251,191,36,0.15);

--shadow-card:  0 4px 24px rgba(0,0,0,0.5);
--shadow-modal: 0 8px 40px rgba(0,0,0,0.7);
--shadow-gold:  0 0 20px rgba(212,175,55,0.15);

--glass:        rgba(19,19,26,0.75);
--glass-border: rgba(212,175,55,0.15);
--blur:         blur(12px);

/* Alias utama — resolusi konflik --primary vs --accent */
--primary:       var(--gold);        /* alias utama — gantikan --accent di siswa/ortu */
--primary-hov:   var(--gold-hover);
--primary-light: var(--gold-muted);
--success-text:  var(--success);     /* alias — dipakai di badge aktif beberapa komponen */
```

### Aturan Penggunaan Warna
- `--gold` HANYA untuk: tombol primary, link aktif, badge aktif, highlight penting, border focus
- `--bg-base` untuk background halaman utama
- `--bg-surface` untuk card dan panel
- `--bg-elevated` untuk modal dan dropdown
- DILARANG menggunakan warna di luar variabel di atas tanpa konfirmasi

---

## 2. TIPOGRAFI

### Font Stack
```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```
Inter di-load dari Google Fonts. Jika tidak tersedia, fallback ke system font.

### Skala Tipografi (Fluid via clamp)
```css
--fs-display: clamp(28px, 7vw, 40px);   /* Judul halaman utama */
--fs-h1:      clamp(24px, 6vw, 34px);   /* Heading utama section */
--fs-h2:      clamp(20px, 5vw, 28px);   /* Heading sub-section */
--fs-h3:      clamp(18px, 4vw, 22px);   /* Heading card/panel */
--fs-body:    clamp(16px, 3.5vw, 18px); /* Teks utama */
--fs-ui:      clamp(15px, 3vw, 17px);   /* Label, input, tombol */
--fs-caption: clamp(13px, 2.5vw, 15px); /* Hint, metadata */
--fs-badge:   clamp(12px, 2vw, 13px);   /* Badge, pill, tag */
```

### Font Weight
```css
--fw-regular:  400;
--fw-medium:   500;
--fw-semibold: 600;
--fw-bold:     700;
```

### Line Height
```css
--lh-tight:  1.2;  /* Heading */
--lh-normal: 1.5;  /* Body */
--lh-loose:  1.8;  /* Paragraf panjang */
```

### Aturan Tipografi
- Heading: `--fw-semibold` atau `--fw-bold`
- Body: `--fw-regular`
- Tombol: `--fw-medium`
- DILARANG menggunakan px hardcode untuk font-size

---

## 3. TOMBOL

### Ukuran
```css
--btn-h:     clamp(48px, 7vw, 56px);   /* Tombol utama */
--btn-h-sm:  clamp(36px, 5vw, 44px);   /* Tombol sekunder/inline */
--btn-h-xs:  clamp(28px, 4vw, 36px);   /* Tombol sangat kecil (badge-like) */
--btn-px:    clamp(16px, 2.5vw, 24px); /* Padding horizontal */
--btn-px-sm: clamp(10px, 1.5vw, 16px); /* Padding horizontal kecil */
--btn-r:     8px;                       /* Border radius tombol */
```

### Varian Tombol

**Primary (Gold):**
```css
background: var(--gold);
color: var(--text-on-gold);
font-weight: var(--fw-medium);
font-size: var(--fs-ui);
min-height: var(--btn-h);
border-radius: var(--btn-r);
padding: 0 var(--btn-px);
transition: background 150ms, box-shadow 150ms;

&:hover { background: var(--gold-hover); box-shadow: var(--shadow-gold); }
&:disabled { opacity: 0.4; cursor: not-allowed; }
```

**Secondary (Outline Gold):**
```css
background: transparent;
color: var(--gold);
border: 1.5px solid var(--gold-border);
font-size: var(--fs-ui);
min-height: var(--btn-h);

&:hover { background: var(--gold-muted); border-color: var(--gold); }
```

**Ghost:**
```css
background: transparent;
color: var(--text-secondary);
border: none;
min-height: var(--btn-h-sm);

&:hover { background: rgba(255,255,255,0.05); color: var(--text-primary); }
```

**Danger:**
```css
background: var(--danger-bg);
color: var(--danger);
border: 1px solid rgba(248,113,113,0.3);
min-height: var(--btn-h-sm);
```

**Tombol Kecil (aksi inline tabel):**
```css
font-size: var(--fs-caption);
min-height: var(--btn-h-xs);
padding: 0 var(--btn-px-sm);
border-radius: 6px;
```

### Aturan Tombol
- Semua tombol WAJIB punya `min-height` via variable — DILARANG hardcode px
- Semua tombol WAJIB punya `transition` untuk hover state
- Semua tombol WAJIB punya state `:disabled` yang jelas
- Tap target minimum 44px untuk semua elemen interaktif
- Gunakan `--primary` sebagai alias `--gold` untuk tombol primary

---

## 4. CARD & PANEL

```css
--card-bg:     var(--bg-surface);
--card-border: var(--border);
--card-r:      clamp(10px, 1.5vw, 14px);
--card-shadow: var(--shadow-card);
--card-p:      clamp(14px, 2vw, 20px);
```

Card standar:
```css
background: var(--card-bg);
border: 1px solid var(--card-border);
border-radius: var(--card-r);
box-shadow: var(--card-shadow);
padding: var(--card-p);
```

Card premium (untuk elemen penting):
```css
border-color: var(--gold-border);
box-shadow: var(--shadow-card), var(--shadow-gold);
```

---

## 5. INPUT & FORM

```css
--input-bg:     rgba(255,255,255,0.04);
--input-border: rgba(212,175,55,0.2);
--input-r:      8px;
--input-py:     clamp(10px, 1.5vw, 14px);
--input-px:     clamp(12px, 1.8vw, 16px);
```

Input standar:
```css
background: var(--input-bg);
border: 1px solid var(--input-border);
border-radius: var(--input-r);
color: var(--text-primary);
font-size: var(--fs-ui);
padding: var(--input-py) var(--input-px);

&:focus {
  border-color: var(--gold);
  outline: none;
  box-shadow: 0 0 0 3px var(--gold-muted);
}

&::placeholder { color: var(--text-muted); }
```

---

## 6. BADGE & PILL

```css
border-radius: 99px;
font-size: var(--fs-badge);
font-weight: var(--fw-medium);
padding: 2px 10px;
```

Varian:
- Aktif/Success: `background: var(--success-bg); color: var(--success);`
- Nonaktif/Muted: `background: rgba(255,255,255,0.06); color: var(--text-secondary);`
- Gold/Primary: `background: var(--gold-muted); color: var(--gold);`
- Danger: `background: var(--danger-bg); color: var(--danger);`

---

## 7. MODAL & OVERLAY

Modal glassmorphism:
```css
background: var(--glass);
border: 1px solid var(--glass-border);
backdrop-filter: var(--blur);
border-radius: clamp(12px, 2vw, 16px);
box-shadow: var(--shadow-modal);
padding: clamp(20px, 3vw, 32px);
```

Overlay backdrop:
```css
background: var(--bg-overlay);
backdrop-filter: blur(4px);
```

---

## 8. SPACING

```css
--space-xs:  clamp(4px, 0.8vw, 6px);
--space-sm:  clamp(8px, 1.2vw, 12px);
--space-md:  clamp(12px, 1.8vw, 18px);
--space-lg:  clamp(18px, 2.5vw, 28px);
--space-xl:  clamp(28px, 4vw, 40px);
--space-2xl: clamp(40px, 6vw, 60px);
```

---

## 9. RESPONSIVITAS

### Prinsip
- **Mobile-first** — desain untuk 375px dulu, lebar ke atas menyesuaikan
- **Fluid, bukan breakpoint** — gunakan `clamp()`, `auto-fit`, `flex-wrap`
- **DILARANG** `@media` dengan px hardcode kecuali untuk kasus yang tidak bisa diselesaikan dengan fluid

### Target layar yang wajib berfungsi baik
- 320px — HP kecil (Samsung Galaxy A)
- 375px — HP standar (iPhone SE, iPhone 14)
- 428px — HP besar (iPhone 14 Pro Max)
- 768px — Tablet
- 1024px+ — Desktop

### Layout rules
- Container max-width: 680px, centered
- Padding halaman: `clamp(12px, 4vw, 24px)`
- Grid form: `repeat(auto-fit, minmax(160px, 1fr))`
- Card list: `flex-direction: column`, full width
- Tabel yang lebar: `overflow-x: auto` dengan `min-width` yang sesuai

### Layout Rules Wajib
- Semua list/card container: `width: 100%`
- Semua card/row item: `width: 100%`, `box-sizing: border-box`
- DILARANG elemen list yang tidak full-width di dalam container tanpa alasan eksplisit
- DILARANG `max-width` pada elemen list — max-width hanya boleh pada container halaman utama
- Padding dalam card tidak boleh mengurangi lebar elemen child

---

## 10. AKSESIBILITAS

### Kontras WCAG AA (minimum)
- Teks normal (< 18px): rasio minimum **4.5:1**
- Teks besar (≥ 18px atau ≥ 14px bold): rasio minimum **3:1**
- Elemen UI (border, ikon): rasio minimum **3:1**

### Kombinasi yang sudah terverifikasi
| Teks | Background | Rasio | Status |
|---|---|---|---|
| `--text-primary #F5F0E8` | `--bg-base #0A0A0F` | 16.8:1 | ✅ |
| `--text-secondary #A89880` | `--bg-base #0A0A0F` | 7.2:1 | ✅ |
| `--text-muted #6B5F50` | `--bg-base #0A0A0F` | 4.6:1 | ✅ |
| `--gold #D4AF37` | `--bg-base #0A0A0F` | 8.9:1 | ✅ |
| `--text-on-gold #0A0A0F` | `--gold #D4AF37` | 8.9:1 | ✅ |
| `--text-primary` | `--bg-surface #13131A` | 14.2:1 | ✅ |

### Tap target
- Semua elemen interaktif: minimum **44×44px**
- Tombol kecil inline: minimum **36px** tinggi

---

## 11. ATURAN WAJIB CLAUDE CODE

Sebelum menyentuh CSS atau HTML apapun:
1. Baca DESIGN-SYSTEM.md ini sampai selesai
2. Gunakan HANYA variable yang didefinisikan di dokumen ini
3. DILARANG hardcode hex warna, px font-size, atau px height tombol
4. Setiap komponen baru WAJIB memenuhi WCAG AA — hitung kontras sebelum commit
5. WAJIB test tampilan di 375px sebelum commit
6. Jika ada deviasi yang diperlukan: STOP — laporkan alasan — tunggu konfirmasi

---

## 12. STRUKTUR HALAMAN

### Prinsip Section Terpisah
Setiap kelompok konten yang berbeda WAJIB dibungkus dalam card/panel tersendiri.
DILARANG membuat satu halaman dengan konten tersambung dari atas ke bawah tanpa pemisah visual.

Contoh yang BENAR untuk halaman Jadwal & Absensi:
- Card 1: "Jadwal Mingguan" — berisi tabel/list jadwal
- Card 2: "Absensi Hari Ini" — berisi form absensi aktif
- Card 3: "Rekap Absensi" — berisi filter dan tabel rekap

Setiap card:
- Background: `var(--bg-surface)`
- Border: `1px solid var(--border)`
- Border-radius: `var(--card-r)`
- Padding: `var(--card-p)`
- Margin-bottom: `var(--space-lg)`
- Box-shadow: `var(--shadow-card)`

Section header di dalam card:
- Font-size: `var(--fs-h2)`
- Font-weight: `var(--fw-semibold)`
- Color: `var(--text-primary)`
- Margin-bottom: `var(--space-md)`
- Border-bottom: `1px solid var(--border)` (opsional, untuk section panjang)

### Aturan Wajib Claude Code
- Setiap fitur baru yang ditambahkan ke halaman existing WAJIB dibungkus dalam card tersendiri
- DILARANG menambahkan konten langsung ke `<body>` atau container utama tanpa card wrapper
- Jika ragu apakah konten perlu card baru: YA, buat card baru

### Posisi Tombol Aksi pada Card List
Tombol aksi (Edit, Hapus, Nonaktifkan, dsb.) pada card list WAJIB diposisikan di bawah informasi utama, bukan di sebelah kanan.

Layout card list yang benar:
- **Baris atas**: informasi utama (hari, waktu, nama, badge status)
- **Baris bawah**: tombol aksi, rata kiri (`justify-content: flex-start`)

Implementasi CSS:
```css
.card-row        { display: flex; flex-direction: column; gap: var(--space-xs); }
.card-row-info   { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; }
.card-row-actions{ display: flex; gap: var(--space-xs); flex-wrap: wrap; justify-content: flex-start; }
```

DILARANG menempatkan tombol aksi di sebelah kanan baris yang sama dengan informasi utama.

---

## 13. LAYOUT & CONTAINER

```css
--container-max: 680px;
--container-px:  clamp(12px, 4vw, 24px);

/* Border radius tambahan */
--r-sm: 6px;   /* badge kecil, code snippet */
--r-md: 8px;   /* alias --btn-r, --input-r */
```

### Aturan Container
- `.container`: `max-width: var(--container-max); margin: 0 auto; padding: 0 var(--container-px); box-sizing: border-box;`
- Semua halaman WAJIB membungkus konten utama dalam `.container`
- DILARANG hardcode `680px` atau `1rem` — selalu referensi token di atas

---

## 14. HEADER PORTAL

Komponen header yang identik di semua portal (guru, siswa, ortu):

```css
/* .header-brand */
display: flex;
align-items: center;
gap: var(--space-sm);
font-size: var(--fs-h3);
font-weight: var(--fw-semibold);
color: var(--text-primary);

/* .header-right */
display: flex;
align-items: center;
gap: var(--space-sm);
font-size: var(--fs-caption);
color: var(--text-secondary);
```

### Aturan Header Portal
- Nama portal/brand WAJIB menggunakan `.header-brand`
- Area kanan (nama user, logout) WAJIB menggunakan `.header-right`
- DILARANG mendefinisikan ulang header per portal — gunakan komponen bersama di `shared/css/components.css`

---

## 15. FEEDBACK & STATE

Komponen feedback yang identik di semua portal:

```css
/* .error-msg */
color: var(--danger);
font-size: var(--fs-caption);
margin-top: var(--space-xs);

/* .konfirmasi */
color: var(--success);
font-size: var(--fs-caption);
margin-top: var(--space-xs);

/* .empty-state */
text-align: center;
color: var(--text-muted);
font-size: var(--fs-body);
padding: var(--space-xl) var(--space-md);
```

### Aturan Feedback
- `.error-msg` dan `.konfirmasi` WAJIB muncul langsung setelah elemen yang memicu state tersebut
- DILARANG mendefinisikan ulang komponen feedback per portal — gunakan komponen bersama

---

## 16. CARD PARTS

Bagian card yang identik lintas portal:

```css
/* .card-name */
font-size: var(--fs-body);
font-weight: var(--fw-semibold);
color: var(--text-primary);

/* .card-code */
font-size: var(--fs-caption);
font-weight: var(--fw-medium);
color: var(--gold);
background: var(--gold-muted);
border: 1px solid var(--gold-border);
border-radius: var(--r-sm);
padding: 2px var(--space-sm);
font-family: ui-monospace, SFMono-Regular, 'Courier New', monospace;

/* .cl-label */
font-size: var(--fs-caption);
color: var(--text-muted);

/* .opsional */
font-size: var(--fs-caption);
font-weight: var(--fw-regular);
color: var(--text-muted);
```

### Aturan Card Parts
- `.card-code` selalu monospace — kode classroom, NIS, atau identifier lain
- `.cl-label` untuk label caption di atas card/section
- DILARANG mendefinisikan ulang komponen ini per portal

---

## 17. JADWAL & ABSENSI VIEWER

Komponen viewer yang identik di portal siswa dan ortu:

```css
/* .sch-section-title */
font-size: var(--fs-h3);
font-weight: var(--fw-semibold);
color: var(--text-primary);
margin-bottom: var(--space-sm);

/* .sch-day-group */
margin-bottom: var(--space-md);

/* .sch-slot */
display: flex;
align-items: center;
gap: var(--space-sm);
padding: var(--space-xs) 0;
font-size: var(--fs-ui);
color: var(--text-primary);
border-bottom: 1px solid var(--border);

/* .sch-slot-time */
font-size: var(--fs-caption);
color: var(--text-secondary);
min-width: 80px;

/* .sch-empty-msg */
font-size: var(--fs-caption);
color: var(--text-muted);
font-style: italic;

/* Absensi viewer (.att-*) */
/* .att-header */
font-size: var(--fs-h3);
font-weight: var(--fw-semibold);

/* .att-summary */
display: flex;
gap: var(--space-sm);
font-size: var(--fs-caption);
color: var(--text-secondary);

/* .att-row */
display: flex;
align-items: center;
gap: var(--space-sm);
padding: var(--space-xs) 0;
font-size: var(--fs-ui);
border-bottom: 1px solid var(--border);

/* .att-status badge varian */
/* H (Hadir):  background var(--success-bg); color var(--success)  */
/* S (Sakit):  background var(--warning-bg); color var(--warning)  */
/* I (Izin):   background var(--warning-bg); color var(--warning)  */
/* A (Alpha):  background var(--danger-bg);  color var(--danger)   */
```

### Aturan Jadwal & Absensi Viewer
- Komponen `.sch-*` dan `.att-*` viewer WAJIB ada di `shared/css/components.css`
- Warna status absensi menggunakan token badge Section 6 — DILARANG hardcode
- `min-width: 80px` pada `.sch-slot-time` boleh hardcode sebagai layout constraint teknis

---

## 18. ATURAN PERMANEN REFACTOR

Aturan berikut berlaku permanen setelah refactor design system selesai:

```
1. Tidak ada :root di luar shared/css/design-system.css
2. Tidak ada inline <style> di file HTML manapun
3. Komponen yang dipakai 2+ portal WAJIB ada di shared/css/components.css
4. Semua nilai warna/ukuran WAJIB referensi token — tidak ada hardcode baru
5. Alias --primary = --gold — gunakan --primary di komponen, --gold di token
6. onboarding ikut design system hitam+gold — tidak ada tema terpisah
```

### Pembagian File CSS
| File | Isi |
|---|---|
| `shared/css/design-system.css` | Semua token `:root` (Section 1–13) |
| `shared/css/components.css` | Komponen reusable 2+ portal (Section 14–17) |
| `guru/css/guru.css` | Komponen eksklusif portal guru |
| `siswa/css/siswa.css` | Komponen eksklusif portal siswa |
| `ortu/css/ortu.css` | Komponen eksklusif portal ortu |

### Urutan `<link>` yang Wajib
```html
<link rel="stylesheet" href="../shared/css/design-system.css">
<link rel="stylesheet" href="../shared/css/components.css">
<link rel="stylesheet" href="css/guru.css">  <!-- atau siswa/ortu -->
```

---

*Dokumen ini dibuat 5 Agustus 2026. Setiap perubahan harus melalui konfirmasi Romo.*
