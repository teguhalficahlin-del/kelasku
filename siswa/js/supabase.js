const SUPABASE_URL = 'https://teccdzetrdjowqemnuuc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7T4Y9_ty5cN6_NIZ4TalXA_ByYNtSwG';
window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storageKey: 'sb-siswa-auth', storage: window.localStorage }
});
