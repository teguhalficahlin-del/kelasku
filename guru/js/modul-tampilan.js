/* modul-tampilan.js — SATU OTORITAS PENYAJIAN untuk bagian Modul yang M4–M7
 * tambahkan.
 *
 * MASALAH YANG DITUTUP (M8).
 *
 * Ada DUA renderer yang berdiri sendiri dan tidak pernah saling memeriksa:
 *
 *   guru/js/rancang-chat.js     → pratinjau HTML yang guru lihat di layar
 *   guru/js/classroom-unduh.js  → berkas .docx yang guru cetak
 *
 * Keduanya sudah pernah menyalin tabel istilah dengan tangan (lihat komentar
 * "disamakan dengan ISTILAH_INSTRUMEN di rancang-chat.js"), dan itu persis pola
 * yang mahal di repo ini: yang dipakai di dua tempat sekaligus adalah yang
 * paling mahal kalau salah.
 *
 * Terukur sebelum M8: SELURUH field yang M4–M7 tambahkan tidak muncul di kedua
 * renderer — `keputusan_ketercapaian`, `cakupan_bukti`, `keputusan_kontekstual`,
 * `yang_diamati`, `putusan_lanjut`. Yang paling merugikan: `ambang_batas`
 * (penjelasan manusiawi) TAMPIL, sementara `keputusan_ketercapaian` (otoritas
 * keputusan) TIDAK — guru melihat kalimatnya dan kehilangan angkanya.
 *
 * BATAS BERKAS INI.
 *
 * Ia MENYAJIKAN, tidak memutuskan. Tidak ada ambang yang dihitung di sini,
 * tidak ada nilai yang disimpulkan, tidak ada isi yang dikarang. Setiap fungsi
 * hanya menyusun ulang nilai yang SUDAH ada di dokumen menjadi kalimat yang
 * guru pahami — dan mengembalikan null/[] ketika nilainya tidak ada, supaya
 * dokumen lama tidak menghasilkan judul kosong atau "undefined".
 *
 * Bentuk kembaliannya sengaja DATA, bukan HTML: pratinjau merangkainya menjadi
 * HTML, pengunduh merangkainya menjadi paragraf .docx, dan keduanya berangkat
 * dari kalimat yang sama.
 */
