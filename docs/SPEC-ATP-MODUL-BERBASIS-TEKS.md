# Spesifikasi ATP dan Modul Ajar Berbasis Teks

Status: keputusan produk, belum diimplementasikan.

Dokumen ini mengumpulkan keputusan yang tersebar dalam konsultasi produk tanggal 9 September 2026. Ia tidak mengubah kode, membuka kohor baru, atau menyatakan kemampuan yang belum tersedia sebagai kemampuan produksi.

## 1. Latar belakang

MiClass menghasilkan ATP dan Modul Ajar untuk guru SMK. Keluaran yang dapat disediakan MiClass adalah teks: bacaan, dialog, naskah simakan, kasus, data contoh, formulir, petunjuk peran, latihan, umpan balik, dan instrumen penilaian.

MiClass tidak menghasilkan gambar, foto, simbol grafis, rekaman audio, video, benda praktik, atau peralatan. Karena itu keterbatasan ini harus diperhitungkan sejak perumusan Tujuan Pembelajaran (TP), bukan ditemukan setelah modul selesai.

Guru tidak boleh diminta mencari, membuat, mengunduh, membeli, membawa, atau merakit bahan tambahan. Pembelajaran tetap dapat mencakup membaca, menyimak naskah yang dibacakan guru, berdialog, bermain peran tanpa properti, berdiskusi, menulis, menganalisis kasus, dan merefleksi.

Seluruh tuntutan Capaian Pembelajaran (CP) wajib dilayani. Teks dan interaksi langsung adalah cara produk memenuhi CP, bukan alasan untuk menghapus, menurunkan, atau mengganti tuntutan CP.

## 2. Hasil akhir yang ditetapkan

### 2.1 ATP

ATP wajib:

1. memakai CP resmi sebagai dasar;
2. memetakan seluruh tuntutan kompetensi dan lingkup materi CP ke TP;
3. merumuskan TP yang dapat dicapai dan dinilai melalui teks serta interaksi langsung;
4. mempertahankan jenis dan tingkat kemampuan dalam CP;
5. memperhatikan kesiapan murid, bantuan yang diperlukan, konteks, program keahlian, dan waktu;
6. mengurutkan TP secara logis;
7. menghitung waktu per tahun dan semester yang tercakup dalam fase; dan
8. tidak bergantung pada pengadaan gambar, video, rekaman, benda, kunjungan, narasumber, atau peralatan tambahan.

Prioritas guru mengatur penekanan, bukan menentukan bagian CP yang boleh diabaikan.

### 2.2 Modul Ajar

Modul adalah paket lengkap untuk TP yang dipilih. Komponen wajibnya adalah:

- tujuan dan hubungan dengan CP;
- kriteria keberhasilan;
- langkah dan durasi pembelajaran;
- tindakan guru dan kegiatan murid;
- bacaan, dialog, naskah simakan, kasus, data, formulir, dan petunjuk tugas;
- pengalaman belajar memahami, mengaplikasi, dan merefleksi;
- bantuan belajar;
- asesmen formatif;
- asesmen sumatif bila dipilih;
- kunci jawaban dan kriteria respons terbuka;
- penguatan dan pengayaan; dan
- **Naskah Fasilitasi**.

Naskah Fasilitasi wajib ada. Keputusan produk tanggal 8 September 2026 menetapkannya sebagai pembeda MiClass dari penghasil dokumen biasa. Keputusan itu sudah ditutup dan tidak dibuka kembali dalam spesifikasi ini.

Guru melaksanakan pembelajaran, termasuk membacakan naskah, memandu, mengamati, dan memberi umpan balik. Penggandaan sederhana dokumen siap cetak adalah pengecualian sadar atas larangan pekerjaan susulan. Guru tidak diminta membuat, mencari, menyunting, memotong, atau merakit bahan.

Modul menerangkan prinsip penggandaan hemat di muka. Jumlah halaman dan salinan nyata dilaporkan setelah tata letak selesai; jumlah itu tidak dijanjikan sebelum generate.

