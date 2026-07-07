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
      cobrancas: {
        Row: {
          created_at: string
          data_pagamento: string | null
          hotel_id: string
          id: string
          observacoes: string | null
          roll_id: string
          status: Database["public"]["Enums"]["status_cobranca"]
          updated_at: string
          valor: number
          vencimento: string | null
        }
        Insert: {
          created_at?: string
          data_pagamento?: string | null
          hotel_id: string
          id?: string
          observacoes?: string | null
          roll_id: string
          status?: Database["public"]["Enums"]["status_cobranca"]
          updated_at?: string
          valor?: number
          vencimento?: string | null
        }
        Update: {
          created_at?: string
          data_pagamento?: string | null
          hotel_id?: string
          id?: string
          observacoes?: string | null
          roll_id?: string
          status?: Database["public"]["Enums"]["status_cobranca"]
          updated_at?: string
          valor?: number
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobrancas_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hoteis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: true
            referencedRelation: "rolls_alyani"
            referencedColumns: ["id"]
          },
        ]
      }
      conferencias: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          observacoes: string | null
          roll_alyani_id: string
          roll_prestadora_id: string
          total_divergencias: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          observacoes?: string | null
          roll_alyani_id: string
          roll_prestadora_id: string
          total_divergencias?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          observacoes?: string | null
          roll_alyani_id?: string
          roll_prestadora_id?: string
          total_divergencias?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conferencias_roll_alyani_id_fkey"
            columns: ["roll_alyani_id"]
            isOneToOne: false
            referencedRelation: "rolls_alyani"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conferencias_roll_prestadora_id_fkey"
            columns: ["roll_prestadora_id"]
            isOneToOne: false
            referencedRelation: "rolls_prestadora"
            referencedColumns: ["id"]
          },
        ]
      }
      hoteis: {
        Row: {
          cep: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          inscricao: string | null
          nome: string
          observacoes: string | null
          razao_social: string | null
          status: Database["public"]["Enums"]["status_ativo"]
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cep?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao?: string | null
          nome: string
          observacoes?: string | null
          razao_social?: string | null
          status?: Database["public"]["Enums"]["status_ativo"]
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cep?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao?: string | null
          nome?: string
          observacoes?: string | null
          razao_social?: string | null
          status?: Database["public"]["Enums"]["status_ativo"]
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pagamentos: {
        Row: {
          created_at: string
          data_pagamento: string | null
          id: string
          observacoes: string | null
          prestadora_id: string
          roll_id: string
          status: Database["public"]["Enums"]["status_pagamento"]
          updated_at: string
          valor: number
        }
        Insert: {
          created_at?: string
          data_pagamento?: string | null
          id?: string
          observacoes?: string | null
          prestadora_id: string
          roll_id: string
          status?: Database["public"]["Enums"]["status_pagamento"]
          updated_at?: string
          valor?: number
        }
        Update: {
          created_at?: string
          data_pagamento?: string | null
          id?: string
          observacoes?: string | null
          prestadora_id?: string
          roll_id?: string
          status?: Database["public"]["Enums"]["status_pagamento"]
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_prestadora_id_fkey"
            columns: ["prestadora_id"]
            isOneToOne: false
            referencedRelation: "prestadoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: true
            referencedRelation: "rolls_alyani"
            referencedColumns: ["id"]
          },
        ]
      }
      pecas: {
        Row: {
          created_at: string
          id: string
          nome: string
          status: Database["public"]["Enums"]["status_ativo"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          status?: Database["public"]["Enums"]["status_ativo"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          status?: Database["public"]["Enums"]["status_ativo"]
          updated_at?: string
        }
        Relationships: []
      }
      prestadoras: {
        Row: {
          cep: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          is_alyani: boolean
          nome: string
          observacoes: string | null
          razao_social: string | null
          status: Database["public"]["Enums"]["status_ativo"]
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cep?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          is_alyani?: boolean
          nome: string
          observacoes?: string | null
          razao_social?: string | null
          status?: Database["public"]["Enums"]["status_ativo"]
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cep?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          is_alyani?: boolean
          nome?: string
          observacoes?: string | null
          razao_social?: string | null
          status?: Database["public"]["Enums"]["status_ativo"]
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rolls_alyani: {
        Row: {
          cobrada: boolean
          created_at: string
          created_by: string | null
          data_roll: string
          data_vencimento: string | null
          expresso: boolean
          hotel_id: string
          id: string
          nf_fat: string | null
          numero: string
          observacoes: string | null
          prestadora_id: string | null
          total_custo: number
          total_lucro: number
          total_receita: number
          updated_at: string
        }
        Insert: {
          cobrada?: boolean
          created_at?: string
          created_by?: string | null
          data_roll?: string
          data_vencimento?: string | null
          expresso?: boolean
          hotel_id: string
          id?: string
          nf_fat?: string | null
          numero: string
          observacoes?: string | null
          prestadora_id?: string | null
          total_custo?: number
          total_lucro?: number
          total_receita?: number
          updated_at?: string
        }
        Update: {
          cobrada?: boolean
          created_at?: string
          created_by?: string | null
          data_roll?: string
          data_vencimento?: string | null
          expresso?: boolean
          hotel_id?: string
          id?: string
          nf_fat?: string | null
          numero?: string
          observacoes?: string | null
          prestadora_id?: string | null
          total_custo?: number
          total_lucro?: number
          total_receita?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolls_alyani_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hoteis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolls_alyani_prestadora_id_fkey"
            columns: ["prestadora_id"]
            isOneToOne: false
            referencedRelation: "prestadoras"
            referencedColumns: ["id"]
          },
        ]
      }
      rolls_alyani_itens: {
        Row: {
          created_at: string
          custo_total: number
          custo_unit: number
          diferenca_receita: number
          expresso_item: boolean
          id: string
          peca_id: string
          quantidade: number
          roll_id: string
          updated_at: string
          valor_total: number
          valor_unit: number
        }
        Insert: {
          created_at?: string
          custo_total?: number
          custo_unit?: number
          diferenca_receita?: number
          expresso_item?: boolean
          id?: string
          peca_id: string
          quantidade?: number
          roll_id: string
          updated_at?: string
          valor_total?: number
          valor_unit?: number
        }
        Update: {
          created_at?: string
          custo_total?: number
          custo_unit?: number
          diferenca_receita?: number
          expresso_item?: boolean
          id?: string
          peca_id?: string
          quantidade?: number
          roll_id?: string
          updated_at?: string
          valor_total?: number
          valor_unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "rolls_alyani_itens_peca_id_fkey"
            columns: ["peca_id"]
            isOneToOne: false
            referencedRelation: "pecas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolls_alyani_itens_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: false
            referencedRelation: "rolls_alyani"
            referencedColumns: ["id"]
          },
        ]
      }
      rolls_prestadora: {
        Row: {
          created_at: string
          created_by: string | null
          data_roll: string
          id: string
          numero: string
          observacoes: string | null
          prestadora_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_roll?: string
          id?: string
          numero: string
          observacoes?: string | null
          prestadora_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_roll?: string
          id?: string
          numero?: string
          observacoes?: string | null
          prestadora_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolls_prestadora_prestadora_id_fkey"
            columns: ["prestadora_id"]
            isOneToOne: false
            referencedRelation: "prestadoras"
            referencedColumns: ["id"]
          },
        ]
      }
      rolls_prestadora_itens: {
        Row: {
          created_at: string
          id: string
          peca_id: string
          quantidade: number
          roll_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          peca_id: string
          quantidade?: number
          roll_id: string
        }
        Update: {
          created_at?: string
          id?: string
          peca_id?: string
          quantidade?: number
          roll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rolls_prestadora_itens_peca_id_fkey"
            columns: ["peca_id"]
            isOneToOne: false
            referencedRelation: "pecas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rolls_prestadora_itens_roll_id_fkey"
            columns: ["roll_id"]
            isOneToOne: false
            referencedRelation: "rolls_prestadora"
            referencedColumns: ["id"]
          },
        ]
      }
      tabela_custos: {
        Row: {
          created_at: string
          data_vigencia: string
          id: string
          peca_id: string
          prestadora_id: string
          status: Database["public"]["Enums"]["status_ativo"]
          updated_at: string
          valor: number
        }
        Insert: {
          created_at?: string
          data_vigencia?: string
          id?: string
          peca_id: string
          prestadora_id: string
          status?: Database["public"]["Enums"]["status_ativo"]
          updated_at?: string
          valor?: number
        }
        Update: {
          created_at?: string
          data_vigencia?: string
          id?: string
          peca_id?: string
          prestadora_id?: string
          status?: Database["public"]["Enums"]["status_ativo"]
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "tabela_custos_peca_id_fkey"
            columns: ["peca_id"]
            isOneToOne: false
            referencedRelation: "pecas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tabela_custos_prestadora_id_fkey"
            columns: ["prestadora_id"]
            isOneToOne: false
            referencedRelation: "prestadoras"
            referencedColumns: ["id"]
          },
        ]
      }
      tabela_precos: {
        Row: {
          created_at: string
          data_vigencia: string
          hotel_id: string
          id: string
          peca_id: string
          status: Database["public"]["Enums"]["status_ativo"]
          updated_at: string
          valor_expresso: number
          valor_normal: number
        }
        Insert: {
          created_at?: string
          data_vigencia?: string
          hotel_id: string
          id?: string
          peca_id: string
          status?: Database["public"]["Enums"]["status_ativo"]
          updated_at?: string
          valor_expresso?: number
          valor_normal?: number
        }
        Update: {
          created_at?: string
          data_vigencia?: string
          hotel_id?: string
          id?: string
          peca_id?: string
          status?: Database["public"]["Enums"]["status_ativo"]
          updated_at?: string
          valor_expresso?: number
          valor_normal?: number
        }
        Relationships: [
          {
            foreignKeyName: "tabela_precos_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hoteis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tabela_precos_peca_id_fkey"
            columns: ["peca_id"]
            isOneToOne: false
            referencedRelation: "pecas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      tg_roll_recalc: { Args: { _roll_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "operador"
      status_ativo: "ativo" | "inativo"
      status_cobranca: "pendente" | "pago" | "atrasado" | "cancelado"
      status_pagamento: "pendente" | "pago" | "cancelado"
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
      app_role: ["admin", "operador"],
      status_ativo: ["ativo", "inativo"],
      status_cobranca: ["pendente", "pago", "atrasado", "cancelado"],
      status_pagamento: ["pendente", "pago", "cancelado"],
    },
  },
} as const
