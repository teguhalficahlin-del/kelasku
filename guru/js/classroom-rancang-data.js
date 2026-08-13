// classroom-rancang-data.js
// Tanggung jawab: fetch dan transformasi data CP dari JSON lokal
// Dipanggil dari IIFE di classroom-rancang.js via global scope

'use strict';

let _cpDataCache = null;

async function loadCpData() {
  if (_cpDataCache) return _cpDataCache;
  try {
    const isGhPages = location.hostname.includes('github.io');
    const base = isGhPages
      ? location.pathname.split('/').slice(0, 2).join('/')
      : '';
    const res = await fetch(`${base}/shared/data/cp-data.json`);
    if (!res.ok) throw new Error('fetch failed');
    _cpDataCache = await res.json();
    return _cpDataCache;
  } catch {
    return null;
  }
}

async function fetchCpData(mapelKey, faseKey) {
  const data = await loadCpData();
  if (!data) return null;
  const mapelData = data[mapelKey];
  if (!mapelData || !mapelData[faseKey]) return null;
  return mapelData[faseKey];
}

function normalizeMapelKey(mapel) {
  if (!mapel) return '';
  const raw = mapel.toLowerCase().replace(/[-\s]+/g, '_').replace(/[^a-z0-9_]/g, '');

  // Exact atau partial match — urutan penting (lebih spesifik dulu)
  const mapping = [
    [/pendidikan_agama_islam|pai|agama_islam/, 'pendidikan_agama_islam'],
    [/pendidikan_agama_kristen|agama_kristen/, 'pendidikan_agama_kristen'],
    [/pendidikan_agama_katolik|agama_katolik/, 'pendidikan_agama_katolik'],
    [/pendidikan_agama_hindu|agama_hindu/, 'pendidikan_agama_hindu'],
    [/pendidikan_agama_buddha|agama_buddha/, 'pendidikan_agama_buddha'],
    [/pendidikan_agama_khonghucu|agama_khonghucu/, 'pendidikan_agama_khonghucu'],
    [/pendidikan_pancasila|ppkn|pkn/, 'pendidikan_pancasila'],
    [/bahasa_indonesia|b_ind/, 'bahasa_indonesia'],
    [/bahasa_inggris|english|b_ing/, 'bahasa_inggris'],
    [/bahasa_arab/, 'bahasa_arab'],
    [/bahasa_jepang/, 'bahasa_jepang'],
    [/bahasa_jerman/, 'bahasa_jerman'],
    [/bahasa_korea/, 'bahasa_korea'],
    [/bahasa_mandarin|bahasa_cina/, 'bahasa_mandarin'],
    [/bahasa_prancis/, 'bahasa_prancis'],
    [/matematika|math/, 'matematika'],
    [/ilmu_pengetahuan_alam_dan_sosial|ipas/, 'ipas'],
    [/ilmu_pengetahuan_alam|ipa$/, 'ipa'],
    [/ilmu_pengetahuan_sosial|ips$/, 'ips'],
    [/projek_ipas/, 'projek_ipas'],
    [/informatika/, 'informatika'],
    [/sejarah_indonesia|sejarah/, 'sejarah'],
    [/geografi/, 'geografi'],
    [/ekonomi/, 'ekonomi'],
    [/sosiologi/, 'sosiologi'],
    [/antropologi/, 'antropologi'],
    [/fisika/, 'fisika'],
    [/kimia/, 'kimia'],
    [/biologi/, 'biologi'],
    [/pjok|pendidikan_jasmani/, 'pjok'],
    [/seni_musik|musik/, 'seni_musik'],
    [/seni_rupa|rupa/, 'seni_rupa'],
    [/seni_teater|teater/, 'seni_teater'],
    [/seni_tari|tari/, 'seni_tari'],
    [/prakarya_dan_kewirausahaan|prakarya/, 'prakarya_dan_kewirausahaan'],
    [/projek_kreatif_kewirausahaan/, 'projek_kreatif_kewirausahaan'],
  ];

  for (const [pattern, key] of mapping) {
    if (pattern.test(raw)) return key;
  }

  // Fallback: gunakan raw key langsung (untuk mapel SMK spesifik)
  return raw;
}
