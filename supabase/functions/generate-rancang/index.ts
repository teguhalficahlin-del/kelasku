const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const SYSTEM_PROMPT = `Kamu adalah asisten perancang pembelajaran untuk guru Indonesia.
Keahlianmu: Kurikulum Merdeka, backward design, konteks SMK dan SMA.

Aturan output yang tidak boleh dilanggar:
- Selalu kembalikan JSON valid tanpa teks tambahan apapun
- Jangan tambahkan penjelasan, komentar, atau kalimat pengantar
- Jangan gunakan markdown fence — langsung tulis JSON mentah
- Gunakan bahasa Indonesia yang natural dan praktis untuk guru`;

// ─── Prompt builders ─────────────────────────────────────────────────────────

function buildCpSummaryPrompt(konteks: Record<string, unknown>, elemenList: Array<{ nama: string; cp_normatif: string }>) {
  const lines = elemenList.map((e, i) =>
    `Elemen ${i + 1}: ${e.nama}\nCP Normatif:\n${e.cp_normatif}`
  ).join('\n\n');

  return `Mata pelajaran: ${konteks.mapel}
Jenjang: ${konteks.jenjang}
Fase: ${konteks.fase}

Berikut adalah teks CP normatif untuk setiap elemen:

${lines}

Untuk SETIAP elemen di atas, tulis ringkasan konkret dengan format:
"Bayangkan siswa Anda: [deskripsi kemampuan konkret yang akan dimiliki siswa, bukan parafrase CP]"

ATURAN WAJIB:
1. Cakup SEMUA aspek yang disebutkan dalam teks CP normatif — jangan ada yang dibuang atau digabung menjadi satu frasa umum.
2. Panjang ringkasan proporsional dengan kompleksitas CP: CP yang menyebut banyak kemampuan = ringkasan lebih panjang (boleh 2–4 kalimat).
3. Setiap aspek CP normatif diterjemahkan ke skenario nyata yang bisa dibayangkan guru — bukan bahasa akademik.
4. Fokus pada apa yang akan BISA DILAKUKAN siswa secara nyata di kelas, sehari-hari, atau dunia kerja.

Skema output JSON:
{
  "ringkasan": [
    { "elemen": "Nama Elemen 1", "konkret": "Bayangkan siswa Anda: ..." },
    { "elemen": "Nama Elemen 2", "konkret": "Bayangkan siswa Anda: ..." }
  ]
}`;
}

function buildAtpPrompt(payload: Record<string, unknown>) {
  const { konteks, smk, dnk_dk, preferensi } = payload as Record<string, Record<string, unknown>>;

  const smkSection = smk ? `
Konteks SMK:
- Jurusan: ${smk.jurusan}
- Rumpun: ${smk.rumpun}
- Tujuan utama: ${Array.isArray(smk.tujuan) ? smk.tujuan.join(', ') : smk.tujuan}
- Status PKL: ${smk.status_pkl}
- Pola jadwal: ${smk.pola_jadwal}
- Hubungan DUDI: ${Array.isArray(smk.hubungan_dudi) ? smk.hubungan_dudi.join(', ') : '-'}
- Industri dominan: ${smk.industri_dominan}` : '';

  const dnkSection = dnk_dk ? `
Profil kelas (DNK/DK):
- Kondisi emosi dominan: ${dnk_dk.kondisi_emosi}
- Motivasi belajar: ${dnk_dk.motivasi}
- Gaya belajar dominan: ${dnk_dk.gaya_belajar}
- Pengetahuan awal: ${dnk_dk.pengetahuan_awal}
- Hambatan kognitif: ${dnk_dk.hambatan_kognitif}
- Kesiapan mandiri: ${dnk_dk.kesiapan_mandiri}` : '';

  return `Konteks Pembelajaran:
- Mata pelajaran: ${konteks.mapel}
- Jenjang: ${konteks.jenjang}
- Fase: ${konteks.fase}
- JP per minggu: ${konteks.jp_per_minggu}
${smkSection}
${dnkSection}

Preferensi Guru:
- Karakter kelas: ${Array.isArray(preferensi?.karakter) ? preferensi.karakter.join(', ') : preferensi?.karakter}
- Kemandirian siswa: ${preferensi?.kemandirian}
- Elemen CP diprioritaskan: ${Array.isArray(preferensi?.prioritas_elemen) ? preferensi.prioritas_elemen.join(', ') : preferensi?.prioritas_elemen}
- Pendekatan pembelajaran: ${preferensi?.pendekatan}
- Gaya mengajar: ${preferensi?.gaya_mengajar}
- Cara penilaian utama: ${preferensi?.penilaian_utama}

Tugas: Susun 6–12 Tujuan Pembelajaran (TP) yang membentuk alur koheren untuk satu tahun penuh (dua semester). Setiap TP harus:
1. Ditulis dengan kata kerja operasional yang bisa diobservasi
2. Menunjukkan jenjang taksonomi yang meningkat (dari mudah ke kompleks)
3. Relevan dengan konteks siswa dan preferensi guru
4. Jika JP per minggu tersedia, hitung estimasi JP per TP berdasarkan jumlah minggu efektif (asumsi 36 minggu/tahun dikurangi UTS, UAS, dan libur nasional = sekitar 28 minggu efektif)
5. Tandai setiap TP dengan semester (1 atau 2) agar guru tahu kapan TP tersebut diajarkan

Skema output JSON:
{
  "tp_list": [
    {
      "urutan": 1,
      "semester": 1,
      "judul": "Judul singkat TP",
      "deskripsi": "Kalimat TP lengkap dengan kata kerja operasional",
      "elemen_cp": "Nama elemen CP yang dikover",
      "estimasi_jp": 4,
      "catatan": "Alasan urutan / konteks khusus (opsional)"
    }
  ]
}`;
}