### 2.3 Kapan ketentuan berlaku

| Ketentuan | Status |
|---|---|
| Revisi alur pertanyaan; tidak menanyakan media/bahan/perlengkapan tambahan; tidak ada tombol mematikan asesmen formatif; kebutuhan murid konkret; kalender masuk sebagai minggu; dukungan cetak sebagai premis | Berlaku sekarang setelah implementasi masing-masing |
| Fase lintas tahun dengan data waktu per periode | Berlaku setelah pekerjaan fase lintas tahun selesai |
| ATP memetakan seluruh tuntutan CP; kelayakan layanan diperiksa sebelum pintu dibuka; pemeriksaan makna TP terhadap CP | Berlaku setelah acuan CP tersedia |
| Pemeriksaan bahwa modul memenuhi TP | Berlaku setelah acuan CP tersedia |
| Jumlah halaman dan kebutuhan salinan aktual | Berlaku setelah dokumen selesai ditata |

Sampai acuan CP tersedia, kohor Tab Rancang dibatasi pada kombinasi mata pelajaran/fase yang sudah terbukti terlayani teks. Saat ini kohor sementara adalah Bahasa Inggris yang sudah memiliki keluaran produksi terverifikasi. Kombinasi lain harus menunggu acuan CP-nya atau didahulukan penyusunan acuannya.

Untuk kombinasi yang belum memiliki acuan CP, MiClass menyampaikan bahwa layanan belum tersedia **sebelum guru mulai menjawab pertanyaan dan sebelum kuota generate terpakai**. Gerbang layanan tidak boleh membiarkan guru menghabiskan kuota untuk kombinasi yang belum diperiksa.

### 2.4 Uji penerimaan

Hasil ATP dan Modul Ajar hanya boleh dinyatakan memenuhi spesifikasi jika empat hal berikut terbukti:

1. seluruh tuntutan CP terpetakan;
2. setiap TP memiliki kegiatan dan bukti penilaian yang sesuai;
3. seluruh kebutuhan pembelajaran tersedia melalui teks dan interaksi langsung; dan
4. tidak ada pekerjaan pengadaan bahan tambahan yang dipindahkan kepada guru, di luar penggandaan sederhana yang diatur §2.2.

Butir 1 dan 2 berlaku setelah acuan CP tersedia. Butir 3 dan 4 berlaku sekarang setelah perilaku produk yang terkait diimplementasikan.

## 3. Acuan CP: prasyarat batas layanan

MiClass memerlukan acuan CP berversi untuk setiap kombinasi mata pelajaran, fase, dan versi CP. Acuan berisi tuntutan kompetensi, lingkup materi, hubungan ke teks CP resmi, penilaian kelayakan dilayani melalui teks/interaksi langsung, serta contoh benar dan keliru.

Acuan yang sama memiliki dua keluaran: (1) menentukan kombinasi yang boleh dibuka; (2) memeriksa cakupan dan ketepatan ATP yang dihasilkan. Acuan disimpan sebagai data berversi, bukan ditanam permanen di prompt atau kode.

Kurasi acuan adalah pekerjaan berkelanjutan dan menjadi penentu kecepatan perluasan produk. AI boleh mengusulkan uraian tuntutan, tetapi pemeriksaan terakhir memerlukan manusia atau AI yang sudah memiliki set uji yang tervalidasi. Untuk mapel pertama, hasil pemeriksaan manusia menjadi set uji bagi pemeriksaan berikutnya.

## 4. Pertanyaan level ATP (21 definisi)

Pertanyaan bersyarat hanya muncul bila diperlukan. Data yang sudah tersimpan dipakai kembali.

