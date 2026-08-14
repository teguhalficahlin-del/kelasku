(function () {
  const client = window.supabaseClient;

  window.api = {

    getSession() {
      return client.auth.getSession();
    },

    async getProfile(userId) {
      return client
        .from('profiles')
        .select('id, full_name, role_guru')
        .eq('user_id', userId)
        .single();
    },

    async getClassrooms(teacherId) {
      return client
        .from('classrooms')
        .select('id, name, subject, classroom_code, description')
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false });
    },

    async getRosterCount(classroomId) {
      const { count, error } = await client
        .from('classroom_roster')
        .select('*', { count: 'exact', head: true })
        .eq('classroom_id', classroomId);
      if (error) return 0;
      return count ?? 0;
    },

    async createClassroom(teacherId, name, subject, description) {
      return client
        .from('classrooms')
        .insert({ teacher_id: teacherId, name, subject, description: description || null })
        .select('id, name, subject, classroom_code, description')
        .single();
    },

    async getScheduleCount(classroomId) {
      const { count, error } = await client
        .from('schedules')
        .select('*', { count: 'exact', head: true })
        .eq('classroom_id', classroomId);
      if (error) return 0;
      return count ?? 0;
    },

    async getClassroomStats(id) {
      const [memberRes, attendRes] = await Promise.all([
        client.from('classroom_members')
          .select('*', { count: 'exact', head: true })
          .eq('classroom_id', id)
          .eq('member_role', 'SISWA'),
        client.from('attendance')
          .select('*', { count: 'exact', head: true })
          .eq('classroom_id', id),
      ]);
      return {
        members:  memberRes.count ?? 0,
        sessions: attendRes.count ?? 0,
        error:    memberRes.error || attendRes.error || null,
      };
    },

    async deleteClassroom(id) {
      return client.from('classrooms').delete().eq('id', id);
    },

    async updateClassroom(id, name, subject, description) {
      return client
        .from('classrooms')
        .update({ name, subject, description: description || null })
        .eq('id', id)
        .select('id, name, subject, classroom_code, description')
        .single();
    },

    async getTrialStatus() {
      const { data, error } = await client.rpc('fn_guru_trial_status');
      if (error) return null;
      return data;
    },

    signOut() {
      return client.auth.signOut();
    },

    // ── Rancang Settings ───────────────────────────────────────
    async getRancangSettings(classroomId) {
      const { data, error } = await client
        .from('rancang_settings')
        .select('*')
        .eq('classroom_id', classroomId)
        .maybeSingle();
      if (error) return null;
      return data;
    },

    async updateClassroomRancang(id, payload) {
      return client
        .from('classrooms')
        .update(payload)
        .eq('id', id)
        .select('id, jenjang, mapel_key, bidang_keahlian, program_keahlian, elemen_terpilih')
        .single();
    },

    async upsertRancangSettings(classroomId, payload) {
      const { data, error } = await client
        .from('rancang_settings')
        .upsert(
          { classroom_id: classroomId, ...payload },
          { onConflict: 'classroom_id' }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    // ── Rancang Dokumen ────────────────────────────────────────
    async getRancangDokumen(classroomId) {
      const { data, error } = await client
        .from('rancang_dokumen')
        .select('id, jenis, judul, tp_id, created_at')
        .eq('classroom_id', classroomId)
        .order('created_at', { ascending: false });
      if (error) return [];
      return data ?? [];
    },

    async simpanRancangDokumen(classroomId, jenis, judul, konten, tpId) {
      const { data, error } = await client
        .from('rancang_dokumen')
        .insert({
          classroom_id: classroomId,
          jenis,
          judul,
          konten,
          tp_id: tpId ?? null,
        })
        .select('id, jenis, judul, tp_id, created_at')
        .single();
      if (error) throw error;
      return data;
    },

    async hapusRancangDokumen(docId) {
      const { error } = await client
        .from('rancang_dokumen')
        .delete()
        .eq('id', docId);
      if (error) throw error;
    },

    async getRancangDokumenKonten(docId) {
      const { data, error } = await client
        .from('rancang_dokumen')
        .select('konten')
        .eq('id', docId)
        .single();
      if (error) return null;
      return data?.konten ?? null;
    },
  };
}());
