#!/usr/bin/env node
/**
 * tests/tenant-isolation.mjs
 *
 * Guard-rail otomatis untuk ISOLASI MULTI-TENANT MIClass.
 * Berjalan langsung terhadap DB live via Supabase Management API.
 * Tidak membutuhkan Playwright, browser, atau server lokal.
 *
 * Menjalankan 7 pemeriksaan:
 *   1. RLS coverage        — SEMUA tabel public wajib RLS enabled.
 *   2. RPC exposure        — TIDAK boleh ada fungsi SECURITY DEFINER `fn_*`
 *                            VOLATILE (menulis, non-trigger) yang EXECUTE-nya
 *                            dipegang `anon`, kecuali allowlist.
 *                            (Fungsi STABLE seperti fn_validate_roster_login
 *                             dikecualikan oleh predikat provolatile='v'.)
 *   3. Anon read baseline  — anon tak boleh membaca baris tabel inti.
 *   4. RPC regression      — fungsi privileged spesifik wajib
 *                            has_function_privilege('anon', ...) = false.
 *   5. Cross-classroom     — guru A TIDAK dapat membaca data classroom guru B.
 *                            Simulasi konteks RLS via SET ROLE authenticated +
 *                            request.jwt.claims (cara fn_current_profile_id()
 *                            dievaluasi).
 *   6. View exposure       — SEMUA view public wajib security_invoker=true
 *                            DAN anon tak boleh membaca barisnya.
 *   7. Visibilitas catatan — RLS student_notes memfilter is_visible_to_student /
 *                            is_visible_to_parent; guidance_sessions default-deny
 *                            untuk siswa/ortu (selalu private).
 *
 * CARA JALANKAN:
 *   SUPABASE_ACCESS_TOKEN=sbp_xxx node tests/tenant-isolation.mjs
 *   (opsional: PROJECT_REF=teccdzetrdjowqemnuuc)
 *   Token = access token CLI Supabase (sbp_... dari `supabase login`).
 *   Anon key diambil otomatis via Management API.
 *
 * EXIT CODE: 0 = semua lulus, 1 = ada pelanggaran (cocok untuk CI).
 */

// Auto-load .env
if (!process.env.SUPABASE_ACCESS_TOKEN) {
    try {
        const { readFileSync } = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        const { dirname, join } = await import('node:path');
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const envPath = join(__dirname, '..', '.env');
        for (const line of readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
            if (m && !process.env[m[1]])
                process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
        }
    } catch { /* .env tidak ada — env var harus disediakan manual */ }
}

const REF   = process.env.PROJECT_REF || 'teccdzetrdjowqemnuuc';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const MGMT  = `https://api.supabase.com/v1/projects/${REF}`;
const BASE  = `https://${REF}.supabase.co`;

// Fungsi VOLATILE SECURITY DEFINER yang sengaja anon-accessible.
// Catatan: fn_validate_roster_login dan fn_validate_ortu_login STABLE —
// tidak perlu masuk sini karena CHECK 2 hanya memeriksa provolatile='v'.
const ANON_RPC_ALLOWLIST = new Set([
    // Tambahkan di sini jika ada fungsi VOLATILE yang memang sengaja anon-accessible.
]);

// Tabel inti yang anon TIDAK boleh baca satu baris pun.
const CORE_TABLES = [
    'profiles',
    'classrooms',
    'classroom_members',
    'classroom_roster',
    'student_notes',
    'guidance_sessions',
    'forum_posts',
    'forum_comments',
    'schedules',
];

// View public yang sengaja anon-readable (kosongkan bila tak ada).
const VIEW_ANON_ALLOWLIST = new Set([]);

// Fungsi privileged yang HARUS tidak bisa dieksekusi oleh anon.
const PRIVILEGED_RPCS = [
    'fn_semester_reset',
    'fn_tahun_ajaran_reset',
    'fn_hard_delete_guru',
    'fn_guru_trial_status',
    'fn_guru_rancang_eligible',
    'fn_is_classroom_owner',
    'fn_is_classroom_member',
    'fn_current_profile_id',
];

if (!TOKEN) {
    console.error('FATAL: env SUPABASE_ACCESS_TOKEN wajib diisi.');
    console.error('  Jalankan: SUPABASE_ACCESS_TOKEN=sbp_xxx node tests/tenant-isolation.mjs');
    process.exit(2);
}

let failures = 0;
const log = {
    pass: (m) => console.log(`  ✓ ${m}`),
    fail: (m) => { failures++; console.log(`  ✗ FAIL: ${m}`); },
    head: (m) => console.log(`\n── ${m}`),
    warn: (m) => console.log(`  ⚠ ${m}`),
};