(function (global) {
  'use strict';

  // ── Istilah yang guru baca ──────────────────────────────────────────────
  //
  // Kunci di kiri adalah nilai yang tersimpan di dokumen; kalimat di kanan yang
  // guru lihat. Kunci yang tidak dikenal dikembalikan apa adanya — dokumen lama
  // boleh memuat nilai yang belum pernah ada di daftar ini.

  var ISTILAH_SUMBER_KONTEKS = {
    kesiapan_murid:   'Kesiapan murid',
    konteks_tugas:    'Porsi konteks contoh dan tugas',
    prioritas_guru:   'Penekanan guru',
    program_keahlian: 'Program keahlian',
    jumlah_murid:     'Jumlah murid'
  };

  var ISTILAH_CAKUPAN_BUKTI = {
    per_murid: 'bukti dikumpulkan per murid',
    kelompok:  'bukti dikumpulkan per kelompok'
  };

  function teksAda(v) {
    return typeof v === 'string' && v.trim().length > 0;
  }
  function daftarTeks(v) {
    return Array.isArray(v) ? v.filter(teksAda).map(function (x) { return x.trim(); }) : [];
  }
  function istilah(peta, kunci) {
    if (!teksAda(kunci)) return null;
    return peta[kunci] || kunci;
  }

  /**
   * Ambang ketercapaian dalam kalimat yang guru dapat hitung.
   *
   * `keputusan_ketercapaian` adalah OTORITAS KEPUTUSAN (M4); `ambang_batas`
   * adalah penjelasan yang guru baca. Berkas ini tidak pernah membalik
   * perannya: yang disusun di sini semata bentuk terbaca dari angka yang sudah
   * ada, dan tidak ada ambang baru yang dihitung.
   *
   * Bentuk kalimatnya mengikuti jenisnya supaya tidak janggal:
   *   jumlah      "minimal 4 simbol"
   *   persentase  "minimal 75 persen dari 4 tahapan"
   *   rubrik      "minimal level 3"
   */
  function kalimatKetercapaian(kktp) {
    if (!kktp || typeof kktp !== 'object') return null;
    var kk = kktp.keputusan_ketercapaian;
    if (!kk || typeof kk !== 'object') return null;          // dokumen pra-M4
    var nilai  = kk.nilai_minimum;
    var satuan = teksAda(kk.satuan) ? kk.satuan.trim() : '';
    if (typeof nilai !== 'number' || !isFinite(nilai) || !satuan) return null;
    return kk.jenis === 'rubrik'
      ? 'Tercapai bila minimal ' + satuan + ' ' + nilai
      : 'Tercapai bila minimal ' + nilai + ' ' + satuan;
  }

  /** Penjelasan ambang yang guru baca — tetap ditampilkan di samping angkanya. */
  function kalimatPenjelasanAmbang(kktp) {
    if (!kktp || typeof kktp !== 'object') return null;
    var kk = kktp.keputusan_ketercapaian;
    if (kk && typeof kk === 'object' && teksAda(kk.deskripsi)) return kk.deskripsi.trim();
    if (teksAda(kktp.ambang_batas)) return kktp.ambang_batas.trim();
    return null;
  }

  /** "bukti dikumpulkan per murid" — null bila dokumennya belum punya field itu. */
  function kalimatCakupanBukti(entri) {
    if (!entri || typeof entri !== 'object') return null;
    return istilah(ISTILAH_CAKUPAN_BUKTI, entri.cakupan_bukti);
  }

  /**
   * Pertimbangan konteks (M6) dalam bentuk yang guru pahami.
   *
   * ID internal `KTX-01` TIDAK ditampilkan — guru tidak memerlukannya, dan
   * membocorkannya hanya membuat dokumen terlihat seperti laporan audit.
   * Dari `komponen_terdampak` hanya nomor pertemuan yang disajikan; rujukan
   * sub_langkah, KKTP, dan instrumen adalah alamat internal.
   *
   * Nilai otoritasnya tidak diubah: `sumber.kunci` disajikan apa adanya di
   * samping label manusiawinya.
   */
  function blokPertimbanganKonteks(konten) {
    var arr = konten && Array.isArray(konten.keputusan_kontekstual)
      ? konten.keputusan_kontekstual : [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var e = arr[i];
      if (!e || typeof e !== 'object') continue;
      var sumber = e.sumber && typeof e.sumber === 'object' ? e.sumber : {};
      var label  = istilah(ISTILAH_SUMBER_KONTEKS, sumber.jenis);
      if (!label) continue;
      var judul = teksAda(sumber.kunci) ? label + ': ' + sumber.kunci.trim() : label;

      var pertemuan = [];
      var komp = Array.isArray(e.komponen_terdampak) ? e.komponen_terdampak : [];
      for (var j = 0; j < komp.length; j++) {
        var ref = String(komp[j] || '');
        if (ref.indexOf('pertemuan:') === 0) {
          var no = ref.slice('pertemuan:'.length);
          if (no) pertemuan.push('Pertemuan ' + no);
        }
      }

      out.push({
        judul:     judul,
        keputusan: teksAda(e.keputusan) ? e.keputusan.trim() : null,
        penerapan: teksAda(e.penerapan) ? e.penerapan.trim() : null,
        terlihat:  pertemuan
      });
    }
    return out;
  }

  /**
   * Bagian Naskah yang M7 tambahkan, sebagai kelompok berlabel.
   *
   * Dikembalikan HANYA yang benar-benar berisi, sehingga renderer tidak pernah
   * menghasilkan judul kosong. Itu juga yang membuat slot SUMATIF tidak
   * terlihat "rusak" ketika ia memang tidak punya keputusan lanjut: bagiannya
   * sekadar tidak muncul, bukan muncul kosong.
   */
  function blokNaskahTambahan(sl) {
    if (!sl || typeof sl !== 'object') return [];
    var out = [];

    var amati = daftarTeks(sl.yang_diamati);
    if (amati.length) out.push({ label: 'Yang Diamati', butir: amati });

    var pl = sl.putusan_lanjut;
    if (pl && typeof pl === 'object' && !Array.isArray(pl)) {
      if (teksAda(pl.jika_tercapai))
        out.push({ label: 'Jika Tercapai', butir: [pl.jika_tercapai.trim()] });
      if (teksAda(pl.jika_belum))
        out.push({ label: 'Jika Belum', butir: [pl.jika_belum.trim()] });
    }
    return out;
  }

  global.ModulTampilan = {
    ISTILAH_SUMBER_KONTEKS:   ISTILAH_SUMBER_KONTEKS,
    ISTILAH_CAKUPAN_BUKTI:    ISTILAH_CAKUPAN_BUKTI,
    kalimatKetercapaian:      kalimatKetercapaian,
    kalimatPenjelasanAmbang:  kalimatPenjelasanAmbang,
    kalimatCakupanBukti:      kalimatCakupanBukti,
    blokPertimbanganKonteks:  blokPertimbanganKonteks,
    blokNaskahTambahan:       blokNaskahTambahan
  };
})(typeof window !== 'undefined' ? window : globalThis);
