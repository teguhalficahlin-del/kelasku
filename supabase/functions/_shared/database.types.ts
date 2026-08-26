export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      assessment_results: {
        Row: {
          assessment_id: string
          catatan: string | null
          classroom_id: string
          created_at: string
          grup_diferensiasi: string | null
          id: string
          kktp_tercapai: boolean | null
          nilai: number | null
          status: string | null
          student_id: string
          teacher_id: string
          tindak_lanjut: string | null
          umpan_balik: string | null
          updated_at: string
        }
        Insert: {
          assessment_id: string
          catatan?: string | null
          classroom_id: string
          created_at?: string
          grup_diferensiasi?: string | null
          id?: string
          kktp_tercapai?: boolean | null
          nilai?: number | null
          status?: string | null
          student_id: string
          teacher_id: string
          tindak_lanjut?: string | null
          umpan_balik?: string | null
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          catatan?: string | null
          classroom_id?: string
          created_at?: string
          grup_diferensiasi?: string | null
          id?: string
          kktp_tercapai?: boolean | null
          nilai?: number | null
          status?: string | null
          student_id?: string
          teacher_id?: string
          tindak_lanjut?: string | null
          umpan_balik?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_results_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_results_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "classroom_roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_results_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          classroom_id: string
          created_at: string
          id: string
          instrumen: string | null
          is_visible_ortu: boolean
          is_visible_siswa: boolean
          jenis: string
          konten: Json | null
          refleksi_guru: string | null
          teacher_id: string
          teknik: string | null
          tp_kktp_id: string | null
          tujuan: string | null
        }
        Insert: {
          classroom_id: string
          created_at?: string
          id?: string
          instrumen?: string | null
          is_visible_ortu?: boolean
          is_visible_siswa?: boolean
          jenis: string
          konten?: Json | null
          refleksi_guru?: string | null
          teacher_id: string
          teknik?: string | null
          tp_kktp_id?: string | null
          tujuan?: string | null
        }
        Update: {
          classroom_id?: string
          created_at?: string
          id?: string
          instrumen?: string | null
          is_visible_ortu?: boolean
          is_visible_siswa?: boolean
          jenis?: string
          konten?: Json | null
          refleksi_guru?: string | null
          teacher_id?: string
          teknik?: string | null
          tp_kktp_id?: string | null
          tujuan?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessments_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_tp_kktp_id_fkey"
            columns: ["tp_kktp_id"]
            isOneToOne: false
            referencedRelation: "tp_kktp"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          classroom_id: string
          created_at: string
          id: string
          schedule_id: string
          status: string
          student_id: string
          tanggal: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          classroom_id: string
          created_at?: string
          id?: string
          schedule_id: string
          status: string
          student_id: string
          tanggal: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          classroom_id?: string
          created_at?: string
          id?: string
          schedule_id?: string
          status?: string
          student_id?: string
          tanggal?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      authorized_teaching_scopes: {
        Row: {
          bidang: string | null
          confirmation_payload: Json
          cp_dataset_revision: string
          created_at: string
          id: string
          jenjang: string
          locked_at: string
          profile_id: string
          program_keahlian: string | null
          role_guru: string
          status: string
          subject_keys: string[]
          updated_at: string
        }
        Insert: {
          bidang?: string | null
          confirmation_payload?: Json
          cp_dataset_revision: string
          created_at?: string
          id?: string
          jenjang: string
          locked_at?: string
          profile_id: string
          program_keahlian?: string | null
          role_guru: string
          status?: string
          subject_keys: string[]
          updated_at?: string
        }
        Update: {
          bidang?: string | null
          confirmation_payload?: Json
          cp_dataset_revision?: string
          created_at?: string
          id?: string
          jenjang?: string
          locked_at?: string
          profile_id?: string
          program_keahlian?: string | null
          role_guru?: string
          status?: string
          subject_keys?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "authorized_teaching_scopes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classroom_jp_policies: {
        Row: {
          classroom_id: string
          confirmed_at: string
          confirmed_by_profile_id: string
          created_at: string
          effective_jp_minutes: number
          override_reason: string | null
          profile_id: string
          standard_jp_minutes: number
          updated_at: string
        }
        Insert: {
          classroom_id: string
          confirmed_at?: string
          confirmed_by_profile_id: string
          created_at?: string
          effective_jp_minutes: number
          override_reason?: string | null
          profile_id: string
          standard_jp_minutes: number
          updated_at?: string
        }
        Update: {
          classroom_id?: string
          confirmed_at?: string
          confirmed_by_profile_id?: string
          created_at?: string
          effective_jp_minutes?: number
          override_reason?: string | null
          profile_id?: string
          standard_jp_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classroom_jp_policies_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: true
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_jp_policies_confirmed_by_profile_id_fkey"
            columns: ["confirmed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_jp_policies_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classroom_members: {
        Row: {
          classroom_id: string
          id: string
          joined_at: string
          linked_student_id: string | null
          member_role: Database["public"]["Enums"]["member_role"]
          profile_id: string
          teacher_id: string
        }
        Insert: {
          classroom_id: string
          id?: string
          joined_at?: string
          linked_student_id?: string | null
          member_role: Database["public"]["Enums"]["member_role"]
          profile_id: string
          teacher_id: string
        }
        Update: {
          classroom_id?: string
          id?: string
          joined_at?: string
          linked_student_id?: string | null
          member_role?: Database["public"]["Enums"]["member_role"]
          profile_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classroom_members_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_members_linked_student_id_fkey"
            columns: ["linked_student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_members_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classroom_roster: {
        Row: {
          classroom_id: string
          created_at: string
          full_name: string
          id: string
          nama_ortu: string | null
          nis: string
          profile_id: string | null
          teacher_id: string
        }
        Insert: {
          classroom_id: string
          created_at?: string
          full_name: string
          id?: string
          nama_ortu?: string | null
          nis: string
          profile_id?: string | null
          teacher_id: string
        }
        Update: {
          classroom_id?: string
          created_at?: string
          full_name?: string
          id?: string
          nama_ortu?: string | null
          nis?: string
          profile_id?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classroom_roster_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_roster_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_roster_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classrooms: {
        Row: {
          bidang_keahlian: string | null
          classroom_code: string
          created_at: string
          description: string | null
          elemen_terpilih: Json | null
          id: string
          is_archived: boolean
          jenjang: string | null
          mapel_key: string | null
          name: string
          program_keahlian: string | null
          subject: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          bidang_keahlian?: string | null
          classroom_code?: string
          created_at?: string
          description?: string | null
          elemen_terpilih?: Json | null
          id?: string
          is_archived?: boolean
          jenjang?: string | null
          mapel_key?: string | null
          name: string
          program_keahlian?: string | null
          subject?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          bidang_keahlian?: string | null
          classroom_code?: string
          created_at?: string
          description?: string | null
          elemen_terpilih?: Json | null
          id?: string
          is_archived?: boolean
          jenjang?: string | null
          mapel_key?: string | null
          name?: string
          program_keahlian?: string | null
          subject?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classrooms_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_comments: {
        Row: {
          author_id: string
          classroom_id: string
          content: string
          created_at: string
          id: string
          post_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          classroom_id: string
          content: string
          created_at?: string
          id?: string
          post_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          classroom_id?: string
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_comments_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_comments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_posts: {
        Row: {
          classroom_id: string
          content: string
          created_at: string
          id: string
          teacher_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          classroom_id: string
          content: string
          created_at?: string
          id?: string
          teacher_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          classroom_id?: string
          content?: string
          created_at?: string
          id?: string
          teacher_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forum_posts_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forum_posts_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_recap: {
        Row: {
          classroom_id: string
          deskripsi_capaian: string | null
          id: string
          kktp_tercapai: boolean | null
          nilai_akhir: number | null
          semester: string
          student_id: string
          tahun_ajaran: string
          tp_kktp_id: string
          updated_at: string
        }
        Insert: {
          classroom_id: string
          deskripsi_capaian?: string | null
          id?: string
          kktp_tercapai?: boolean | null
          nilai_akhir?: number | null
          semester: string
          student_id: string
          tahun_ajaran: string
          tp_kktp_id: string
          updated_at?: string
        }
        Update: {
          classroom_id?: string
          deskripsi_capaian?: string | null
          id?: string
          kktp_tercapai?: boolean | null
          nilai_akhir?: number | null
          semester?: string
          student_id?: string
          tahun_ajaran?: string
          tp_kktp_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_recap_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_recap_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "classroom_roster"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_recap_tp_kktp_id_fkey"
            columns: ["tp_kktp_id"]
            isOneToOne: false
            referencedRelation: "tp_kktp"
            referencedColumns: ["id"]
          },
        ]
      }
      guidance_sessions: {
        Row: {
          classroom_id: string
          created_at: string
          duration_minutes: number | null
          id: string
          session_date: string
          student_id: string | null
          summary: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          classroom_id: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          session_date: string
          student_id?: string | null
          summary: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          classroom_id?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          session_date?: string
          student_id?: string | null
          summary?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guidance_sessions_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guidance_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guidance_sessions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifikasi_log: {
        Row: {
          hari_notifikasi: number
          id: string
          profile_id: string
          sent_at: string
        }
        Insert: {
          hari_notifikasi: number
          id?: string
          profile_id: string
          sent_at?: string
        }
        Update: {
          hari_notifikasi?: number
          id?: string
          profile_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifikasi_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_messages: {
        Row: {
          author_profile_id: string
          author_role: string
          classroom_id: string
          content: string
          created_at: string
          id: string
          read_at: string | null
          student_id: string
          teacher_id: string
        }
        Insert: {
          author_profile_id: string
          author_role: string
          classroom_id: string
          content: string
          created_at?: string
          id?: string
          read_at?: string | null
          student_id: string
          teacher_id: string
        }
        Update: {
          author_profile_id?: string
          author_role?: string
          classroom_id?: string
          content?: string
          created_at?: string
          id?: string
          read_at?: string | null
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_messages_author_profile_id_fkey"
            columns: ["author_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_messages_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_messages_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_messages_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activated_at: string | null
          avatar_url: string | null
          created_at: string
          email: string | null
          expires_at: string | null
          full_name: string
          id: string
          is_active: boolean
          last_reset_at: string | null
          nis: string | null
          phone: string | null
          role: string
          role_guru: string | null
          role_lock_version: number
          role_locked_at: string | null
          tier: string
          tier_requested: string | null
          trial_started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          last_reset_at?: string | null
          nis?: string | null
          phone?: string | null
          role: string
          role_guru?: string | null
          role_lock_version?: number
          role_locked_at?: string | null
          tier?: string
          tier_requested?: string | null
          trial_started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          last_reset_at?: string | null
          nis?: string | null
          phone?: string | null
          role?: string
          role_guru?: string | null
          role_lock_version?: number
          role_locked_at?: string | null
          tier?: string
          tier_requested?: string | null
          trial_started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rancang_artifact_dependencies: {
        Row: {
          artifact_version_id: string
          created_at: string
          dependency_hash: string
          dependency_kind: string
          depends_on_version_id: string | null
          id: string
          meeting_allocation_id: string | null
          meeting_allocation_item_id: string | null
          planning_context_id: string | null
          snapshot_key: string | null
          tp_revision_id: string | null
        }
        Insert: {
          artifact_version_id: string
          created_at?: string
          dependency_hash: string
          dependency_kind: string
          depends_on_version_id?: string | null
          id?: string
          meeting_allocation_id?: string | null
          meeting_allocation_item_id?: string | null
          planning_context_id?: string | null
          snapshot_key?: string | null
          tp_revision_id?: string | null
        }
        Update: {
          artifact_version_id?: string
          created_at?: string
          dependency_hash?: string
          dependency_kind?: string
          depends_on_version_id?: string | null
          id?: string
          meeting_allocation_id?: string | null
          meeting_allocation_item_id?: string | null
          planning_context_id?: string | null
          snapshot_key?: string | null
          tp_revision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rancang_artifact_dependencies_artifact_version_id_fkey"
            columns: ["artifact_version_id"]
            isOneToOne: false
            referencedRelation: "rancang_artifact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_dependencies_depends_on_version_id_fkey"
            columns: ["depends_on_version_id"]
            isOneToOne: false
            referencedRelation: "rancang_artifact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_dependencies_meeting_allocation_id_fkey"
            columns: ["meeting_allocation_id"]
            isOneToOne: false
            referencedRelation: "rancang_meeting_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_dependencies_meeting_allocation_item_id_fkey"
            columns: ["meeting_allocation_item_id"]
            isOneToOne: false
            referencedRelation: "rancang_meeting_allocation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_dependencies_planning_context_id_fkey"
            columns: ["planning_context_id"]
            isOneToOne: false
            referencedRelation: "rancang_planning_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_dependencies_tp_revision_id_fkey"
            columns: ["tp_revision_id"]
            isOneToOne: false
            referencedRelation: "rancang_tp_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_artifact_events: {
        Row: {
          actor_type: string
          artifact_id: string
          created_at: string
          event_payload: Json
          event_type: string
          id: string
          idempotency_key: string
          profile_id: string
          version_id: string | null
        }
        Insert: {
          actor_type: string
          artifact_id: string
          created_at?: string
          event_payload?: Json
          event_type: string
          id?: string
          idempotency_key: string
          profile_id: string
          version_id?: string | null
        }
        Update: {
          actor_type?: string
          artifact_id?: string
          created_at?: string
          event_payload?: Json
          event_type?: string
          id?: string
          idempotency_key?: string
          profile_id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rancang_artifact_events_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "rancang_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_events_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "rancang_artifact_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_artifact_selections: {
        Row: {
          artifact_id: string
          selected_at: string
          selected_by: string
          selected_version_id: string
          selection_revision: number
        }
        Insert: {
          artifact_id: string
          selected_at?: string
          selected_by: string
          selected_version_id: string
          selection_revision?: number
        }
        Update: {
          artifact_id?: string
          selected_at?: string
          selected_by?: string
          selected_version_id?: string
          selection_revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "rancang_artifact_selections_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: true
            referencedRelation: "rancang_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_selections_selected_by_fkey"
            columns: ["selected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_selections_selected_version_id_fkey"
            columns: ["selected_version_id"]
            isOneToOne: true
            referencedRelation: "rancang_artifact_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_artifact_version_states: {
        Row: {
          confirmed_at: string | null
          decision_status: string
          invalidated_at: string | null
          invalidation_reason: string | null
          lifecycle_status: string
          needs_update: boolean
          rejected_at: string | null
          updated_at: string
          usable: boolean
          validation_status: string
          validation_summary: Json
          version_id: string
        }
        Insert: {
          confirmed_at?: string | null
          decision_status?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          lifecycle_status: string
          needs_update?: boolean
          rejected_at?: string | null
          updated_at?: string
          usable?: boolean
          validation_status?: string
          validation_summary?: Json
          version_id: string
        }
        Update: {
          confirmed_at?: string | null
          decision_status?: string
          invalidated_at?: string | null
          invalidation_reason?: string | null
          lifecycle_status?: string
          needs_update?: boolean
          rejected_at?: string | null
          updated_at?: string
          usable?: boolean
          validation_status?: string
          validation_summary?: Json
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rancang_artifact_version_states_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "rancang_artifact_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_artifact_versions: {
        Row: {
          artifact_id: string
          candidate_of_version_id: string | null
          content: Json
          created_at: string
          created_by: string
          dependency_hash: string
          id: string
          meeting_allocation_id: string | null
          meeting_allocation_item_id: string | null
          model_version: string | null
          origin: string
          parent_version_id: string | null
          planning_context_id: string
          profile_id: string
          prompt_version: string | null
          source_hash: string
          source_snapshot: Json
          teacher_edited: boolean
          tp_id: string
          tp_revision_id: string
          version_no: number
        }
        Insert: {
          artifact_id: string
          candidate_of_version_id?: string | null
          content: Json
          created_at?: string
          created_by: string
          dependency_hash: string
          id?: string
          meeting_allocation_id?: string | null
          meeting_allocation_item_id?: string | null
          model_version?: string | null
          origin: string
          parent_version_id?: string | null
          planning_context_id: string
          profile_id: string
          prompt_version?: string | null
          source_hash: string
          source_snapshot?: Json
          teacher_edited?: boolean
          tp_id: string
          tp_revision_id: string
          version_no: number
        }
        Update: {
          artifact_id?: string
          candidate_of_version_id?: string | null
          content?: Json
          created_at?: string
          created_by?: string
          dependency_hash?: string
          id?: string
          meeting_allocation_id?: string | null
          meeting_allocation_item_id?: string | null
          model_version?: string | null
          origin?: string
          parent_version_id?: string | null
          planning_context_id?: string
          profile_id?: string
          prompt_version?: string | null
          source_hash?: string
          source_snapshot?: Json
          teacher_edited?: boolean
          tp_id?: string
          tp_revision_id?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "rancang_artifact_versions_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "rancang_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_versions_candidate_of_version_id_fkey"
            columns: ["candidate_of_version_id"]
            isOneToOne: false
            referencedRelation: "rancang_artifact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_versions_meeting_allocation_id_fkey"
            columns: ["meeting_allocation_id"]
            isOneToOne: false
            referencedRelation: "rancang_meeting_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_versions_meeting_allocation_item_id_fkey"
            columns: ["meeting_allocation_item_id"]
            isOneToOne: false
            referencedRelation: "rancang_meeting_allocation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_versions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "rancang_artifact_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_versions_planning_context_id_fkey"
            columns: ["planning_context_id"]
            isOneToOne: false
            referencedRelation: "rancang_planning_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_versions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_versions_tp_id_fkey"
            columns: ["tp_id"]
            isOneToOne: false
            referencedRelation: "rancang_tp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifact_versions_tp_revision_id_fkey"
            columns: ["tp_revision_id"]
            isOneToOne: false
            referencedRelation: "rancang_tp_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_artifacts: {
        Row: {
          archived_at: string | null
          artifact_kind: string
          created_at: string
          id: string
          meeting_allocation_item_id: string | null
          planning_context_id: string
          profile_id: string
          scope_key: string
        }
        Insert: {
          archived_at?: string | null
          artifact_kind: string
          created_at?: string
          id?: string
          meeting_allocation_item_id?: string | null
          planning_context_id: string
          profile_id: string
          scope_key?: string
        }
        Update: {
          archived_at?: string | null
          artifact_kind?: string
          created_at?: string
          id?: string
          meeting_allocation_item_id?: string | null
          planning_context_id?: string
          profile_id?: string
          scope_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "rancang_artifacts_meeting_allocation_item_id_fkey"
            columns: ["meeting_allocation_item_id"]
            isOneToOne: false
            referencedRelation: "rancang_meeting_allocation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifacts_planning_context_id_fkey"
            columns: ["planning_context_id"]
            isOneToOne: false
            referencedRelation: "rancang_planning_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_artifacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_atp: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          status: string
          teaching_context_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          status?: string
          teaching_context_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          status?: string
          teaching_context_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rancang_atp_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_atp_teaching_context_id_fkey"
            columns: ["teaching_context_id"]
            isOneToOne: false
            referencedRelation: "teaching_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_atp_revision_items: {
        Row: {
          atp_revision_id: string
          tp_id: string
          tp_revision_id: string
          urutan: number
        }
        Insert: {
          atp_revision_id: string
          tp_id: string
          tp_revision_id: string
          urutan: number
        }
        Update: {
          atp_revision_id?: string
          tp_id?: string
          tp_revision_id?: string
          urutan?: number
        }
        Relationships: [
          {
            foreignKeyName: "rancang_atp_revision_items_atp_revision_id_fkey"
            columns: ["atp_revision_id"]
            isOneToOne: false
            referencedRelation: "rancang_atp_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_atp_revision_items_tp_id_fkey"
            columns: ["tp_id"]
            isOneToOne: false
            referencedRelation: "rancang_tp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_atp_revision_items_tp_revision_id_fkey"
            columns: ["tp_revision_id"]
            isOneToOne: false
            referencedRelation: "rancang_tp_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_atp_revisions: {
        Row: {
          atp_id: string
          cp_dataset_revision: string
          created_at: string
          created_by: string
          id: string
          revision_no: number
          source: string
          source_hash: string
        }
        Insert: {
          atp_id: string
          cp_dataset_revision: string
          created_at?: string
          created_by: string
          id?: string
          revision_no: number
          source: string
          source_hash: string
        }
        Update: {
          atp_id?: string
          cp_dataset_revision?: string
          created_at?: string
          created_by?: string
          id?: string
          revision_no?: number
          source?: string
          source_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "rancang_atp_revisions_atp_id_fkey"
            columns: ["atp_id"]
            isOneToOne: false
            referencedRelation: "rancang_atp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_atp_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_dokumen: {
        Row: {
          classroom_id: string
          created_at: string
          id: string
          jenis: string
          judul: string
          konten: Json
          tp_id: string | null
        }
        Insert: {
          classroom_id: string
          created_at?: string
          id?: string
          jenis: string
          judul: string
          konten?: Json
          tp_id?: string | null
        }
        Update: {
          classroom_id?: string
          created_at?: string
          id?: string
          jenis?: string
          judul?: string
          konten?: Json
          tp_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rancang_dokumen_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_legacy_atp_mappings: {
        Row: {
          adopted_at: string
          adopted_by: string
          atp_id: string
          legacy_rancang_dokumen_id: string
          raw_payload_hash: string
          unresolved_elements: Json
        }
        Insert: {
          adopted_at?: string
          adopted_by: string
          atp_id: string
          legacy_rancang_dokumen_id: string
          raw_payload_hash: string
          unresolved_elements?: Json
        }
        Update: {
          adopted_at?: string
          adopted_by?: string
          atp_id?: string
          legacy_rancang_dokumen_id?: string
          raw_payload_hash?: string
          unresolved_elements?: Json
        }
        Relationships: [
          {
            foreignKeyName: "rancang_legacy_atp_mappings_adopted_by_fkey"
            columns: ["adopted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_legacy_atp_mappings_atp_id_fkey"
            columns: ["atp_id"]
            isOneToOne: true
            referencedRelation: "rancang_atp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_legacy_atp_mappings_legacy_rancang_dokumen_id_fkey"
            columns: ["legacy_rancang_dokumen_id"]
            isOneToOne: true
            referencedRelation: "rancang_dokumen"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_meeting_allocation_items: {
        Row: {
          duration_minutes: number
          id: string
          jp: number
          meeting_allocation_id: string
          meeting_no: number
        }
        Insert: {
          duration_minutes: number
          id?: string
          jp: number
          meeting_allocation_id: string
          meeting_no: number
        }
        Update: {
          duration_minutes?: number
          id?: string
          jp?: number
          meeting_allocation_id?: string
          meeting_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "rancang_meeting_allocation_items_meeting_allocation_id_fkey"
            columns: ["meeting_allocation_id"]
            isOneToOne: false
            referencedRelation: "rancang_meeting_allocations"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_meeting_allocations: {
        Row: {
          confirmed_at: string
          confirmed_by_profile_id: string
          created_at: string
          effective_jp_minutes: number
          id: string
          planning_context_id: string
          proposal_source: string
          revision_no: number
          source_hash: string
          standard_jp_minutes: number
          superseded_at: string | null
          total_jp_tp: number
        }
        Insert: {
          confirmed_at: string
          confirmed_by_profile_id: string
          created_at?: string
          effective_jp_minutes: number
          id?: string
          planning_context_id: string
          proposal_source: string
          revision_no: number
          source_hash: string
          standard_jp_minutes: number
          superseded_at?: string | null
          total_jp_tp: number
        }
        Update: {
          confirmed_at?: string
          confirmed_by_profile_id?: string
          created_at?: string
          effective_jp_minutes?: number
          id?: string
          planning_context_id?: string
          proposal_source?: string
          revision_no?: number
          source_hash?: string
          standard_jp_minutes?: number
          superseded_at?: string | null
          total_jp_tp?: number
        }
        Relationships: [
          {
            foreignKeyName: "rancang_meeting_allocations_confirmed_by_profile_id_fkey"
            columns: ["confirmed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_meeting_allocations_planning_context_id_fkey"
            columns: ["planning_context_id"]
            isOneToOne: false
            referencedRelation: "rancang_planning_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_pipeline_state: {
        Row: {
          created_at: string
          id: string
          last_validated_at: string | null
          planning_context_id: string
          profile_id: string
          rpm_ready_for_class: boolean
          updated_at: string
          validation_report_version_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_validated_at?: string | null
          planning_context_id: string
          profile_id: string
          rpm_ready_for_class?: boolean
          updated_at?: string
          validation_report_version_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_validated_at?: string | null
          planning_context_id?: string
          profile_id?: string
          rpm_ready_for_class?: boolean
          updated_at?: string
          validation_report_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rancang_pipeline_state_planning_context_id_fkey"
            columns: ["planning_context_id"]
            isOneToOne: false
            referencedRelation: "rancang_planning_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_pipeline_state_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_pipeline_state_validation_report_version_id_fkey"
            columns: ["validation_report_version_id"]
            isOneToOne: false
            referencedRelation: "rancang_artifact_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_planning_contexts: {
        Row: {
          academic_year: string
          class_context_snapshot: Json
          classroom_id: string
          context_source_hash: string
          created_at: string
          id: string
          preferences_snapshot: Json
          profile_id: string
          schedule_config_snapshot: Json
          selected_tp_revision_id: string
          semester: number
          smk_context_snapshot: Json | null
          stale_reasons: string[]
          status: string
          teacher_intent_snapshot: Json
          teaching_context_id: string
          tp_id: string
          updated_at: string
        }
        Insert: {
          academic_year: string
          class_context_snapshot?: Json
          classroom_id: string
          context_source_hash: string
          created_at?: string
          id?: string
          preferences_snapshot?: Json
          profile_id: string
          schedule_config_snapshot?: Json
          selected_tp_revision_id: string
          semester: number
          smk_context_snapshot?: Json | null
          stale_reasons?: string[]
          status?: string
          teacher_intent_snapshot?: Json
          teaching_context_id: string
          tp_id: string
          updated_at?: string
        }
        Update: {
          academic_year?: string
          class_context_snapshot?: Json
          classroom_id?: string
          context_source_hash?: string
          created_at?: string
          id?: string
          preferences_snapshot?: Json
          profile_id?: string
          schedule_config_snapshot?: Json
          selected_tp_revision_id?: string
          semester?: number
          smk_context_snapshot?: Json | null
          stale_reasons?: string[]
          status?: string
          teacher_intent_snapshot?: Json
          teaching_context_id?: string
          tp_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rancang_planning_contexts_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_planning_contexts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_planning_contexts_selected_tp_revision_id_fkey"
            columns: ["selected_tp_revision_id"]
            isOneToOne: false
            referencedRelation: "rancang_tp_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_planning_contexts_teaching_context_id_fkey"
            columns: ["teaching_context_id"]
            isOneToOne: false
            referencedRelation: "teaching_contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_planning_contexts_tp_id_fkey"
            columns: ["tp_id"]
            isOneToOne: false
            referencedRelation: "rancang_tp"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_profil: {
        Row: {
          bidang_keahlian: string | null
          created_at: string
          elemen_terpilih: string[]
          fase: string | null
          id: string
          is_locked: boolean
          jam_per_minggu: number | null
          jenjang: string | null
          kelas: string | null
          kota: string | null
          mapel: string | null
          mapel_key: string | null
          mapel_list: string[]
          nama_guru: string | null
          nama_kepsek: string | null
          nip_guru: string | null
          nip_kepsek: string | null
          peran: string | null
          profile_id: string
          program_keahlian: string | null
          semester_list: string[]
          tahun_ajaran: string | null
          updated_at: string
        }
        Insert: {
          bidang_keahlian?: string | null
          created_at?: string
          elemen_terpilih?: string[]
          fase?: string | null
          id?: string
          is_locked?: boolean
          jam_per_minggu?: number | null
          jenjang?: string | null
          kelas?: string | null
          kota?: string | null
          mapel?: string | null
          mapel_key?: string | null
          mapel_list?: string[]
          nama_guru?: string | null
          nama_kepsek?: string | null
          nip_guru?: string | null
          nip_kepsek?: string | null
          peran?: string | null
          profile_id: string
          program_keahlian?: string | null
          semester_list?: string[]
          tahun_ajaran?: string | null
          updated_at?: string
        }
        Update: {
          bidang_keahlian?: string | null
          created_at?: string
          elemen_terpilih?: string[]
          fase?: string | null
          id?: string
          is_locked?: boolean
          jam_per_minggu?: number | null
          jenjang?: string | null
          kelas?: string | null
          kota?: string | null
          mapel?: string | null
          mapel_key?: string | null
          mapel_list?: string[]
          nama_guru?: string | null
          nama_kepsek?: string | null
          nip_guru?: string | null
          nip_kepsek?: string | null
          peran?: string | null
          profile_id?: string
          program_keahlian?: string | null
          semester_list?: string[]
          tahun_ajaran?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rancang_profil_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_settings: {
        Row: {
          bidang_keahlian: string | null
          classroom_id: string
          created_at: string
          elemen_terpilih: Json | null
          fase: string | null
          id: string
          jenjang: string | null
          kota: string | null
          mapel: string | null
          mapel_key: string | null
          nama_guru: string | null
          nama_kepsek: string | null
          nip_guru: string | null
          nip_kepsek: string | null
          program_keahlian: string | null
          semester: string | null
          tahun_ajaran: string | null
          updated_at: string
        }
        Insert: {
          bidang_keahlian?: string | null
          classroom_id: string
          created_at?: string
          elemen_terpilih?: Json | null
          fase?: string | null
          id?: string
          jenjang?: string | null
          kota?: string | null
          mapel?: string | null
          mapel_key?: string | null
          nama_guru?: string | null
          nama_kepsek?: string | null
          nip_guru?: string | null
          nip_kepsek?: string | null
          program_keahlian?: string | null
          semester?: string | null
          tahun_ajaran?: string | null
          updated_at?: string
        }
        Update: {
          bidang_keahlian?: string | null
          classroom_id?: string
          created_at?: string
          elemen_terpilih?: Json | null
          fase?: string | null
          id?: string
          jenjang?: string | null
          kota?: string | null
          mapel?: string | null
          mapel_key?: string | null
          nama_guru?: string | null
          nama_kepsek?: string | null
          nip_guru?: string | null
          nip_kepsek?: string | null
          program_keahlian?: string | null
          semester?: string | null
          tahun_ajaran?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rancang_settings_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: true
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_tp: {
        Row: {
          atp_id: string
          created_at: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          atp_id: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          atp_id?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rancang_tp_atp_id_fkey"
            columns: ["atp_id"]
            isOneToOne: false
            referencedRelation: "rancang_atp"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_tp_revision_elements: {
        Row: {
          cp_dataset_revision: string
          element_name: string
          phase_key: string
          subject_key: string
          tp_revision_id: string
        }
        Insert: {
          cp_dataset_revision: string
          element_name: string
          phase_key: string
          subject_key: string
          tp_revision_id: string
        }
        Update: {
          cp_dataset_revision?: string
          element_name?: string
          phase_key?: string
          subject_key?: string
          tp_revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rancang_tp_revision_elements_tp_revision_id_fkey"
            columns: ["tp_revision_id"]
            isOneToOne: false
            referencedRelation: "rancang_tp_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      rancang_tp_revisions: {
        Row: {
          created_at: string
          created_by: string
          deskripsi: string
          estimasi_jp: number | null
          id: string
          judul: string
          raw_element_value: Json | null
          revision_no: number
          semester: number
          source_hash: string
          tp_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deskripsi?: string
          estimasi_jp?: number | null
          id?: string
          judul: string
          raw_element_value?: Json | null
          revision_no: number
          semester: number
          source_hash: string
          tp_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deskripsi?: string
          estimasi_jp?: number | null
          id?: string
          judul?: string
          raw_element_value?: Json | null
          revision_no?: number
          semester?: number
          source_hash?: string
          tp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rancang_tp_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rancang_tp_revisions_tp_id_fkey"
            columns: ["tp_id"]
            isOneToOne: false
            referencedRelation: "rancang_tp"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          endpoint: string
          identifier: string
          request_count: number
          window_start: string
        }
        Insert: {
          endpoint: string
          identifier: string
          request_count?: number
          window_start: string
        }
        Update: {
          endpoint?: string
          identifier?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      schedules: {
        Row: {
          classroom_id: string
          created_at: string
          day_of_week: string
          end_time: string
          id: string
          inactive_reason: string | null
          is_active: boolean
          note: string | null
          start_time: string
          subject: string | null
          teacher_id: string
        }
        Insert: {
          classroom_id: string
          created_at?: string
          day_of_week: string
          end_time: string
          id?: string
          inactive_reason?: string | null
          is_active?: boolean
          note?: string | null
          start_time: string
          subject?: string | null
          teacher_id: string
        }
        Update: {
          classroom_id?: string
          created_at?: string
          day_of_week?: string
          end_time?: string
          id?: string
          inactive_reason?: string | null
          is_active?: boolean
          note?: string | null
          start_time?: string
          subject?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_groups: {
        Row: {
          classroom_id: string
          grup: string
          id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          classroom_id: string
          grup: string
          id?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          classroom_id?: string
          grup?: string
          id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_groups_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_groups_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "classroom_roster"
            referencedColumns: ["id"]
          },
        ]
      }
      student_notes: {
        Row: {
          announcement_id: string | null
          classroom_id: string
          content: string
          created_at: string
          id: string
          is_visible_to_parent: boolean
          is_visible_to_student: boolean
          student_id: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          announcement_id?: string | null
          classroom_id: string
          content: string
          created_at?: string
          id?: string
          is_visible_to_parent?: boolean
          is_visible_to_student?: boolean
          student_id?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          announcement_id?: string | null
          classroom_id?: string
          content?: string
          created_at?: string
          id?: string
          is_visible_to_parent?: boolean
          is_visible_to_student?: boolean
          student_id?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_notes_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_notes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teaching_context_classrooms: {
        Row: {
          classroom_id: string
          compatibility_metadata: Json
          confirmed_at: string
          created_at: string
          id: string
          status: string
          teaching_context_id: string
        }
        Insert: {
          classroom_id: string
          compatibility_metadata?: Json
          confirmed_at?: string
          created_at?: string
          id?: string
          status?: string
          teaching_context_id: string
        }
        Update: {
          classroom_id?: string
          compatibility_metadata?: Json
          confirmed_at?: string
          created_at?: string
          id?: string
          status?: string
          teaching_context_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaching_context_classrooms_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_context_classrooms_teaching_context_id_fkey"
            columns: ["teaching_context_id"]
            isOneToOne: false
            referencedRelation: "teaching_contexts"
            referencedColumns: ["id"]
          },
        ]
      }
      teaching_contexts: {
        Row: {
          authorization_metadata: Json
          bidang: string | null
          cp_dataset_revision: string
          created_at: string
          id: string
          jenjang: string
          phase_key: string
          profile_id: string
          program_keahlian: string | null
          role_guru: string
          status: string
          subject_key: string
          teaching_scope_id: string
          updated_at: string
        }
        Insert: {
          authorization_metadata?: Json
          bidang?: string | null
          cp_dataset_revision: string
          created_at?: string
          id?: string
          jenjang: string
          phase_key: string
          profile_id: string
          program_keahlian?: string | null
          role_guru: string
          status?: string
          subject_key: string
          teaching_scope_id: string
          updated_at?: string
        }
        Update: {
          authorization_metadata?: Json
          bidang?: string | null
          cp_dataset_revision?: string
          created_at?: string
          id?: string
          jenjang?: string
          phase_key?: string
          profile_id?: string
          program_keahlian?: string | null
          role_guru?: string
          status?: string
          subject_key?: string
          teaching_scope_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teaching_contexts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teaching_contexts_teaching_scope_id_fkey"
            columns: ["teaching_scope_id"]
            isOneToOne: false
            referencedRelation: "authorized_teaching_scopes"
            referencedColumns: ["id"]
          },
        ]
      }
      tp_kktp: {
        Row: {
          academic_year: string
          batas_atas: number | null
          batas_bawah: number | null
          classroom_id: string
          created_at: string
          id: string
          is_active: boolean
          is_visible_ortu: boolean
          is_visible_siswa: boolean
          judul: string
          konten: string | null
          mapel: string | null
          parent_id: string | null
          rentang: Json | null
          semester: number | null
          teacher_id: string
          tipe: string
          updated_at: string
          urutan: number
        }
        Insert: {
          academic_year: string
          batas_atas?: number | null
          batas_bawah?: number | null
          classroom_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_visible_ortu?: boolean
          is_visible_siswa?: boolean
          judul: string
          konten?: string | null
          mapel?: string | null
          parent_id?: string | null
          rentang?: Json | null
          semester?: number | null
          teacher_id: string
          tipe?: string
          updated_at?: string
          urutan?: number
        }
        Update: {
          academic_year?: string
          batas_atas?: number | null
          batas_bawah?: number | null
          classroom_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_visible_ortu?: boolean
          is_visible_siswa?: boolean
          judul?: string
          konten?: string | null
          mapel?: string | null
          parent_id?: string | null
          rentang?: Json | null
          semester?: number | null
          teacher_id?: string
          tipe?: string
          updated_at?: string
          urutan?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tp_kktp"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_items_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_objectives_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      wali_home_classrooms: {
        Row: {
          classroom_id: string
          created_at: string
          id: string
          locked_at: string
          phase_key: string
          profile_id: string
          status: string
        }
        Insert: {
          classroom_id: string
          created_at?: string
          id?: string
          locked_at?: string
          phase_key: string
          profile_id: string
          status?: string
        }
        Update: {
          classroom_id?: string
          created_at?: string
          id?: string
          locked_at?: string
          phase_key?: string
          profile_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "wali_home_classrooms_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wali_home_classrooms_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_auth_user: { Args: { uid: string }; Returns: undefined }
      fn_activate_guru: {
        Args: { p_profile_id: string; p_tier: string }
        Returns: undefined
      }
      fn_activate_roster: {
        Args: { p_profile_id: string; p_roster_id: string }
        Returns: undefined
      }
      fn_artifact_is_usable: {
        Args: { p_needs_update: boolean; p_status: string }
        Returns: boolean
      }
      fn_check_rate_limit: {
        Args: {
          p_endpoint: string
          p_identifier: string
          p_max_requests: number
          p_window_minutes: number
        }
        Returns: boolean
      }
      fn_check_schedule_conflict:
        | {
            Args: {
              p_classroom_id: string
              p_day_of_week: string
              p_end_time: string
              p_exclude_id?: string
              p_start_time: string
            }
            Returns: {
              conflict_classroom_name: string
              conflict_day: string
              conflict_end: string
              conflict_start: string
            }[]
          }
        | {
            Args: {
              p_day_of_week: string
              p_end_time: string
              p_exclude_id?: string
              p_start_time: string
            }
            Returns: {
              conflict_classroom_name: string
              conflict_day: string
              conflict_end: string
              conflict_start: string
            }[]
          }
      fn_child_profile_ids: { Args: never; Returns: string[] }
      fn_child_roster_ids: { Args: never; Returns: string[] }
      fn_classroom_teacher_is: {
        Args: { p_classroom_id: string; p_teacher_id: string }
        Returns: boolean
      }
      fn_cleanup_rate_limits: { Args: never; Returns: number }
      fn_cron_health_check: { Args: never; Returns: Json }
      fn_current_profile_id: { Args: never; Returns: string }
      fn_current_roster_ids: { Args: never; Returns: string[] }
      fn_declare_and_lock_role: {
        Args: { p_confirmed: boolean; p_role_guru: string }
        Returns: Json
      }
      fn_get_rancang_profil: { Args: never; Returns: Json }
      fn_guru_is_active: { Args: never; Returns: boolean }
      fn_guru_may_write_group: {
        Args: { p_classroom_id: string; p_roster_id: string }
        Returns: boolean
      }
      fn_guru_may_write_result: {
        Args: {
          p_assessment_id: string
          p_classroom_id: string
          p_roster_id: string
        }
        Returns: boolean
      }
      fn_guru_rancang_eligible: { Args: never; Returns: boolean }
      fn_guru_trial_status: { Args: never; Returns: Json }
      fn_hard_delete_guru: {
        Args: { p_dry_run?: boolean; p_teacher_id: string }
        Returns: Json
      }
      fn_is_classroom_member: {
        Args: { p_classroom_id: string }
        Returns: boolean
      }
      fn_is_classroom_owner: {
        Args: { p_classroom_id: string }
        Returns: boolean
      }
      fn_is_my_child_in_classroom: {
        Args: { p_classroom_id: string; p_student_id: string }
        Returns: boolean
      }
      fn_is_my_child_roster_in_classroom: {
        Args: { p_classroom_id: string; p_roster_id: string }
        Returns: boolean
      }
      fn_is_teaching_context_owner: {
        Args: { p_teaching_context_id: string }
        Returns: boolean
      }
      fn_list_guru_hard_delete: {
        Args: never
        Returns: {
          email: string
          expires_at: string
          full_name: string
          hari_lewat: number
          teacher_id: string
        }[]
      }
      fn_lookup_profile_name: {
        Args: { p_profile_id: string }
        Returns: string
      }
      fn_lookup_roster_by_name_nis: {
        Args: { p_classroom_id: string; p_full_name: string; p_nis: string }
        Returns: {
          full_name: string
          id: string
          nis: string
          profile_id: string
        }[]
      }
      fn_lookup_roster_by_nis: {
        Args: { p_classroom_id: string; p_nis: string }
        Returns: {
          full_name: string
          id: string
          nis: string
          profile_id: string
        }[]
      }
      fn_meeting_scope_key: { Args: { p_meeting_no: number }; Returns: string }
      fn_phase2_validate_follow_up: { Args: { p_content: Json }; Returns: Json }
      fn_phase2_validate_material_spec: {
        Args: { p_content: Json }
        Returns: Json
      }
      fn_phase2_validate_meeting_plan: {
        Args: { p_content: Json; p_expected_duration_minutes: number }
        Returns: Json
      }
      fn_phase2a_confirm_allocation: {
        Args: {
          p_effective_minutes: number
          p_items: Json
          p_planning_context_id: string
          p_profile_id: string
          p_source: string
          p_source_hash: string
          p_standard_minutes: number
          p_total_jp: number
        }
        Returns: Json
      }
      fn_phase2a_get_atp: {
        Args: { p_atp_id: string; p_profile_id: string }
        Returns: Json
      }
      fn_phase2a_owns_atp: { Args: { p_atp_id: string }; Returns: boolean }
      fn_phase2a_owns_atp_revision: { Args: { p_id: string }; Returns: boolean }
      fn_phase2a_owns_meeting_allocation: {
        Args: { p_id: string }
        Returns: boolean
      }
      fn_phase2a_owns_planning_context: {
        Args: { p_id: string }
        Returns: boolean
      }
      fn_phase2a_owns_tp_revision: { Args: { p_id: string }; Returns: boolean }
      fn_phase2a_persist_atp: {
        Args: {
          p_atp_id?: string
          p_cp_dataset_revision: string
          p_legacy_document_id?: string
          p_legacy_payload_hash?: string
          p_profile_id: string
          p_source: string
          p_source_hash: string
          p_teaching_context_id: string
          p_tp_list: Json
        }
        Returns: Json
      }
      fn_phase2a_revise_tp: {
        Args: {
          p_atp_source_hash: string
          p_deskripsi: string
          p_element_refs: Json
          p_estimasi_jp: number
          p_judul: string
          p_profile_id: string
          p_raw_element: Json
          p_semester: number
          p_source_hash: string
          p_teaching_context_id: string
          p_tp_id: string
        }
        Returns: Json
      }
      fn_phase2a_save_planning_context: {
        Args: {
          p_academic_year: string
          p_class_context: Json
          p_classroom_id: string
          p_preferences: Json
          p_profile_id: string
          p_schedule_config: Json
          p_semester: number
          p_smk_context: Json
          p_source_hash: string
          p_teacher_intent: Json
          p_teaching_context_id: string
          p_tp_id: string
          p_tp_revision_id: string
        }
        Returns: Json
      }
      fn_phase2b_create_version: {
        Args: {
          p_artifact_kind: string
          p_candidate_of_version_id: string
          p_content: Json
          p_dependencies: Json
          p_dependency_hash: string
          p_idempotency_key: string
          p_meeting_allocation_item_id: string
          p_model_version: string
          p_origin: string
          p_parent_version_id: string
          p_planning_context_id: string
          p_profile_id: string
          p_prompt_version: string
          p_scope_key: string
          p_source_hash: string
          p_source_snapshot: Json
          p_teacher_edited: boolean
        }
        Returns: Json
      }
      fn_phase2b_decide_candidate: {
        Args: {
          p_decision: string
          p_expected_selection_revision: number
          p_idempotency_key: string
          p_profile_id: string
          p_version_id: string
        }
        Returns: Json
      }
      fn_phase2b_invalidate_dependants: {
        Args: {
          p_dependency_hash: string
          p_dependency_id: string
          p_dependency_kind: string
          p_idempotency_prefix: string
          p_profile_id: string
          p_reason: string
        }
        Returns: number
      }
      fn_phase2b_owns_artifact: {
        Args: { p_artifact_id: string }
        Returns: boolean
      }
      fn_phase2b_owns_version: {
        Args: { p_version_id: string }
        Returns: boolean
      }
      fn_phase2b_recompute_usable: {
        Args: { p_version_id: string }
        Returns: undefined
      }
      fn_phase2b_rpm_ready_for_class: {
        Args: { p_planning_context_id: string; p_profile_id: string }
        Returns: boolean
      }
      fn_phase2b_transition_version: {
        Args: {
          p_action: string
          p_idempotency_key: string
          p_profile_id: string
          p_reason: string
          p_validation_status: string
          p_validation_summary: Json
          p_version_id: string
        }
        Returns: Json
      }
      fn_phase2c_all_meetings_usable: {
        Args: { p_planning_context_id: string; p_profile_id: string }
        Returns: boolean
      }
      fn_phase2c_artifact_state_json: {
        Args: {
          p_artifact_kind: string
          p_planning_context_id: string
          p_profile_id: string
        }
        Returns: Json
      }
      fn_phase2c_assessment_spec_confirmed: {
        Args: { p_planning_context_id: string; p_profile_id: string }
        Returns: boolean
      }
      fn_phase2c_context_spec_confirmed: {
        Args: { p_planning_context_id: string; p_profile_id: string }
        Returns: boolean
      }
      fn_phase2c_get_pipeline_state: {
        Args: { p_planning_context_id: string; p_profile_id: string }
        Returns: Json
      }
      fn_phase2c_material_spec_usable: {
        Args: { p_planning_context_id: string; p_profile_id: string }
        Returns: boolean
      }
      fn_phase2c_meeting_plan_state_json: {
        Args: {
          p_meeting_no: number
          p_planning_context_id: string
          p_profile_id: string
        }
        Returns: Json
      }
      fn_phase2c_validate_assessment_spec: {
        Args: { p_content: Json }
        Returns: Json
      }
      fn_phase2c_validate_context_spec: {
        Args: { p_content: Json }
        Returns: Json
      }
      fn_recap_visible_ortu: {
        Args: { p_classroom_id: string; p_tp_kktp_id: string }
        Returns: boolean
      }
      fn_recap_visible_siswa: {
        Args: { p_classroom_id: string; p_tp_kktp_id: string }
        Returns: boolean
      }
      fn_rpm_ready_for_class: {
        Args: { p_planning_context_id: string; p_profile_id: string }
        Returns: boolean
      }
      fn_semester_reset: { Args: { p_teacher_id: string }; Returns: Json }
      fn_server_apply_teaching_foundation: {
        Args: {
          p_context?: Json
          p_home_classroom_id?: string
          p_profile_id: string
          p_scope: Json
          p_target_classroom_id?: string
        }
        Returns: Json
      }
      fn_server_now: { Args: never; Returns: string }
      fn_tahun_ajaran_reset: { Args: { p_teacher_id: string }; Returns: Json }
      fn_update_pipeline_state: {
        Args: { p_planning_context_id: string; p_profile_id: string }
        Returns: undefined
      }
      fn_upsert_assessment_batch: {
        Args: { p_assessment_id: string; p_classroom_id: string; p_rows: Json }
        Returns: undefined
      }
      fn_upsert_rancang_profil: { Args: { p_payload: Json }; Returns: Json }
      fn_validate_ortu_login: {
        Args: { p_classroom_code: string; p_nama_anak: string; p_nis: string }
        Returns: boolean
      }
      fn_validate_roster_login: {
        Args: { p_classroom_code: string; p_nama: string; p_nis: string }
        Returns: string
      }
    }
    Enums: {
      member_role: "SISWA" | "ORTU"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      member_role: ["SISWA", "ORTU"],
    },
  },
} as const