| ID | Pertanyaan | Pilihan / isian |
|---|---|---|
| A1 | Data kelas dan CP yang ditampilkan sudah sesuai? | Sudah sesuai; Perbaiki data kelas/program keahlian; Lihat CP lengkap; CP belum sesuai. |
| A2 | Berapa jumlah murid? | Isian angka, otomatis bila tersedia. |
| A3 | Bahasa apa yang membantu murid memahami pelajaran? | Indonesia; Indonesia untuk penjelasan dan bahasa target untuk contoh/latihan; campuran; bahasa target sebagian besar; bahasa target sepenuhnya; tentukan saat menyusun. |
| A4 | Bagaimana kesiapan murid memulai fase? | Sebagian besar siap; perlu penyegaran; banyak kemampuan dasar perlu dibangun; sangat beragam; belum diketahui. |
| A5 | Apa dasar informasi kesiapan? | Hasil penilaian/pekerjaan; pengamatan/pengalaman; gabungan; belum cukup informasi. Dilewati bila A4 belum diketahui. |
| A6 | Adakah kemampuan atau kesulitan yang perlu dicatat? | Tidak ada; ada → uraian singkat. |
| A7 | Bantuan apa yang diperlukan? | Memahami bacaan; menjawab lisan; menyusun tulisan; mengikuti urutan kegiatan; mempertahankan perhatian; kebutuhan lain → uraian; tidak ada yang diketahui; belum diketahui. |
| A8 | ATP mulai digunakan tahun pelajaran berapa? | Tahun tersedia; tahun lainnya → isian. |
| A9 | Berapa JP per minggu? | Isian; sama sepanjang fase atau berbeda menurut tahun/periode. |
| A10 | Berapa menit satu JP? | 35; 40; 45; lainnya → isian. |
| A11 | Bagaimana pola pertemuan? | Seluruh JP dalam satu pertemuan; dibagi beberapa pertemuan → isian; jadwal blok → isian sesi dan JP. |
| A12 | Berapa minggu pembelajaran bersih tiap semester? | Isi tiap semester; gunakan perkiraan sementara MiClass. |
| A13 | Apakah perlu mengurangi waktu cadangan? | Tidak ada; kurangi 1 minggu; kurangi 2 minggu; tentukan sendiri → isian. |
| A14 | Perhitungan waktu sudah sesuai? | Ya; perbaiki minggu/cadangan; perbaiki JP/pola pertemuan. |
| A15 | Kapan kemampuan dasar dikuatkan? | Di awal; saat topik membutuhkan; keduanya; tidak diperlukan; tentukan saat menyusun. |
| A15a | Apakah penguatan memerlukan alokasi tersendiri? | Tidak, menyatu dengan topik; ya → isian JP. Muncul bila A15 memerlukan penguatan. |
| A16 | Kebutuhan apa yang diberi penekanan? Maksimal dua. | Kemampuan dasar; kehidupan sehari-hari; PKL/dunia kerja; pendidikan lanjut/tes akademik; kebutuhan khusus sekolah → uraian; tidak ada penekanan tambahan. |
| A17 | Konteks contoh dan tugas? | Seimbang kehidupan dan kerja; lebih banyak kehidupan/sekolah; lebih banyak situasi kerja; tentukan saat menyusun. |
| A18 | Situasi yang diutamakan/dihindari? | Tidak ada; ada → uraian singkat. |
| A19 | Bagaimana urutan pembelajaran? | Mudah ke sulit; prasyarat ke lanjut; contoh konkret ke konsep; umum ke khusus; urutan prosedur; bantuan berkurang menuju mandiri; tentukan saat menyusun. |
| A20 | Ringkasan arah ATP sudah sesuai? | Ya, susun ATP; ubah profil; ubah waktu; ubah penguatan/penekanan; ubah konteks/pengurutan. |

Pilihan “tentukan saat menyusun” hanya menyimpan pendelegasian keputusan. Ia tidak memanggil AI di tengah corong.

Setelah ATP selesai, tersedia tindakan pascahasil: gunakan ATP; perbaiki TP/urutan; perbaiki waktu; atau perbaiki profil/konteks. Tindakan ini bukan definisi pertanyaan tambahan.

## 5. Pertanyaan level Modul Ajar (11 definisi)

