// classroom-rancang-data.js
// Tanggung jawab: fetch dan transformasi data CP dari JSON lokal
// Dipanggil dari IIFE di classroom-rancang.js via global scope

'use strict';

async function fetchCpData(mapelKey, faseKey) {
  try {
    const res = await fetch('../../shared/data/cp-data.json');
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    const mapelData = data[mapelKey];
    if (!mapelData || !mapelData[faseKey]) return null;
    return mapelData[faseKey];
  } catch {
    return null;
  }
}

function normalizeMapelKey(mapel) {
  return mapel.toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/bahasa_inggris|english/, 'bahasa_inggris')
    .replace(/bahasa_indonesia|b\.ind/, 'bahasa_indonesia')
    .replace(/matematika|math/, 'matematika')
    .replace(/ipa|ilmu_pengetahuan_alam/, 'ipa')
    .replace(/informatika/, 'informatika');
}
