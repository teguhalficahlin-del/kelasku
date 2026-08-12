// classroom-rancang-data.js
// Tanggung jawab: fetch dan transformasi data CP dari JSON lokal
// Dipanggil dari IIFE di classroom-rancang.js via global scope

'use strict';

let _cpDataCache = null;

async function loadCpData() {
  if (_cpDataCache) return _cpDataCache;
  try {
    const res = await fetch('../../shared/data/cp-data.json');
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
  return mapel.toLowerCase()
    .replace(/[-\s]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/bahasa_inggris|english/, 'bahasa_inggris')
    .replace(/bahasa_indonesia|b\.ind/, 'bahasa_indonesia')
    .replace(/matematika|math/, 'matematika')
    .replace(/ipa|ilmu_pengetahuan_alam/, 'ipa')
    .replace(/informatika/, 'informatika');
}
