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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      clients: {
        Row: {
          company: string
          created_at: string
          email: string
          id: string
          name: string
          nif: string
          phone: string
        }
        Insert: {
          company: string
          created_at?: string
          email: string
          id?: string
          name: string
          nif?: string
          phone?: string
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          nif?: string
          phone?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          category_id: string | null
          description: string
          id: string
          invoice_id: string
          position: number
          quantity: number
          service_type: Database["public"]["Enums"]["service_type"]
          unit_price: number
        }
        Insert: {
          category_id?: string | null
          description: string
          id?: string
          invoice_id: string
          position?: number
          quantity?: number
          service_type?: Database["public"]["Enums"]["service_type"]
          unit_price?: number
        }
        Update: {
          category_id?: string | null
          description?: string
          id?: string
          invoice_id?: string
          position?: number
          quantity?: number
          service_type?: Database["public"]["Enums"]["service_type"]
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string
          created_at: string
          due_date: string
          id: string
          issue_date: string
          notes: string | null
          number: string
          status: Database["public"]["Enums"]["invoice_status"]
          subscription_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          due_date?: string
          id?: string
          issue_date?: string
          notes?: string | null
          number: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          due_date?: string
          id?: string
          issue_date?: string
          notes?: string | null
          number?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          date: string
          id: string
          invoice_id: string | null
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          date?: string
          id?: string
          invoice_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          date?: string
          id?: string
          invoice_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          category_id: string | null
          created_at: string
          default_price: number
          id: string
          name: string
          service_type: Database["public"]["Enums"]["service_type"]
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          default_price?: number
          id?: string
          name: string
          service_type?: Database["public"]["Enums"]["service_type"]
        }
        Update: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          default_price?: number
          id?: string
          name?: string
          service_type?: Database["public"]["Enums"]["service_type"]
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_items: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          description: string
          id: string
          invoiced_at: string | null
          kind: Database["public"]["Enums"]["subscription_item_kind"]
          position: number
          subscription_id: string
        }
        Insert: {
          amount?: number
          category_id?: string | null
          created_at?: string
          description: string
          id?: string
          invoiced_at?: string | null
          kind?: Database["public"]["Enums"]["subscription_item_kind"]
          position?: number
          subscription_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          description?: string
          id?: string
          invoiced_at?: string | null
          kind?: Database["public"]["Enums"]["subscription_item_kind"]
          position?: number
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_items_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_price_history: {
        Row: {
          amount: number
          id: string
          reason: string | null
          subscription_id: string
          subscription_item_id: string | null
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          amount: number
          id?: string
          reason?: string | null
          subscription_id: string
          subscription_item_id?: string | null
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          amount?: number
          id?: string
          reason?: string | null
          subscription_id?: string
          subscription_item_id?: string | null
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          active: boolean
          amount: number
          category_id: string | null
          client_id: string
          created_at: string
          first_invoice_generated_at: string | null
          frequency: Database["public"]["Enums"]["subscription_frequency"]
          id: string
          name: string
          next_billing_date: string
          paused_until: string | null
          prorate_first_invoice: boolean
          service_type: Database["public"]["Enums"]["service_type"]
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"]
        }
        Insert: {
          amount?: number
          category_id?: string | null
          client_id: string
          created_at?: string
          first_invoice_generated_at?: string | null
          frequency?: Database["public"]["Enums"]["subscription_frequency"]
          id?: string
          name: string
          next_billing_date?: string
          paused_until?: string | null
          prorate_first_invoice?: boolean
          service_type?: Database["public"]["Enums"]["service_type"]
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
        }
        Update: {
          amount?: number
          category_id?: string | null
          client_id?: string
          created_at?: string
          first_invoice_generated_at?: string | null
          frequency?: Database["public"]["Enums"]["subscription_frequency"]
          id?: string
          name?: string
          next_billing_date?: string
          paused_until?: string | null
          prorate_first_invoice?: boolean
          service_type?: Database["public"]["Enums"]["service_type"]
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_subscription_invoices: {
        Args: Record<string, never>
        Returns: number
      }
    }
    Enums: {
      invoice_status:
        | "paid"
        | "pending"
        | "overdue"
        | "draft"
        | "partially_paid"
      payment_method: "transfer" | "mbway" | "cash" | "card"
      service_type: "social_media" | "website" | "marketing" | "subscription"
      subscription_frequency:
        | "weekly"
        | "biweekly"
        | "monthly"
        | "bimonthly"
        | "quarterly"
        | "semiannual"
        | "yearly"
        | "biannual"
      subscription_item_kind: "recurring" | "setup" | "addon"
      subscription_status: "active" | "paused" | "cancelled"
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
  public: {
    Enums: {
      invoice_status: ["paid", "pending", "overdue", "draft", "partially_paid"],
      payment_method: ["transfer", "mbway", "cash", "card"],
      service_type: ["social_media", "website", "marketing", "subscription"],
      subscription_frequency: [
        "weekly",
        "biweekly",
        "monthly",
        "bimonthly",
        "quarterly",
        "semiannual",
        "yearly",
        "biannual",
      ],
    },
  },
} as const