function buildRencanaPrompt(payload: Record<string, unknown>) {
  const { konteks, smk, dnk_dk, preferensi, tp_terpilih, konteks_kelas } = payload as Record<string, Record<string, unknown>>;

  return `Tujuan Pembelajaran yang dirancang:
- Judul: ${tp_terpilih?.judul}
- Deskripsi: ${tp_terpilih?.deskripsi}
- Elemen CP: ${tp_terpilih?.elemen_cp}
- Estimasi JP: ${tp_terpilih?.estimasi_jp} JP (@ ${konteks?.jp_per_minggu} JP/minggu)

Konteks:
- Mata pelajaran: ${konteks?.mapel}
- Jenjang: ${konteks?.jenjang} — Fase: ${konteks?.fase}
${smk ? `- Jurusan SMK: ${smk.jurusan}, Rumpun: ${smk.rumpun}` : ''}
${dnk_dk ? `- Profil kelas: emosi ${dnk_dk.kondisi_emosi}, motivasi ${dnk_dk.motivasi}, gaya belajar ${dnk_dk.gaya_belajar}` : ''}

Preferensi Guru:
- Pendekatan: ${preferensi?.pendekatan}
- Gaya mengajar: ${preferensi?.gaya_mengajar}
- Penilaian utama: ${preferensi?.penilaian_utama}

Kondisi Kelas:
- Jumlah siswa: ${konteks_kelas?.jumlah_siswa}
- ABK: ${konteks_kelas?.abk}
- Fasilitas: ${Array.isArray(konteks_kelas?.fasilitas) ? konteks_kelas.fasilitas.join(', ') : konteks_kelas?.fasilitas}
- Situasi HP: ${konteks_kelas?.situasi_hp}
- Akses internet: ${konteks_kelas?.akses_internet}
- Materi cetak: ${Array.isArray(konteks_kelas?.materi_cetak) ? konteks_kelas.materi_cetak.join(', ') : konteks_kelas?.materi_cetak}
- Aktivitas dihindari: ${Array.isArray(konteks_kelas?.aktivitas_dihindari) ? konteks_kelas.aktivitas_dihindari.join(', ') : '-'}
- Kendala kelas: ${Array.isArray(konteks_kelas?.kendala) ? konteks_kelas.kendala.join(', ') : '-'}
${konteks_kelas?.daerah ? `- Daerah: ${konteks_kelas.daerah}` : ''}

Hasilkan rencana pembelajaran dalam 5 komponen. Sesuaikan dengan kondisi nyata kelas — jangan rekomendasikan alat/metode yang tidak tersedia.

Skema output JSON:
{
  "tujuan_praktis": "Tujuan pembelajaran dalam bahasa yang mudah dipahami siswa (1–2 kalimat)",
  "pertemuan": [
    {
      "no": 1,
      "judul": "Judul pertemuan",
      "durasi_jp": 2,
      "aktivitas": "Deskripsi urutan aktivitas belajar",
      "sumber": "Sumber/media yang digunakan",
      "catatan_guru": "Tips pelaksanaan"
    }
  ],
  "asesmen": {
    "jenis": "Jenis asesmen",
    "instrumen": "Deskripsi instrumen/soal",
    "kktp": [
      { "level": "Baru Berkembang", "deskripsi": "..." },
      { "level": "Berkembang Sesuai Harapan", "deskripsi": "..." },
      { "level": "Sangat Berkembang", "deskripsi": "..." }
    ]
  },
  "lks": {
    "judul": "Judul LKS",
    "instruksi": "Petunjuk pengerjaan",
    "pertanyaan": ["Pertanyaan 1", "Pertanyaan 2", "Pertanyaan 3"]
  },
  "tindak_lanjut": {
    "pengayaan": "Aktivitas untuk siswa yang sudah mencapai TP",
    "penguatan": "Aktivitas untuk siswa yang hampir mencapai TP",
    "pendampingan": "Aktivitas untuk siswa yang belum mencapai TP"
  }
}`;
}

