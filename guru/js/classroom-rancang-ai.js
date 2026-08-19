// classroom-rancang-ai.js
// Tanggung jawab: call Edge Function AI generate-rancang
// Dipanggil dari IIFE di classroom-rancang.js via global scope

'use strict';

const EF_URL = 'https://teccdzetrdjowqemnuuc.supabase.co/functions/v1/generate-rancang';

async function callAI(payload) {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  const token = session?.access_token ?? '';
  const res = await fetch(EF_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || 'AI error');
  return json.result;
}

// ── Generate .docx untuk RPM ──────────────────────────────────
async function generateDocxRancang(konten, jenis, judul, identitas) {
  const {
    Document, Paragraph, TextRun, Table, TableRow, TableCell,
    HeadingLevel, AlignmentType, WidthType, BorderStyle,
    Packer, PageOrientation,
  } = window.docx;

  const s  = identitas || {};
  const namaGuru   = s.nama_guru    || '___________________';
  const nipGuru    = s.nip_guru     || '___________________';
  const namaKepsek = s.nama_kepsek  || '___________________';
  const nipKepsek  = s.nip_kepsek   || '___________________';
  const tahunAj    = s.tahun_ajaran || '____/____';
  const semester   = s.semester     || '________';
  const kota       = s.kota         || '________';

  // ── Helper paragraf ──────────────────────────────────────────
  function p(text, opts = {}) {
    return new Paragraph({
      children: [new TextRun({
        text: String(text || ''),
        bold:   opts.bold   || false,
        size:   opts.size   || 24,
        color:  opts.color  || '000000',
        font:   'Times New Roman',
      })],
      alignment: opts.align || AlignmentType.LEFT,
      spacing:   { after: opts.after ?? 120 },
      heading:   opts.heading || undefined,
    });
  }

  function hr() {
    return new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA' } },
      spacing: { after: 120 },
      children: [],
    });
  }

  function cell(text, opts = {}) {
    return new TableCell({
      children: [new Paragraph({
        children: [new TextRun({
          text: String(text || ''),
          bold: opts.bold || false,
          size: 22,
          font: 'Times New Roman',
        })],
        spacing: { after: 60 },
      })],
      width:   opts.width   ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
      shading: opts.shading ? { fill: opts.shading } : undefined,
    });
  }

  // ── Halaman tanda tangan ─────────────────────────────────────
  function ttdSection() {
    const tanggal = new Date().toLocaleDateString('id-ID', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
    return [
      p(''),
      p(`${kota}, ${tanggal}`),
      p(''),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: [
            cell('Mengetahui,', { bold: true }),
            cell('Guru Mata Pelajaran,', { bold: true }),
          ]}),
          new TableRow({ children: [
            cell('Kepala Sekolah'),
            cell(''),
          ]}),
          new TableRow({ children: [
            cell(''),
            cell(''),
          ]}),
          new TableRow({ children: [
            cell(''),
            cell(''),
          ]}),
          new TableRow({ children: [
            cell(namaKepsek, { bold: true }),
            cell(namaGuru, { bold: true }),
          ]}),
          new TableRow({ children: [
            cell(`NIP. ${nipKepsek}`),
            cell(`NIP. ${nipGuru}`),
          ]}),
        ],
        borders: {
          top:    { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left:   { style: BorderStyle.NONE },
          right:  { style: BorderStyle.NONE },
          insideH:{ style: BorderStyle.NONE },
          insideV:{ style: BorderStyle.NONE },
        },
      }),
    ];
  }

  // ── Bangun konten per jenis ──────────────────────────────────
  let children = [];

  if (jenis === 'RPM') {
    const r  = konten.rencana || {};
    const tp = konten.tp      || {};

    children = [
      p('RENCANA PELAKSANAAN MODUL (RPM)', { bold: true, size: 28, align: AlignmentType.CENTER, after: 60 }),
      p(`${konten.mapel || ''} — ${konten.jenjang || ''} — ${(konten.fase || '').replace('_',' ').toUpperCase()}`,
        { align: AlignmentType.CENTER, after: 60, color: '555555' }),
      p(`Tahun Ajaran ${tahunAj} | Semester ${semester}`,
        { align: AlignmentType.CENTER, after: 240, color: '555555' }),
      hr(),

      p('A. Tujuan Pembelajaran', { bold: true, after: 60 }),
      p(r.tujuan_praktis || tp.deskripsi || '-', { after: 200 }),

      p('B. Rencana Pertemuan', { bold: true, after: 60 }),
      ...(r.pertemuan || []).flatMap(pt => [
        p(`Pertemuan ${pt.no} — ${pt.judul} (${pt.durasi_jp} JP)`, { bold: true, after: 40 }),
        p(pt.aktivitas || '-', { after: 160 }),
      ]),

      p('C. Asesmen', { bold: true, after: 60 }),
      p(r.asesmen?.deskripsi || '-', { after: 60 }),
      ...(r.asesmen?.instrumen?.length
        ? [new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [
                cell('Instrumen', { bold: true, shading: 'F0F0F0', width: 30 }),
                cell('Bobot', { bold: true, shading: 'F0F0F0', width: 15 }),
                cell('Deskripsi', { bold: true, shading: 'F0F0F0', width: 55 }),
              ]}),
              ...(Array.isArray(r.asesmen?.instrumen) ? r.asesmen.instrumen.map(ins => new TableRow({ children: [
                cell(ins.nama   || '-'),
                cell(ins.bobot  ? `${ins.bobot}%` : '-'),
                cell(ins.detail || '-'),
              ]})) : []),
            ],
          })]
        : []),
      p('', { after: 120 }),

      p('D. Tindak Lanjut', { bold: true, after: 60 }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: [
            cell('Pengayaan',   { bold: true, shading: 'F0F0F0', width: 20 }),
            cell(r.tindak_lanjut?.pengayaan   || '-', { width: 80 }),
          ]}),
          new TableRow({ children: [
            cell('Penguatan',   { bold: true, shading: 'F0F0F0' }),
            cell(r.tindak_lanjut?.penguatan   || '-'),
          ]}),
          new TableRow({ children: [
            cell('Pendampingan',{ bold: true, shading: 'F0F0F0' }),
            cell(r.tindak_lanjut?.pendampingan|| '-'),
          ]}),
        ],
      }),
      p('', { after: 240 }),

      ...ttdSection(),
    ];
  } else if (jenis === 'CP') {
    const cpUmum   = konten.cp_umum   || '';
    const elemen   = konten.elemen    || [];
    const ringkasan= konten.ringkasan || [];
    const mapelLabel = konten.mapel   || '';
    const faseLabel  = (konten.fase   || '').replace(/_/g, ' ').toUpperCase();

    children = [
      p('CAPAIAN PEMBELAJARAN', { bold: true, size: 28, align: AlignmentType.CENTER, after: 60 }),
      p(`${mapelLabel}${faseLabel ? ' — ' + faseLabel : ''}`,
        { align: AlignmentType.CENTER, after: 60, color: '555555' }),
      p(`Tahun Ajaran ${tahunAj} | Semester ${semester}`,
        { align: AlignmentType.CENTER, after: 240, color: '555555' }),
      hr(),

      ...(cpUmum ? [p('Deskripsi Umum', { bold: true, after: 60 }), p(cpUmum, { after: 200 })] : []),

      p('Elemen Capaian Pembelajaran', { bold: true, after: 80 }),
      ...elemen.flatMap(e => {
        const r = ringkasan.find(x => x.elemen === e.nama);
        const konkret = r?.konkret;
        return [
          p(e.nama, { bold: true, after: 40 }),
          p(e.cp_normatif || '-', { after: konkret ? 60 : 160, color: '333333' }),
          ...(konkret ? [p('Gambaran Pencapaian: ' + konkret, { after: 160, color: '555555' })] : []),
        ];
      }),

      p('', { after: 240 }),
      ...ttdSection(),
    ];
  } else if (jenis === 'TP') {
    const atpList   = konten.atp     || [];
    const mapelLabel = konten.mapel  || '';
    const faseLabel  = (konten.fase  || '').replace(/_/g, ' ').toUpperCase();
    const jenjangLabel = konten.jenjang || '';

    children = [
      p('ALUR TUJUAN PEMBELAJARAN (ATP)', { bold: true, size: 28, align: AlignmentType.CENTER, after: 60 }),
      p(`${mapelLabel}${jenjangLabel ? ' — ' + jenjangLabel : ''}${faseLabel ? ' — ' + faseLabel : ''}`,
        { align: AlignmentType.CENTER, after: 60, color: '555555' }),
      p(`Tahun Ajaran ${tahunAj} | Semester ${semester}`,
        { align: AlignmentType.CENTER, after: 240, color: '555555' }),
      hr(),

      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: [
            cell('No', { bold: true, shading: 'F0F0F0', width: 6 }),
            cell('Judul TP', { bold: true, shading: 'F0F0F0', width: 30 }),
            cell('Deskripsi', { bold: true, shading: 'F0F0F0', width: 40 }),
            cell('Elemen CP', { bold: true, shading: 'F0F0F0', width: 14 }),
            cell('Est. JP', { bold: true, shading: 'F0F0F0', width: 10 }),
          ]}),
          ...atpList.map((tp, i) => new TableRow({ children: [
            cell(String(tp.urutan || i + 1)),
            cell(tp.judul || '-'),
            cell(tp.deskripsi || '-'),
            cell(tp.elemen_cp || '-'),
            cell(tp.estimasi_jp ? `${tp.estimasi_jp} JP` : '-'),
          ]})),
        ],
      }),

      p('', { after: 240 }),
      ...ttdSection(),
    ];
  } else {
    children = [
      p(judul, { bold: true, size: 28, align: AlignmentType.CENTER, after: 240 }),
      hr(),
      p(JSON.stringify(konten, null, 2), { after: 120 }),
      p('', { after: 240 }),
      ...ttdSection(),
    ];
  }

  // ── Generate dan download ────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {},
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${judul.replace(/[^a-zA-Z0-9\s\-]/g, '').trim()}.docx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// ── Generate .docx dari Pipeline State (Phase 2C) ─────────────────────────
// jenis: 'RPM' | 'LKS'
// state: _phase2cState object
// profil: _profil object (identitas guru)
async function generateDocxFromPipelineState(state, profil, jenis, tp) {
  const {
    Document, Paragraph, TextRun, Table, TableRow, TableCell,
    HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
    Packer,
  } = window.docx;

  const s  = profil || {};
  const locked = profil?.is_locked;
  const namaGuru   = locked ? (profil.nama_guru   || '___________________') : (s.nama_guru   || '___________________');
  const nipGuru    = locked ? (profil.nip_guru    || '___________________') : (s.nip_guru    || '___________________');
  const namaKepsek = locked ? (profil.nama_kepsek || '___________________') : (s.nama_kepsek || '___________________');
  const nipKepsek  = locked ? (profil.nip_kepsek  || '___________________') : (s.nip_kepsek  || '___________________');
  const tahunAj    = locked ? (profil.tahun_ajaran|| '____/____')           : (s.tahun_ajaran|| '____/____');
  const semesterStr= locked ? ((profil.semester_list||[]).join(', ') || '________') : (s.semester || '________');
  const kota       = locked ? (profil.kota        || '________')            : (s.kota        || '________');

  const ctxContent = state?.context_spec?.content ?? {};
  const asmContent = state?.assessment_spec?.content ?? {};
  const matContent = state?.material_spec?.content ?? {};
  const meetings   = state?.meeting_plans ?? [];
  const fuContent  = state?.follow_up?.content ?? {};

  // Identitas mapel dari context_decisions
  function ctxDecision(key) {
    const decisions = ctxContent.context_decisions ?? [];
    const found = decisions.find(d => d.key === key || d.aspect?.toLowerCase().includes(key));
    return found?.decision || found?.value || '';
  }

  const mapelLabel  = ctxDecision('mapel') || s.mapel || '';
  const jenjangLabel= ctxDecision('jenjang') || s.jenjang || '';
  const faseLabel   = (ctxDecision('fase') || s.fase || '').replace(/_/g,' ').toUpperCase();
  const kelasLabel  = ctxDecision('kelas') || s.kelas || '';

  // ── Helpers ──────────────────────────────────────────────────────────────
  const DXA = WidthType.DXA;
  const PAGE_WIDTH_DXA = 9360; // A4 usable width at 2.5cm margin each side

  function p(text, opts = {}) {
    return new Paragraph({
      children: [new TextRun({
        text: String(text || ''),
        bold:   opts.bold   || false,
        size:   opts.size   || 24,
        color:  opts.color  || '000000',
        font:   'Times New Roman',
      })],
      alignment: opts.align || AlignmentType.LEFT,
      spacing:   { after: opts.after ?? 120 },
      heading:   opts.heading || undefined,
    });
  }

  function hr() {
    return new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA' } },
      spacing: { after: 120 },
      children: [],
    });
  }

  function heading(text, level = 2) {
    return new Paragraph({
      children: [new TextRun({ text: String(text || ''), bold: true, size: 26, font: 'Times New Roman' })],
      heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
    });
  }

  function subheading(text) {
    return new Paragraph({
      children: [new TextRun({ text: String(text || ''), bold: true, size: 24, font: 'Times New Roman', color: '444444' })],
      spacing: { before: 160, after: 80 },
    });
  }

  function bullet(text) {
    return new Paragraph({
      children: [new TextRun({ text: '  • ' + txt(text), size: 22, font: 'Times New Roman' })],
      spacing: { after: 60 },
    });
  }

  // Konversi nilai apa pun menjadi teks yang aman untuk dokumen.
  // Jaring pengaman terakhir agar '[object Object]' tidak pernah lagi lolos ke
  // dokumen jadi: objek/array tak terduga tetap ditampilkan isinya, dan
  // ketidakcocokan bentuk data dilaporkan ke konsol supaya tidak senyap.
  function txt(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) return v.map(txt).filter(Boolean).join('; ');
    if (typeof v === 'object') {
      console.warn('[rpm-docx] bentuk data tak terduga saat render:', v);
      return Object.values(v).map(txt).filter(Boolean).join(' — ');
    }
    return String(v);
  }

  // Laporkan field yang diharapkan renderer tapi tidak ada di artifact.
  // Tanpa ini, ketidakcocokan nama field hanya berubah jadi '-' di dokumen.
  function warnMissing(bagian, field, obj) {
    if (obj && typeof obj === 'object' && !(field in obj)) {
      console.warn(`[rpm-docx] ${bagian}: field '${field}' tidak ada di artifact`, Object.keys(obj));
    }
  }

  // cols: array of DXA widths summing to PAGE_WIDTH_DXA
  function tbl(headers, rows, cols) {
    const colWidths = cols || headers.map(() => Math.floor(PAGE_WIDTH_DXA / headers.length));
    function mkCell(text, opts = {}, w) {
      return new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: String(text ?? ''), bold: opts.bold || false, size: 20, font: 'Times New Roman' })],
          spacing: { after: 40 },
        })],
        width: { size: w || Math.floor(PAGE_WIDTH_DXA / headers.length), type: DXA },
        shading: opts.shading ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.shading } : undefined,
      });
    }
    return new Table({
      width: { size: PAGE_WIDTH_DXA, type: DXA },
      columnWidths: colWidths,
      rows: [
        new TableRow({ children: headers.map((h, i) => mkCell(h, { bold: true, shading: 'E8E8E8' }, colWidths[i])) }),
        ...rows.map(row => new TableRow({ children: row.map((cell, i) => mkCell(cell, {}, colWidths[i])) })),
      ],
    });
  }

  function ttdSection() {
    const tanggal = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    return [
      p(''),
      p(`${kota}, ${tanggal}`),
      p(''),
      new Table({
        width: { size: PAGE_WIDTH_DXA, type: DXA },
        columnWidths: [Math.floor(PAGE_WIDTH_DXA / 2), Math.floor(PAGE_WIDTH_DXA / 2)],
        rows: [
          new TableRow({ children: [
            new TableCell({ children: [p('Mengetahui,', { bold: true })], width: { size: Math.floor(PAGE_WIDTH_DXA/2), type: DXA }, borders: { top:{style:BorderStyle.NONE}, bottom:{style:BorderStyle.NONE}, left:{style:BorderStyle.NONE}, right:{style:BorderStyle.NONE} } }),
            new TableCell({ children: [p('Guru Mata Pelajaran,', { bold: true })], width: { size: Math.floor(PAGE_WIDTH_DXA/2), type: DXA }, borders: { top:{style:BorderStyle.NONE}, bottom:{style:BorderStyle.NONE}, left:{style:BorderStyle.NONE}, right:{style:BorderStyle.NONE} } }),
          ]}),
          new TableRow({ children: [
            new TableCell({ children: [p('Kepala Sekolah')], width: { size: Math.floor(PAGE_WIDTH_DXA/2), type: DXA }, borders: { top:{style:BorderStyle.NONE}, bottom:{style:BorderStyle.NONE}, left:{style:BorderStyle.NONE}, right:{style:BorderStyle.NONE} } }),
            new TableCell({ children: [p('')], width: { size: Math.floor(PAGE_WIDTH_DXA/2), type: DXA }, borders: { top:{style:BorderStyle.NONE}, bottom:{style:BorderStyle.NONE}, left:{style:BorderStyle.NONE}, right:{style:BorderStyle.NONE} } }),
          ]}),
          ...[1,2,3].map(() => new TableRow({ children: [
            new TableCell({ children: [p('')], width: { size: Math.floor(PAGE_WIDTH_DXA/2), type: DXA }, borders: { top:{style:BorderStyle.NONE}, bottom:{style:BorderStyle.NONE}, left:{style:BorderStyle.NONE}, right:{style:BorderStyle.NONE} } }),
            new TableCell({ children: [p('')], width: { size: Math.floor(PAGE_WIDTH_DXA/2), type: DXA }, borders: { top:{style:BorderStyle.NONE}, bottom:{style:BorderStyle.NONE}, left:{style:BorderStyle.NONE}, right:{style:BorderStyle.NONE} } }),
          ]})),
          new TableRow({ children: [
            new TableCell({ children: [p(namaKepsek, { bold: true })], width: { size: Math.floor(PAGE_WIDTH_DXA/2), type: DXA }, borders: { top:{style:BorderStyle.NONE}, bottom:{style:BorderStyle.NONE}, left:{style:BorderStyle.NONE}, right:{style:BorderStyle.NONE} } }),
            new TableCell({ children: [p(namaGuru, { bold: true })], width: { size: Math.floor(PAGE_WIDTH_DXA/2), type: DXA }, borders: { top:{style:BorderStyle.NONE}, bottom:{style:BorderStyle.NONE}, left:{style:BorderStyle.NONE}, right:{style:BorderStyle.NONE} } }),
          ]}),
          new TableRow({ children: [
            new TableCell({ children: [p('NIP. ' + nipKepsek)], width: { size: Math.floor(PAGE_WIDTH_DXA/2), type: DXA }, borders: { top:{style:BorderStyle.NONE}, bottom:{style:BorderStyle.NONE}, left:{style:BorderStyle.NONE}, right:{style:BorderStyle.NONE} } }),
            new TableCell({ children: [p('NIP. ' + nipGuru)], width: { size: Math.floor(PAGE_WIDTH_DXA/2), type: DXA }, borders: { top:{style:BorderStyle.NONE}, bottom:{style:BorderStyle.NONE}, left:{style:BorderStyle.NONE}, right:{style:BorderStyle.NONE} } }),
          ]}),
        ],
      }),
    ];
  }

  // ── Build per jenis ──────────────────────────────────────────────────────
  let children = [];

  if (jenis === 'RPM') {
    // Halaman judul
    children.push(
      p('RENCANA PELAKSANAAN MODUL (RPM)', { bold: true, size: 32, align: AlignmentType.CENTER, after: 60 }),
      p([mapelLabel, jenjangLabel, faseLabel].filter(Boolean).join(' — '), { align: AlignmentType.CENTER, after: 60, color: '444444' }),
      p(`Tahun Ajaran ${tahunAj} | Semester ${semesterStr}`, { align: AlignmentType.CENTER, after: 60, color: '444444' }),
      p(namaGuru + (nipGuru && nipGuru !== '___________________' ? ` / NIP ${nipGuru}` : ''), { align: AlignmentType.CENTER, after: 240, color: '666666', size: 22 }),
      hr(),
    );

    // Bagian A — Identitas
    children.push(
      heading('A. Identitas', 2),
      tbl(
        ['Komponen','Keterangan'],
        [
          ['Mata Pelajaran', mapelLabel],
          ['Jenjang', jenjangLabel],
          ['Fase', faseLabel],
          ['Kelas', kelasLabel],
          ['Tahun Ajaran', tahunAj],
          ['Semester', semesterStr],
        ],
        [Math.floor(PAGE_WIDTH_DXA * 0.35), Math.floor(PAGE_WIDTH_DXA * 0.65)],
      ),
      p(''),
    );

    // Bagian B — Tujuan Pembelajaran
    // TP tidak tersimpan di artifact CONTEXT_SPEC — isinya hanya context_decisions,
    // constraints, contextual_opportunities, risks, dan irrelevant_context.
    // Sumber TP yang benar adalah TP terpilih dari planning context (parameter `tp`).
    const tpJudul  = txt(tp?.judul)     || txt(state?.context_spec?.content?.tp_judul);
    const tpDeskr  = txt(tp?.deskripsi) || txt(state?.context_spec?.content?.tp_deskripsi);
    const tpElemen = txt(tp?.elemen_cp) || txt(state?.context_spec?.content?.elemen_cp);
    children.push(heading('B. Tujuan Pembelajaran', 2));
    if (tpJudul) children.push(p(tpJudul, { bold: true, after: 60 }));
    if (tpDeskr) children.push(p(tpDeskr, { after: 120 }));
    if (tpElemen) children.push(p('Elemen CP: ' + tpElemen, { color: '555555', size: 22, after: 120 }));
    if (!tpJudul && !tpDeskr) children.push(p('—', { color: '888888' }));
    children.push(p(''));

    // Bagian C — Asesmen + KKTP
    children.push(heading('C. Asesmen dan Kriteria Ketercapaian', 2));
    const kktpList = asmContent.kktp ?? [];
    // Nama field mengikuti skema keluaran phase2c-generate:
    // success_evidence (array), diagnostic {tujuan,instrumen}, summative {jenis,instrumen,rubrik},
    // formative [{meeting_no, expected_evidence, classification_anchor, response}]
    const bukti    = asmContent.success_evidence ?? asmContent.bukti_ketercapaian ?? [];
    const diagn    = asmContent.diagnostic ?? asmContent.asesmen_diagnostik ?? null;
    const sumatif  = asmContent.summative ?? asmContent.asesmen_sumatif ?? null;
    warnMissing('assessment_spec', 'success_evidence', asmContent);

    const buktiList = Array.isArray(bukti) ? bukti : (bukti ? [bukti] : []);
    if (buktiList.length) {
      children.push(subheading('Bukti Ketercapaian'));
      buktiList.forEach(b => children.push(bullet(b)));
      children.push(p(''));
    }
    if (kktpList.length) {
      children.push(subheading('Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)'));
      children.push(tbl(
        ['Kriteria','Sudah Paham','Hampir Paham','Belum Paham'],
        kktpList.map(k => [
          txt(k.deskripsi ?? k.kriteria ?? k.criterion) || '-',
          txt(k.paham  ?? k.sudah_paham)  || '-',
          txt(k.hampir ?? k.hampir_paham) || '-',
          txt(k.belum  ?? k.belum_paham)  || '-',
        ]),
        [Math.floor(PAGE_WIDTH_DXA*0.28), Math.floor(PAGE_WIDTH_DXA*0.24), Math.floor(PAGE_WIDTH_DXA*0.24), Math.floor(PAGE_WIDTH_DXA*0.24)],
      ));
      children.push(p(''));
    }
    if (diagn) {
      children.push(subheading('Asesmen Diagnostik'));
      if (diagn.tujuan)    children.push(p('Tujuan: ' + txt(diagn.tujuan), { size: 22 }));
      if (diagn.instrumen) children.push(p('Instrumen: ' + txt(diagn.instrumen), { size: 22 }));
      if (!diagn.tujuan && !diagn.instrumen) children.push(p(txt(diagn)));
      children.push(p(''));
    }
    if (sumatif) {
      children.push(subheading('Asesmen Sumatif'));
      if (sumatif.jenis)     children.push(p('Jenis: ' + txt(sumatif.jenis), { size: 22 }));
      if (sumatif.instrumen) children.push(p('Instrumen: ' + txt(sumatif.instrumen), { size: 22 }));
      if (sumatif.rubrik)    children.push(p('Rubrik: ' + txt(sumatif.rubrik), { size: 22 }));
      if (!sumatif.jenis && !sumatif.instrumen && !sumatif.rubrik) children.push(p(txt(sumatif)));
      children.push(p(''));
    }
    const formativeCheckpoints = asmContent.formative ?? asmContent.formative_checkpoints ?? [];
    if (formativeCheckpoints.length) {
      children.push(subheading('Asesmen Formatif per Pertemuan'));
      children.push(tbl(
        ['Pertemuan','Bukti yang Diamati','Sudah','Hampir','Belum'],
        formativeCheckpoints.map(f => {
          const a = f.classification_anchor ?? {};
          return [
            txt(f.meeting_no) || '-',
            txt(f.expected_evidence ?? f.deskripsi ?? f.description) || '-',
            txt(a.paham)  || '-',
            txt(a.hampir) || '-',
            txt(a.belum)  || '-',
          ];
        }),
        [Math.floor(PAGE_WIDTH_DXA*0.10), Math.floor(PAGE_WIDTH_DXA*0.30),
         Math.floor(PAGE_WIDTH_DXA*0.20), Math.floor(PAGE_WIDTH_DXA*0.20), Math.floor(PAGE_WIDTH_DXA*0.20)],
      ));
    }
    children.push(p(''));

    // Bagian D — Materi Pembelajaran
    children.push(heading('D. Materi Pembelajaran', 2));
    const konsep  = matContent.konsep_inti ?? [];
    const mis     = matContent.miskonsepsi ?? [];
    const konteks = matContent.konteks_nyata ?? [];
    if (konsep.length) {
      children.push(subheading('Konsep Inti'));
      children.push(tbl(
        ['Konsep','Penjelasan','Prasyarat'],
        konsep.map(k => [txt(k.judul ?? k.nama) || '-', txt(k.penjelasan) || '-', txt(k.prasyarat) || '-']),
        [Math.floor(PAGE_WIDTH_DXA*0.25), Math.floor(PAGE_WIDTH_DXA*0.50), Math.floor(PAGE_WIDTH_DXA*0.25)],
      ));
      children.push(p(''));
    }
    if (mis.length) {
      // Item miskonsepsi berbentuk {id, miskonsepsi, klarifikasi} — bukan {deskripsi}.
      warnMissing('material_spec.miskonsepsi', 'miskonsepsi', mis[0]);
      children.push(subheading('Miskonsepsi Umum'));
      children.push(tbl(
        ['Miskonsepsi','Klarifikasi'],
        mis.map(m => [
          txt(m.miskonsepsi ?? m.deskripsi ?? m) || '-',
          txt(m.klarifikasi) || '-',
        ]),
        [Math.floor(PAGE_WIDTH_DXA*0.45), Math.floor(PAGE_WIDTH_DXA*0.55)],
      ));
      children.push(p(''));
    }
    if (konteks.length) {
      children.push(subheading('Konteks Nyata'));
      konteks.forEach(k => children.push(bullet(k.deskripsi ?? k)));
    }
    children.push(p(''));

    // Bagian E — Rencana Pertemuan
    children.push(heading('E. Rencana Pertemuan', 2));
    if (!meetings.length) {
      children.push(p('Rencana pertemuan belum di-generate.', { color: '888888' }));
    }
    meetings.forEach(m => {
      const mc = m.content ?? {};
      children.push(subheading(`Pertemuan ${m.meeting_no} — ${m.jp} JP (${m.duration_minutes} menit)`));
      if (mc.tujuan_pertemuan || mc.meeting_objective) {
        children.push(p('Tujuan: ' + (mc.tujuan_pertemuan || mc.meeting_objective), { size: 22, color: '333333' }));
      }
      if (mc.trigger_question || mc.pertanyaan_pemantik || mc.essential_question) {
        children.push(p('Pertanyaan pemantik: ' + txt(mc.trigger_question ?? mc.pertanyaan_pemantik ?? mc.essential_question), { size: 22, color: '333333', after: 80 }));
      }
      const persiapan = mc.teacher_notes ?? mc.persiapan_guru ?? mc.teacher_preparation ?? [];
      if (Array.isArray(persiapan) && persiapan.length) {
        children.push(p('Catatan & persiapan guru:', { bold: true, size: 22, after: 40 }));
        persiapan.forEach(item => children.push(bullet(item.deskripsi ?? item.description ?? item)));
      }
      // Activity unit mengikuti kontrak runtime-step granularity Step 6:
      // {step_id, title, phase, planned_minutes, teacher_action, student_action, completion_cue}
      const aktivitas = mc.activities ?? mc.aktivitas ?? [];
      if (aktivitas.length) {
        warnMissing('meeting_plan.activities', 'teacher_action', aktivitas[0]);
        children.push(tbl(
          ['Fase','Langkah','Menit','Aktivitas Guru','Aktivitas Siswa','Tanda Selesai'],
          aktivitas.map(a => [
            txt(a.phase ?? a.fase) || '-',
            txt(a.title) || '-',
            txt(a.planned_minutes ?? a.durasi_menit ?? a.duration_minutes) || '-',
            txt(a.teacher_action ?? a.guru ?? a.teacher) || '-',
            txt(a.student_action ?? a.siswa ?? a.student) || '-',
            txt(a.completion_cue) || '-',
          ]),
          [Math.floor(PAGE_WIDTH_DXA*0.11), Math.floor(PAGE_WIDTH_DXA*0.15), Math.floor(PAGE_WIDTH_DXA*0.07),
           Math.floor(PAGE_WIDTH_DXA*0.26), Math.floor(PAGE_WIDTH_DXA*0.26), Math.floor(PAGE_WIDTH_DXA*0.15)],
        ));
        children.push(p(''));
      }
      // formative_checkpoint = {expected_evidence, classification_anchor{paham,hampir,belum}}
      const fc = mc.formative_checkpoint ?? mc.formative;
      if (fc) {
        children.push(p('Asesmen formatif pertemuan ini:', { bold: true, size: 22, after: 40 }));
        if (fc.expected_evidence) children.push(bullet('Bukti yang diamati: ' + txt(fc.expected_evidence)));
        const anchor = fc.classification_anchor ?? {};
        if (anchor.paham)  children.push(bullet('Sudah paham: '  + txt(anchor.paham)));
        if (anchor.hampir) children.push(bullet('Hampir paham: ' + txt(anchor.hampir)));
        if (anchor.belum)  children.push(bullet('Belum paham: '  + txt(anchor.belum)));
        if (!fc.expected_evidence && !anchor.paham) children.push(bullet(fc.deskripsi ?? fc.description ?? fc));
        children.push(p(''));
      }
      // differentiation dikunci pada status pemahaman {paham,hampir,belum},
      // masing-masing {aktivitas, bukti_belajar} — bukan pengayaan/penguatan/pendampingan.
      const dif = mc.differentiation ?? mc.diferensiasi ?? {};
      if (dif.paham || dif.hampir || dif.belum || dif.pengayaan) {
        const difRow = (label, d) => [label, txt(d?.aktivitas) || '-', txt(d?.bukti_belajar) || '-'];
        children.push(p('Diferensiasi:', { bold: true, size: 22, after: 40 }));
        children.push(tbl(
          ['Status','Yang Dikerjakan Siswa','Bukti Belajar'],
          [
            difRow('Sudah paham',  dif.paham  ?? dif.pengayaan),
            difRow('Hampir paham', dif.hampir ?? dif.penguatan),
            difRow('Belum paham',  dif.belum  ?? dif.pendampingan),
          ],
          [Math.floor(PAGE_WIDTH_DXA*0.18), Math.floor(PAGE_WIDTH_DXA*0.47), Math.floor(PAGE_WIDTH_DXA*0.35)],
        ));
        children.push(p(''));
      }
    });

    // Bagian F — Tindak Lanjut
    children.push(heading('F. Tindak Lanjut', 2));
    if (fuContent.pengayaan || fuContent.penguatan || fuContent.pendampingan) {
      // Tiap jalur berbentuk {target, gap_addressed, activities[{deskripsi, durasi_estimasi}]}
      warnMissing('follow_up.pengayaan', 'activities', fuContent.pengayaan);
      const fuRow = (label, j) => {
        if (!j) return [label, '-', '-'];
        if (typeof j !== 'object') return [label, '-', txt(j)];
        const acts = (j.activities ?? []).map(a => txt(a.deskripsi ?? a.description ?? a)
          + (a.durasi_estimasi ? ` (${txt(a.durasi_estimasi)})` : ''));
        return [
          label,
          txt(j.target) || '-',
          // Digabung inline dengan penomoran: helper tbl merender satu TextRun,
          // sehingga '\n' tidak akan menjadi baris baru di dokumen Word.
          acts.length ? acts.map((a, i) => `${i + 1}. ${a}`).join('   ') : (txt(j.gap_addressed) || '-'),
        ];
      };
      children.push(tbl(
        ['Jalur','Sasaran','Kegiatan'],
        [
          fuRow('Pengayaan',    fuContent.pengayaan),
          fuRow('Penguatan',    fuContent.penguatan),
          fuRow('Pendampingan', fuContent.pendampingan),
        ],
        [Math.floor(PAGE_WIDTH_DXA*0.18), Math.floor(PAGE_WIDTH_DXA*0.27), Math.floor(PAGE_WIDTH_DXA*0.55)],
      ));
    } else {
      children.push(p('Tindak lanjut belum di-generate.', { color: '888888' }));
    }
    children.push(p(''));
    children.push(...ttdSection());

  } else if (jenis === 'LKS') {
    // Hanya meeting yang worksheet.required=true
    const meetingsWithLks = meetings.filter(m => m.content?.worksheet?.required === true);
    children.push(
      p('LEMBAR KERJA SISWA (LKS)', { bold: true, size: 32, align: AlignmentType.CENTER, after: 60 }),
      p([mapelLabel, jenjangLabel, faseLabel].filter(Boolean).join(' — '), { align: AlignmentType.CENTER, after: 60, color: '444444' }),
      p(`Tahun Ajaran ${tahunAj} | Semester ${semesterStr}`, { align: AlignmentType.CENTER, after: 60, color: '444444' }),
      p(namaGuru, { align: AlignmentType.CENTER, after: 240, color: '666666', size: 22 }),
      hr(),
    );
    if (!meetingsWithLks.length) {
      children.push(p('Tidak ada LKS yang di-generate untuk classroom ini.', { color: '888888' }));
    }
    meetingsWithLks.forEach(m => {
      const ws = m.content?.worksheet ?? {};
      children.push(heading(`LKS Pertemuan ${m.meeting_no}`, 2));
      if (ws.judul || ws.title) children.push(p(ws.judul || ws.title, { bold: true, after: 80 }));
      if (ws.instruksi || ws.instructions) {
        children.push(subheading('Petunjuk Pengerjaan'));
        children.push(p(ws.instruksi || ws.instructions, { size: 22 }));
        children.push(p(''));
      }
      const tasks = ws.tasks ?? ws.soal ?? [];
      if (tasks.length) {
        children.push(subheading('Tugas'));
        tasks.forEach((t, i) => {
          const pertanyaan = t.pertanyaan || t.question || t.instruksi || t.instruction || '';
          const format     = t.format_jawaban || t.answer_format || '';
          children.push(p(`${i + 1}. ${pertanyaan}`, { bold: false, size: 22, after: 40 }));
          if (format) children.push(p(`(Format jawaban: ${format})`, { size: 20, color: '666666', after: 80 }));
          children.push(p('Jawaban: _______________________________________________', { size: 22, after: 120 }));
        });
      }
      const refleksi = ws.refleksi || ws.reflection;
      if (refleksi) {
        children.push(subheading('Refleksi Diri'));
        children.push(p(refleksi, { size: 22 }));
      }
      children.push(p(''));
      children.push(hr());
    });
    children.push(p(''));
    children.push(...ttdSection());
  }

  // ── Generate dan download ────────────────────────────────────────────────
  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const blob = await Packer.toBlob(doc);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  const safeMapel = mapelLabel.replace(/[^a-zA-Z0-9\s\-]/g, '').trim() || 'RPM';
  const now   = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  a.download = `${jenis} - ${safeMapel} - ${now}.docx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