Guru memilih TP dari ATP. Identitas, bahasa, profil kelas, konteks, dan waktu dipakai kembali.

| ID | Pertanyaan | Pilihan / isian |
|---|---|---|
| M1 | TP dan alokasi waktu ini sudah sesuai? | Sudah; pilih TP lain; tinjau alokasi ATP. |
| M2 | Bagaimana kesiapan murid untuk TP ini? | Sesuai profil; belum menguasai prasyarat; sudah menguasai sebagian; siap; sangat beragam; belum diketahui. |
| M3 | Ada perubahan kebutuhan bantuan? | Tidak; ada → bantuan membaca, jawaban lisan, menulis, mengikuti langkah, perhatian, atau kebutuhan lain. |
| M4 | Konteks modul? | Ikuti ATP; kehidupan/sekolah; situasi kerja; konteks khusus → uraian. |
| M5 | Cara belajar yang lebih banyak digunakan? | Contoh/latihan terbimbing; kasus tertulis dan alasan; menemukan pola dari contoh/data; karya tulis bertahap; percakapan/bermain peran tanpa properti; tentukan saat menyusun. |
| M6 | Dimensi Profil Lulusan yang dikuatkan, maksimal tiga? | Keimanan dan Ketakwaan; Kewargaan; Penalaran Kritis; Kreativitas; Kolaborasi; Kemandirian; Kesehatan; Komunikasi; tentukan saat menyusun. Batas tiga adalah keputusan desain MiClass. |
| M7 | Informasi kesiapan sudah cukup? | Gunakan informasi sebelumnya; ada tambahan → uraian; belum → pemeriksaan singkat di awal. |
| M8 | Bagaimana pemahaman dipantau? | Tanya jawab; pengamatan; latihan dengan umpan balik; gabungan; tentukan saat menyusun. Tidak ada pilihan mematikan asesmen formatif. |
| M9 | Apakah ada sumatif dalam modul? | Ya; tidak ada sumatif tersendiri. Keduanya tetap memiliki formatif dan tindak lanjut. |
| M10 | Bentuk penilaian sumatif? | Tes tertulis; jawaban/penjelasan lisan; percakapan/bermain peran; karya tulis; penyampaian lisan tanpa slide; gabungan tertulis-lisan; tentukan saat menyusun. Hanya muncul bila M9 ya. |
| M11 | Ringkasan modul sudah sesuai? | Ya, buat modul lengkap; ubah kesiapan/bantuan; ubah konteks/cara belajar; ubah asesmen. |

Bentuk penilaian wajib mengukur kemampuan TP: berbicara dibuktikan dengan berbicara, membaca dengan teks yang dibaca murid, menulis dengan tulisan murid, dan menyimak dengan pemahaman terhadap naskah yang dibacakan tanpa memperlihatkan jawaban saat bukti diambil.

## 6. Empat pekerjaan terpisah

1. **Acuan CP:** prasyarat pembukaan layanan dan pemeriksaan cakupan; terbesar dan berkelanjutan.
2. **Fase lintas tahun:** struktur waktu per periode, penyimpanan, ringkasan, dan alokasi TP.
3. **Revisi alur pertanyaan:** dapat dikerjakan tanpa menunggu acuan CP; tidak boleh membawa klaim cakupan lengkap sebelum acuan tersedia.
4. **Dukungan cetak:** premis penggandaan hemat di muka; jumlah halaman/salinan setelah tata letak.

## 7. Pertanyaan terbuka

- Siapa pemeriksa akhir acuan CP: manusia, AI dengan set uji, atau kombinasi?
- Bukti minimum apa yang harus lulus sebelum acuan membuka layanan?
- Bagaimana mengukur beban guru pada fase terpanjang, termasuk fase lintas tahun dan JP berbeda?
- Berapa proporsi guru yang memilih “tentukan saat menyusun”, dan apakah pilihan itu masih memberi informasi yang cukup?

Belum ada implementasi kode yang menjadi bagian dari spesifikasi ini.