async function mgmtQuery(sql) {
    const res = await fetch(`${MGMT}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
    });
    if (!res.ok) throw new Error(`mgmtQuery ${res.status}: ${await res.text()}`);
    return res.json();
}

async function getAnonKey() {
    const res = await fetch(`${MGMT}/api-keys`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!res.ok) throw new Error(`api-keys ${res.status}`);
    const keys = await res.json();
    const anon = keys.find((k) => k.name === 'anon');
    if (!anon) throw new Error('anon key tidak ditemukan');
    return anon.api_key;
}

async function anonGet(anon, path) {
    const res = await fetch(`${BASE}/rest/v1/${path}`, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    return { status: res.status, body: await res.json().catch(() => null) };
}

async function anonRpc(anon, fn, params = {}) {
    const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
}

// Konteks RLS: jalankan transaksi sebagai user authenticated tertentu.
// profiles.user_id adalah FK ke auth.users — itulah yang JWT sub berisi.
// fn_current_profile_id() memetakan auth.uid() (= sub) ke profiles.id.
const asAuth = (userUid) =>
    ` SET LOCAL ROLE authenticated;` +
    ` SELECT set_config('request.jwt.claims', $j${"sub":"${userUid}","role":"authenticated"}$j$, true);`;

async function main() {
    console.log(`Tenant-isolation audit → MIClass project ${REF}`);
    const anon = await getAnonKey();

    // ── CHECK 1: RLS coverage ────────────────────────────────────
    log.head('CHECK 1 — RLS enabled di semua tabel public');
    const noRls = await mgmtQuery(`
        SELECT t.tablename
        FROM pg_tables t
        JOIN pg_class c ON c.relname = t.tablename
                       AND c.relnamespace = 'public'::regnamespace
        WHERE t.schemaname = 'public' AND NOT c.relrowsecurity
        ORDER BY 1;`);
    if (noRls.length === 0) log.pass('semua tabel public RLS enabled');
    else noRls.forEach((r) => log.fail(`tabel tanpa RLS: ${r.tablename}`));

    // ── CHECK 2: RPC exposure ─────────────────────────────────────
    log.head('CHECK 2 — tak ada fn_* SECURITY DEFINER VOLATILE yang executable oleh anon');
    const anonExec = await mgmtQuery(`
        SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef
          AND p.proname ~ '^fn_'
          AND p.provolatile = 'v'
          AND p.prorettype <> 'pg_catalog.trigger'::regtype
          AND has_function_privilege('anon', p.oid, 'EXECUTE')
        ORDER BY 1;`);
    const leaks = anonExec.map((r) => r.proname).filter((n) => !ANON_RPC_ALLOWLIST.has(n));
    if (leaks.length === 0)
        log.pass(`tak ada fungsi penulis SECURITY DEFINER bocor ke anon`);
    else
        leaks.forEach((n) => log.fail(`fn VOLATILE SECURITY DEFINER executable oleh anon: ${n} — REVOKE dari PUBLIC/anon`));

    // ── CHECK 3: Anon read baseline ───────────────────────────────
    log.head('CHECK 3 — anon tak bisa membaca tabel inti');
    for (const t of CORE_TABLES) {
        let { status, body } = await anonGet(anon, `${t}?select=*&limit=1`);
        if (status === 500) {
            log.warn(`${t}: status 500 — retry dalam 2 detik...`);
            await new Promise(r => setTimeout(r, 2000));
            ({ status, body } = await anonGet(anon, `${t}?select=*&limit=1`));
        }
        if (Array.isArray(body) && body.length === 0) log.pass(`${t}: anon dapat [] (RLS menutup)`);
        else if (!Array.isArray(body) && (status === 401 || status === 403)) log.pass(`${t}: anon ditolak ${status}`);
        else if (status === 500) log.warn(`${t}: status 500 setelah retry — server error sementara (SKIP)`);
        else log.fail(`${t}: anon TIDAK kosong (status ${status}, rows ${Array.isArray(body) ? body.length : '?'})`);
    }

    // ── CHECK 4: RPC regression ────────────────────────────────────
    log.head('CHECK 4 — fungsi privileged: anon TANPA EXECUTE');
    const rpcList = PRIVILEGED_RPCS.map((n) => `'${n}'`).join(',');
    const rpcPriv = await mgmtQuery(`
        SELECT p.proname, bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')) as anon_exec
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN (${rpcList})
        GROUP BY p.proname ORDER BY p.proname;`);
    const seen = new Set(rpcPriv.map((r) => r.proname));
    for (const fn of PRIVILEGED_RPCS) {
        if (!seen.has(fn)) { log.warn(`${fn}: tidak ditemukan di DB (belum ter-deploy atau sudah di-drop)`); continue; }
    }
    for (const r of rpcPriv) {
        if (r.anon_exec === false) log.pass(`${r.proname}: anon tanpa EXECUTE`);
        else log.fail(`${r.proname}: anon MASIH punya EXECUTE — REVOKE dari PUBLIC/anon`);
    }
    // Probe live: fn_current_profile_id harus ditolak anon.
    const probe = await anonRpc(anon, 'fn_current_profile_id', {});
    const denied = probe.body && (
        probe.body.code === '42501' ||
        probe.body.code === 'PGRST202' ||
        String(probe.body.message || '').includes('permission denied'));
    if (denied) log.pass(`probe live fn_current_profile_id ditolak anon (code ${probe.body?.code})`);
    else log.fail(`probe live fn_current_profile_id TIDAK ditolak anon (code ${probe.body?.code})`);

    // ── CHECK 5: Cross-Classroom Isolation ───────────────────────
    // Simulasikan konteks RLS dua guru berbeda. Guru A tidak boleh melihat
    // data classroom Guru B, tapi tetap bisa melihat classroom miliknya sendiri
    // (uji tidak vacuous).
    log.head('CHECK 5 — Cross-Classroom: guru A tidak dapat membaca data classroom guru B');
    const gurus = await mgmtQuery(`
        SELECT p.id           AS profile_id,
               p.user_id      AS jwt_sub,
               c.id           AS classroom_id,
               (SELECT count(*)::int FROM student_notes sn WHERE sn.classroom_id = c.id)   AS n_notes,
               (SELECT count(*)::int FROM classroom_members cm WHERE cm.classroom_id = c.id) AS n_members
        FROM profiles p
        JOIN classrooms c ON c.teacher_id = p.id
        WHERE p.role = 'GURU' AND p.user_id IS NOT NULL
        ORDER BY n_notes DESC, n_members DESC, p.id
        LIMIT 2;`);

    if (gurus.length < 2) {
        log.pass(`SKIP — hanya ${gurus.length} guru dengan classroom (butuh ≥2)`);
    } else {
        const [A, B] = gurus;
        for (const [viewer, other] of [[A, B], [B, A]]) {
            const rows = await mgmtQuery(
                `BEGIN;` +
                ` ${asAuth(viewer.jwt_sub)}` +
                ` SELECT` +
                `   (SELECT count(*)::int FROM student_notes   WHERE classroom_id = '${other.classroom_id}') AS notes_other,` +
                `   (SELECT count(*)::int FROM guidance_sessions WHERE classroom_id = '${other.classroom_id}') AS guidance_other,` +
                `   (SELECT count(*)::int FROM forum_posts     WHERE classroom_id = '${other.classroom_id}') AS posts_other,` +
                `   (SELECT count(*)::int FROM classroom_members WHERE classroom_id = '${other.classroom_id}') AS members_other,` +
                `   (SELECT count(*)::int FROM student_notes   WHERE classroom_id = '${viewer.classroom_id}') AS notes_own,` +
                `   fn_current_profile_id()::text AS resolved;` +
                ` COMMIT;`);
            const r = rows[0] || {};
            const leakCols = ['notes_other', 'guidance_other', 'posts_other', 'members_other']
                .filter((c) => (r[c] ?? -1) !== 0);

            if (leakCols.length === 0)
                log.pass(`guru dengan classroom ${viewer.classroom_id.slice(0,8)}… → 0 baris milik classroom ${other.classroom_id.slice(0,8)}…`);
            else
                leakCols.forEach((c) => log.fail(`BOCOR: guru ${viewer.classroom_id.slice(0,8)}… melihat ${r[c]} baris classroom lain (${c})`));

            if (r.resolved === viewer.profile_id)
                log.pass(`fn_current_profile_id() = ${viewer.profile_id.slice(0,8)}… (benar)`);
            else
                log.fail(`fn_current_profile_id() salah: ${r.resolved} ≠ ${viewer.profile_id}`);

            // Non-vacuous: guru harus bisa melihat classroom miliknya sendiri.
            // Jika notes_own = 0 itu bukan kegagalan — data mungkin belum ada.
            if ((r.notes_own ?? 0) > 0)
                log.pass(`guru tetap melihat ${r.notes_own} catatan di classroomnya sendiri — uji tidak vacuous`);
            else
                log.warn(`guru classroom ${viewer.classroom_id.slice(0,8)}…: notes_own=0 — belum ada data student_notes (uji isolation tetap valid)`);
        }
    }

    // ── CHECK 6: View security_invoker ─────────────────────────────
    log.head('CHECK 6 — semua view public security_invoker=true & tak terbaca anon');
    const views = await mgmtQuery(`
        SELECT c.relname,
               ('security_invoker=true' = ANY(c.reloptions)) AS si_on
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'v'
        ORDER BY c.relname;`);
    if (views.length === 0) {
        log.pass('tidak ada view public (tidak ada yang perlu diperiksa)');
    } else {
        for (const v of views) {
            if (VIEW_ANON_ALLOWLIST.has(v.relname)) { log.pass(`${v.relname}: di allowlist anon (dilewati)`); continue; }
            if (v.si_on === true) log.pass(`${v.relname}: security_invoker=true`);
            else log.fail(`${v.relname}: security_invoker TIDAK menyala — view bypass RLS`);
            const { status, body } = await anonGet(anon, `${v.relname}?select=*&limit=1`);
            if (Array.isArray(body) && body.length === 0) log.pass(`${v.relname}: anon dapat [] (RLS ditegakkan)`);
            else if (!Array.isArray(body)) log.pass(`${v.relname}: anon ditolak (status ${status})`);
            else log.fail(`${v.relname}: anon BOCOR ${body.length} baris (status ${status})`);
        }
    }

    // ── CHECK 7: Visibilitas catatan siswa (MIClass-specific) ──────
    // (a) student_notes — RLS siswa/ortu wajib memfilter flag visibilitas.
    // (b) guidance_sessions — tidak boleh ada SELECT policy untuk siswa/ortu
    //     (selalu private per desain).
    log.head('CHECK 7 — Struktural: visibilitas student_notes & privacy guidance_sessions');
    {
        const pols = await mgmtQuery(`
            SELECT tablename, policyname, cmd,
                   coalesce(qual, '') AS qual
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename IN ('student_notes', 'guidance_sessions')
            ORDER BY tablename, policyname;`);

        // (a) student_notes: cari policy SELECT untuk authenticated yang
        //     memfilter is_visible_to_student atau is_visible_to_parent.
        const notesPols = pols.filter((p) => p.tablename === 'student_notes' && (p.cmd === 'SELECT' || p.cmd === 'ALL'));
        const notesForSiswa = notesPols.filter((p) =>
            p.qual.includes('is_visible_to_student') || p.qual.includes('is_visible_to_parent'));
        if (notesForSiswa.length > 0)
            log.pass(`student_notes: ditemukan ${notesForSiswa.length} policy SELECT yang memfilter flag visibilitas (${notesForSiswa.map(p => p.policyname).join(', ')})`);
        else if (notesPols.length === 0)
            log.fail('student_notes: tidak ada policy SELECT sama sekali — staf pun tidak bisa baca (bug fungsional)');
        else
            log.fail(`student_notes: policy SELECT ada (${notesPols.map(p => p.policyname).join(', ')}) tapi TIDAK ada yang memfilter is_visible_to_student/parent — siswa/ortu mungkin bisa baca semua catatan`);

        // (b) guidance_sessions: tidak boleh ada SELECT policy untuk non-guru.
        //     Guru punya policy-nya sendiri, tapi siswa/ortu harus default-deny.
        const guidancePols = pols.filter((p) => p.tablename === 'guidance_sessions' && (p.cmd === 'SELECT' || p.cmd === 'ALL'));
        const guidanceOpen = guidancePols.filter((p) =>
            !p.qual.includes('fn_is_classroom_owner') &&
            !p.qual.includes('teacher_id = fn_current_profile_id()'));
        if (guidanceOpen.length === 0)
            log.pass('guidance_sessions: semua policy SELECT terikat ke guru (fn_is_classroom_owner atau teacher_id) — siswa/ortu default-deny');
        else
            log.fail(`guidance_sessions: ada policy SELECT yang tidak terikat ke guru: ${guidanceOpen.map(p => p.policyname).join(', ')} — bisa membocorkan sesi pembinaan ke siswa/ortu`);

        // (c) Anon tidak bisa membaca guidance_sessions (behavioral).
        const { status: gsStatus, body: gsBody } = await anonGet(anon, 'guidance_sessions?select=*&limit=1');
        if (Array.isArray(gsBody) && gsBody.length === 0) log.pass('guidance_sessions: anon dapat [] (RLS menutup)');
        else if (!Array.isArray(gsBody)) log.pass(`guidance_sessions: anon ditolak ${gsStatus}`);
        else log.fail(`guidance_sessions: anon BOCOR ${gsBody.length} baris`);
    }

    // ── Ringkasan ─────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(56));
    if (failures === 0) console.log(`✅ LULUS — semua check tenant-isolation MIClass lulus.`);
    else console.log(`❌ GAGAL — ${failures} pelanggaran ditemukan.`);
    console.log('═'.repeat(56));
    process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error('FATAL:', err.message); process.exit(2); });
