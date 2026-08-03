(function () {
  const client = window.supabaseClient;

  window.api = {

    getSession() {
      return client.auth.getSession();
    },

    async getProfile(userId) {
      return client
        .from('profiles')
        .select('id, full_name')
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

    async getTrialStatus() {
      const { data, error } = await client.rpc('fn_guru_trial_status');
      if (error) return null;
      return data;
    },

    signOut() {
      return client.auth.signOut();
    },
  };
}());
