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
              ...(r.asesmen.instrumen.map(ins => new TableRow({ children: [
                cell(ins.nama   || '-'),
                cell(ins.bobot  ? `${ins.bobot}%` : '-'),
                cell(ins.detail || '-'),
              ]}))),
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
