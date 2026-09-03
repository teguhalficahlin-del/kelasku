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
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/docx/8.5.0/build/index.js';
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
      .select('id, mapel, fase, jenjang, progresi_tp, updated_at')
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
              new D.TextRun({ text: tp.elemen.join(', '), italics: true }),
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

        // Konteks (jika ada)
        if (Array.isArray(tp.konteks) && tp.konteks.length > 0) {
          tp.konteks.forEach(function (k) {
            children.push(new D.Paragraph({
              children: [new D.TextRun({ text: '• ' + k })],
              spacing: { after: 60 },
              indent: { left: 360 },
            }));
          });
        }
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

  function generateModulDocx(modul, atpInfo) {
    var D = window.docx;
    var k = modul.konten || {};
    var children = [];

    // Header
    children.push(new D.Paragraph({
      text: 'Modul Ajar',
      heading: D.HeadingLevel.HEADING_1,
      spacing: { after: 100 },
    }));

    children.push(new D.Paragraph({
      text: 'TP ' + modul.nomor_tp + ': ' + (modul.tp_judul || ''),
      heading: D.HeadingLevel.HEADING_2,
      spacing: { after: 300 },
    }));

    // Identitas dari ATP
    children.push(tableRow2Col('Mata Pelajaran', atpInfo.mapel || '-'));
    children.push(tableRow2Col('Fase', atpInfo.fase || '-'));
    children.push(tableRow2Col('Jenjang', atpInfo.jenjang || '-'));
    children.push(new D.Paragraph({ text: '', spacing: { after: 300 } }));

    // A. Informasi Umum
    var infoUmum = k.informasi_umum || {};
    if (Object.keys(infoUmum).length > 0) {
      children.push(sectionHeading('A. Informasi Umum'));
      if (infoUmum.durasi_jp)         children.push(tableRow2Col('Alokasi Waktu', infoUmum.durasi_jp + ' JP'));
      if (infoUmum.jp_per_pertemuan)  children.push(tableRow2Col('JP per Pertemuan', String(infoUmum.jp_per_pertemuan)));
      if (infoUmum.jumlah_pertemuan)  children.push(tableRow2Col('Jumlah Pertemuan', String(infoUmum.jumlah_pertemuan)));
      if (infoUmum.model_pembelajaran) children.push(tableRow2Col('Model Pembelajaran', infoUmum.model_pembelajaran));
      children.push(new D.Paragraph({ text: '', spacing: { after: 200 } }));
    }

    // B. Tujuan Pembelajaran
    var tujuan = k.tujuan_pembelajaran || {};
    if (tujuan.rumusan || tujuan.kompetensi || tujuan.lingkup_materi) {
      children.push(sectionHeading('B. Tujuan Pembelajaran'));
      if (tujuan.rumusan) children.push(bodyPara(tujuan.rumusan));
      if (Array.isArray(tujuan.lingkup_materi) && tujuan.lingkup_materi.length > 0) {
        children.push(new D.Paragraph({ children: [new D.TextRun({ text: 'Lingkup Materi:', bold: true })], spacing: { before: 100 } }));
        tujuan.lingkup_materi.forEach(function (m) {
          children.push(bulletPara(m));
        });
      }
      children.push(new D.Paragraph({ text: '', spacing: { after: 200 } }));
    }

    // C. Desain Pembelajaran
    var desain = k.desain_pembelajaran || {};
    if (desain.strategi_pedagogis) {
      children.push(sectionHeading('C. Desain Pembelajaran'));
      children.push(tableRow2Col('Strategi', desain.strategi_pedagogis));
      if (Array.isArray(desain.sumber_belajar) && desain.sumber_belajar.length > 0) {
        children.push(new D.Paragraph({ children: [new D.TextRun({ text: 'Sumber Belajar:', bold: true })], spacing: { before: 100, after: 60 } }));
        desain.sumber_belajar.forEach(function (sb) {
          children.push(bulletPara(sb.sumber + ' — ' + (sb.fungsi || '')));
        });
      }
      if (Array.isArray(desain.bukti_ketercapaian) && desain.bukti_ketercapaian.length > 0) {
        children.push(new D.Paragraph({ children: [new D.TextRun({ text: 'Bukti Ketercapaian:', bold: true })], spacing: { before: 100, after: 60 } }));
        desain.bukti_ketercapaian.forEach(function (b) {
          children.push(bulletPara(b));
        });
      }
      children.push(new D.Paragraph({ text: '', spacing: { after: 200 } }));
    }

    // D. Rencana Asesmen
    var asesmen = k.rencana_asesmen || {};
    if (asesmen.asesmen_awal) {
      children.push(sectionHeading('D. Rencana Asesmen'));
      var aa = asesmen.asesmen_awal;
      children.push(new D.Paragraph({ children: [new D.TextRun({ text: 'Asesmen Awal', bold: true })], spacing: { after: 60 } }));
      if (aa.tujuan)   children.push(tableRow2Col('Tujuan', aa.tujuan));
      if (aa.teknik)   children.push(tableRow2Col('Teknik', aa.teknik));
      if (aa.instrumen) children.push(tableRow2Col('Instrumen', aa.instrumen));
      if (aa.waktu)    children.push(tableRow2Col('Waktu', aa.waktu));

      if (Array.isArray(asesmen.asesmen_formatif) && asesmen.asesmen_formatif.length > 0) {
        children.push(new D.Paragraph({ children: [new D.TextRun({ text: 'Asesmen Formatif', bold: true })], spacing: { before: 200, after: 60 } }));
        asesmen.asesmen_formatif.forEach(function (af) {
          children.push(bulletPara('[' + af.id + '] ' + af.teknik_instrumen + ' — ' + (af.fungsi || '')));
        });
      }
      children.push(new D.Paragraph({ text: '', spacing: { after: 200 } }));
    }

    // E. Langkah Pembelajaran (pertemuan-pertemuan)
    var pertemuan = k.langkah_pembelajaran || k.pertemuan || [];
    if (Array.isArray(pertemuan) && pertemuan.length > 0) {
      children.push(sectionHeading('E. Langkah Pembelajaran'));
      pertemuan.forEach(function (p) {
        children.push(new D.Paragraph({
          children: [new D.TextRun({ text: 'Pertemuan ' + p.nomor + ' — ' + (p.tujuan_pertemuan || ''), bold: true })],
          spacing: { before: 300, after: 100 },
        }));
        if (Array.isArray(p.media_dan_alat) && p.media_dan_alat.length > 0) {
          children.push(tableRow2Col('Media & Alat', p.media_dan_alat.join(', ')));
        }
        if (Array.isArray(p.langkah)) {
          p.langkah.forEach(function (lk) {
            children.push(new D.Paragraph({
              children: [
                new D.TextRun({ text: lk.nama + ' ', bold: true }),
                new D.TextRun({ text: '(' + lk.durasi_menit + ' menit)', color: '555555' }),
              ],
              spacing: { before: 160, after: 60 },
              indent: { left: 360 },
            }));
            if (Array.isArray(lk.sub_langkah)) {
              lk.sub_langkah.forEach(function (sl) {
                children.push(new D.Paragraph({
                  children: [new D.TextRun({ text: sl.deskripsi || '' })],
                  spacing: { after: 40 },
                  indent: { left: 720 },
                  bullet: { level: 0 },
                }));
              });
            }
          });
        }
      });
      children.push(new D.Paragraph({ text: '', spacing: { after: 200 } }));
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