// ─── API helper ──────────────────────────────────────────────────────────────

async function callWithRetry(payload: Record<string, unknown>, maxRetry = 2): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')!;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('Anthropic API error:', res.status, errText);
        if (res.status >= 400 && res.status < 500) {
          throw new Error(`Anthropic 4xx: ${res.status}`);
        }
        lastErr = new Error(`Anthropic ${res.status}: ${errText}`);
        continue;
      }
      const data = await res.json();
      return data?.content?.[0]?.text ?? '';
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Anthropic 4xx')) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

// ─── JSON extractor ───────────────────────────────────────────────────────────

function extractJson(raw: string): unknown {
  try { return JSON.parse(raw.trim()); } catch (_) {}
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch (_) {} }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1).trim()); } catch (_) {} }
  throw new Error('Tidak bisa ekstrak JSON dari output AI');
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method tidak diizinkan' }, 405);
  }

  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    return json({ error: 'Konfigurasi server tidak lengkap' }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body tidak valid' }, 400);
  }

  const { mode, konteks, smk, dnk_dk, preferensi, tp_terpilih, konteks_kelas, elemen_list } = body;

  if (!mode || !['cp_summary', 'atp', 'rencana'].includes(mode as string)) {
    return json({ error: 'mode harus: cp_summary | atp | rencana' }, 400);
  }

  let prompt: string;
  let maxTokens: number;

  if (mode === 'cp_summary') {
    if (!konteks || !Array.isArray(elemen_list) || elemen_list.length === 0) {
      return json({ error: 'cp_summary membutuhkan konteks dan elemen_list' }, 400);
    }
    prompt = buildCpSummaryPrompt(
      konteks as Record<string, unknown>,
      elemen_list as Array<{ nama: string; cp_normatif: string }>
    );
    maxTokens = 2000;
  } else if (mode === 'atp') {
    if (!konteks || !preferensi) {
      return json({ error: 'atp membutuhkan konteks dan preferensi' }, 400);
    }
    prompt = buildAtpPrompt({ konteks, smk, dnk_dk, preferensi });
    maxTokens = 2000;
  } else {
    if (!konteks || !tp_terpilih || !konteks_kelas) {
      return json({ error: 'rencana membutuhkan konteks, tp_terpilih, dan konteks_kelas' }, 400);
    }
    prompt = buildRencanaPrompt({ konteks, smk, dnk_dk, preferensi, tp_terpilih, konteks_kelas });
    maxTokens = 6000;
  }

  try {
    const raw = await callWithRetry({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch {
      console.error('Gagal parse JSON dari AI:', raw.slice(0, 200));
      return json({ error: 'AI menghasilkan format yang tidak valid. Coba lagi.' }, 502);
    }

    return json({ result: parsed });
  } catch (err) {
    console.error('generate-rancang error:', err);
    return json({ error: 'Terjadi kesalahan server. Coba lagi.' }, 500);
  }
});
