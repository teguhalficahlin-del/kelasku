/* classroom-unduh.js — Tab "Unduh Perangkat Ajar"
 * Mengambil ATP aktif dan Modul Ajar milik guru di classroom ini,
 * lalu menghasilkan file .docx yang siap cetak.
 *
 * Tidak ada EF baru: data diambil via PostgREST (RLS sudah melindungi).
 * Library docx dimuat dari CDN saat tab pertama kali dibuka (lazy load).
 */

(function () {
  'use strict';

  var client    = window.supabaseClient;
  var _loaded   = false;
  var _classroomId = null;
  var _guruId      = null;
  var _docxReady   = false;

  // ── CDN loader ────────────────────────────────────────────────────────────

  function loadDocxLib(callback) {
    if (window.docx) { callback(null); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/docx@7.8.2/build/index.js';
    s.onload = function () {
      if (window.docx) { callback(null); }
      else { callback(new Error('Library docx gagal dimuat')); }
    };
    s.onerror = function () { callback(new Error('Gagal mengunduh library docx')); };
    document.head.appendChild(s);
  }

  // ── Ambil data dari Supabase ──────────────────────────────────────────────

  async function fetchAtpAktif(guruId) {
    var { data, error } = await client
      .from('atp_induk')
      .select('id, mapel, fase, jenjang, progresi_tp, elemen_cp, updated_at')
      .eq('guru_id', guruId)
      .eq('status', 'aktif')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    if (error) return null;
    return data;
  }

  async function fetchModulAktif(guruId, atpIndukId) {
    var { data, error } = await client
      .from('modul_induk')
      .select('id, nomor_tp, tp_judul, konten, updated_at')
      .eq('guru_id', guruId)
      .eq('atp_induk_id', atpIndukId)
      .eq('status', 'aktif')
      .order('nomor_tp', { ascending: true });
    if (error || !data) return [];
    return data;
  }

  // ── Generate DOCX ATP ─────────────────────────────────────────────────────

  function generateAtpDocx(atp) {
    var D = window.docx;
    var tpList = Array.isArray(atp.progresi_tp) ? atp.progresi_tp : [];

    // Peta id elemen → label manusia.
    //
    // progresi_tp[].elemen menyimpan KUNCI ("menyimak_berbicara"), bukan label.
    // Sampai 7 September 2026 kunci itu tercetak apa adanya di dokumen yang
    // dibawa guru ke sekolah — persis kelas cacat yang dilarang
    // AGENT_RULES.md §5.3. Labelnya sudah tersedia di atp_induk.elemen_cp,
    // jadi tidak perlu ditebak dari bentuk kuncinya.
    var elemenLabel = {};
    (Array.isArray(atp.elemen_cp) ? atp.elemen_cp : []).forEach(function (e) {
      if (e && e.id) elemenLabel[e.id] = e.label || e.id;
    });
    function labelElemen(id) {
      if (elemenLabel[id]) return elemenLabel[id];
      // Jalan mundur untuk ATP lama yang elemen_cp-nya kosong: ubah kunci
      // bergaris bawah jadi frasa berkapital, jangan pernah cetak mentah.
      return String(id || '')
        .split('_')
        .filter(Boolean)
        .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); })
        .join(' - ') || '-';
    }

    var children = [];

    // Judul dokumen
    children.push(new D.Paragraph({
      text: 'Alur Tujuan Pembelajaran (ATP)',
      heading: D.HeadingLevel.HEADING_1,
      spacing: { after: 200 },
    }));

    // Identitas
    children.push(tableRow2Col('Mata Pelajaran', atp.mapel || '-'));
    children.push(tableRow2Col('Fase', atp.fase || '-'));
    children.push(tableRow2Col('Jenjang', atp.jenjang || '-'));
    var totalJp = tpList.reduce(function (s, tp) { return s + (Number(tp.jp_alokasi) || 0); }, 0);
    var totalPertemuan = tpList.reduce(function (s, tp) {
      return s + (Array.isArray(tp.jp_pertemuan) ? tp.jp_pertemuan.length : 0);
    }, 0);
    if (tpList.length > 0) {
      children.push(tableRow2Col('Jumlah TP', String(tpList.length)));
      children.push(tableRow2Col('Total Alokasi',
        totalJp + ' JP' + (totalPertemuan ? ' · ' + totalPertemuan + ' pertemuan' : '')));
    }
    children.push(new D.Paragraph({ text: '', spacing: { after: 300 } }));

    // Daftar TP
    if (tpList.length === 0) {
      children.push(new D.Paragraph({ text: 'Belum ada Tujuan Pembelajaran yang tersusun.' }));
    } else {
      tpList.forEach(function (tp) {
        // Nomor + Judul TP
        children.push(new D.Paragraph({
          children: [
            new D.TextRun({ text: 'TP ' + tp.nomor + '. ', bold: true }),
            new D.TextRun({ text: tp.judul || '-' }),
          ],
          spacing: { before: 300, after: 100 },
        }));

        // Elemen CP
        if (Array.isArray(tp.elemen) && tp.elemen.length > 0) {
          children.push(new D.Paragraph({
            children: [
              new D.TextRun({ text: 'Elemen: ', bold: true, italics: true }),
              new D.TextRun({ text: tp.elemen.map(labelElemen).join(', '), italics: true }),
            ],
            spacing: { after: 80 },
          }));
        }

        // Alokasi JP
        var jpInfo = 'JP: ' + (tp.jp_alokasi || '-');
        if (Array.isArray(tp.jp_pertemuan) && tp.jp_pertemuan.length > 0) {
          jpInfo += ' (' + tp.jp_pertemuan.length + ' pertemuan: ' + tp.jp_pertemuan.join(', ') + ' JP)';
        }
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: jpInfo, color: '555555', size: 20 })],
          spacing: { after: 100 },
        }));

        // Konteks: tag internal, tidak ditampilkan di dokumen cetak
      });
    }

    // Footer
    children.push(new D.Paragraph({ text: '', spacing: { before: 600 } }));
    children.push(new D.Paragraph({
      children: [new D.TextRun({
        text: 'Dicetak dari MiClass — ' + new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }),
        color: '888888', size: 18,
      })],
    }));

    return new D.Document({
      sections: [{
        properties: {
          page: {
            margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 },
          },
        },
        children: children,
      }],
    });
  }

  // ── Generate DOCX Modul ───────────────────────────────────────────────────

  // Label yang ditampilkan per nama langkah
  var LABEL_LANGKAH = {
    'PEMBUKA':       'Pembuka',
    'ASESMEN_AWAL':  'Asesmen Awal Pembelajaran',
    'MEMAHAMI':      'Memahami',
    'MENGAPLIKASI':  'Mengaplikasi',
    'MEREFLEKSI':    'Merefleksi',
    'PENUTUP':       'Penutup',
  };
  // Fase utama sesuai kerangka pembelajaran mendalam (PDF hal. 38–40)
  var FASE_UTAMA = ['MEMAHAMI', 'MENGAPLIKASI', 'MEREFLEKSI'];

  // Label jenis instrumen — disamakan dengan ISTILAH_INSTRUMEN di rancang-chat.js.
  // Kalau salah satu diubah, ubah keduanya.
  var LABEL_INSTRUMEN = {
    dialog_baseline:   'Contoh percakapan (awal)',
    dialog_model:      'Contoh percakapan',
    teks_autentik:     'Teks nyata dari dunia kerja',
    kartu_peran:       'Kartu bermain peran',
    pemetaan_awal:     'Pemetaan kemampuan awal',
    matriks_observasi: 'Lembar pengamatan',
    lembar_refleksi:   'Lembar refleksi',
    soal_latihan:      'Soal latihan',
    lembar_praktikum:  'Lembar praktik',
    panduan_proyek:    'Panduan proyek',
    custom:            'Lainnya',
  };

  // Nama field → frasa manusia. Yang tidak terdaftar diubah otomatis oleh
  // manusiakanKunci(): kode mesin tidak boleh sampai ke dokumen cetak.
  var LABEL_FIELD = {
    petunjuk: 'Petunjuk', giliran: 'Percakapan', set: 'Set peran',
    pembicara: 'Pembicara', ucapan: 'Ucapan', isi_teks: 'Teks',
    pertanyaan_panduan: 'Pertanyaan panduan', item_soal: 'Butir soal',
    pertanyaan_menyimak: 'Pertanyaan menyimak', situasi_respons: 'Situasi respons',
    kolom_indikator: 'Indikator', kode_legend: 'Keterangan kode',
    catatan_kritis: 'Catatan penting', catatan_fasilitasi: 'Catatan fasilitasi',
    fokus_pengamatan: 'Fokus pengamatan', tujuan_diagnostik: 'Tujuan',
    panduan_interpretasi: 'Cara membaca hasil', nama_set: 'Nama set',
    nama_entitas: 'Nama', peran_a: 'Peran A', peran_b: 'Peran B',
    jabatan: 'Jabatan', instruksi_peran: 'Instruksi peran',
    kalimat_konteks: 'Kalimat', kata_target: 'Kata kunci',
    pertanyaan: 'Pertanyaan', prompt: 'Pertanyaan', soal: 'Soal',
    tipe: 'Jenis', label: 'Uraian', id: 'Kode',
  };

  function manusiakanKunci(k) {
    if (LABEL_FIELD[k]) return LABEL_FIELD[k];
    var s = String(k || '').replace(/_/g, ' ').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  // Penampil isi instrumen — SENGAJA GENERIK.
  //
  // Cabang per jenis pernah dicoba di renderer layar dan gagal: AI mengarang
  // nama field sendiri dan berbeda tiap generate, sehingga kotak tampil
  // berlabel tapi kosong tanpa ada yang mengeluh (CLAUDE.md, Pelajaran 3 sesi
  // 5 September 2026). Penyelesaiannya di sana adalah penampil generik, dan
  // bentuk itu yang ditiru di sini supaya berkas Word tidak mengulang
  // kesalahan yang sama.
  function renderIsiInstrumen(children, obj, D, dalam) {
    if (obj === null || obj === undefined || obj === '') return;
    dalam = dalam || 0;
    if (dalam > 3) return;
    var indent = 360 + dalam * 240;

    if (Array.isArray(obj)) {
      obj.forEach(function (v) { renderIsiInstrumen(children, v, D, dalam); });
      return;
    }
    if (typeof obj !== 'object') {
      children.push(new D.Paragraph({
        children: [new D.TextRun({ text: String(obj) })],
        indent: { left: indent }, spacing: { after: 50 }, bullet: { level: Math.min(dalam, 2) },
      }));
      return;
    }
    Object.keys(obj).forEach(function (kunci) {
      var nilai = obj[kunci];
      if (nilai === null || nilai === undefined || nilai === '') return;
      if (Array.isArray(nilai) && nilai.length === 0) return;

      if (typeof nilai !== 'object') {
        children.push(new D.Paragraph({
          children: [
            new D.TextRun({ text: manusiakanKunci(kunci) + ': ', bold: true, size: 20 }),
            new D.TextRun({ text: String(nilai), size: 20 }),
          ],
          indent: { left: indent }, spacing: { after: 50 },
        }));
      } else {
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: manusiakanKunci(kunci), bold: true, size: 20 })],
          indent: { left: indent }, spacing: { before: 80, after: 40 },
        }));
        renderIsiInstrumen(children, nilai, D, dalam + 1);
      }
    });
  }

  // Satu blok naskah: label di atas, butirnya di bawah.
  function blokNaskah(children, label, arr, D) {
    if (!Array.isArray(arr) || arr.length === 0) return;
    children.push(new D.Paragraph({
      children: [new D.TextRun({ text: label, bold: true, size: 19, color: '444444' })],
      indent: { left: 720 }, spacing: { before: 120, after: 40 },
    }));
    arr.forEach(function (x) {
      children.push(new D.Paragraph({
        children: [new D.TextRun({ text: String(x) })],
        indent: { left: 1080 }, spacing: { after: 50 }, bullet: { level: 0 },
      }));
    });
  }

  function generateModulDocx(modul, atpInfo) {
    var D = window.docx;
    var k = modul.konten || {};
    // Skema ModulOutput V4.0.
    //
    // Sampai 7 September 2026 fungsi ini masih membaca `identifikasi` dan
    // `desain_pembelajaran` — dua nama kunci dari V3 yang sudah tidak pernah
    // ada lagi. Akibatnya bab "A. Identifikasi" tercetak sebagai judul kosong,
    // bab B tinggal judul TP, dan sebelas bagian V4.0 tidak pernah ikut sama
    // sekali: berkas Word yang guru cetak hanya memuat 13% isi modul, tanpa
    // satu pun lembar kerja dan tanpa seluruh Naskah Fasilitasi.
    //
    // Kegagalannya diam — tidak ada galat, ukuran berkasnya wajar. Karena itu
    // setiap bagian di bawah dibaca dengan nama V4.0-nya, dan setiap bab
    // dilewati kalau datanya memang kosong, bukan dicetak sebagai judul hampa.
    var identitas    = k.identitas    || {};
    var rancangan    = k.rancangan    || {};
    var asesmen      = k.rencana_asesmen || {};
    var pertemuan    = k.pertemuan || k.langkah_pembelajaran || [];
    var kktp         = Array.isArray(k.kktp) ? k.kktp : [];
    var konteksMurid = k.konteks_murid   || {};
    var materi       = k.materi_esensial || {};
    var tindakLanjut = k.tindak_lanjut   || {};
    var catatanGuru  = Array.isArray(k.catatan_guru) ? k.catatan_guru : [];
    var insAsesmen   = Array.isArray(k.instrumen_asesmen) ? k.instrumen_asesmen : [];
    var insBelajar   = Array.isArray(k.instrumen_pembelajaran) ? k.instrumen_pembelajaran : [];
    var naskah       = Array.isArray(k.naskah_fasilitasi) ? k.naskah_fasilitasi : [];

    var children = [];

    // ── HEADER ────────────────────────────────────────────────────────────────
    children.push(new D.Paragraph({
      text: 'MODUL AJAR',
      heading: D.HeadingLevel.HEADING_1,
      spacing: { after: 80 },
    }));
    children.push(new D.Paragraph({
      children: [new D.TextRun({ text: 'TP ' + modul.nomor_tp + ': ' + (modul.tp_judul || ''), bold: true, size: 26 })],
      spacing: { after: 200 },
    }));

    // Tabel identitas
    children.push(tableRow2Col('Mata Pelajaran', atpInfo.mapel || '-'));
    children.push(tableRow2Col('Fase / Jenjang', (atpInfo.fase || '-') + ' / ' + (atpInfo.jenjang || '-')));
    if (Array.isArray(identitas.elemen_cp) && identitas.elemen_cp.length > 0)
      children.push(tableRow2Col('Elemen', identitas.elemen_cp.join(', ')));
    if (identitas.jumlah_pertemuan)
      children.push(tableRow2Col('Alokasi Waktu',
        identitas.jumlah_pertemuan + ' pertemuan × ' +
        (identitas.jp_per_pertemuan || '-') + ' JP' +
        ' (' + (identitas.durasi_jp_menit || 40) + ' menit/JP)'));
    if (Array.isArray(identitas.lingkup_materi) && identitas.lingkup_materi.length > 0)
      children.push(tableRow2Col('Lingkup Materi', identitas.lingkup_materi.join('; ')));
    if (Array.isArray(identitas.kosakata_inti) && identitas.kosakata_inti.length > 0)
      children.push(tableRow2Col('Kosakata Inti', identitas.kosakata_inti.join(', ')));
    children.push(new D.Paragraph({ text: '', spacing: { after: 300 } }));

    // ── A. KONTEKS MURID ──────────────────────────────────────────────────────
    if (konteksMurid.variasi_kemampuan ||
        (Array.isArray(konteksMurid.kesiapan_awal) && konteksMurid.kesiapan_awal.length) ||
        (Array.isArray(konteksMurid.kebutuhan_dukungan) && konteksMurid.kebutuhan_dukungan.length)) {
      children.push(sectionHeading('A. Konteks Murid'));
      if (konteksMurid.variasi_kemampuan) {
        children.push(subLabel('Keragaman Kemampuan'));
        children.push(bodyPara(konteksMurid.variasi_kemampuan));
      }
      if (Array.isArray(konteksMurid.kesiapan_awal) && konteksMurid.kesiapan_awal.length) {
        children.push(subLabel('Kesiapan Awal'));
        konteksMurid.kesiapan_awal.forEach(function (x) { children.push(bulletPara(x)); });
      }
      if (Array.isArray(konteksMurid.kebutuhan_dukungan) && konteksMurid.kebutuhan_dukungan.length) {
        children.push(subLabel('Kebutuhan Dukungan'));
        konteksMurid.kebutuhan_dukungan.forEach(function (x) { children.push(bulletPara(x)); });
      }
      children.push(new D.Paragraph({ text: '', spacing: { after: 200 } }));
    }

    // ── B. MATERI ESENSIAL ────────────────────────────────────────────────────
    if ((Array.isArray(materi.konsep_utama) && materi.konsep_utama.length) ||
        (Array.isArray(materi.lingkup_materi) && materi.lingkup_materi.length) ||
        (Array.isArray(materi.kosakata_kunci) && materi.kosakata_kunci.length)) {
      children.push(sectionHeading('B. Materi Esensial'));
      if (Array.isArray(materi.konsep_utama) && materi.konsep_utama.length) {
        children.push(subLabel('Konsep Utama'));
        materi.konsep_utama.forEach(function (x) { children.push(bulletPara(x)); });
      }
      if (Array.isArray(materi.lingkup_materi) && materi.lingkup_materi.length) {
        children.push(subLabel('Lingkup Materi'));
        materi.lingkup_materi.forEach(function (x) { children.push(bulletPara(x)); });
      }
      if (Array.isArray(materi.kosakata_kunci) && materi.kosakata_kunci.length) {
        children.push(subLabel('Kosakata Kunci'));
        children.push(bodyPara(materi.kosakata_kunci.join(', ')));
      }
      children.push(new D.Paragraph({ text: '', spacing: { after: 200 } }));
    }

    // ── C. KRITERIA KETERCAPAIAN ──────────────────────────────────────────────
    // Dasar penilaian guru. Sebelumnya hilang seluruhnya dari dokumen cetak,
    // padahal asesmen di bab F dan instrumen di bab I merujuk kodenya
    // (K1, K2, ...) — rujukan ke sesuatu yang tidak pernah ikut tercetak.
    if (kktp.length > 0) {
      children.push(sectionHeading('C. Kriteria Ketercapaian Tujuan Pembelajaran'));
      kktp.forEach(function (kk) {
        children.push(new D.Paragraph({
          children: [
            new D.TextRun({ text: (kk.id_kktp || '') + ' — ', bold: true }),
            new D.TextRun({ text: kk.kriteria || '' }),
          ],
          spacing: { before: 120, after: 40 },
        }));
        if (kk.ambang_batas)
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: 'Ambang batas: ' + kk.ambang_batas, italics: true, size: 20 })],
            indent: { left: 360 }, spacing: { after: 40 },
          }));
        if (Array.isArray(kk.instrumen_bukti) && kk.instrumen_bukti.length)
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: 'Bukti: ' + kk.instrumen_bukti.join(', '), color: '555555', size: 20 })],
            indent: { left: 360 }, spacing: { after: 80 },
          }));
      });
      children.push(new D.Paragraph({ text: '', spacing: { after: 200 } }));
    }

    // ── D. RANCANGAN PEMBELAJARAN ─────────────────────────────────────────────
    var adaRancangan = rancangan.strategi_pedagogis || rancangan.lingkungan_pembelajaran ||
      rancangan.kemitraan_pembelajaran || rancangan.keselamatan_k3 ||
      rancangan.pemanfaatan_digital ||
      (Array.isArray(rancangan.sumber_belajar) && rancangan.sumber_belajar.length);
    if (identitas.tujuan_pembelajaran || adaRancangan) {
      children.push(sectionHeading('D. Rancangan Pembelajaran'));
      if (identitas.tujuan_pembelajaran) {
        children.push(subLabel('Tujuan Pembelajaran'));
        children.push(bodyPara(identitas.tujuan_pembelajaran));
      }
      if (rancangan.strategi_pedagogis) {
        children.push(subLabel('Praktik Pedagogis'));
        children.push(bodyPara(rancangan.strategi_pedagogis));
      }
      if (rancangan.lingkungan_pembelajaran) {
        children.push(subLabel('Lingkungan Pembelajaran'));
        children.push(bodyPara(rancangan.lingkungan_pembelajaran));
      }
      if (rancangan.kemitraan_pembelajaran) {
        children.push(subLabel('Kemitraan Pembelajaran'));
        children.push(bodyPara(rancangan.kemitraan_pembelajaran));
      }
      if (rancangan.keselamatan_k3) {
        children.push(subLabel('Keselamatan Kerja (K3)'));
        children.push(bodyPara(rancangan.keselamatan_k3));
      }
      if (rancangan.pemanfaatan_digital) {
        children.push(subLabel('Pemanfaatan Digital'));
        children.push(bodyPara(rancangan.pemanfaatan_digital));
      }
      if (Array.isArray(rancangan.sumber_belajar) && rancangan.sumber_belajar.length) {
        children.push(subLabel('Sumber Belajar'));
        rancangan.sumber_belajar.forEach(function (sb) {
          children.push(bulletPara((sb.sumber || '') + (sb.fungsi ? ' — ' + sb.fungsi : '')));
        });
      }
      children.push(new D.Paragraph({ text: '', spacing: { after: 200 } }));
    }

    // ── E. LANGKAH-LANGKAH PEMBELAJARAN ──────────────────────────────────────
    if (Array.isArray(pertemuan) && pertemuan.length > 0) {
      children.push(sectionHeading('E. Langkah-Langkah Pembelajaran'));

      pertemuan.forEach(function (p) {
        // Sub-judul pertemuan
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: 'Pertemuan ' + p.nomor + (p.tujuan_pertemuan ? ' — ' + p.tujuan_pertemuan : ''), bold: true, size: 24 })],
          spacing: { before: 400, after: 120 },
        }));

        if (Array.isArray(p.media_dan_alat) && p.media_dan_alat.length > 0)
          children.push(tableRow2Col('Media & Alat', p.media_dan_alat.join(', ')));

        if (!Array.isArray(p.langkah)) return;

        p.langkah.forEach(function (lk) {
          var namaUpper = (lk.nama || '').toUpperCase();
          var label = LABEL_LANGKAH[namaUpper] || lk.nama;
          var isFaseUtama = FASE_UTAMA.indexOf(namaUpper) !== -1;

          // Judul langkah
          if (isFaseUtama) {
            // Fase utama: cetak tebal dengan prinsip
            var prinsipText = Array.isArray(lk.prinsip) && lk.prinsip.length > 0
              ? ' (' + lk.prinsip.join(', ') + ')'
              : '';
            children.push(new D.Paragraph({
              children: [
                new D.TextRun({ text: label + prinsipText, bold: true, size: 22 }),
                new D.TextRun({ text: '  ' + lk.durasi_menit + ' menit', color: '555555', size: 20 }),
              ],
              spacing: { before: 240, after: 80 },
              indent: { left: 360 },
            }));
          } else {
            // Pembuka / Asesmen Awal / Penutup: lebih ringan
            children.push(new D.Paragraph({
              children: [
                new D.TextRun({ text: label, bold: true }),
                new D.TextRun({ text: '  (' + lk.durasi_menit + ' menit)', color: '777777', size: 20 }),
              ],
              spacing: { before: 180, after: 60 },
              indent: { left: 360 },
            }));
          }

          // Sub-langkah
          if (Array.isArray(lk.sub_langkah)) {
            lk.sub_langkah.forEach(function (sl) {
              children.push(new D.Paragraph({
                children: [new D.TextRun({ text: sl.deskripsi || '' })],
                spacing: { after: 60 },
                indent: { left: 720 },
                bullet: { level: 0 },
              }));
            });
          }
        });
      });
      children.push(new D.Paragraph({ text: '', spacing: { after: 200 } }));
    }

    // ── F. ASESMEN PEMBELAJARAN ───────────────────────────────────────────────
    // V4.0 memakai `asesmen_diagnostik` (bukan `asesmen_awal`) dan tiap butir
    // formatif memakai `teknik` (bukan `teknik_instrumen`). Pembacaan lama
    // mencetak kata "undefined" di dokumen guru — terlihat di berkas Word
    // tertanggal 7 September 2026 sebagai "[F1] undefined".
    var diag = asesmen.asesmen_diagnostik || asesmen.asesmen_awal || null;
    var forma = Array.isArray(asesmen.asesmen_formatif) ? asesmen.asesmen_formatif : [];
    var suma = asesmen.asesmen_sumatif || null;
    if (diag || forma.length || suma) {
      children.push(sectionHeading('F. Asesmen Pembelajaran'));

      if (diag) {
        children.push(subLabel('Asesmen Awal'));
        if (diag.tujuan) children.push(tableRow2Col('Tujuan', diag.tujuan));
        if (diag.teknik) children.push(tableRow2Col('Teknik', diag.teknik));
        if (Array.isArray(diag.instrumen_ref) && diag.instrumen_ref.length)
          children.push(tableRow2Col('Instrumen', diag.instrumen_ref.join(', ')));
        else if (diag.instrumen) children.push(tableRow2Col('Instrumen', diag.instrumen));
        if (diag.waktu) children.push(tableRow2Col('Waktu', diag.waktu));
        if (diag.penggunaan_hasil) children.push(tableRow2Col('Penggunaan Hasil', diag.penggunaan_hasil));
        children.push(new D.Paragraph({ text: '', spacing: { after: 100 } }));
      }

      if (forma.length) {
        children.push(subLabel('Cek Pemahaman di Tengah Pembelajaran'));
        forma.forEach(function (af) {
          var kode = af.id ? '[' + af.id + '] ' : '';
          var teknik = af.teknik || af.teknik_instrumen || '';
          children.push(bulletPara(kode + teknik + (af.fungsi ? ' — ' + af.fungsi : '')));
          var jejak = [];
          if (af.waktu_pertemuan) jejak.push('Pertemuan ' + af.waktu_pertemuan);
          if (af.referensi_kktp)  jejak.push('Kriteria ' + af.referensi_kktp);
          if (Array.isArray(af.instrumen_ref) && af.instrumen_ref.length)
            jejak.push('Instrumen ' + af.instrumen_ref.join(', '));
          if (jejak.length)
            children.push(new D.Paragraph({
              children: [new D.TextRun({ text: jejak.join(' · '), color: '666666', size: 18 })],
              indent: { left: 720 }, spacing: { after: 60 },
            }));
          if (af.umpan_balik)
            children.push(new D.Paragraph({
              children: [new D.TextRun({ text: 'Umpan balik: ' + af.umpan_balik, italics: true, size: 19 })],
              indent: { left: 720 }, spacing: { after: 80 },
            }));
        });
        children.push(new D.Paragraph({ text: '', spacing: { after: 100 } }));
      }

      if (suma) {
        children.push(subLabel('Penilaian Akhir'));
        if (suma.teknik)    children.push(tableRow2Col('Teknik', suma.teknik));
        if (suma.deskripsi) children.push(tableRow2Col('Deskripsi', suma.deskripsi));
        if (Array.isArray(suma.instrumen_ref) && suma.instrumen_ref.length)
          children.push(tableRow2Col('Instrumen', suma.instrumen_ref.join(', ')));
        if (suma.placement && (suma.placement.pertemuan || suma.placement.fase))
          children.push(tableRow2Col('Penempatan',
            (suma.placement.pertemuan ? 'Pertemuan ' + suma.placement.pertemuan : '') +
            (suma.placement.fase ? ' · ' + (LABEL_LANGKAH[String(suma.placement.fase).toUpperCase()] || suma.placement.fase) : '')));
        if (suma.durasi_menit) children.push(tableRow2Col('Durasi', suma.durasi_menit + ' menit'));
      }
      children.push(new D.Paragraph({ text: '', spacing: { after: 200 } }));
    }

    // ── G. TINDAK LANJUT ──────────────────────────────────────────────────────
    var tlPunya = ['pilihan_dukungan', 'dukungan_terstruktur', 'tantangan_lanjutan']
      .some(function (x) { return Array.isArray(tindakLanjut[x]) && tindakLanjut[x].length; });
    if (tlPunya) {
      children.push(sectionHeading('G. Tindak Lanjut'));
      // Label dalam bahasa guru — "dukungan terstruktur" termasuk jargon yang
      // dilarang muncul di hadapan guru (AGENT_RULES.md §5.3).
      [['pilihan_dukungan', 'Pilihan Dukungan'],
       ['dukungan_terstruktur', 'Pendampingan Bertahap'],
       ['tantangan_lanjutan', 'Tantangan Lanjutan']].forEach(function (pair) {
        var arr = tindakLanjut[pair[0]];
        if (Array.isArray(arr) && arr.length) {
          children.push(subLabel(pair[1]));
          arr.forEach(function (x) { children.push(bulletPara(x)); });
        }
      });
      children.push(new D.Paragraph({ text: '', spacing: { after: 200 } }));
    }

    // ── H. CATATAN UNTUK GURU ─────────────────────────────────────────────────
    if (catatanGuru.length) {
      children.push(sectionHeading('H. Catatan untuk Guru'));
      catatanGuru.forEach(function (c) { children.push(bulletPara(c)); });
      children.push(new D.Paragraph({ text: '', spacing: { after: 200 } }));
    }

    // ── I. INSTRUMEN ──────────────────────────────────────────────────────────
    // Lembar kerja murid dan lembar pengamatan guru. Tanpa bagian ini guru
    // membawa modul ke kelas tanpa satu pun bahan yang dirujuk langkah-langkah
    // di bab E.
    if (insBelajar.length || insAsesmen.length) {
      children.push(sectionHeading('I. Instrumen'));
      insBelajar.concat(insAsesmen).forEach(function (ins) {
        children.push(new D.Paragraph({
          children: [
            new D.TextRun({ text: (ins.id || '?') + ' — ', bold: true }),
            new D.TextRun({ text: ins.judul || '', bold: true }),
          ],
          spacing: { before: 240, after: 40 },
        }));
        var jenisLabel = LABEL_INSTRUMEN[ins.jenis] || ins.jenis || '';
        if (jenisLabel)
          children.push(new D.Paragraph({
            children: [new D.TextRun({
              text: jenisLabel + (ins.untuk_murid ? ' · dibagikan ke murid' : ' · untuk guru'),
              italics: true, color: '666666', size: 19,
            })],
            spacing: { after: 80 },
          }));
        renderIsiInstrumen(children, ins.konten_murid, D);
        renderIsiInstrumen(children, ins.panduan_guru,  D);
      });
      children.push(new D.Paragraph({ text: '', spacing: { after: 200 } }));
    }

    // ── LAMPIRAN: NASKAH FASILITASI ───────────────────────────────────────────
    // 47% isi modul. Dimulai di halaman baru supaya guru bisa mencetak atau
    // membawa bagian ini terpisah dari modulnya.
    if (naskah.length) {
      children.push(new D.Paragraph({ text: '', pageBreakBefore: true }));
      children.push(sectionHeading('Lampiran — Naskah Fasilitasi'));
      children.push(new D.Paragraph({
        children: [new D.TextRun({
          text: 'Panduan kata demi kata untuk dibawa ke kelas. Boleh disesuaikan dengan gaya bicara Anda sendiri.',
          italics: true, color: '666666', size: 19,
        })],
        spacing: { after: 200 },
      }));

      naskah.forEach(function (np) {
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: 'Pertemuan ' + (np.nomor || '?'), bold: true, size: 26 })],
          spacing: { before: 320, after: 120 },
        }));
        (Array.isArray(np.langkah) ? np.langkah : []).forEach(function (lk) {
          var label = LABEL_LANGKAH[String(lk.nama || '').toUpperCase()] || lk.nama || '';
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: label, bold: true, size: 22 })],
            spacing: { before: 200, after: 60 }, indent: { left: 360 },
          }));
          (Array.isArray(lk.sub_langkah) ? lk.sub_langkah : []).forEach(function (sl) {
            blokNaskah(children, 'Ucapan guru',           sl.ucapan_guru,      D);
            blokNaskah(children, 'Yang dilakukan guru',   sl.aksi_guru,        D);
            blokNaskah(children, 'Pertanyaan kunci',      sl.pertanyaan_kunci, D);
            blokNaskah(children, 'Jika murid kesulitan',  sl.jika_kesulitan,   D);
          });
        });
      });
    }

    // ── FOOTER ────────────────────────────────────────────────────────────────
    children.push(new D.Paragraph({ text: '', spacing: { before: 600 } }));
    children.push(new D.Paragraph({
      children: [new D.TextRun({
        text: 'Dicetak dari MiClass — ' + new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }),
        color: '888888', size: 18,
      })],
    }));

    return new D.Document({
      sections: [{
        properties: {
          page: { margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 } },
        },
        children: children,
      }],
    });
  }

  // ── Helper paragraf ───────────────────────────────────────────────────────

  function sectionHeading(text) {
    return new window.docx.Paragraph({
      text: text,
      heading: window.docx.HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 120 },
    });
  }

  function subLabel(text) {
    return new window.docx.Paragraph({
      children: [new window.docx.TextRun({ text: text, bold: true, underline: {} })],
      spacing: { before: 160, after: 60 },
    });
  }

  function bodyPara(text) {
    return new window.docx.Paragraph({
      text: text || '',
      spacing: { after: 100 },
    });
  }

  function bulletPara(text) {
    return new window.docx.Paragraph({
      children: [new window.docx.TextRun({ text: '• ' + (text || '') })],
      spacing: { after: 60 },
      indent: { left: 360 },
    });
  }

  function tableRow2Col(label, value) {
    return new window.docx.Paragraph({
      children: [
        new window.docx.TextRun({ text: label + ': ', bold: true }),
        new window.docx.TextRun({ text: value || '-' }),
      ],
      spacing: { after: 80 },
    });
  }

  // ── Simpan file ───────────────────────────────────────────────────────────

  async function saveDocx(doc, filename) {
    var D = window.docx;
    var blob = await D.Packer.toBlob(doc);
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 1000);
  }

  // ── Render panel ──────────────────────────────────────────────────────────

  function renderLoading(container, msg) {
    container.innerHTML =
      '<div style="padding:2rem;text-align:center;color:var(--muted)">' + (msg || 'Memuat...') + '</div>';
  }

  function renderEmpty(container, msg) {
    container.innerHTML =
      '<div class="panel"><p style="color:var(--muted);padding:1rem">' + msg + '</p></div>';
  }

  async function initUnduhTab() {
    var container = document.getElementById('panel-unduh');
    if (!container) return;
    if (_loaded) return;
    _loaded = true;

    renderLoading(container, 'Memuat data perangkat ajar...');

    // Ambil session + profile
    var sess = await client.auth.getSession();
    if (!sess.data.session) { renderEmpty(container, 'Sesi habis. Silakan login ulang.'); return; }

    var classroomId = new URLSearchParams(window.location.search).get('id');
    if (!classroomId) { renderEmpty(container, 'ID kelas tidak ditemukan.'); return; }
    _classroomId = classroomId;

    var { data: prof } = await client
      .from('profiles').select('id').eq('user_id', sess.data.session.user.id).single();
    if (!prof) { renderEmpty(container, 'Gagal memuat profil.'); return; }
    _guruId = prof.id;

    var atp = await fetchAtpAktif(_guruId);

    if (!atp) {
      renderEmpty(container,
        'Belum ada ATP (Alur Tujuan Pembelajaran) yang aktif. ' +
        'Buka tab Rancang Pembelajaran untuk membuat ATP terlebih dahulu.');
      return;
    }

    var modulList = await fetchModulAktif(_guruId, atp.id);

    // Render UI
    container.innerHTML = '';

    // ── Panel ATP ─────────────────────────────────────────────────────────
    var panelAtp = document.createElement('div');
    panelAtp.className = 'panel';
    panelAtp.innerHTML =
      '<h2>Alur Tujuan Pembelajaran (ATP)</h2>' +
      '<p style="color:var(--muted);margin-bottom:.75rem">' +
        atp.mapel + ' &mdash; Fase ' + atp.fase + ' &mdash; ' + atp.jenjang +
        '<br><small>Berisi ' + (Array.isArray(atp.progresi_tp) ? atp.progresi_tp.length : 0) + ' Tujuan Pembelajaran</small>' +
      '</p>' +
      '<button id="btn-unduh-atp" class="btn-primary" style="margin-top:.5rem">Unduh ATP sebagai Word (.docx)</button>';
    container.appendChild(panelAtp);

    // ── Panel Modul Ajar ──────────────────────────────────────────────────
    var panelModul = document.createElement('div');
    panelModul.className = 'panel';
    var modulHtml = '<h2>Modul Ajar</h2>';

    if (modulList.length === 0) {
      modulHtml += '<p style="color:var(--muted)">Belum ada modul ajar yang dibuat untuk kelas ini. ' +
        'Buka tab Rancang Pembelajaran untuk membuat modul.</p>';
    } else {
      modulHtml += '<ul class="unduh-modul-list">';
      modulList.forEach(function (m, idx) {
        modulHtml +=
          '<li class="unduh-modul-item" style="display:flex;align-items:center;justify-content:space-between;' +
          'padding:.6rem 0;border-bottom:1px solid var(--border)">' +
          '<span><strong>TP ' + m.nomor_tp + ':</strong> ' + (m.tp_judul || '') + '</span>' +
          '<button class="btn-unduh-modul btn-secondary" data-idx="' + idx + '" style="flex-shrink:0;margin-left:1rem">Unduh .docx</button>' +
          '</li>';
      });
      modulHtml += '</ul>';
    }
    panelModul.innerHTML = modulHtml;
    container.appendChild(panelModul);

    // ── Event: Unduh ATP ──────────────────────────────────────────────────
    var btnAtp = document.getElementById('btn-unduh-atp');
    if (btnAtp) {
      btnAtp.addEventListener('click', function () {
        btnAtp.disabled = true;
        btnAtp.textContent = 'Menyiapkan file...';
        loadDocxLib(function (err) {
          if (err) {
            btnAtp.disabled = false;
            btnAtp.textContent = 'Unduh ATP sebagai Word (.docx)';
            alert('Gagal memuat komponen unduh. Periksa koneksi internet Anda.');
            return;
          }
          var doc = generateAtpDocx(atp);
          var filename = 'ATP_' + (atp.mapel || 'Mapel').replace(/\s+/g, '_') + '_Fase' + atp.fase + '.docx';
          saveDocx(doc, filename).then(function () {
            btnAtp.disabled = false;
            btnAtp.textContent = 'Unduh ATP sebagai Word (.docx)';
          });
        });
      });
    }

    // ── Event: Unduh Modul ────────────────────────────────────────────────
    if (modulList.length > 0) {
      panelModul.querySelectorAll('.btn-unduh-modul').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = parseInt(btn.getAttribute('data-idx'), 10);
          var modul = modulList[idx];
          if (!modul) return;
          btn.disabled = true;
          btn.textContent = 'Menyiapkan...';
          loadDocxLib(function (err) {
            if (err) {
              btn.disabled = false;
              btn.textContent = 'Unduh .docx';
              alert('Gagal memuat komponen unduh. Periksa koneksi internet Anda.');
              return;
            }
            var doc = generateModulDocx(modul, atp);
            var filename = 'Modul_TP' + modul.nomor_tp + '_' + (modul.tp_judul || '').replace(/\s+/g, '_').slice(0, 30) + '.docx';
            saveDocx(doc, filename).then(function () {
              btn.disabled = false;
              btn.textContent = 'Unduh .docx';
            });
          });
        });
      });
    }
  }

  // ── Tab switching ─────────────────────────────────────────────────────────

  window.addEventListener('DOMContentLoaded', function () {
    var tabUnduh   = document.getElementById('tab-unduh');
    var panelUnduh = document.getElementById('panel-unduh');
    if (!tabUnduh || !panelUnduh) return;

    var allOtherTabs = ['tab-siswa', 'tab-jadwal', 'tab-catatan', 'tab-penilaian', 'tab-rancang']
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);

    tabUnduh.addEventListener('click', async function () {
      window.currentTab = 'unduh';
      allOtherTabs.forEach(function (t) { t.classList.remove('active'); });
      tabUnduh.classList.add('active');
      document.querySelectorAll('[id^="panel-"]').forEach(function (p) { p.style.display = 'none'; });
      panelUnduh.style.display = '';
      var _cId = new URLSearchParams(window.location.search).get('id');
      if (_cId) try { localStorage.setItem('sip_tab_' + _cId, 'unduh'); } catch (_) {}
      await initUnduhTab();
    });

    allOtherTabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabUnduh.classList.remove('active');
        panelUnduh.style.display = 'none';
      });
    });

    var cId = new URLSearchParams(window.location.search).get('id');
    if (cId) {
      var saved = localStorage.getItem('sip_tab_' + cId);
      if (saved === 'unduh') tabUnduh.click();
    }
  });

}());
