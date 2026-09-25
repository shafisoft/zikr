export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      close_group: { Args: { p_code: string }; Returns: undefined }
      contribute: {
        Args: {
          p_code: string
          p_delta: number
          p_event_id: string
          p_plan_id: string
          p_zikr_name: string
        }
        Returns: Json
      }
      create_group: {
        Args: { p_name: string; p_plan: Json; p_title: string }
        Returns: Json
      }
      create_plan: { Args: { p_code: string; p_plan: Json }; Returns: Json }
      end_plan: {
        Args: { p_code: string; p_plan_id: string }
        Returns: undefined
      }
      get_group_state: { Args: { p_code: string }; Returns: Json }
      get_or_create_device_token: { Args: never; Returns: string }
      join_group: { Args: { p_code: string; p_name: string }; Returns: Json }
      leave_group: { Args: { p_code: string }; Returns: undefined }
      pull_verified_zikrs: {
        Args: { p_cursor_id?: string; p_cursor_updated_at?: string }
        Returns: Json
      }
      purge_expired: { Args: never; Returns: undefined }
      remove_member: {
        Args: { p_code: string; p_user_id: string }
        Returns: undefined
      }
      share_zikr: {
        Args: { p_arabic_text: string; p_name: string; p_translation: string }
        Returns: Json
      }
      track_event: {
        Args: { p_name: string; p_properties?: Json }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  zikr_app: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string
          device_token: string
          id: number
          name: string
          properties: Json
        }
        Insert: {
          created_at?: string
          device_token: string
          id?: never
          name: string
          properties?: Json
        }
        Update: {
          created_at?: string
          device_token?: string
          id?: never
          name?: string
          properties?: Json
        }
        Relationships: []
      }
      devices: {
        Row: {
          created_at: string
          last_seen_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_seen_at?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_seen_at?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          code: string
          created_at: string
          id: string
          owner_id: string
          status: string
          title: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          owner_id: string
          status?: string
          title: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          owner_id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      members: {
        Row: {
          group_id: string
          joined_at: string
          name: string
          removed_at: string | null
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          name: string
          removed_at?: string | null
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          name?: string
          removed_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_contributions: {
        Row: {
          created_at: string
          delta: number
          event_id: string
          plan_id: string
          zikr_name: string
        }
        Insert: {
          created_at?: string
          delta: number
          event_id: string
          plan_id: string
          zikr_name: string
        }
        Update: {
          created_at?: string
          delta?: number
          event_id?: string
          plan_id?: string
          zikr_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_contributions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_daily_totals: {
        Row: {
          day: string
          plan_id: string
          total: number
          zikr_name: string
        }
        Insert: {
          day: string
          plan_id: string
          total: number
          zikr_name: string
        }
        Update: {
          day?: string
          plan_id?: string
          total?: number
          zikr_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_daily_totals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_owners: {
        Row: {
          created_at: string
          owner_id: string
          owner_kind: string
          plan_id: string
        }
        Insert: {
          created_at?: string
          owner_id: string
          owner_kind: string
          plan_id: string
        }
        Update: {
          created_at?: string
          owner_id?: string
          owner_kind?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_owners_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_zikrs: {
        Row: {
          created_at: string
          plan_id: string
          target: number | null
          total: number
          zikr_arabic: string | null
          zikr_name: string
        }
        Insert: {
          created_at?: string
          plan_id: string
          target?: number | null
          total?: number
          zikr_arabic?: string | null
          zikr_name: string
        }
        Update: {
          created_at?: string
          plan_id?: string
          target?: number | null
          total?: number
          zikr_arabic?: string | null
          zikr_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_zikrs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          ended_at: string | null
          ends_at: string | null
          id: string
          mode: string
          period: string
          starts_at: string | null
          status: string
          target: number | null
          time_zone: string | null
          title: string | null
          total: number
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          ends_at?: string | null
          id?: string
          mode: string
          period: string
          starts_at?: string | null
          status?: string
          target?: number | null
          time_zone?: string | null
          title?: string | null
          total?: number
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          ends_at?: string | null
          id?: string
          mode?: string
          period?: string
          starts_at?: string | null
          status?: string
          target?: number | null
          time_zone?: string | null
          title?: string | null
          total?: number
        }
        Relationships: []
      }
      shared_zikrs: {
        Row: {
          arabic_text: string | null
          id: string
          name: string
          name_bn: string | null
          submitted_at: string
          submitted_by: string | null
          translation: string | null
          translation_bn: string | null
          updated_at: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          arabic_text?: string | null
          id?: string
          name: string
          name_bn?: string | null
          submitted_at?: string
          submitted_by?: string | null
          translation?: string | null
          translation_bn?: string | null
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          arabic_text?: string | null
          id?: string
          name?: string
          name_bn?: string | null
          submitted_at?: string
          submitted_by?: string | null
          translation?: string | null
          translation_bn?: string | null
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_zikr_total: {
        Args: { p_delta: number; p_plan_id: string; p_zikr_name: string }
        Returns: undefined
      }
      group_member_count: { Args: { p_group_id: string }; Returns: number }
      insert_plan: {
        Args: { p_group_id: string; p_plan: Json }
        Returns: {
          created_at: string
          ended_at: string | null
          ends_at: string | null
          id: string
          mode: string
          period: string
          starts_at: string | null
          status: string
          target: number | null
          time_zone: string | null
          title: string | null
          total: number
        }
        SetofOptions: {
          from: "*"
          to: "plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_group_member: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: boolean
      }
      is_group_owner: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: boolean
      }
      is_plan_group_member: {
        Args: { p_plan_id: string; p_user_id: string }
        Returns: boolean
      }
      is_plan_group_owner: {
        Args: { p_plan_id: string; p_user_id: string }
        Returns: boolean
      }
      plan_period_start: {
        Args: { p_period: string; p_tz: string }
        Returns: string
      }
      random_device_token: { Args: never; Returns: string }
      random_group_code: { Args: never; Returns: string }
      set_plan_ended: { Args: { p_plan_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
  zikr_app: {
    Enums: {},
  },
} as const

