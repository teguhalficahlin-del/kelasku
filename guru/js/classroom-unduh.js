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
      // collected_data ikut diambil demi ATP_HASIL — amplop dasar penyusunan,
      // cakupan CP, dan anggaran semester. Tanpanya dokumen yang guru cetak
      // hanya berisi daftar TP tanpa satu kalimat pun tentang atas dasar apa
      // ia disusun, dan asumsi tidak bisa dibedakan dari bukti.
      .select('id, mapel, fase, jenjang, progresi_tp, elemen_cp, collected_data, updated_at')
      .eq('guru_id', guruId)
      .eq('status', 'aktif')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    if (error) return null;
    return data;
  }

  // Identitas dokumen: nama guru, kelas, semester, tahun ajaran.
  //
  // Panduan Pembelajaran dan Asesmen 2025 memperlakukan modul ajar sebagai
  // dokumen perencanaan yang disimpan dan ditinjau, dan contoh modul di
  // Panduan Mata Pelajaran Bahasa Inggris (hal. 90) membuka dengan
  // Kelas/Semester. Sampai 7 September 2026 tidak satu pun dari keempatnya
  // tercetak, padahal semuanya sudah tersimpan di rancang_settings.
  async function fetchIdentitasKelas(classroomId) {
    var { data } = await client
      .from('rancang_settings')
      .select('nama_guru, nip_guru, nama_kepsek, tahun_ajaran, semester, kota, program_keahlian')
      .eq('classroom_id', classroomId)
      .maybeSingle();
    var { data: kelas } = await client
      .from('classrooms').select('name').eq('id', classroomId).maybeSingle();
    var hasil = data || {};
    hasil.nama_kelas = kelas ? kelas.name : null;
    return hasil;
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

  // Kunci rujukan konteks → frasa guru. Sisi Edge Function-nya adalah
  // DASAR_KETERANGAN di supabase/functions/generate-atp/kontrak.ts — kalau salah
  // satu diubah, ubah keduanya.
  var LABEL_DASAR_KEPUTUSAN = {
    'cp_anchor.tuntutan': 'tuntutan CP fase ini',
    'cp_anchor.elemen':   'teks CP per elemen',
    'kesiapan_murid':     'kesiapan murid',
    'prioritas_guru':     'bagian yang guru ingin lebih dikuatkan',
    'konteks_kejuruan':   'program keahlian kelas ini',
    'situasi_khusus':     'situasi yang guru minta diutamakan atau dihindari',
    'jumlah_murid':       'jumlah murid',
    'anggaran_waktu':     'jam dan pembagian semester',
    'batas_mutlak':       'batas layanan teks dan interaksi langsung'
  };

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

    // Amplop hasil (schema atp-1.0.0). Null untuk ATP yang disusun sebelum
    // kontrak ini ada — dokumennya tetap tercetak, hanya tanpa bagian dasar
    // penyusunan. Jangan menggantinya dengan kalimat karangan: ATP lama memang
    // tidak pernah mencatat atas dasar apa ia disusun, dan berpura-pura
    // sebaliknya persis yang dilarang.
    var hasil = (atp.collected_data && atp.collected_data.ATP_HASIL) || null;

    // Peta id tuntutan CP → kalimat kompetensinya, supaya dokumen tidak
    // mencetak kode seperti "BIE-MB-2" tanpa artinya.
    var tuntutanTeks = {};
    if (hasil && hasil.acuan_cp && window._cpAcuan && window._cpAcuan.acuan) {
      var mk = String(atp.mapel || '').toLowerCase()
        .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      var fk = 'fase_' + String(atp.fase || '').toLowerCase();
      var el = window._cpAcuan.acuan[mk] && window._cpAcuan.acuan[mk][fk]
        && window._cpAcuan.acuan[mk][fk].elemen;
      if (el) {
        Object.keys(el).forEach(function (k) {
          (el[k].tuntutan || []).forEach(function (t) { tuntutanTeks[t.id] = t.kompetensi; });
        });
      }
    }

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
    if (hasil && Array.isArray(hasil.anggaran_semester) && hasil.anggaran_semester.length) {
      children.push(tableRow2Col('Pembagian Semester',
        hasil.anggaran_semester.map(function (a) {
          return 'Semester ' + a.semester + ': ' + a.minggu + ' minggu, ' + a.jp + ' JP';
        }).join(' · ')));
    }
    if (hasil && hasil.acuan_cp && hasil.acuan_cp.versi_cp) {
      children.push(tableRow2Col('Acuan CP', hasil.acuan_cp.versi_cp));
    }
    children.push(new D.Paragraph({ text: '', spacing: { after: 300 } }));

    // ── Dasar penyusunan ────────────────────────────────────────────────────
    //
    // Ditempatkan SEBELUM daftar TP, bukan sebagai lampiran di belakang.
    // Guru yang membaca ATP-nya perlu tahu lebih dulu mana yang berasal dari
    // jawabannya, mana yang MiClass putuskan untuknya, dan mana yang masih
    // berupa perkiraan — sesudah membaca dua puluh judul TP, ketiganya sudah
    // terlanjur terbaca sebagai fakta yang setara.
    if (hasil && hasil.dasar_penyusunan) {
      var d = hasil.dasar_penyusunan;
      children.push(new D.Paragraph({
        text: 'Dasar Penyusunan',
        heading: D.HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 120 },
      }));

      function subJudul(teks) {
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: teks, bold: true, size: 21 })],
          spacing: { before: 160, after: 60 },
        }));
      }
      function butir(teks, miring) {
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: String(teks), size: 20, italics: !!miring })],
          bullet: { level: 0 }, indent: { left: 360 }, spacing: { after: 50 },
        }));
      }

      if (d.dasar_profil_murid) { subJudul('Profil murid'); butir(d.dasar_profil_murid); }

      if (Array.isArray(d.konteks_dari_guru) && d.konteks_dari_guru.length) {
        subJudul('Konteks yang diberikan guru');
        d.konteks_dari_guru.forEach(function (x) { butir(x); });
      }

      if (Array.isArray(d.keputusan_miclass) && d.keputusan_miclass.length) {
        subJudul('Keputusan yang ditetapkan MiClass');
        d.keputusan_miclass.forEach(function (k) {
          butir(k.pertanyaan + ' → ' + k.dipilih);
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: 'Alasan: ' + k.alasan, size: 19, color: '666666' })],
            indent: { left: 720 }, spacing: { after: 60 },
          }));
          // Hanya keputusan yang diambil saat penyusunan yang punya dasar.
          // Dicetak supaya dokumen yang guru arsipkan menyatakan atas apa
          // keputusan itu diambil, bukan hanya bahwa ia diambil.
          var dasar = Array.isArray(k.dasar) ? k.dasar.map(function (x) {
            return LABEL_DASAR_KEPUTUSAN[x]
              || LABEL_DASAR_KEPUTUSAN[String(x).split('.').slice(0, 2).join('.')]
              || x;
          }) : [];
          if (dasar.length) {
            var unik = dasar.filter(function (v, i) { return dasar.indexOf(v) === i; });
            children.push(new D.Paragraph({
              children: [new D.TextRun({ text: 'Ditimbang dari: ' + unik.join('; '), size: 19, color: '666666' })],
              indent: { left: 720 }, spacing: { after: 60 },
            }));
          }
        });
      }

      // Jejak penekanan guru (Pass 5) — frasa manusia dari server. ATP lama
      // tidak memilikinya, dan bagian ini dilewati.
      if (Array.isArray(d.penerapan_prioritas) && d.penerapan_prioritas.length) {
        subJudul('Penekanan yang diminta guru');
        d.penerapan_prioritas.forEach(function (p) {
          var tpTeks = Array.isArray(p.tp) && p.tp.length ? 'TP ' + p.tp.join(', ') : '-';
          var pengaruh = Array.isArray(p.pengaruh) && p.pengaruh.length ? ' (' + p.pengaruh.join(', ') + ')' : '';
          butir(p.prioritas + ' → diterapkan terutama pada ' + tpTeks + pengaruh);
          if (p.alasan) {
            children.push(new D.Paragraph({
              children: [new D.TextRun({ text: p.alasan, size: 19, color: '666666' })],
              indent: { left: 720 }, spacing: { after: 60 },
            }));
          }
        });
      }

      if (Array.isArray(d.asumsi) && d.asumsi.length) {
        subJudul('Bagian yang masih berupa asumsi');
        children.push(new D.Paragraph({
          children: [new D.TextRun({
            text: 'Bagian berikut belum berasal dari bukti dan sebaiknya diperiksa ulang.',
            size: 19, color: '666666',
          })],
          indent: { left: 360 }, spacing: { after: 60 },
        }));
        d.asumsi.forEach(function (a) { butir(a.hal + ' — ' + a.sebab, true); });
      }

      if (hasil.cakupan_cp) {
        var c = hasil.cakupan_cp;
        subJudul('Cakupan Capaian Pembelajaran');
        if (!c.diperiksa) {
          butir('Belum diperiksa — acuan CP untuk kombinasi ini belum tersedia.');
        } else if (c.tuntutan_belum && c.tuntutan_belum.length) {
          butir(c.tuntutan_tercakup.length + ' dari ' + c.tuntutan_wajib.length +
            ' tuntutan CP terpetakan. Belum terpetakan: ' + c.tuntutan_belum.join(', ') + '.');
        } else {
          butir('Seluruh ' + c.tuntutan_wajib.length +
            ' tuntutan CP fase ini sudah terpetakan ke Tujuan Pembelajaran.');
        }
      }
      children.push(new D.Paragraph({ text: '', spacing: { after: 240 } }));
    }

    // Daftar TP
    children.push(new D.Paragraph({
      text: 'Tujuan Pembelajaran',
      heading: D.HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 120 },
    }));
    if (tpList.length === 0) {
      children.push(new D.Paragraph({ text: 'Belum ada Tujuan Pembelajaran yang tersusun.' }));
    } else {
      var semesterTerakhir = null;
      tpList.forEach(function (tp) {
        // Penanda semester dicetak sekali, di tempat tahun ajarannya terbelah.
        if (tp.semester && tp.semester !== semesterTerakhir) {
          semesterTerakhir = tp.semester;
          var jpSem = tpList.filter(function (t) { return t.semester === tp.semester; })
            .reduce(function (s, t) { return s + (Number(t.jp_alokasi) || 0); }, 0);
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: 'Semester ' + tp.semester + ' — ' + jpSem + ' JP', bold: true })],
            spacing: { before: 300, after: 80 },
          }));
        }
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

        // Tuntutan CP yang dilayani — inilah yang membuat cakupan CP dapat
        // ditelusuri guru sendiri, bukan hanya diklaim di ringkasan.
        if (Array.isArray(tp.tuntutan) && tp.tuntutan.length > 0) {
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: 'Tuntutan CP yang dilayani:', bold: true, size: 19 })],
            spacing: { after: 40 },
          }));
          tp.tuntutan.forEach(function (id) {
            children.push(new D.Paragraph({
              children: [new D.TextRun({ text: tuntutanTeks[id] || String(id), size: 19 })],
              bullet: { level: 0 }, indent: { left: 360 }, spacing: { after: 40 },
            }));
          });
        }

        // Jenis teks (Pass 5) — ada pada ATP baru, tidak ada pada ATP lama.
        if (Array.isArray(tp.kategori_teks) && tp.kategori_teks.length) {
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: 'Jenis teks: ' + tp.kategori_teks.join(' dan '), size: 19 })],
            spacing: { after: 60 },
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
  // ── M8.1: DUA JALUR .docx YANG SEMPAT TERTINGGAL ──────────────────────
  //
  // M8 memasang otoritas penyajian bersama (`modul-tampilan.js`) supaya
  // pratinjau dan pengunduh tidak menyimpang. Dua dari empat fungsinya sempat
  // hanya dipakai pratinjau, sehingga guru MELIHAT Pertimbangan Konteks dan
  // cakupan bukti di layar lalu KEHILANGANNYA di berkas yang ia cetak.
  //
  // Alasannya waktu itu penomoran bab — dan itu alasan yang salah: data
  // otoritas lebih penting daripada kenyamanan mempertahankan nomor.
  //
  // Keduanya sengaja fungsi di lingkup modul, sejajar dengan `blokNaskah` di
  // bawah. Bentuk itu yang membuatnya dapat dijalankan langsung oleh uji dengan
  // `D` tiruan — jadi yang dibuktikan bukan sekadar nama fungsi muncul di
  // sumber, melainkan paragraf benar-benar dihasilkan.
  //
  // `MT` diterima sebagai argumen (bukan dibaca dari window di dalam) supaya
  // keduanya murni dan dapat diuji tanpa memalsukan global.

  /** Pertimbangan Konteks (M6) ke dalam dokumen. Tidak menghasilkan apa pun
   *  ketika dokumennya tidak punya jejak — dokumen lama tidak boleh mendapat
   *  judul kosong. */
  function blokKonteksDocx(children, konten, D, MT) {
    if (!MT || typeof MT.blokPertimbanganKonteks !== 'function') return;
    var blok = MT.blokPertimbanganKonteks(konten) || [];
    if (!blok.length) return;

    children.push(subLabel('C2. Pertimbangan Konteks'));
    for (var i = 0; i < blok.length; i++) {
      var b = blok[i];
      children.push(new D.Paragraph({
        children: [new D.TextRun({ text: b.judul, bold: true, size: 20 })],
        spacing: { before: 100, after: 40 },
      }));
      if (b.keputusan)
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: b.keputusan, size: 20 })],
          indent: { left: 360 }, spacing: { after: 40 },
        }));
      if (b.penerapan)
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: b.penerapan, size: 20 })],
          indent: { left: 360 }, spacing: { after: 40 },
        }));
      if (b.terlihat && b.terlihat.length)
        children.push(new D.Paragraph({
          children: [new D.TextRun({
            text: 'Terlihat pada: ' + b.terlihat.join(', '), color: '666666', size: 18,
          })],
          indent: { left: 360 }, spacing: { after: 80 },
        }));
    }
    children.push(new D.Paragraph({ text: '', spacing: { after: 100 } }));
  }

  /** Cakupan bukti (M4) pada satu entri asesmen. Diam ketika dokumennya tidak
   *  menyatakannya — tidak ada kalimat yang dikarang. */
  function barisCakupanDocx(children, entri, D, MT) {
    if (!MT || typeof MT.kalimatCakupanBukti !== 'function') return;
    var teks = MT.kalimatCakupanBukti(entri);
    if (!teks) return;
    children.push(new D.Paragraph({
      children: [new D.TextRun({ text: teks, color: '666666', size: 18 })],
      indent: { left: 720 }, spacing: { after: 60 },
    }));
  }

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

  function generateModulDocx(modul, atpInfo, ident) {
    var D = window.docx;
    var k = modul.konten || {};
    ident = ident || {};
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
    // metadata_pedagogis menyimpan dua komponen yang DIMINTA kerangka resmi
    // (Panduan Pembelajaran dan Asesmen 2025, hal. 30–31): Dimensi Profil
    // Lulusan dan Karakteristik Materi. Keduanya sempat hilang dari dokumen
    // cetak sejak V4.0 — di V3 mereka ada di bab Identifikasi.
    var meta         = k.metadata_pedagogis || {};
    var dpl          = Array.isArray(meta.dimensi_profil_lulusan) ? meta.dimensi_profil_lulusan : [];
    var karMateri    = meta.karakteristik_materi || {};

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
    if (ident.nama_guru) children.push(tableRow2Col('Guru Penyusun',
      ident.nama_guru + (ident.nip_guru ? ' (NIP ' + ident.nip_guru + ')' : '')));
    children.push(tableRow2Col('Mata Pelajaran', atpInfo.mapel || '-'));
    if (ident.nama_kelas || ident.semester)
      children.push(tableRow2Col('Kelas / Semester',
        (ident.nama_kelas || '-') + ' / ' + (ident.semester || '-')));
    if (ident.tahun_ajaran) children.push(tableRow2Col('Tahun Pelajaran', ident.tahun_ajaran));
    children.push(tableRow2Col('Fase / Jenjang', (atpInfo.fase || '-') + ' / ' + (atpInfo.jenjang || '-')));
    var pk = ident.program_keahlian ||
      (identitas.konteks_kejuruan && identitas.konteks_kejuruan.program_keahlian);
    if (pk) children.push(tableRow2Col('Program Keahlian', pk));
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

    // ── A. IDENTIFIKASI ───────────────────────────────────────────────────────
    // Nama bab mengikuti kerangka resmi Panduan Pembelajaran dan Asesmen 2025
    // (hal. 30): Identifikasi → Desain Pembelajaran → Langkah-langkah
    // Pembelajaran → Asesmen Pembelajaran. Pengawas dan kepala sekolah mencari
    // keempat nama itu; menggantinya dengan istilah kita sendiri membuat modul
    // terlihat tidak sah meski isinya lengkap.
    var adaIdentifikasi = dpl.length || karMateri.faktual || karMateri.konseptual ||
      karMateri.prosedural || konteksMurid.variasi_kemampuan ||
      (Array.isArray(konteksMurid.kesiapan_awal) && konteksMurid.kesiapan_awal.length) ||
      (Array.isArray(konteksMurid.kebutuhan_dukungan) && konteksMurid.kebutuhan_dukungan.length);
    if (adaIdentifikasi) {
      children.push(sectionHeading('A. Identifikasi'));

      // Dimensi Profil Lulusan — diminta eksplisit oleh kerangka resmi.
      if (dpl.length) {
        children.push(subLabel('Dimensi Profil Lulusan'));
        dpl.forEach(function (d) {
          children.push(new D.Paragraph({
            children: [
              new D.TextRun({ text: (d.dimensi || '') + ': ', bold: true }),
              new D.TextRun({ text: d.indikator || '' }),
            ],
            indent: { left: 360 }, spacing: { after: 40 },
          }));
          if (d.alasan)
            children.push(new D.Paragraph({
              children: [new D.TextRun({ text: d.alasan, italics: true, color: '666666', size: 19 })],
              indent: { left: 720 }, spacing: { after: 80 },
            }));
        });
      }

      // Karakteristik Materi — faktual / konseptual / prosedural.
      if (karMateri.faktual || karMateri.konseptual || karMateri.prosedural) {
        children.push(subLabel('Karakteristik Materi'));
        if (karMateri.faktual)    children.push(tableRow2Col('Faktual', karMateri.faktual));
        if (karMateri.konseptual) children.push(tableRow2Col('Konseptual', karMateri.konseptual));
        if (karMateri.prosedural) children.push(tableRow2Col('Prosedural', karMateri.prosedural));
      }

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
      children.push(sectionHeading('B. Fokus Materi'));
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
        // M8: otoritas keputusan ikut tercetak, bukan hanya penjelasannya.
        var MT8 = window.ModulTampilan || {};
        var ambang8 = MT8.kalimatKetercapaian ? MT8.kalimatKetercapaian(kk) : null;
        if (ambang8)
          children.push(new D.Paragraph({
            children: [new D.TextRun({ text: ambang8, bold: true, size: 20 })],
            spacing: { after: 40 }
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

    // ── D. DESAIN PEMBELAJARAN ────────────────────────────────────────────────
    // Nama dan isi bab ini mengikuti kerangka resmi Panduan Pembelajaran dan
    // Asesmen 2025 (hal. 30): Tujuan Pembelajaran, Praktik Pedagogis,
    // Kemitraan Pembelajaran (opsional), Lingkungan Pembelajaran, Pemanfaatan
    // Digital (opsional). K3 dan Sumber Belajar menyusul ketentuan SMK di
    // hal. 35, yang menuntut modul ajar SMK dilengkapi bahan ajar dan lembar
    // kerja. "Rancangan Pembelajaran" — nama yang sempat dipakai di sini —
    // tidak ada di kerangka mana pun; pengawas mencari "Desain Pembelajaran".
    var adaRancangan = rancangan.strategi_pedagogis || rancangan.lingkungan_pembelajaran ||
      rancangan.kemitraan_pembelajaran || rancangan.keselamatan_k3 ||
      rancangan.pemanfaatan_digital ||
      (Array.isArray(rancangan.sumber_belajar) && rancangan.sumber_belajar.length);
    if (identitas.tujuan_pembelajaran || adaRancangan) {
      // M8.1: subbagian, bukan bab baru — penomoran A–I tidak bergeser sama
      // sekali, dan labelnya sama dengan pratinjau ("C2. Pertimbangan Konteks").
      blokKonteksDocx(children, konten, D, window.ModulTampilan);

      children.push(sectionHeading('D. Desain Pembelajaran'));
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
          barisCakupanDocx(children, af, D, window.ModulTampilan);
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
        barisCakupanDocx(children, suma, D, window.ModulTampilan);
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
            // M8: bagian M7 lewat otoritas penyajian yang sama dengan pratinjau.
            var tambahan8 = (window.ModulTampilan && window.ModulTampilan.blokNaskahTambahan)
              ? window.ModulTampilan.blokNaskahTambahan(sl) : [];
            for (var t8 = 0; t8 < tambahan8.length; t8++)
              blokNaskah(children, tambahan8[t8].label, tambahan8[t8].butir, D);
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
    var identitasKelas = await fetchIdentitasKelas(_classroomId);

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
            var doc = generateModulDocx(modul, atp, identitasKelas);
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
