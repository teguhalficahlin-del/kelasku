(function () {
  const client = window.supabaseClient;

  window.api = {

    getSession() {
      return client.auth.getSession();
    },

    async getProfile(userId) {
      return client
        .from('profiles')
        .select('id, full_name, role_guru, role_locked_at')
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

    // ── Rancang Profil (step 0 — per akun guru) ───────────────
    async getRancangProfil() {
      const { data, error } = await client.rpc('fn_get_rancang_profil');
      if (error) return null;
      if (!data) return null;
      // role_guru ada di tabel profiles, bukan rancang_profil — fetch dan merge
      if (data.profile_id) {
        const { data: prof } = await client
          .from('profiles')
          .select('role_guru')
          .eq('id', data.profile_id)
          .maybeSingle();
        if (prof?.role_guru) data.role_guru = prof.role_guru;
      }
      return data;
    },

    async upsertRancangProfil(payload) {
      const { data, error } = await client.rpc('fn_upsert_rancang_profil', {
        p_payload: payload,
      });
      if (error) throw error;
      return data;
    },

    async declareAndLockRole(roleGuru) {
      const { data, error } = await client.rpc('fn_declare_and_lock_role', {
        p_role_guru: roleGuru,
        p_confirmed: true,
      });
      if (error) throw error;
      return data;
    },

    async applyTeachingFoundation(payload) {
      const { data, error } = await client.functions.invoke('teaching-foundation', {
        body: { action: 'apply_foundation', confirmed: true, ...payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
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

    // ── tp_kktp (CP / TP / KKTP per classroom) ────────────────────────────
    async getTpKktp(classroomId, teacherId) {
      const { data, error } = await client
        .from('tp_kktp')
        .select('*')
        .eq('classroom_id', classroomId)
        .eq('teacher_id', teacherId)
        .order('urutan', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },

    async createTpKktp(classroomId, teacherId, payload) {
      const { data, error } = await client
        .from('tp_kktp')
        .insert({ classroom_id: classroomId, teacher_id: teacherId, ...payload })
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async updateTpKktp(id, payload) {
      const { error } = await client.from('tp_kktp').update(payload).eq('id', id);
      if (error) throw error;
    },

    async deleteTpKktp(id) {
      const { error } = await client.from('tp_kktp').delete().eq('id', id);
      if (error) throw error;
    },

    // ── assessments ────────────────────────────────────────────────────────
    async getAssessments(classroomId) {
      const { data, error } = await client
        .from('assessments')
        .select('*')
        .eq('classroom_id', classroomId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },

    async createAssessment(classroomId, teacherId, payload) {
      const { data, error } = await client
        .from('assessments')
        .insert({ classroom_id: classroomId, teacher_id: teacherId, ...payload })
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async updateAssessment(id, payload) {
      const { error } = await client.from('assessments').update(payload).eq('id', id);
      if (error) throw error;
    },

    async deleteAssessment(id) {
      const { error } = await client.from('assessments').delete().eq('id', id);
      if (error) throw error;
    },

    // ── assessment_results ─────────────────────────────────────────────────
    async getAssessmentResults(assessmentId) {
      const { data, error } = await client
        .from('assessment_results')
        .select('*')
        .eq('assessment_id', assessmentId);
      if (error) throw error;
      return data ?? [];
    },

    async upsertAssessmentResult(classroomId, teacherId, assessmentId, studentId, payload) {
      const { error } = await client
        .from('assessment_results')
        .upsert(
          {
            classroom_id: classroomId, teacher_id: teacherId,
            assessment_id: assessmentId, student_id: studentId,
            ...payload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'assessment_id,student_id' }
        );
      if (error) throw error;
    },

    // ── student_groups ─────────────────────────────────────────────────────
    async getStudentGroups(classroomId) {
      const { data, error } = await client
        .from('student_groups')
        .select('student_id, grup, updated_at')
        .eq('classroom_id', classroomId);
      if (error) throw error;
      return data ?? [];
    },

    async upsertStudentGroup(classroomId, studentId, grup) {
      const { error } = await client
        .from('student_groups')
        .upsert(
          { classroom_id: classroomId, student_id: studentId, grup,
            updated_at: new Date().toISOString() },
          { onConflict: 'classroom_id,student_id' }
        );
      if (error) throw error;
    },

    async getClassroomStudents(classroomId) {
      const { data: members, error: e1 } = await client
        .from('classroom_members')
        .select('profile_id')
        .eq('classroom_id', classroomId)
        .eq('member_role', 'SISWA');
      if (e1) throw e1;
      if (!members?.length) return [];
      const { data, error: e2 } = await client
        .from('profiles')
        .select('id, full_name')
        .in('id', members.map(m => m.profile_id))
        .order('full_name');
      if (e2) throw e2;
      return (data ?? []).map(p => ({ id: p.id, nama: p.full_name }));
    },

    async getAssessmentStudents(assessmentId) {
      const { data, error } = await client
        .from('assessment_results')
        .select('student_id, status, catatan, umpan_balik, grup_diferensiasi, nilai, kktp_tercapai, tindak_lanjut')
        .eq('assessment_id', assessmentId);
      if (error) throw error;
      return data ?? [];
    },

    // ── grade_recap ────────────────────────────────────────────────────────
    async getGradeRecap(classroomId, semester, tahunAjaran) {
      const { data, error } = await client
        .from('grade_recap')
        .select('*')
        .eq('classroom_id', classroomId)
        .eq('semester', semester)
        .eq('tahun_ajaran', tahunAjaran);
      if (error) throw error;
      return data ?? [];
    },

    async upsertGradeRecap(classroomId, studentId, tpKktpId, semester, tahunAjaran, payload) {
      const { error } = await client
        .from('grade_recap')
        .upsert(
          {
            classroom_id: classroomId, student_id: studentId,
            tp_kktp_id: tpKktpId, semester, tahun_ajaran: tahunAjaran,
            ...payload,
          },
          { onConflict: 'classroom_id,student_id,tp_kktp_id,semester,tahun_ajaran' }
        );
      if (error) throw error;
    },
  };
}());
