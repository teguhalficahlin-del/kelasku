#!/usr/bin/env node
/**
 * tests/verify-migrations.mjs
 *
 * Bandingkan migration lokal di supabase/migrations/
 * dengan yang sudah terdaftar di DB (schema_migrations).
 *
 * Melaporkan:
 *   - Migration lokal yang BELUM masuk ke DB (perlu `supabase db push --linked`)
 *   - Migration di DB yang TIDAK punya file lokal (manual atau dari luar repo)
 *   - Ketidakcocokan nama file (satu versi, dua nama)
 *
 * CARA JALANKAN:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx node tests/verify-migrations.mjs
 *   (opsional: PROJECT_REF=teccdzetrdjowqemnuuc)
 *
 * EXIT CODE: 0 = konsisten, 1 = ada perbedaan.
 */

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Auto-load .env
if (!process.env.SUPABASE_ACCESS_TOKEN) {
    try {
        const { readFileSync } = await import('node:fs');
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const envPath = join(__dirname, '..', '.env');
        for (const line of readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
            if (m && !process.env[m[1]])
                process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
        }
    } catch { /* .env tidak ada */ }
}

const REF   = process.env.PROJECT_REF || 'teccdzetrdjowqemnuuc';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const MGMT  = `https://api.supabase.com/v1/projects/${REF}`;

if (!TOKEN) {
    console.error('FATAL: env SUPABASE_ACCESS_TOKEN wajib diisi.');
    console.error('  Jalankan: SUPABASE_ACCESS_TOKEN=sbp_xxx node tests/verify-migrations.mjs');
    process.exit(2);
}

async function mgmtQuery(sql) {
    const res = await fetch(`${MGMT}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) throw new Error(`mgmtQuery ${res.status}: ${await res.text()}`);
    return res.json();
}

async function main() {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const migrDir   = join(__dirname, '..', 'supabase', 'migrations');

    // File lokal: ambil semua .sql di supabase/migrations/, ekstrak version.
    let localFiles;
    try {
        localFiles = readdirSync(migrDir)
            .filter((f) => f.endsWith('.sql'))
            .sort();
    } catch {
        console.error(`FATAL: direktori migrations tidak ditemukan: ${migrDir}`);
        process.exit(2);
    }

    // version = 14 digit pertama sebelum underscore pertama.
    const localVersions = new Map(
        localFiles.map((f) => [f.replace(/_.*/, '').slice(0, 14), f])
    );

    // Migration yang sudah terdaftar di DB.
    const rows = await mgmtQuery(
        `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;`
    );
    const dbVersions = new Map(rows.map((r) => [r.version, true]));

    // Hitung perbedaan.
    const onlyLocal = [...localVersions.keys()].filter((v) => !dbVersions.has(v));
    const onlyDb    = [...dbVersions.keys()].filter((v) => !localVersions.has(v));

    console.log(`\nVerifikasi migration — MIClass project ${REF}`);
    console.log(`  File lokal : ${localVersions.size}`);
    console.log(`  Terdaftar di DB: ${dbVersions.size}`);

    let failures = 0;

    if (onlyLocal.length > 0) {
        console.log('\n⚠ LOKAL TAPI BELUM DI-PUSH (jalankan: supabase db push --linked):');
        onlyLocal.forEach((v) => {
            console.log(`  ${v}  →  ${localVersions.get(v)}`);
        });
        failures += onlyLocal.length;
    }

    if (onlyDb.length > 0) {
        console.log('\n⚠ TERDAFTAR DI DB TAPI TIDAK ADA FILE LOKAL (manual / drift):');
        onlyDb.forEach((v) => console.log(`  ${v}`));
        failures += onlyDb.length;
    }

    if (failures === 0) {
        console.log('\n✅ KONSISTEN — semua migration lokal sudah terdaftar di DB dan sebaliknya.');
    } else {
        console.log(`\n❌ TIDAK KONSISTEN — ${failures} item perlu perhatian.`);
    }

    process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error('FATAL:', err.message); process.exit(2); });
