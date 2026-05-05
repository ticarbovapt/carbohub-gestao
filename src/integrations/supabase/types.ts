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
      ai_insights: {
        Row: {
          created_at: string
          dismissed_at: string | null
          dismissed_by: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_dismissed: boolean
          message: string
          metadata: Json | null
          recommendation: string | null
          severity: Database["public"]["Enums"]["insight_severity"]
          type: string
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_dismissed?: boolean
          message: string
          metadata?: Json | null
          recommendation?: string | null
          severity?: Database["public"]["Enums"]["insight_severity"]
          type: string
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_dismissed?: boolean
          message?: string
          metadata?: Json | null
          recommendation?: string | null
          severity?: Database["public"]["Enums"]["insight_severity"]
          type?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_name: string
          action_type: string
          details: Json | null
          error_message: string | null
          executed_at: string
          executed_by: string | null
          id: string
          ip_address: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          action_name: string
          action_type: string
          details?: Json | null
          error_message?: string | null
          executed_at?: string
          executed_by?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          action_name?: string
          action_type?: string
          details?: Json | null
          error_message?: string | null
          executed_at?: string
          executed_by?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      bling_contacts: {
        Row: {
          bling_id: number
          celular: string | null
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          fantasia: string | null
          id: string
          ie: string | null
          is_client: boolean | null
          is_supplier: boolean | null
          nome: string
          raw_data: Json | null
          situacao: string | null
          synced_at: string
          telefone: string | null
          tipo_contato: string | null
          tipo_pessoa: string | null
          updated_at: string
        }
        Insert: {
          bling_id: number
          celular?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          fantasia?: string | null
          id?: string
          ie?: string | null
          is_client?: boolean | null
          is_supplier?: boolean | null
          nome?: string
          raw_data?: Json | null
          situacao?: string | null
          synced_at?: string
          telefone?: string | null
          tipo_contato?: string | null
          tipo_pessoa?: string | null
          updated_at?: string
        }
        Update: {
          bling_id?: number
          celular?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          fantasia?: string | null
          id?: string
          ie?: string | null
          is_client?: boolean | null
          is_supplier?: boolean | null
          nome?: string
          raw_data?: Json | null
          situacao?: string | null
          synced_at?: string
          telefone?: string | null
          tipo_contato?: string | null
          tipo_pessoa?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bling_integration: {
        Row: {
          access_token: string
          connected_at: string
          connected_by: string | null
          expires_at: string
          id: string
          is_active: boolean
          refresh_token: string
          scope: string | null
          token_type: string
          updated_at: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          connected_by?: string | null
          expires_at: string
          id?: string
          is_active?: boolean
          refresh_token: string
          scope?: string | null
          token_type?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          connected_by?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean
          refresh_token?: string
          scope?: string | null
          token_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      bling_orders: {
        Row: {
          bling_id: number
          contato_id: number | null
          contato_nome: string | null
          created_at: string
          data: string | null
          data_prevista: string | null
          data_saida: string | null
          id: string
          items: Json | null
          numero: string | null
          numero_loja: string | null
          observacoes: string | null
          raw_data: Json | null
          situacao_id: number | null
          situacao_valor: string | null
          synced_at: string
          total: number | null
          total_desconto: number | null
          total_frete: number | null
          total_produtos: number | null
          updated_at: string
        }
        Insert: {
          bling_id: number
          contato_id?: number | null
          contato_nome?: string | null
          created_at?: string
          data?: string | null
          data_prevista?: string | null
          data_saida?: string | null
          id?: string
          items?: Json | null
          numero?: string | null
          numero_loja?: string | null
          observacoes?: string | null
          raw_data?: Json | null
          situacao_id?: number | null
          situacao_valor?: string | null
          synced_at?: string
          total?: number | null
          total_desconto?: number | null
          total_frete?: number | null
          total_produtos?: number | null
          updated_at?: string
        }
        Update: {
          bling_id?: number
          contato_id?: number | null
          contato_nome?: string | null
          created_at?: string
          data?: string | null
          data_prevista?: string | null
          data_saida?: string | null
          id?: string
          items?: Json | null
          numero?: string | null
          numero_loja?: string | null
          observacoes?: string | null
          raw_data?: Json | null
          situacao_id?: number | null
          situacao_valor?: string | null
          synced_at?: string
          total?: number | null
          total_desconto?: number | null
          total_frete?: number | null
          total_produtos?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      bling_products: {
        Row: {
          bling_id: number
          codigo: string | null
          created_at: string
          estoque_atual: number | null
          estoque_reservado: number | null
          estoque_synced_at: string | null
          formato: string | null
          gtin: string | null
          gtin_embalagem: string | null
          id: string
          nome: string
          peso_bruto: number | null
          peso_liquido: number | null
          preco: number | null
          raw_data: Json | null
          situacao: string | null
          synced_at: string
          tipo: string | null
          unidade: string | null
          updated_at: string
        }
        Insert: {
          bling_id: number
          codigo?: string | null
          created_at?: string
          estoque_atual?: number | null
          estoque_reservado?: number | null
          estoque_synced_at?: string | null
          formato?: string | null
          gtin?: string | null
          gtin_embalagem?: string | null
          id?: string
          nome?: string
          peso_bruto?: number | null
          peso_liquido?: number | null
          preco?: number | null
          raw_data?: Json | null
          situacao?: string | null
          synced_at?: string
          tipo?: string | null
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          bling_id?: number
          codigo?: string | null
          created_at?: string
          estoque_atual?: number | null
          estoque_reservado?: number | null
          estoque_synced_at?: string | null
          formato?: string | null
          gtin?: string | null
          gtin_embalagem?: string | null
          id?: string
          nome?: string
          peso_bruto?: number | null
          peso_liquido?: number | null
          preco?: number | null
          raw_data?: Json | null
          situacao?: string | null
          synced_at?: string
          tipo?: string | null
          unidade?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bling_sync_log: {
        Row: {
          entity_type: string
          error_message: string | null
          finished_at: string | null
          id: string
          records_failed: number | null
          records_synced: number | null
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          entity_type: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          records_failed?: number | null
          records_synced?: number | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          entity_type?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          records_failed?: number | null
          records_synced?: number | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      bling_vendedores: {
        Row: {
          bling_id: number
          comissao_percentual: number | null
          email: string | null
          id: number
          nome: string
          raw_data: Json | null
          situacao: string | null
          synced_at: string | null
          updated_at: string | null
        }
        Insert: {
          bling_id: number
          comissao_percentual?: number | null
          email?: string | null
          id?: number
          nome: string
          raw_data?: Json | null
          situacao?: string | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Update: {
          bling_id?: number
          comissao_percentual?: number | null
          email?: string | null
          id?: number
          nome?: string
          raw_data?: Json | null
          situacao?: string | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      carbo_user_roles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["carbo_role"]
          scope_departments:
            | Database["public"]["Enums"]["department_type"][]
            | null
          scope_macro_flows: Database["public"]["Enums"]["macro_flow"][] | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["carbo_role"]
          scope_departments?:
            | Database["public"]["Enums"]["department_type"][]
            | null
          scope_macro_flows?: Database["public"]["Enums"]["macro_flow"][] | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["carbo_role"]
          scope_departments?:
            | Database["public"]["Enums"]["department_type"][]
            | null
          scope_macro_flows?: Database["public"]["Enums"]["macro_flow"][] | null
          user_id?: string
        }
        Relationships: []
      }
      carbovapt_payments: {
        Row: {
          amount: number
          created_at: string
          external_event_id: string | null
          external_payment_id: string | null
          id: string
          paid_at: string | null
          payment_method: string
          payment_status: string
          pix_copy_paste: string | null
          pix_qr_code: string | null
          request_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          external_event_id?: string | null
          external_payment_id?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string
          payment_status?: string
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          request_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          external_event_id?: string | null
          external_payment_id?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string
          payment_status?: string
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carbovapt_payments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "carbovapt_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      carbovapt_requests: {
        Row: {
          amount_brl: number | null
          confirmed_terms: boolean
          created_at: string
          created_by: string | null
          credit_cost: number | null
          id: string
          licensee_id: string
          modality: string
          notes: string | null
          preferred_date: string | null
          region: string | null
          request_status: string
          time_window_end: string | null
          time_window_start: string | null
          updated_at: string
        }
        Insert: {
          amount_brl?: number | null
          confirmed_terms?: boolean
          created_at?: string
          created_by?: string | null
          credit_cost?: number | null
          id?: string
          licensee_id: string
          modality: string
          notes?: string | null
          preferred_date?: string | null
          region?: string | null
          request_status?: string
          time_window_end?: string | null
          time_window_start?: string | null
          updated_at?: string
        }
        Update: {
          amount_brl?: number | null
          confirmed_terms?: boolean
          created_at?: string
          created_by?: string | null
          credit_cost?: number | null
          id?: string
          licensee_id?: string
          modality?: string
          notes?: string | null
          preferred_date?: string | null
          region?: string | null
          request_status?: string
          time_window_end?: string | null
          time_window_start?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      carboze_orders: {
        Row: {
          aceite_assinado: boolean | null
          aceite_pdf_url: string | null
          avg_monthly_vehicles: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cnae: string | null
          cnpj: string | null
          commission_amount: number | null
          commission_paid_at: string | null
          commission_rate: number | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          delivered_at: string | null
          delivery_address: string | null
          delivery_city: string | null
          delivery_state: string | null
          delivery_zip: string | null
          discount: number | null
          external_ref: string | null
          has_commission: boolean | null
          id: string
          internal_classification: string | null
          internal_notes: string | null
          invoice_number: string | null
          invoiced_at: string | null
          is_recurring: boolean
          is_test: boolean
          items: Json
          last_recurrence_order_id: string | null
          latitude: number | null
          legal_name: string | null
          licensee_id: string | null
          longitude: number | null
          next_delivery_date: string | null
          notes: string | null
          order_number: string
          order_type: string
          parent_order_id: string | null
          point_type: string | null
          product_code: string
          recurrence_interval_days: number | null
          shipped_at: string | null
          shipping_cost: number | null
          situacao_cadastral: string | null
          source_file: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number | null
          total: number | null
          tracking_code: string | null
          tracking_url: string | null
          trade_name: string | null
          updated_at: string
          works_with_diesel: boolean | null
          works_with_fleets: boolean | null
        }
        Insert: {
          aceite_assinado?: boolean | null
          aceite_pdf_url?: string | null
          avg_monthly_vehicles?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cnae?: string | null
          cnpj?: string | null
          commission_amount?: number | null
          commission_paid_at?: string | null
          commission_rate?: number | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_city?: string | null
          delivery_state?: string | null
          delivery_zip?: string | null
          discount?: number | null
          external_ref?: string | null
          has_commission?: boolean | null
          id?: string
          internal_classification?: string | null
          internal_notes?: string | null
          invoice_number?: string | null
          invoiced_at?: string | null
          is_recurring?: boolean
          is_test?: boolean
          items?: Json
          last_recurrence_order_id?: string | null
          latitude?: number | null
          legal_name?: string | null
          licensee_id?: string | null
          longitude?: number | null
          next_delivery_date?: string | null
          notes?: string | null
          order_number: string
          order_type?: string
          parent_order_id?: string | null
          point_type?: string | null
          product_code?: string
          recurrence_interval_days?: number | null
          shipped_at?: string | null
          shipping_cost?: number | null
          situacao_cadastral?: string | null
          source_file?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number | null
          total?: number | null
          tracking_code?: string | null
          tracking_url?: string | null
          trade_name?: string | null
          updated_at?: string
          works_with_diesel?: boolean | null
          works_with_fleets?: boolean | null
        }
        Update: {
          aceite_assinado?: boolean | null
          aceite_pdf_url?: string | null
          avg_monthly_vehicles?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cnae?: string | null
          cnpj?: string | null
          commission_amount?: number | null
          commission_paid_at?: string | null
          commission_rate?: number | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_city?: string | null
          delivery_state?: string | null
          delivery_zip?: string | null
          discount?: number | null
          external_ref?: string | null
          has_commission?: boolean | null
          id?: string
          internal_classification?: string | null
          internal_notes?: string | null
          invoice_number?: string | null
          invoiced_at?: string | null
          is_recurring?: boolean
          is_test?: boolean
          items?: Json
          last_recurrence_order_id?: string | null
          latitude?: number | null
          legal_name?: string | null
          licensee_id?: string | null
          longitude?: number | null
          next_delivery_date?: string | null
          notes?: string | null
          order_number?: string
          order_type?: string
          parent_order_id?: string | null
          point_type?: string | null
          product_code?: string
          recurrence_interval_days?: number | null
          shipped_at?: string | null
          shipping_cost?: number | null
          situacao_cadastral?: string | null
          source_file?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number | null
          total?: number | null
          tracking_code?: string | null
          tracking_url?: string | null
          trade_name?: string | null
          updated_at?: string
          works_with_diesel?: boolean | null
          works_with_fleets?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "carboze_orders_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carboze_orders_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_carboze_orders_parent_order"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_carboze_orders_parent_order"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders_masked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_carboze_orders_parent_order"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_stage_config: {
        Row: {
          created_at: string | null
          default_items: Json
          description: string | null
          display_order: number
          id: string
          is_optional: boolean | null
          responsible_role: Database["public"]["Enums"]["carbo_role"]
          stage: Database["public"]["Enums"]["os_workflow_stage"]
          stage_label: string
          status_label: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          default_items?: Json
          description?: string | null
          display_order?: number
          id?: string
          is_optional?: boolean | null
          responsible_role: Database["public"]["Enums"]["carbo_role"]
          stage: Database["public"]["Enums"]["os_workflow_stage"]
          stage_label: string
          status_label: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          default_items?: Json
          description?: string | null
          display_order?: number
          id?: string
          is_optional?: boolean | null
          responsible_role?: Database["public"]["Enums"]["carbo_role"]
          stage?: Database["public"]["Enums"]["os_workflow_stage"]
          stage_label?: string
          status_label?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      checklist_templates: {
        Row: {
          created_at: string
          created_by: string | null
          department: Database["public"]["Enums"]["department_type"]
          description: string | null
          id: string
          is_active: boolean | null
          items: Json
          name: string
          updated_at: string
          version: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department: Database["public"]["Enums"]["department_type"]
          description?: string | null
          id?: string
          is_active?: boolean | null
          items?: Json
          name: string
          updated_at?: string
          version?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: Database["public"]["Enums"]["department_type"]
          description?: string | null
          id?: string
          is_active?: boolean | null
          items?: Json
          name?: string
          updated_at?: string
          version?: number | null
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string | null
          description: string | null
          expires_at: string | null
          id: string
          order_id: string | null
          service_order_id: string | null
          type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          order_id?: string | null
          service_order_id?: string | null
          type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          order_id?: string | null
          service_order_id?: string | null
          type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders_masked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "licensee_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_activities: {
        Row: {
          activity_type: string
          body: string | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          direction: string | null
          done_at: string | null
          due_at: string | null
          id: string
          lead_id: string
          meta: Json | null
          stage_from: string | null
          stage_to: string | null
          status: string | null
          subject: string | null
          updated_at: string | null
        }
        Insert: {
          activity_type: string
          body?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          direction?: string | null
          done_at?: string | null
          due_at?: string | null
          id?: string
          lead_id: string
          meta?: Json | null
          stage_from?: string | null
          stage_to?: string | null
          status?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_type?: string
          body?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          direction?: string | null
          done_at?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string
          meta?: Json | null
          stage_from?: string | null
          stage_to?: string | null
          status?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          address: string | null
          assigned_team: string | null
          assigned_to: string | null
          bairro: string | null
          city: string | null
          cnpj: string | null
          cnpj_data: Json | null
          cnpj_status: string | null
          contact_attempts: number | null
          contact_cpf: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_whatsapp: string | null
          created_at: string | null
          created_by: string | null
          credit_amount: number | null
          custom_fields: Json | null
          equipment_type: string | null
          estimated_revenue: number | null
          fleet_size: number | null
          fuel_type: string | null
          funnel_type: string
          google_presence: boolean | null
          id: string
          instagram: string | null
          last_contact_at: string | null
          latitude: number | null
          legal_name: string | null
          longitude: number | null
          lost_at: string | null
          lost_reason: string | null
          monthly_consumption: number | null
          next_action_desc: string | null
          next_follow_up_at: string | null
          next_steps: string | null
          notes: string | null
          onboarding_checklist: Json | null
          onboarding_phase: number | null
          poc_done: boolean | null
          probability: number | null
          products: string[] | null
          ramo: string | null
          score: number | null
          segment: string | null
          service_focus: string | null
          source: string | null
          source_meta: Json | null
          stage: string
          state: string | null
          tags: string[] | null
          temperature: string | null
          territory: string | null
          trade_name: string | null
          updated_at: string | null
          vehicles_per_day: number | null
          wave: string | null
          won_at: string | null
        }
        Insert: {
          address?: string | null
          assigned_team?: string | null
          assigned_to?: string | null
          bairro?: string | null
          city?: string | null
          cnpj?: string | null
          cnpj_data?: Json | null
          cnpj_status?: string | null
          contact_attempts?: number | null
          contact_cpf?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_amount?: number | null
          custom_fields?: Json | null
          equipment_type?: string | null
          estimated_revenue?: number | null
          fleet_size?: number | null
          fuel_type?: string | null
          funnel_type: string
          google_presence?: boolean | null
          id?: string
          instagram?: string | null
          last_contact_at?: string | null
          latitude?: number | null
          legal_name?: string | null
          longitude?: number | null
          lost_at?: string | null
          lost_reason?: string | null
          monthly_consumption?: number | null
          next_action_desc?: string | null
          next_follow_up_at?: string | null
          next_steps?: string | null
          notes?: string | null
          onboarding_checklist?: Json | null
          onboarding_phase?: number | null
          poc_done?: boolean | null
          probability?: number | null
          products?: string[] | null
          ramo?: string | null
          score?: number | null
          segment?: string | null
          service_focus?: string | null
          source?: string | null
          source_meta?: Json | null
          stage?: string
          state?: string | null
          tags?: string[] | null
          temperature?: string | null
          territory?: string | null
          trade_name?: string | null
          updated_at?: string | null
          vehicles_per_day?: number | null
          wave?: string | null
          won_at?: string | null
        }
        Update: {
          address?: string | null
          assigned_team?: string | null
          assigned_to?: string | null
          bairro?: string | null
          city?: string | null
          cnpj?: string | null
          cnpj_data?: Json | null
          cnpj_status?: string | null
          contact_attempts?: number | null
          contact_cpf?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_amount?: number | null
          custom_fields?: Json | null
          equipment_type?: string | null
          estimated_revenue?: number | null
          fleet_size?: number | null
          fuel_type?: string | null
          funnel_type?: string
          google_presence?: boolean | null
          id?: string
          instagram?: string | null
          last_contact_at?: string | null
          latitude?: number | null
          legal_name?: string | null
          longitude?: number | null
          lost_at?: string | null
          lost_reason?: string | null
          monthly_consumption?: number | null
          next_action_desc?: string | null
          next_follow_up_at?: string | null
          next_steps?: string | null
          notes?: string | null
          onboarding_checklist?: Json | null
          onboarding_phase?: number | null
          poc_done?: boolean | null
          probability?: number | null
          products?: string[] | null
          ramo?: string | null
          score?: number | null
          segment?: string | null
          service_focus?: string | null
          source?: string | null
          source_meta?: Json | null
          stage?: string
          state?: string | null
          tags?: string[] | null
          temperature?: string | null
          territory?: string | null
          trade_name?: string | null
          updated_at?: string | null
          vehicles_per_day?: number | null
          wave?: string | null
          won_at?: string | null
        }
        Relationships: []
      }
      crm_pipeline_stages: {
        Row: {
          created_at: string | null
          funnel_type: string
          id: string
          required_fields: Json | null
          stage_slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          funnel_type: string
          id?: string
          required_fields?: Json | null
          stage_slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          funnel_type?: string
          id?: string
          required_fields?: Json | null
          stage_slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          company: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      department_macro_flow_mapping: {
        Row: {
          created_at: string
          department_type: Database["public"]["Enums"]["department_type"]
          display_order: number
          id: string
          macro_flow: Database["public"]["Enums"]["macro_flow"]
        }
        Insert: {
          created_at?: string
          department_type: Database["public"]["Enums"]["department_type"]
          display_order?: number
          id?: string
          macro_flow: Database["public"]["Enums"]["macro_flow"]
        }
        Update: {
          created_at?: string
          department_type?: Database["public"]["Enums"]["department_type"]
          display_order?: number
          id?: string
          macro_flow?: Database["public"]["Enums"]["macro_flow"]
        }
        Relationships: []
      }
      department_sla_config: {
        Row: {
          created_at: string | null
          default_sla_hours: number
          department_type: Database["public"]["Enums"]["department_type"]
          id: string
          requires_checklist: boolean | null
          requires_validation: boolean | null
          updated_at: string | null
          warning_threshold_percent: number
        }
        Insert: {
          created_at?: string | null
          default_sla_hours?: number
          department_type: Database["public"]["Enums"]["department_type"]
          id?: string
          requires_checklist?: boolean | null
          requires_validation?: boolean | null
          updated_at?: string | null
          warning_threshold_percent?: number
        }
        Update: {
          created_at?: string | null
          default_sla_hours?: number
          department_type?: Database["public"]["Enums"]["department_type"]
          id?: string
          requires_checklist?: boolean | null
          requires_validation?: boolean | null
          updated_at?: string | null
          warning_threshold_percent?: number
        }
        Relationships: []
      }
      department_username_sequences: {
        Row: {
          created_at: string
          department_prefix: string
          id: string
          last_sequence: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_prefix: string
          id?: string
          last_sequence?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_prefix?: string
          id?: string
          last_sequence?: number
          updated_at?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          display_order: number
          icon: string | null
          id: string
          is_active: boolean | null
          macro_flow: Database["public"]["Enums"]["macro_flow"] | null
          name: string
          type: Database["public"]["Enums"]["department_type"]
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean | null
          macro_flow?: Database["public"]["Enums"]["macro_flow"] | null
          name: string
          type: Database["public"]["Enums"]["department_type"]
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean | null
          macro_flow?: Database["public"]["Enums"]["macro_flow"] | null
          name?: string
          type?: Database["public"]["Enums"]["department_type"]
        }
        Relationships: []
      }
      descarb_clients: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          email: string | null
          federal_code: string | null
          id: string
          licensee_id: string
          name: string
          notes: string | null
          phone: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          federal_code?: string | null
          id?: string
          licensee_id: string
          name: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          federal_code?: string | null
          id?: string
          licensee_id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "descarb_clients_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descarb_clients_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      descarb_sales: {
        Row: {
          carboflix_cert_num: string | null
          certificate_issued: boolean
          client_id: string | null
          created_at: string
          created_by: string | null
          discount: number
          executed_at: string | null
          id: string
          is_pre_sale: boolean
          licensee_id: string
          machine_id: string | null
          modality: string
          notes: string | null
          payment_type: string
          pre_sale_status: string | null
          preferred_date: string | null
          reagent_qty_used: number
          reagent_type: string
          total_value: number
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          carboflix_cert_num?: string | null
          certificate_issued?: boolean
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          executed_at?: string | null
          id?: string
          is_pre_sale?: boolean
          licensee_id: string
          machine_id?: string | null
          modality: string
          notes?: string | null
          payment_type?: string
          pre_sale_status?: string | null
          preferred_date?: string | null
          reagent_qty_used?: number
          reagent_type?: string
          total_value?: number
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          carboflix_cert_num?: string | null
          certificate_issued?: boolean
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          discount?: number
          executed_at?: string | null
          id?: string
          is_pre_sale?: boolean
          licensee_id?: string
          machine_id?: string | null
          modality?: string
          notes?: string | null
          payment_type?: string
          pre_sale_status?: string | null
          preferred_date?: string | null
          reagent_qty_used?: number
          reagent_type?: string
          total_value?: number
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "descarb_sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "descarb_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descarb_sales_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descarb_sales_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descarb_sales_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descarb_sales_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "descarb_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      descarb_vehicles: {
        Row: {
          brand: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          fuel_type: string
          id: string
          kilometer: number | null
          license_plate: string
          licensee_id: string
          model: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          brand?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          fuel_type?: string
          id?: string
          kilometer?: number | null
          license_plate: string
          licensee_id: string
          model?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          brand?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          fuel_type?: string
          id?: string
          kilometer?: number | null
          license_plate?: string
          licensee_id?: string
          model?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "descarb_vehicles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "descarb_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descarb_vehicles_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descarb_vehicles_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_audit_logs: {
        Row: {
          action_type: string
          created_at: string | null
          department: Database["public"]["Enums"]["department_type"] | null
          details: Json | null
          id: string
          reason: string
          resource_id: string | null
          resource_type: string
          severity: string | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          department?: Database["public"]["Enums"]["department_type"] | null
          details?: Json | null
          id?: string
          reason: string
          resource_id?: string | null
          resource_type: string
          severity?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          department?: Database["public"]["Enums"]["department_type"] | null
          details?: Json | null
          id?: string
          reason?: string
          resource_id?: string | null
          resource_type?: string
          severity?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      forecast_snapshots: {
        Row: {
          confidence: number | null
          created_at: string
          details: Json | null
          entity: string
          entity_id: string | null
          generated_at: string
          id: string
          period_days: number
          product_code: string | null
          projected_revenue: number | null
          projected_volume: number | null
          risk_level: Database["public"]["Enums"]["insight_severity"]
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          details?: Json | null
          entity: string
          entity_id?: string | null
          generated_at?: string
          id?: string
          period_days?: number
          product_code?: string | null
          projected_revenue?: number | null
          projected_volume?: number | null
          risk_level?: Database["public"]["Enums"]["insight_severity"]
        }
        Update: {
          confidence?: number | null
          created_at?: string
          details?: Json | null
          entity?: string
          entity_id?: string | null
          generated_at?: string
          id?: string
          period_days?: number
          product_code?: string | null
          projected_revenue?: number | null
          projected_volume?: number | null
          risk_level?: Database["public"]["Enums"]["insight_severity"]
        }
        Relationships: []
      }
      freight_quotes: {
        Row: {
          carriers: Json
          created_at: string | null
          created_by: string | null
          dimensions_cm: Json | null
          from_cep: string
          id: string
          insurance_value: number | null
          notes: string | null
          product_ref: string | null
          quantity: number | null
          selected_carrier: string | null
          selected_days: number | null
          selected_price: number | null
          to_cep: string
          to_city: string | null
          to_state: string | null
          weight_kg: number | null
        }
        Insert: {
          carriers: Json
          created_at?: string | null
          created_by?: string | null
          dimensions_cm?: Json | null
          from_cep?: string
          id?: string
          insurance_value?: number | null
          notes?: string | null
          product_ref?: string | null
          quantity?: number | null
          selected_carrier?: string | null
          selected_days?: number | null
          selected_price?: number | null
          to_cep: string
          to_city?: string | null
          to_state?: string | null
          weight_kg?: number | null
        }
        Update: {
          carriers?: Json
          created_at?: string | null
          created_by?: string | null
          dimensions_cm?: Json | null
          from_cep?: string
          id?: string
          insurance_value?: number | null
          notes?: string | null
          product_ref?: string | null
          quantity?: number | null
          selected_carrier?: string | null
          selected_days?: number | null
          selected_price?: number | null
          to_cep?: string
          to_city?: string | null
          to_state?: string | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      governance_audit_log: {
        Row: {
          action_type: string
          created_at: string
          department: Database["public"]["Enums"]["department_type"] | null
          details: Json | null
          id: string
          ip_address: string | null
          macro_flow: Database["public"]["Enums"]["macro_flow"] | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          department?: Database["public"]["Enums"]["department_type"] | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          macro_flow?: Database["public"]["Enums"]["macro_flow"] | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          department?: Database["public"]["Enums"]["department_type"] | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          macro_flow?: Database["public"]["Enums"]["macro_flow"] | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      import_runs: {
        Row: {
          filename: string
          id: string
          imported_at: string
          imported_by: string | null
          notes: string | null
          rows_imported: number
        }
        Insert: {
          filename: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          notes?: string | null
          rows_imported?: number
        }
        Update: {
          filename?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          notes?: string | null
          rows_imported?: number
        }
        Relationships: []
      }
      inventory_lot: {
        Row: {
          available_volume_ml: number
          collected_samples: number
          created_at: string
          created_by: string | null
          expected_samples: number
          expired_at: string | null
          id: string
          initial_volume_ml: number
          lot_code: string
          notes: string | null
          product_id: string
          quality_responsible_id: string | null
          received_at: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["lot_status"]
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          available_volume_ml?: number
          collected_samples?: number
          created_at?: string
          created_by?: string | null
          expected_samples?: number
          expired_at?: string | null
          id?: string
          initial_volume_ml?: number
          lot_code: string
          notes?: string | null
          product_id: string
          quality_responsible_id?: string | null
          received_at?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["lot_status"]
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          available_volume_ml?: number
          collected_samples?: number
          created_at?: string
          created_by?: string | null
          expected_samples?: number
          expired_at?: string | null
          id?: string
          initial_volume_ml?: number
          lot_code?: string
          notes?: string | null
          product_id?: string
          quality_responsible_id?: string | null
          received_at?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["lot_status"]
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lot_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mrp_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lot_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lot_consumption: {
        Row: {
          consumed_at: string
          consumed_by: string | null
          id: string
          lot_id: string
          production_order_id: string
          volume_consumed_ml: number
        }
        Insert: {
          consumed_at?: string
          consumed_by?: string | null
          id?: string
          lot_id: string
          production_order_id: string
          volume_consumed_ml: number
        }
        Update: {
          consumed_at?: string
          consumed_by?: string | null
          id?: string
          lot_id?: string
          production_order_id?: string
          volume_consumed_ml?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lot_consumption_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lot_consumption_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      licensee_commission_statements: {
        Row: {
          closed_at: string | null
          created_at: string
          gross_total: number | null
          id: string
          licensee_id: string
          notes: string | null
          paid_at: string | null
          period_month: number
          period_year: number
          status: string
          total_bonus: number | null
          total_order_commission: number | null
          total_orders: number | null
          total_recurrence_commission: number | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          gross_total?: number | null
          id?: string
          licensee_id: string
          notes?: string | null
          paid_at?: string | null
          period_month: number
          period_year: number
          status?: string
          total_bonus?: number | null
          total_order_commission?: number | null
          total_orders?: number | null
          total_recurrence_commission?: number | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          gross_total?: number | null
          id?: string
          licensee_id?: string
          notes?: string | null
          paid_at?: string | null
          period_month?: number
          period_year?: number
          status?: string
          total_bonus?: number | null
          total_order_commission?: number | null
          total_orders?: number | null
          total_recurrence_commission?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licensee_commission_statements_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_commission_statements_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      licensee_commissions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          base_amount: number
          bonus_amount: number | null
          carboze_order_id: string | null
          commission_amount: number
          commission_rate: number
          commission_type: string
          created_at: string
          id: string
          licensee_id: string
          licensee_request_id: string | null
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          payment_reference: string | null
          reference_month: number
          reference_year: number
          rejection_reason: string | null
          service_order_id: string | null
          status: Database["public"]["Enums"]["commission_status"]
          total_amount: number
          updated_at: string
          validated_at: string | null
          validated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          base_amount: number
          bonus_amount?: number | null
          carboze_order_id?: string | null
          commission_amount: number
          commission_rate: number
          commission_type: string
          created_at?: string
          id?: string
          licensee_id: string
          licensee_request_id?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_reference?: string | null
          reference_month: number
          reference_year: number
          rejection_reason?: string | null
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          total_amount: number
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          base_amount?: number
          bonus_amount?: number | null
          carboze_order_id?: string | null
          commission_amount?: number
          commission_rate?: number
          commission_type?: string
          created_at?: string
          id?: string
          licensee_id?: string
          licensee_request_id?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_reference?: string | null
          reference_month?: number
          reference_year?: number
          rejection_reason?: string | null
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          total_amount?: number
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licensee_commissions_carboze_order_id_fkey"
            columns: ["carboze_order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_commissions_carboze_order_id_fkey"
            columns: ["carboze_order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders_masked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_commissions_carboze_order_id_fkey"
            columns: ["carboze_order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_commissions_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_commissions_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_commissions_licensee_request_id_fkey"
            columns: ["licensee_request_id"]
            isOneToOne: false
            referencedRelation: "licensee_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_commissions_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      licensee_gamification: {
        Row: {
          avg_sla_hours: number | null
          calculated_at: string | null
          created_at: string
          customer_recurrence_score: number | null
          growth_score: number | null
          id: string
          is_visible: boolean | null
          level: Database["public"]["Enums"]["licensee_level"]
          licensee_id: string
          order_volume_score: number | null
          period_month: number
          period_year: number
          platform_usage_score: number | null
          previous_month_orders: number | null
          returning_customers: number | null
          rework_count: number | null
          sla_score: number | null
          total_orders: number | null
          total_score: number
          unique_customers: number | null
          updated_at: string
        }
        Insert: {
          avg_sla_hours?: number | null
          calculated_at?: string | null
          created_at?: string
          customer_recurrence_score?: number | null
          growth_score?: number | null
          id?: string
          is_visible?: boolean | null
          level?: Database["public"]["Enums"]["licensee_level"]
          licensee_id: string
          order_volume_score?: number | null
          period_month: number
          period_year: number
          platform_usage_score?: number | null
          previous_month_orders?: number | null
          returning_customers?: number | null
          rework_count?: number | null
          sla_score?: number | null
          total_orders?: number | null
          total_score?: number
          unique_customers?: number | null
          updated_at?: string
        }
        Update: {
          avg_sla_hours?: number | null
          calculated_at?: string | null
          created_at?: string
          customer_recurrence_score?: number | null
          growth_score?: number | null
          id?: string
          is_visible?: boolean | null
          level?: Database["public"]["Enums"]["licensee_level"]
          licensee_id?: string
          order_volume_score?: number | null
          period_month?: number
          period_year?: number
          platform_usage_score?: number | null
          previous_month_orders?: number | null
          returning_customers?: number | null
          rework_count?: number | null
          sla_score?: number | null
          total_orders?: number | null
          total_score?: number
          unique_customers?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licensee_gamification_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_gamification_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      licensee_product_stock: {
        Row: {
          id: string
          licensee_id: string
          min_qty_alert: number
          mrp_product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          id?: string
          licensee_id: string
          min_qty_alert?: number
          mrp_product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          id?: string
          licensee_id?: string
          min_qty_alert?: number
          mrp_product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licensee_product_stock_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_product_stock_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_product_stock_mrp_product_id_fkey"
            columns: ["mrp_product_id"]
            isOneToOne: false
            referencedRelation: "mrp_products"
            referencedColumns: ["id"]
          },
        ]
      }
      licensee_reagent_stock: {
        Row: {
          id: string
          licensee_id: string
          min_qty_alert: number
          qty_diesel: number
          qty_flex: number
          qty_normal: number
          updated_at: string
        }
        Insert: {
          id?: string
          licensee_id: string
          min_qty_alert?: number
          qty_diesel?: number
          qty_flex?: number
          qty_normal?: number
          updated_at?: string
        }
        Update: {
          id?: string
          licensee_id?: string
          min_qty_alert?: number
          qty_diesel?: number
          qty_flex?: number
          qty_normal?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licensee_reagent_stock_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: true
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_reagent_stock_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: true
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      licensee_requests: {
        Row: {
          amount_charged: number | null
          carboze_order_id: string | null
          created_at: string | null
          created_by: string | null
          credits_used: number | null
          id: string
          internal_notes: string | null
          is_recurring: boolean | null
          licensee_id: string
          metadata: Json | null
          notes: string | null
          operation_address: string | null
          operation_city: string | null
          operation_state: string | null
          operation_type: Database["public"]["Enums"]["operation_type"]
          operation_zip: string | null
          parent_request_id: string | null
          payment_method: string | null
          preferred_date: string | null
          preferred_time_end: string | null
          preferred_time_start: string | null
          recurrence_interval_days: number | null
          request_number: string
          scheduled_date: string | null
          service_id: string
          service_order_id: string | null
          sla_breached: boolean | null
          sla_deadline: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          amount_charged?: number | null
          carboze_order_id?: string | null
          created_at?: string | null
          created_by?: string | null
          credits_used?: number | null
          id?: string
          internal_notes?: string | null
          is_recurring?: boolean | null
          licensee_id: string
          metadata?: Json | null
          notes?: string | null
          operation_address?: string | null
          operation_city?: string | null
          operation_state?: string | null
          operation_type: Database["public"]["Enums"]["operation_type"]
          operation_zip?: string | null
          parent_request_id?: string | null
          payment_method?: string | null
          preferred_date?: string | null
          preferred_time_end?: string | null
          preferred_time_start?: string | null
          recurrence_interval_days?: number | null
          request_number: string
          scheduled_date?: string | null
          service_id: string
          service_order_id?: string | null
          sla_breached?: boolean | null
          sla_deadline?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount_charged?: number | null
          carboze_order_id?: string | null
          created_at?: string | null
          created_by?: string | null
          credits_used?: number | null
          id?: string
          internal_notes?: string | null
          is_recurring?: boolean | null
          licensee_id?: string
          metadata?: Json | null
          notes?: string | null
          operation_address?: string | null
          operation_city?: string | null
          operation_state?: string | null
          operation_type?: Database["public"]["Enums"]["operation_type"]
          operation_zip?: string | null
          parent_request_id?: string | null
          payment_method?: string | null
          preferred_date?: string | null
          preferred_time_end?: string | null
          preferred_time_start?: string | null
          recurrence_interval_days?: number | null
          request_number?: string
          scheduled_date?: string | null
          service_id?: string
          service_order_id?: string | null
          sla_breached?: boolean | null
          sla_deadline?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licensee_requests_carboze_order_id_fkey"
            columns: ["carboze_order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_requests_carboze_order_id_fkey"
            columns: ["carboze_order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders_masked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_requests_carboze_order_id_fkey"
            columns: ["carboze_order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_requests_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_requests_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_requests_parent_request_id_fkey"
            columns: ["parent_request_id"]
            isOneToOne: false
            referencedRelation: "licensee_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_requests_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      licensee_subscriptions: {
        Row: {
          billing_cycle_start: string | null
          cancelled_at: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          licensee_id: string
          notes: string | null
          plan_id: string
          started_at: string | null
          status: string
          updated_at: string | null
          vapt_used: number | null
          ze_used: number | null
        }
        Insert: {
          billing_cycle_start?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          licensee_id: string
          notes?: string | null
          plan_id: string
          started_at?: string | null
          status?: string
          updated_at?: string | null
          vapt_used?: number | null
          ze_used?: number | null
        }
        Update: {
          billing_cycle_start?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          licensee_id?: string
          notes?: string | null
          plan_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string | null
          vapt_used?: number | null
          ze_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "licensee_subscriptions_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: true
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_subscriptions_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: true
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      licensee_users: {
        Row: {
          can_order: boolean | null
          can_view_financials: boolean | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          licensee_id: string
          user_id: string
        }
        Insert: {
          can_order?: boolean | null
          can_view_financials?: boolean | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          licensee_id: string
          user_id: string
        }
        Update: {
          can_order?: boolean | null
          can_view_financials?: boolean | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          licensee_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "licensee_users_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_users_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      licensee_wallets: {
        Row: {
          balance: number | null
          id: string
          licensee_id: string
          total_earned: number | null
          total_spent: number | null
          updated_at: string | null
        }
        Insert: {
          balance?: number | null
          id?: string
          licensee_id: string
          total_earned?: number | null
          total_spent?: number | null
          updated_at?: string | null
        }
        Update: {
          balance?: number | null
          id?: string
          licensee_id?: string
          total_earned?: number | null
          total_spent?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licensee_wallets_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: true
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licensee_wallets_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: true
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      licensees: {
        Row: {
          address_city: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          business_hours: Json | null
          code: string
          contract_end_date: string | null
          contract_start_date: string | null
          coverage_cities: string[] | null
          coverage_states: string[] | null
          created_at: string
          created_by: string | null
          current_level: Database["public"]["Enums"]["licensee_level"] | null
          current_score: number | null
          document_number: string | null
          email: string | null
          gamification_visible: boolean | null
          id: string
          legal_name: string | null
          metadata: Json | null
          name: string
          notes: string | null
          performance_score: number | null
          phone: string | null
          status: Database["public"]["Enums"]["licensee_status"]
          total_machines: number | null
          total_revenue: number | null
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          business_hours?: Json | null
          code: string
          contract_end_date?: string | null
          contract_start_date?: string | null
          coverage_cities?: string[] | null
          coverage_states?: string[] | null
          created_at?: string
          created_by?: string | null
          current_level?: Database["public"]["Enums"]["licensee_level"] | null
          current_score?: number | null
          document_number?: string | null
          email?: string | null
          gamification_visible?: boolean | null
          id?: string
          legal_name?: string | null
          metadata?: Json | null
          name: string
          notes?: string | null
          performance_score?: number | null
          phone?: string | null
          status?: Database["public"]["Enums"]["licensee_status"]
          total_machines?: number | null
          total_revenue?: number | null
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          business_hours?: Json | null
          code?: string
          contract_end_date?: string | null
          contract_start_date?: string | null
          coverage_cities?: string[] | null
          coverage_states?: string[] | null
          created_at?: string
          created_by?: string | null
          current_level?: Database["public"]["Enums"]["licensee_level"] | null
          current_score?: number | null
          document_number?: string | null
          email?: string | null
          gamification_visible?: boolean | null
          id?: string
          legal_name?: string | null
          metadata?: Json | null
          name?: string
          notes?: string | null
          performance_score?: number | null
          phone?: string | null
          status?: Database["public"]["Enums"]["licensee_status"]
          total_machines?: number | null
          total_revenue?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      machine_consumption_history: {
        Row: {
          created_at: string
          credits_generated: number | null
          date: string
          id: string
          machine_id: string
          refill_units: number | null
          units_dispensed: number | null
        }
        Insert: {
          created_at?: string
          credits_generated?: number | null
          date: string
          id?: string
          machine_id: string
          refill_units?: number | null
          units_dispensed?: number | null
        }
        Update: {
          created_at?: string
          credits_generated?: number | null
          date?: string
          id?: string
          machine_id?: string
          refill_units?: number | null
          units_dispensed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "machine_consumption_history_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      machines: {
        Row: {
          capacity: number | null
          created_at: string
          created_by: string | null
          current_price_per_unit: number | null
          has_active_alert: boolean | null
          id: string
          installation_date: string | null
          last_alert_at: string | null
          last_alert_message: string | null
          last_maintenance_date: string | null
          latitude: number | null
          licensee_id: string | null
          location_address: string | null
          location_city: string | null
          location_state: string | null
          longitude: number | null
          low_stock_threshold: number | null
          machine_id: string
          metadata: Json | null
          model: string
          next_maintenance_date: string | null
          notes: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["machine_status"]
          total_credits_generated: number | null
          total_units_dispensed: number | null
          units_since_last_refill: number | null
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          current_price_per_unit?: number | null
          has_active_alert?: boolean | null
          id?: string
          installation_date?: string | null
          last_alert_at?: string | null
          last_alert_message?: string | null
          last_maintenance_date?: string | null
          latitude?: number | null
          licensee_id?: string | null
          location_address?: string | null
          location_city?: string | null
          location_state?: string | null
          longitude?: number | null
          low_stock_threshold?: number | null
          machine_id: string
          metadata?: Json | null
          model: string
          next_maintenance_date?: string | null
          notes?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["machine_status"]
          total_credits_generated?: number | null
          total_units_dispensed?: number | null
          units_since_last_refill?: number | null
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          current_price_per_unit?: number | null
          has_active_alert?: boolean | null
          id?: string
          installation_date?: string | null
          last_alert_at?: string | null
          last_alert_message?: string | null
          last_maintenance_date?: string | null
          latitude?: number | null
          licensee_id?: string | null
          location_address?: string | null
          location_city?: string | null
          location_state?: string | null
          longitude?: number | null
          low_stock_threshold?: number | null
          machine_id?: string
          metadata?: Json | null
          model?: string
          next_maintenance_date?: string | null
          notes?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["machine_status"]
          total_credits_generated?: number | null
          total_units_dispensed?: number | null
          units_since_last_refill?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machines_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      mrp_bom: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          insumo_id: string
          is_critical: boolean
          notes: string | null
          product_id: string
          quantity_per_unit: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          insumo_id: string
          is_critical?: boolean
          notes?: string | null
          product_id: string
          quantity_per_unit?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          insumo_id?: string
          is_critical?: boolean
          notes?: string | null
          product_id?: string
          quantity_per_unit?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mrp_bom_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "mrp_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mrp_bom_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mrp_products"
            referencedColumns: ["id"]
          },
        ]
      }
      mrp_products: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          current_stock_qty: number
          dimensions_cm: Json | null
          id: string
          is_active: boolean
          min_order_qty: number | null
          name: string
          notes: string | null
          package_qty: number | null
          packaging_size_g: number | null
          packaging_size_ml: number | null
          product_code: string
          safety_stock_qty: number
          stock_unit: string
          stock_updated_at: string | null
          updated_at: string
          weight_kg: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          current_stock_qty?: number
          dimensions_cm?: Json | null
          id?: string
          is_active?: boolean
          min_order_qty?: number | null
          name: string
          notes?: string | null
          package_qty?: number | null
          packaging_size_g?: number | null
          packaging_size_ml?: number | null
          product_code: string
          safety_stock_qty?: number
          stock_unit?: string
          stock_updated_at?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          current_stock_qty?: number
          dimensions_cm?: Json | null
          id?: string
          is_active?: boolean
          min_order_qty?: number | null
          name?: string
          notes?: string | null
          package_qty?: number | null
          packaging_size_g?: number | null
          packaging_size_ml?: number | null
          product_code?: string
          safety_stock_qty?: number
          stock_unit?: string
          stock_updated_at?: string | null
          updated_at?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      mrp_suppliers: {
        Row: {
          address: Json | null
          category: string | null
          cnpj: string
          created_at: string
          created_by: string | null
          emails: Json | null
          id: string
          legal_name: string | null
          notes: string | null
          phones: Json | null
          raw: Json | null
          status: string
          trade_name: string | null
          updated_at: string
        }
        Insert: {
          address?: Json | null
          category?: string | null
          cnpj: string
          created_at?: string
          created_by?: string | null
          emails?: Json | null
          id?: string
          legal_name?: string | null
          notes?: string | null
          phones?: Json | null
          raw?: Json | null
          status?: string
          trade_name?: string | null
          updated_at?: string
        }
        Update: {
          address?: Json | null
          category?: string | null
          cnpj?: string
          created_at?: string
          created_by?: string | null
          emails?: Json | null
          id?: string
          legal_name?: string | null
          notes?: string | null
          phones?: Json | null
          raw?: Json | null
          status?: string
          trade_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string | null
          error_message: string | null
          event_data: Json | null
          event_type: string
          id: string
          sent_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string | null
          error_message?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          sent_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string | null
          error_message?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          sent_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          alert_member_approval: boolean | null
          alert_new_licensee_order: boolean | null
          alert_os_overdue: boolean | null
          alert_os_risk: boolean | null
          alert_purchase_pending: boolean | null
          alert_shipment_delayed: boolean | null
          alert_stock_rupture: boolean | null
          created_at: string | null
          id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          alert_member_approval?: boolean | null
          alert_new_licensee_order?: boolean | null
          alert_os_overdue?: boolean | null
          alert_os_risk?: boolean | null
          alert_purchase_pending?: boolean | null
          alert_shipment_delayed?: boolean | null
          alert_stock_rupture?: boolean | null
          created_at?: string | null
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          alert_member_approval?: boolean | null
          alert_new_licensee_order?: boolean | null
          alert_os_overdue?: boolean | null
          alert_os_risk?: boolean | null
          alert_purchase_pending?: boolean | null
          alert_shipment_delayed?: boolean | null
          alert_stock_rupture?: boolean | null
          created_at?: string | null
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      op_suggestions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          hub_origin_id: string
          id: string
          product_code: string
          product_id: string | null
          reason: string | null
          status: string
          suggested_qty: number
          target_hub_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          hub_origin_id: string
          id?: string
          product_code: string
          product_id?: string | null
          reason?: string | null
          status?: string
          suggested_qty: number
          target_hub_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          hub_origin_id?: string
          id?: string
          product_code?: string
          product_id?: string | null
          reason?: string | null
          status?: string
          suggested_qty?: number
          target_hub_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "op_suggestions_hub_origin_id_fkey"
            columns: ["hub_origin_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "op_suggestions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mrp_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "op_suggestions_target_hub_id_fkey"
            columns: ["target_hub_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_capacity: {
        Row: {
          available_slots: number | null
          created_at: string | null
          date: string
          department_type: Database["public"]["Enums"]["department_type"]
          id: string
          max_orders: number
          notes: string | null
          scheduled_orders: number
          team_count: number | null
          updated_at: string | null
        }
        Insert: {
          available_slots?: number | null
          created_at?: string | null
          date: string
          department_type: Database["public"]["Enums"]["department_type"]
          id?: string
          max_orders?: number
          notes?: string | null
          scheduled_orders?: number
          team_count?: number | null
          updated_at?: string | null
        }
        Update: {
          available_slots?: number | null
          created_at?: string | null
          date?: string
          department_type?: Database["public"]["Enums"]["department_type"]
          id?: string
          max_orders?: number
          notes?: string | null
          scheduled_orders?: number
          team_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ops_alerts: {
        Row: {
          assigned_to: string | null
          created_at: string
          descricao: string | null
          id: string
          licensee_id: string | null
          machine_id: string | null
          prioridade: string
          resolved_at: string | null
          resolved_by: string | null
          source_id: string | null
          source_table: string | null
          status: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          licensee_id?: string | null
          machine_id?: string | null
          prioridade?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_id?: string | null
          source_table?: string | null
          status?: string
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          licensee_id?: string | null
          machine_id?: string | null
          prioridade?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_id?: string | null
          source_table?: string | null
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_alerts_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_alerts_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_alerts_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      order_audit_logs: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: string
          ip_address: string | null
          record_id: string | null
          role: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          record_id?: string | null
          role?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          record_id?: string | null
          role?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders_masked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      org_chart_nodes: {
        Row: {
          assistant: boolean | null
          avatar_url: string | null
          created_at: string | null
          department: string | null
          dual_role: string | null
          email: string | null
          full_name: string
          hierarchy_level: number | null
          id: string
          job_title: string | null
          phone: string | null
          reports_to: string | null
          updated_at: string | null
        }
        Insert: {
          assistant?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          department?: string | null
          dual_role?: string | null
          email?: string | null
          full_name: string
          hierarchy_level?: number | null
          id: string
          job_title?: string | null
          phone?: string | null
          reports_to?: string | null
          updated_at?: string | null
        }
        Update: {
          assistant?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          department?: string | null
          dual_role?: string | null
          email?: string | null
          full_name?: string
          hierarchy_level?: number | null
          id?: string
          job_title?: string | null
          phone?: string | null
          reports_to?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_chart_nodes_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "org_chart_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      os_checklists: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          department: Database["public"]["Enums"]["department_type"]
          id: string
          is_completed: boolean | null
          items: Json
          notes: string | null
          service_order_id: string
          signature_data: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          department: Database["public"]["Enums"]["department_type"]
          id?: string
          is_completed?: boolean | null
          items?: Json
          notes?: string | null
          service_order_id: string
          signature_data?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          department?: Database["public"]["Enums"]["department_type"]
          id?: string
          is_completed?: boolean | null
          items?: Json
          notes?: string | null
          service_order_id?: string
          signature_data?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_checklists_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      os_shipments: {
        Row: {
          carrier_name: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivered_by: string | null
          delivery_evidence: Json | null
          delivery_notes: string | null
          destination: string | null
          estimated_delivery: string | null
          id: string
          items: Json
          separated_at: string | null
          separated_by: string | null
          service_order_id: string
          shipped_at: string | null
          shipped_by: string | null
          status: Database["public"]["Enums"]["shipment_status"]
          tracking_code: string | null
          tracking_url: string | null
          transport_mode: string | null
          updated_at: string
        }
        Insert: {
          carrier_name?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_evidence?: Json | null
          delivery_notes?: string | null
          destination?: string | null
          estimated_delivery?: string | null
          id?: string
          items?: Json
          separated_at?: string | null
          separated_by?: string | null
          service_order_id: string
          shipped_at?: string | null
          shipped_by?: string | null
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_code?: string | null
          tracking_url?: string | null
          transport_mode?: string | null
          updated_at?: string
        }
        Update: {
          carrier_name?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivery_evidence?: Json | null
          delivery_notes?: string | null
          destination?: string | null
          estimated_delivery?: string | null
          id?: string
          items?: Json
          separated_at?: string | null
          separated_by?: string | null
          service_order_id?: string
          shipped_at?: string | null
          shipped_by?: string | null
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_code?: string | null
          tracking_url?: string | null
          transport_mode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_shipments_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      os_stage_access: {
        Row: {
          can_execute: boolean
          can_validate: boolean
          can_view: boolean
          created_at: string
          department_type: Database["public"]["Enums"]["department_type"]
          id: string
          role: Database["public"]["Enums"]["carbo_role"]
        }
        Insert: {
          can_execute?: boolean
          can_validate?: boolean
          can_view?: boolean
          created_at?: string
          department_type: Database["public"]["Enums"]["department_type"]
          id?: string
          role: Database["public"]["Enums"]["carbo_role"]
        }
        Update: {
          can_execute?: boolean
          can_validate?: boolean
          can_view?: boolean
          created_at?: string
          department_type?: Database["public"]["Enums"]["department_type"]
          id?: string
          role?: Database["public"]["Enums"]["carbo_role"]
        }
        Relationships: []
      }
      os_stage_history: {
        Row: {
          checklist_completed: boolean | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          department: Database["public"]["Enums"]["department_type"]
          id: string
          notes: string | null
          service_order_id: string
          sla_breached: boolean | null
          sla_deadline: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["stage_status"]
          validation_notes: string | null
        }
        Insert: {
          checklist_completed?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          department: Database["public"]["Enums"]["department_type"]
          id?: string
          notes?: string | null
          service_order_id: string
          sla_breached?: boolean | null
          sla_deadline?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["stage_status"]
          validation_notes?: string | null
        }
        Update: {
          checklist_completed?: boolean | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          department?: Database["public"]["Enums"]["department_type"]
          id?: string
          notes?: string | null
          service_order_id?: string
          sla_breached?: boolean | null
          sla_deadline?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["stage_status"]
          validation_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "os_stage_history_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      os_stage_validations: {
        Row: {
          checklist_responses: Json
          created_at: string | null
          id: string
          is_complete: boolean | null
          service_order_id: string
          skip_reason: string | null
          skipped: boolean | null
          stage: Database["public"]["Enums"]["os_workflow_stage"]
          updated_at: string | null
          validated_at: string | null
          validated_by: string | null
          validation_notes: string | null
        }
        Insert: {
          checklist_responses?: Json
          created_at?: string | null
          id?: string
          is_complete?: boolean | null
          service_order_id: string
          skip_reason?: string | null
          skipped?: boolean | null
          stage: Database["public"]["Enums"]["os_workflow_stage"]
          updated_at?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
        }
        Update: {
          checklist_responses?: Json
          created_at?: string | null
          id?: string
          is_complete?: boolean | null
          service_order_id?: string
          skip_reason?: string | null
          skipped?: boolean | null
          stage?: Database["public"]["Enums"]["os_workflow_stage"]
          updated_at?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "os_stage_validations_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_codes: {
        Row: {
          attempts: number
          code: string
          created_at: string
          email: string
          expires_at: string
          id: string
          used: boolean
          user_id: string
        }
        Insert: {
          attempts?: number
          code: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          used?: boolean
          user_id: string
        }
        Update: {
          attempts?: number
          code?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          used?: boolean
          user_id?: string
        }
        Relationships: []
      }
      password_reset_requests: {
        Row: {
          created_at: string
          id: string
          manager_user_id: string
          new_temp_password_set: boolean | null
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          manager_user_id: string
          new_temp_password_set?: boolean | null
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          manager_user_id?: string
          new_temp_password_set?: boolean | null
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pdv_product_stock: {
        Row: {
          has_alert: boolean
          id: string
          last_updated: string
          pdv_id: string
          product_id: string
          qty_current: number
          qty_max_capacity: number
          qty_min_threshold: number
        }
        Insert: {
          has_alert?: boolean
          id?: string
          last_updated?: string
          pdv_id: string
          product_id: string
          qty_current?: number
          qty_max_capacity?: number
          qty_min_threshold?: number
        }
        Update: {
          has_alert?: boolean
          id?: string
          last_updated?: string
          pdv_id?: string
          product_id?: string
          qty_current?: number
          qty_max_capacity?: number
          qty_min_threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "pdv_product_stock_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdvs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_product_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pdv_products"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price_default: number
          short_name: string | null
          sku_code: string
          sort_order: number
          unit: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price_default?: number
          short_name?: string | null
          sku_code: string
          sort_order?: number
          unit?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price_default?: number
          short_name?: string | null
          sku_code?: string
          sort_order?: number
          unit?: string
        }
        Relationships: []
      }
      pdv_replenishment_history: {
        Row: {
          created_at: string
          id: string
          new_stock: number
          notes: string | null
          pdv_id: string
          previous_stock: number
          quantity: number
          replenished_by: string | null
          service_order_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          new_stock: number
          notes?: string | null
          pdv_id: string
          previous_stock: number
          quantity: number
          replenished_by?: string | null
          service_order_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          new_stock?: number
          notes?: string | null
          pdv_id?: string
          previous_stock?: number
          quantity?: number
          replenished_by?: string | null
          service_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_replenishment_history_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdvs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_replenishment_history_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_sales: {
        Row: {
          commission_amount: number
          created_at: string
          created_by: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number
          id: string
          is_voided: boolean
          items: Json
          notes: string | null
          payment_type: string
          pdv_id: string
          rv_vendedor_name: string | null
          seller_id: string | null
          subtotal: number
          total: number
          voided_at: string | null
          voided_by: string | null
          voided_reason: string | null
        }
        Insert: {
          commission_amount?: number
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          is_voided?: boolean
          items?: Json
          notes?: string | null
          payment_type?: string
          pdv_id: string
          rv_vendedor_name?: string | null
          seller_id?: string | null
          subtotal?: number
          total?: number
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Update: {
          commission_amount?: number
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          is_voided?: boolean
          items?: Json
          notes?: string | null
          payment_type?: string
          pdv_id?: string
          rv_vendedor_name?: string | null
          seller_id?: string | null
          subtotal?: number
          total?: number
          voided_at?: string | null
          voided_by?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_sales_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdvs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_sales_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "pdv_sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_sellers: {
        Row: {
          commission_rate: number
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          is_manager: boolean
          name: string
          notes: string | null
          pdv_id: string
          phone: string | null
          rv_vendedor_name: string | null
          user_id: string | null
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_manager?: boolean
          name: string
          notes?: string | null
          pdv_id: string
          phone?: string | null
          rv_vendedor_name?: string | null
          user_id?: string | null
        }
        Update: {
          commission_rate?: number
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_manager?: boolean
          name?: string
          notes?: string | null
          pdv_id?: string
          phone?: string | null
          rv_vendedor_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_sellers_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdvs"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          pdv_id: string
          product_id: string
          qty: number
          qty_after: number | null
          qty_before: number | null
          sale_id: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          pdv_id: string
          product_id: string
          qty: number
          qty_after?: number | null
          qty_before?: number | null
          sale_id?: string | null
          tipo: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          pdv_id?: string
          product_id?: string
          qty?: number
          qty_after?: number | null
          qty_before?: number | null
          sale_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_stock_movements_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdvs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "pdv_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_stock_movements_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pdv_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_users: {
        Row: {
          can_request_replenishment: boolean | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          pdv_id: string
          user_id: string
        }
        Insert: {
          can_request_replenishment?: boolean | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          pdv_id: string
          user_id: string
        }
        Update: {
          can_request_replenishment?: boolean | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          pdv_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdv_users_pdv_id_fkey"
            columns: ["pdv_id"]
            isOneToOne: false
            referencedRelation: "pdvs"
            referencedColumns: ["id"]
          },
        ]
      }
      pdvs: {
        Row: {
          address_city: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          assigned_licensee_id: string | null
          avg_daily_consumption: number | null
          cnpj: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          current_stock: number
          email: string | null
          has_stock_alert: boolean | null
          id: string
          last_alert_at: string | null
          last_replenishment_at: string | null
          last_replenishment_qty: number | null
          latitude: number | null
          longitude: number | null
          metadata: Json | null
          min_stock_threshold: number
          name: string
          notes: string | null
          pdv_code: string
          status: string
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          assigned_licensee_id?: string | null
          avg_daily_consumption?: number | null
          cnpj?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          current_stock?: number
          email?: string | null
          has_stock_alert?: boolean | null
          id?: string
          last_alert_at?: string | null
          last_replenishment_at?: string | null
          last_replenishment_qty?: number | null
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          min_stock_threshold?: number
          name: string
          notes?: string | null
          pdv_code: string
          status?: string
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          assigned_licensee_id?: string | null
          avg_daily_consumption?: number | null
          cnpj?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          current_stock?: number
          email?: string | null
          has_stock_alert?: boolean | null
          id?: string
          last_alert_at?: string | null
          last_replenishment_at?: string | null
          last_replenishment_qty?: number | null
          latitude?: number | null
          longitude?: number | null
          metadata?: Json | null
          min_stock_threshold?: number
          name?: string
          notes?: string | null
          pdv_code?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdvs_assigned_licensee_id_fkey"
            columns: ["assigned_licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdvs_assigned_licensee_id_fkey"
            columns: ["assigned_licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_actions: {
        Row: {
          action_type: string
          created_at: string
          id: string
          payload: Json
          requested_by: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          resource_id: string | null
          resource_type: string
          status: string
          updated_at: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          payload?: Json
          requested_by: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resource_id?: string | null
          resource_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          payload?: Json
          requested_by?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resource_id?: string | null
          resource_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      production_confirmation: {
        Row: {
          bom_adherence_pct: number | null
          confirmed_at: string
          confirmed_by: string | null
          created_at: string
          deviation_notes: string | null
          good_quantity: number
          id: string
          production_order_id: string
          rejected_quantity: number
          rejection_reason: string | null
          yield_pct: number | null
        }
        Insert: {
          bom_adherence_pct?: number | null
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          deviation_notes?: string | null
          good_quantity?: number
          id?: string
          production_order_id: string
          rejected_quantity?: number
          rejection_reason?: string | null
          yield_pct?: number | null
        }
        Update: {
          bom_adherence_pct?: number | null
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          deviation_notes?: string | null
          good_quantity?: number
          id?: string
          production_order_id?: string
          rejected_quantity?: number
          rejection_reason?: string | null
          yield_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_confirmation_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: true
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_confirmation_item: {
        Row: {
          actual_quantity: number
          confirmation_id: string
          created_at: string
          id: string
          loss_quantity: number
          loss_reason: string | null
          lot_id: string | null
          product_id: string
          theoretical_quantity: number
        }
        Insert: {
          actual_quantity?: number
          confirmation_id: string
          created_at?: string
          id?: string
          loss_quantity?: number
          loss_reason?: string | null
          lot_id?: string | null
          product_id: string
          theoretical_quantity?: number
        }
        Update: {
          actual_quantity?: number
          confirmation_id?: string
          created_at?: string
          id?: string
          loss_quantity?: number
          loss_reason?: string | null
          lot_id?: string | null
          product_id?: string
          theoretical_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_confirmation_item_confirmation_id_fkey"
            columns: ["confirmation_id"]
            isOneToOne: false
            referencedRelation: "production_confirmation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_confirmation_item_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_confirmation_item_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mrp_products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_material: {
        Row: {
          created_at: string
          id: string
          is_critical: boolean
          is_separated: boolean
          product_id: string
          production_order_id: string
          separated_at: string | null
          separated_by: string | null
          separated_quantity: number
          theoretical_quantity: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_critical?: boolean
          is_separated?: boolean
          product_id: string
          production_order_id: string
          separated_at?: string | null
          separated_by?: string | null
          separated_quantity?: number
          theoretical_quantity?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_critical?: boolean
          is_separated?: boolean
          product_id?: string
          production_order_id?: string
          separated_at?: string | null
          separated_by?: string | null
          separated_quantity?: number
          theoretical_quantity?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_order_material_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mrp_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_material_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_material_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          confirmed_lot_id: string | null
          created_at: string
          created_by: string | null
          demand_source: Database["public"]["Enums"]["demand_source"] | null
          destination_warehouse_id: string | null
          deviation_notes: string | null
          finished_at: string | null
          good_quantity: number | null
          id: string
          linked_order_ids: string[] | null
          need_date: string | null
          notes: string | null
          op_number: string
          op_status: Database["public"]["Enums"]["op_status"]
          operator_id: string | null
          pcp_responsible_id: string | null
          planned_quantity: number
          priority: number
          product_code: string
          product_id: string
          quality_result: Database["public"]["Enums"]["quality_result"] | null
          quantity: number
          rejected_quantity: number | null
          resolved_at: string | null
          resolved_by: string | null
          sku_id: string | null
          source: string
          started_at: string | null
          status: string
          suggested_lot_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          confirmed_lot_id?: string | null
          created_at?: string
          created_by?: string | null
          demand_source?: Database["public"]["Enums"]["demand_source"] | null
          destination_warehouse_id?: string | null
          deviation_notes?: string | null
          finished_at?: string | null
          good_quantity?: number | null
          id?: string
          linked_order_ids?: string[] | null
          need_date?: string | null
          notes?: string | null
          op_number: string
          op_status?: Database["public"]["Enums"]["op_status"]
          operator_id?: string | null
          pcp_responsible_id?: string | null
          planned_quantity?: number
          priority?: number
          product_code: string
          product_id: string
          quality_result?: Database["public"]["Enums"]["quality_result"] | null
          quantity?: number
          rejected_quantity?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          sku_id?: string | null
          source?: string
          started_at?: string | null
          status?: string
          suggested_lot_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          confirmed_lot_id?: string | null
          created_at?: string
          created_by?: string | null
          demand_source?: Database["public"]["Enums"]["demand_source"] | null
          destination_warehouse_id?: string | null
          deviation_notes?: string | null
          finished_at?: string | null
          good_quantity?: number | null
          id?: string
          linked_order_ids?: string[] | null
          need_date?: string | null
          notes?: string | null
          op_number?: string
          op_status?: Database["public"]["Enums"]["op_status"]
          operator_id?: string | null
          pcp_responsible_id?: string | null
          planned_quantity?: number
          priority?: number
          product_code?: string
          product_id?: string
          quality_result?: Database["public"]["Enums"]["quality_result"] | null
          quantity?: number
          rejected_quantity?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          sku_id?: string | null
          source?: string
          started_at?: string | null
          status?: string
          suggested_lot_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_confirmed_lot_id_fkey"
            columns: ["confirmed_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lot"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_destination_warehouse_id_fkey"
            columns: ["destination_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mrp_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "sku"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_suggested_lot_id_fkey"
            columns: ["suggested_lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lot"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          allowed_interfaces: string[] | null
          avatar_url: string | null
          created_at: string
          created_by_manager: string | null
          department: Database["public"]["Enums"]["department_type"] | null
          email: string | null
          escopo: string | null
          full_name: string | null
          funcao: string | null
          id: string
          invite_token: string | null
          invite_token_expires_at: string | null
          last_access: string | null
          last_login_at: string | null
          manager_user_id: string | null
          notification_channel:
            | Database["public"]["Enums"]["notification_channel"]
            | null
          password_must_change: boolean
          phone: string | null
          phone_country_code: string | null
          requested_role: string | null
          status: string
          telegram_chat_id: string | null
          temp_password_expires_at: string | null
          temp_password_sent_at: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          allowed_interfaces?: string[] | null
          avatar_url?: string | null
          created_at?: string
          created_by_manager?: string | null
          department?: Database["public"]["Enums"]["department_type"] | null
          email?: string | null
          escopo?: string | null
          full_name?: string | null
          funcao?: string | null
          id: string
          invite_token?: string | null
          invite_token_expires_at?: string | null
          last_access?: string | null
          last_login_at?: string | null
          manager_user_id?: string | null
          notification_channel?:
            | Database["public"]["Enums"]["notification_channel"]
            | null
          password_must_change?: boolean
          phone?: string | null
          phone_country_code?: string | null
          requested_role?: string | null
          status?: string
          telegram_chat_id?: string | null
          temp_password_expires_at?: string | null
          temp_password_sent_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          allowed_interfaces?: string[] | null
          avatar_url?: string | null
          created_at?: string
          created_by_manager?: string | null
          department?: Database["public"]["Enums"]["department_type"] | null
          email?: string | null
          escopo?: string | null
          full_name?: string | null
          funcao?: string | null
          id?: string
          invite_token?: string | null
          invite_token_expires_at?: string | null
          last_access?: string | null
          last_login_at?: string | null
          manager_user_id?: string | null
          notification_channel?:
            | Database["public"]["Enums"]["notification_channel"]
            | null
          password_must_change?: boolean
          phone?: string | null
          phone_country_code?: string | null
          requested_role?: string | null
          status?: string
          telegram_chat_id?: string | null
          temp_password_expires_at?: string | null
          temp_password_sent_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      purchase_approval_config: {
        Row: {
          approver_role: Database["public"]["Enums"]["carbo_role"]
          created_at: string
          id: string
          max_value: number
          requires_ceo: boolean
          updated_at: string
        }
        Insert: {
          approver_role: Database["public"]["Enums"]["carbo_role"]
          created_at?: string
          id?: string
          max_value: number
          requires_ceo?: boolean
          updated_at?: string
        }
        Update: {
          approver_role?: Database["public"]["Enums"]["carbo_role"]
          created_at?: string
          id?: string
          max_value?: number
          requires_ceo?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      purchase_invoices: {
        Row: {
          created_at: string
          file_url: string | null
          id: string
          invoice_date: string
          invoice_number: string
          invoice_value: number
          notes: string | null
          oc_match: boolean | null
          purchase_order_id: string
          receiving_id: string | null
          receiving_match: boolean | null
          updated_at: string
          value_match: boolean | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          file_url?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          invoice_value?: number
          notes?: string | null
          oc_match?: boolean | null
          purchase_order_id: string
          receiving_id?: string | null
          receiving_match?: boolean | null
          updated_at?: string
          value_match?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          file_url?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          invoice_value?: number
          notes?: string | null
          oc_match?: boolean | null
          purchase_order_id?: string
          receiving_id?: string | null
          receiving_match?: boolean | null
          updated_at?: string
          value_match?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_receiving_id_fkey"
            columns: ["receiving_id"]
            isOneToOne: false
            referencedRelation: "purchase_receivings"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          expected_delivery: string | null
          generated_by: string
          id: string
          items: Json
          oc_number: string
          payment_condition: string | null
          purchase_request_id: string
          rc_id: string | null
          service_order_id: string | null
          status: Database["public"]["Enums"]["purchase_order_status"]
          supplier_contact: string | null
          supplier_document: string | null
          supplier_name: string
          total_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_delivery?: string | null
          generated_by: string
          id?: string
          items?: Json
          oc_number: string
          payment_condition?: string | null
          purchase_request_id: string
          rc_id?: string | null
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_contact?: string | null
          supplier_document?: string | null
          supplier_name: string
          total_value?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_delivery?: string | null
          generated_by?: string
          id?: string
          items?: Json
          oc_number?: string
          payment_condition?: string | null
          purchase_request_id?: string
          rc_id?: string | null
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_contact?: string | null
          supplier_document?: string | null
          supplier_name?: string
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_purchase_request_id_fkey"
            columns: ["purchase_request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_rc_id_fkey"
            columns: ["rc_id"]
            isOneToOne: false
            referencedRelation: "rc_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_payables: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          invoice_id: string | null
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          payment_proof_url: string | null
          purchase_order_id: string
          service_order_id: string | null
          status: Database["public"]["Enums"]["payable_status"]
          supplier_name: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          due_date: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_proof_url?: string | null
          purchase_order_id: string
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["payable_status"]
          supplier_name: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_proof_url?: string | null
          purchase_order_id?: string
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["payable_status"]
          supplier_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_payables_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payables_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_payables_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_receivings: {
        Row: {
          created_at: string
          divergence_notes: string | null
          has_divergence: boolean
          id: string
          items_received: Json
          purchase_order_id: string
          received_at: string
          received_by: string
          status: Database["public"]["Enums"]["receiving_status"]
          stock_updated: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          divergence_notes?: string | null
          has_divergence?: boolean
          id?: string
          items_received?: Json
          purchase_order_id: string
          received_at?: string
          received_by: string
          status?: Database["public"]["Enums"]["receiving_status"]
          stock_updated?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          divergence_notes?: string | null
          has_divergence?: boolean
          id?: string
          items_received?: Json
          purchase_order_id?: string
          received_at?: string
          received_by?: string
          status?: Database["public"]["Enums"]["receiving_status"]
          stock_updated?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receivings_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cost_center: string
          created_at: string
          estimated_value: number
          id: string
          items: Json
          justification: string
          operational_impact: string | null
          purchase_type: Database["public"]["Enums"]["purchase_request_type"]
          rc_number: string
          rejection_reason: string | null
          requested_by: string
          service_order_id: string | null
          status: Database["public"]["Enums"]["purchase_request_status"]
          suggested_supplier: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cost_center: string
          created_at?: string
          estimated_value?: number
          id?: string
          items?: Json
          justification: string
          operational_impact?: string | null
          purchase_type?: Database["public"]["Enums"]["purchase_request_type"]
          rc_number: string
          rejection_reason?: string | null
          requested_by: string
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["purchase_request_status"]
          suggested_supplier?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cost_center?: string
          created_at?: string
          estimated_value?: number
          id?: string
          items?: Json
          justification?: string
          operational_impact?: string | null
          purchase_type?: Database["public"]["Enums"]["purchase_request_type"]
          rc_number?: string
          rejection_reason?: string | null
          requested_by?: string
          service_order_id?: string | null
          status?: Database["public"]["Enums"]["purchase_request_status"]
          suggested_supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_check: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          checklist_items: Json
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["quality_entity_type"]
          id: string
          notes: string | null
          result: Database["public"]["Enums"]["quality_result"]
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          checklist_items?: Json
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["quality_entity_type"]
          id?: string
          notes?: string | null
          result?: Database["public"]["Enums"]["quality_result"]
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          checklist_items?: Json
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["quality_entity_type"]
          id?: string
          notes?: string | null
          result?: Database["public"]["Enums"]["quality_result"]
        }
        Relationships: []
      }
      rc_analysis: {
        Row: {
          created_at: string
          criterios: Json | null
          fornecedor_recomendado_id: string | null
          fornecedor_recomendado_nome: string | null
          id: string
          justificativa: string
          ranking: Json
          rc_id: string
          score: number
        }
        Insert: {
          created_at?: string
          criterios?: Json | null
          fornecedor_recomendado_id?: string | null
          fornecedor_recomendado_nome?: string | null
          id?: string
          justificativa: string
          ranking?: Json
          rc_id: string
          score?: number
        }
        Update: {
          created_at?: string
          criterios?: Json | null
          fornecedor_recomendado_id?: string | null
          fornecedor_recomendado_nome?: string | null
          id?: string
          justificativa?: string
          ranking?: Json
          rc_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "rc_analysis_fornecedor_recomendado_id_fkey"
            columns: ["fornecedor_recomendado_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_analysis_rc_id_fkey"
            columns: ["rc_id"]
            isOneToOne: false
            referencedRelation: "rc_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rc_approval_logs: {
        Row: {
          action: string
          approver_id: string
          created_at: string
          id: string
          justificativa: string | null
          nivel: number
          rc_id: string
        }
        Insert: {
          action: string
          approver_id: string
          created_at?: string
          id?: string
          justificativa?: string | null
          nivel?: number
          rc_id: string
        }
        Update: {
          action?: string
          approver_id?: string
          created_at?: string
          id?: string
          justificativa?: string | null
          nivel?: number
          rc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rc_approval_logs_rc_id_fkey"
            columns: ["rc_id"]
            isOneToOne: false
            referencedRelation: "rc_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rc_quotations: {
        Row: {
          condicao_pagamento: string | null
          created_at: string
          created_by: string | null
          fornecedor_id: string | null
          fornecedor_nome: string
          id: string
          observacoes: string | null
          prazo_entrega_dias: number
          preco: number
          rc_id: string
        }
        Insert: {
          condicao_pagamento?: string | null
          created_at?: string
          created_by?: string | null
          fornecedor_id?: string | null
          fornecedor_nome: string
          id?: string
          observacoes?: string | null
          prazo_entrega_dias?: number
          preco: number
          rc_id: string
        }
        Update: {
          condicao_pagamento?: string | null
          created_at?: string
          created_by?: string | null
          fornecedor_id?: string | null
          fornecedor_nome?: string
          id?: string
          observacoes?: string | null
          prazo_entrega_dias?: number
          preco?: number
          rc_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rc_quotations_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_quotations_rc_id_fkey"
            columns: ["rc_id"]
            isOneToOne: false
            referencedRelation: "rc_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rc_requests: {
        Row: {
          centro_custo: string
          created_at: string
          fornecedor_selecionado_id: string | null
          id: string
          justificativa: string
          produto_id: string | null
          produto_nome: string | null
          quantidade: number
          service_order_id: string | null
          solicitante_id: string
          status: string
          unidade: string
          updated_at: string
          valor_estimado: number | null
        }
        Insert: {
          centro_custo?: string
          created_at?: string
          fornecedor_selecionado_id?: string | null
          id?: string
          justificativa: string
          produto_id?: string | null
          produto_nome?: string | null
          quantidade?: number
          service_order_id?: string | null
          solicitante_id: string
          status?: string
          unidade?: string
          updated_at?: string
          valor_estimado?: number | null
        }
        Update: {
          centro_custo?: string
          created_at?: string
          fornecedor_selecionado_id?: string | null
          id?: string
          justificativa?: string
          produto_id?: string | null
          produto_nome?: string | null
          quantidade?: number
          service_order_id?: string | null
          solicitante_id?: string
          status?: string
          unidade?: string
          updated_at?: string
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rc_requests_fornecedor_selecionado_id_fkey"
            columns: ["fornecedor_selecionado_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_requests_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "mrp_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rc_requests_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      reagent_movements: {
        Row: {
          created_at: string
          created_by: string | null
          descarb_sale_id: string | null
          id: string
          licensee_id: string
          motivo: string | null
          quantidade: number
          reagent_type: string
          saldo_apos: number | null
          tipo: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descarb_sale_id?: string | null
          id?: string
          licensee_id: string
          motivo?: string | null
          quantidade: number
          reagent_type: string
          saldo_apos?: number | null
          tipo: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descarb_sale_id?: string | null
          id?: string
          licensee_id?: string
          motivo?: string | null
          quantidade?: number
          reagent_type?: string
          saldo_apos?: number | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "reagent_movements_descarb_sale_id_fkey"
            columns: ["descarb_sale_id"]
            isOneToOne: false
            referencedRelation: "descarb_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reagent_movements_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reagent_movements_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      replenishment_policy: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          lead_time_days: number
          min_coverage_days: number
          product_id: string
          purchase_multiple: number | null
          safety_stock_qty: number
          supplier_id: string | null
          updated_at: string
          weekly_capacity: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          lead_time_days?: number
          min_coverage_days?: number
          product_id: string
          purchase_multiple?: number | null
          safety_stock_qty?: number
          supplier_id?: string | null
          updated_at?: string
          weekly_capacity?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          lead_time_days?: number
          min_coverage_days?: number
          product_id?: string
          purchase_multiple?: number | null
          safety_stock_qty?: number
          supplier_id?: string | null
          updated_at?: string
          weekly_capacity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "replenishment_policy_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "mrp_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishment_policy_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      replenishment_suggestion: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          current_stock: number
          days_until_rupture: number | null
          id: string
          product_id: string
          projected_stock: number
          rc_id: string | null
          reason: string | null
          reserved_stock: number
          status: Database["public"]["Enums"]["suggestion_status"]
          suggested_quantity: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          current_stock?: number
          days_until_rupture?: number | null
          id?: string
          product_id: string
          projected_stock?: number
          rc_id?: string | null
          reason?: string | null
          reserved_stock?: number
          status?: Database["public"]["Enums"]["suggestion_status"]
          suggested_quantity: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          current_stock?: number
          days_until_rupture?: number | null
          id?: string
          product_id?: string
          projected_stock?: number
          rc_id?: string | null
          reason?: string | null
          reserved_stock?: number
          status?: Database["public"]["Enums"]["suggestion_status"]
          suggested_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "replenishment_suggestion_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mrp_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishment_suggestion_rc_id_fkey"
            columns: ["rc_id"]
            isOneToOne: false
            referencedRelation: "rc_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog: {
        Row: {
          base_price: number | null
          created_at: string | null
          credit_cost: number | null
          default_sla_hours: number | null
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_recurring_eligible: boolean | null
          metadata: Json | null
          min_lead_time_hours: number | null
          name: string
          operation_type: Database["public"]["Enums"]["operation_type"]
          requires_scheduling: boolean | null
          updated_at: string | null
        }
        Insert: {
          base_price?: number | null
          created_at?: string | null
          credit_cost?: number | null
          default_sla_hours?: number | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_recurring_eligible?: boolean | null
          metadata?: Json | null
          min_lead_time_hours?: number | null
          name: string
          operation_type: Database["public"]["Enums"]["operation_type"]
          requires_scheduling?: boolean | null
          updated_at?: string | null
        }
        Update: {
          base_price?: number | null
          created_at?: string | null
          credit_cost?: number | null
          default_sla_hours?: number | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_recurring_eligible?: boolean | null
          metadata?: Json | null
          min_lead_time_hours?: number | null
          name?: string
          operation_type?: Database["public"]["Enums"]["operation_type"]
          requires_scheduling?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      service_orders: {
        Row: {
          assigned_to: string | null
          cancelled_reason: string | null
          checklist_completed: boolean | null
          completed_at: string | null
          created_at: string
          created_by: string
          current_department: Database["public"]["Enums"]["department_type"]
          customer_id: string | null
          customer_name: string | null
          description: string | null
          due_date: string | null
          executed_at: string | null
          id: string
          metadata: Json | null
          os_number: string
          os_stage: Database["public"]["Enums"]["os_stage_type"] | null
          priority: number | null
          scheduled_at: string | null
          service_type: string | null
          stage_sla_deadline: string | null
          stage_started_at: string | null
          stage_validated_at: string | null
          stage_validated_by: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["os_status"]
          technician_id: string | null
          title: string
          updated_at: string
          vehicle_model: string | null
          vehicle_plate: string | null
        }
        Insert: {
          assigned_to?: string | null
          cancelled_reason?: string | null
          checklist_completed?: boolean | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          current_department?: Database["public"]["Enums"]["department_type"]
          customer_id?: string | null
          customer_name?: string | null
          description?: string | null
          due_date?: string | null
          executed_at?: string | null
          id?: string
          metadata?: Json | null
          os_number: string
          os_stage?: Database["public"]["Enums"]["os_stage_type"] | null
          priority?: number | null
          scheduled_at?: string | null
          service_type?: string | null
          stage_sla_deadline?: string | null
          stage_started_at?: string | null
          stage_validated_at?: string | null
          stage_validated_by?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["os_status"]
          technician_id?: string | null
          title: string
          updated_at?: string
          vehicle_model?: string | null
          vehicle_plate?: string | null
        }
        Update: {
          assigned_to?: string | null
          cancelled_reason?: string | null
          checklist_completed?: boolean | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          current_department?: Database["public"]["Enums"]["department_type"]
          customer_id?: string | null
          customer_name?: string | null
          description?: string | null
          due_date?: string | null
          executed_at?: string | null
          id?: string
          metadata?: Json | null
          os_number?: string
          os_stage?: Database["public"]["Enums"]["os_stage_type"] | null
          priority?: number | null
          scheduled_at?: string | null
          service_type?: string | null
          stage_sla_deadline?: string | null
          stage_started_at?: string | null
          stage_validated_at?: string | null
          stage_validated_by?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["os_status"]
          technician_id?: string | null
          title?: string
          updated_at?: string
          vehicle_model?: string | null
          vehicle_plate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      sku: {
        Row: {
          category: string | null
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          packaging_ml: number | null
          safety_stock_qty: number
          target_coverage_days: number
          unit: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          packaging_ml?: number | null
          safety_stock_qty?: number
          target_coverage_days?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          packaging_ml?: number | null
          safety_stock_qty?: number
          target_coverage_days?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      sku_bom: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          items: Json
          sku_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          items?: Json
          sku_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          items?: Json
          sku_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sku_bom_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "sku"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          checklist_template_id: string | null
          created_at: string
          created_by: string | null
          department_type: Database["public"]["Enums"]["department_type"]
          id: string
          is_active: boolean
          location: string | null
          name: string
          qr_code: string
          sensor_id: string | null
          updated_at: string
        }
        Insert: {
          checklist_template_id?: string | null
          created_at?: string
          created_by?: string | null
          department_type: Database["public"]["Enums"]["department_type"]
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          qr_code: string
          sensor_id?: string | null
          updated_at?: string
        }
        Update: {
          checklist_template_id?: string | null
          created_at?: string
          created_by?: string | null
          department_type?: Database["public"]["Enums"]["department_type"]
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          qr_code?: string
          sensor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stations_checklist_template_id_fkey"
            columns: ["checklist_template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          custo_medio_anterior: number | null
          custo_medio_novo: number | null
          custo_unitario: number | null
          id: string
          observacoes: string | null
          origem: string
          origem_id: string | null
          product_id: string
          quantidade: number
          tipo: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custo_medio_anterior?: number | null
          custo_medio_novo?: number | null
          custo_unitario?: number | null
          id?: string
          observacoes?: string | null
          origem: string
          origem_id?: string | null
          product_id: string
          quantidade: number
          tipo: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custo_medio_anterior?: number | null
          custo_medio_novo?: number | null
          custo_unitario?: number | null
          id?: string
          observacoes?: string | null
          origem?: string
          origem_id?: string | null
          product_id?: string
          quantidade?: number
          tipo?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mrp_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          executed_at: string | null
          executed_by: string | null
          from_hub: string
          id: string
          notes: string | null
          product_code: string
          product_id: string
          quantity: number
          requested_by: string | null
          status: string
          suggested_reason: string | null
          to_hub: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          executed_at?: string | null
          executed_by?: string | null
          from_hub: string
          id?: string
          notes?: string | null
          product_code: string
          product_id: string
          quantity: number
          requested_by?: string | null
          status?: string
          suggested_reason?: string | null
          to_hub: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          executed_at?: string | null
          executed_by?: string | null
          from_hub?: string
          id?: string
          notes?: string | null
          product_code?: string
          product_id?: string
          quantity?: number
          requested_by?: string | null
          status?: string
          suggested_reason?: string | null
          to_hub?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_hub_fkey"
            columns: ["from_hub"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mrp_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_hub_fkey"
            columns: ["to_hub"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string | null
          description: string | null
          features: Json | null
          id: string
          included_credits: number | null
          is_active: boolean | null
          is_featured: boolean | null
          max_vapt_operations: number | null
          max_ze_orders: number | null
          monthly_price: number | null
          name: string
          price_per_vapt: number | null
          price_per_ze_order: number | null
          sla_execution_hours: number | null
          sla_level: Database["public"]["Enums"]["sla_level"]
          sla_response_hours: number | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          included_credits?: number | null
          is_active?: boolean | null
          is_featured?: boolean | null
          max_vapt_operations?: number | null
          max_ze_orders?: number | null
          monthly_price?: number | null
          name: string
          price_per_vapt?: number | null
          price_per_ze_order?: number | null
          sla_execution_hours?: number | null
          sla_level?: Database["public"]["Enums"]["sla_level"]
          sla_response_hours?: number | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          included_credits?: number | null
          is_active?: boolean | null
          is_featured?: boolean | null
          max_vapt_operations?: number | null
          max_ze_orders?: number | null
          monthly_price?: number | null
          name?: string
          price_per_vapt?: number | null
          price_per_ze_order?: number | null
          sla_execution_hours?: number | null
          sla_level?: Database["public"]["Enums"]["sla_level"]
          sla_response_hours?: number | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          category: string | null
          city: string | null
          created_at: string
          created_by: string | null
          document_number: string | null
          email: string | null
          id: string
          is_active: boolean
          legal_name: string | null
          name: string
          notes: string | null
          phone: string | null
          state: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: []
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
          role?: Database["public"]["Enums"]["app_role"]
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
      warehouse_stock: {
        Row: {
          id: string
          product_id: string
          quantity: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "mrp_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          city: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      bling_bridge_stats: {
        Row: {
          bridged_orders: number | null
          bridged_revenue: number | null
          delivered_orders: number | null
        }
        Relationships: []
      }
      carboze_orders_masked: {
        Row: {
          aceite_ref: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cnpj: string | null
          commission_amount: number | null
          commission_paid_at: string | null
          commission_rate: number | null
          confirmed_at: string | null
          created_at: string | null
          created_by: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          delivered_at: string | null
          delivery_address: string | null
          delivery_city: string | null
          delivery_state: string | null
          delivery_zip: string | null
          discount: number | null
          external_ref: string | null
          has_commission: boolean | null
          id: string | null
          internal_classification: string | null
          internal_notes: string | null
          invoice_number: string | null
          invoiced_at: string | null
          is_recurring: boolean | null
          is_test: boolean | null
          items: Json | null
          latitude: number | null
          legal_name: string | null
          licensee_id: string | null
          longitude: number | null
          notes: string | null
          order_number: string | null
          order_type: string | null
          point_type: string | null
          product_code: string | null
          recurrence_interval_days: number | null
          shipped_at: string | null
          shipping_cost: number | null
          source_file: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          subtotal: number | null
          total: number | null
          tracking_code: string | null
          tracking_url: string | null
          trade_name: string | null
          updated_at: string | null
        }
        Insert: {
          aceite_ref?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cnpj?: string | null
          commission_amount?: number | null
          commission_paid_at?: string | null
          commission_rate?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_email?: never
          customer_name?: string | null
          customer_phone?: never
          delivered_at?: string | null
          delivery_address?: never
          delivery_city?: string | null
          delivery_state?: string | null
          delivery_zip?: never
          discount?: number | null
          external_ref?: string | null
          has_commission?: boolean | null
          id?: string | null
          internal_classification?: string | null
          internal_notes?: string | null
          invoice_number?: string | null
          invoiced_at?: string | null
          is_recurring?: boolean | null
          is_test?: boolean | null
          items?: Json | null
          latitude?: number | null
          legal_name?: string | null
          licensee_id?: string | null
          longitude?: number | null
          notes?: string | null
          order_number?: string | null
          order_type?: string | null
          point_type?: string | null
          product_code?: string | null
          recurrence_interval_days?: number | null
          shipped_at?: string | null
          shipping_cost?: number | null
          source_file?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal?: number | null
          total?: number | null
          tracking_code?: string | null
          tracking_url?: string | null
          trade_name?: string | null
          updated_at?: string | null
        }
        Update: {
          aceite_ref?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cnpj?: string | null
          commission_amount?: number | null
          commission_paid_at?: string | null
          commission_rate?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_email?: never
          customer_name?: string | null
          customer_phone?: never
          delivered_at?: string | null
          delivery_address?: never
          delivery_city?: string | null
          delivery_state?: string | null
          delivery_zip?: never
          discount?: number | null
          external_ref?: string | null
          has_commission?: boolean | null
          id?: string | null
          internal_classification?: string | null
          internal_notes?: string | null
          invoice_number?: string | null
          invoiced_at?: string | null
          is_recurring?: boolean | null
          is_test?: boolean | null
          items?: Json | null
          latitude?: number | null
          legal_name?: string | null
          licensee_id?: string | null
          longitude?: number | null
          notes?: string | null
          order_number?: string | null
          order_type?: string | null
          point_type?: string | null
          product_code?: string | null
          recurrence_interval_days?: number | null
          shipped_at?: string | null
          shipping_cost?: number | null
          source_file?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal?: number | null
          total?: number | null
          tracking_code?: string | null
          tracking_url?: string | null
          trade_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carboze_orders_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carboze_orders_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      carboze_orders_secure: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          commission_amount: number | null
          commission_paid_at: string | null
          commission_rate: number | null
          confirmed_at: string | null
          created_at: string | null
          created_by: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          delivered_at: string | null
          delivery_address: string | null
          delivery_city: string | null
          delivery_state: string | null
          delivery_zip: string | null
          discount: number | null
          has_commission: boolean | null
          id: string | null
          internal_notes: string | null
          invoice_number: string | null
          invoiced_at: string | null
          is_recurring: boolean | null
          items: Json | null
          last_recurrence_order_id: string | null
          licensee_id: string | null
          next_delivery_date: string | null
          notes: string | null
          order_number: string | null
          order_type: string | null
          parent_order_id: string | null
          recurrence_interval_days: number | null
          shipped_at: string | null
          shipping_cost: number | null
          status: Database["public"]["Enums"]["order_status"] | null
          subtotal: number | null
          total: number | null
          tracking_code: string | null
          tracking_url: string | null
          updated_at: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          commission_amount?: number | null
          commission_paid_at?: string | null
          commission_rate?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_email?: never
          customer_name?: never
          customer_phone?: never
          delivered_at?: string | null
          delivery_address?: never
          delivery_city?: string | null
          delivery_state?: string | null
          delivery_zip?: never
          discount?: number | null
          has_commission?: boolean | null
          id?: string | null
          internal_notes?: string | null
          invoice_number?: string | null
          invoiced_at?: string | null
          is_recurring?: boolean | null
          items?: Json | null
          last_recurrence_order_id?: string | null
          licensee_id?: string | null
          next_delivery_date?: string | null
          notes?: string | null
          order_number?: string | null
          order_type?: string | null
          parent_order_id?: string | null
          recurrence_interval_days?: number | null
          shipped_at?: string | null
          shipping_cost?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal?: number | null
          total?: number | null
          tracking_code?: string | null
          tracking_url?: string | null
          updated_at?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          commission_amount?: number | null
          commission_paid_at?: string | null
          commission_rate?: number | null
          confirmed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_email?: never
          customer_name?: never
          customer_phone?: never
          delivered_at?: string | null
          delivery_address?: never
          delivery_city?: string | null
          delivery_state?: string | null
          delivery_zip?: never
          discount?: number | null
          has_commission?: boolean | null
          id?: string | null
          internal_notes?: string | null
          invoice_number?: string | null
          invoiced_at?: string | null
          is_recurring?: boolean | null
          items?: Json | null
          last_recurrence_order_id?: string | null
          licensee_id?: string | null
          next_delivery_date?: string | null
          notes?: string | null
          order_number?: string | null
          order_type?: string | null
          parent_order_id?: string | null
          recurrence_interval_days?: number | null
          shipped_at?: string | null
          shipping_cost?: number | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal?: number | null
          total?: number | null
          tracking_code?: string | null
          tracking_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carboze_orders_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carboze_orders_licensee_id_fkey"
            columns: ["licensee_id"]
            isOneToOne: false
            referencedRelation: "licensees_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_carboze_orders_parent_order"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_carboze_orders_parent_order"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders_masked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_carboze_orders_parent_order"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "carboze_orders_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      licensees_summary: {
        Row: {
          address_city: string | null
          address_state: string | null
          code: string | null
          created_at: string | null
          email: string | null
          id: string | null
          name: string | null
          phone: string | null
          status: Database["public"]["Enums"]["licensee_status"] | null
          total_machines: number | null
        }
        Insert: {
          address_city?: string | null
          address_state?: string | null
          code?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["licensee_status"] | null
          total_machines?: number | null
        }
        Update: {
          address_city?: string | null
          address_state?: string | null
          code?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          name?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["licensee_status"] | null
          total_machines?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_licensee_level: {
        Args: { _score: number }
        Returns: Database["public"]["Enums"]["licensee_level"]
      }
      can_access_macro_flow: {
        Args: {
          _flow: Database["public"]["Enums"]["macro_flow"]
          _user_id: string
        }
        Returns: boolean
      }
      can_access_os: {
        Args: { _os_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_profile: {
        Args: { _profile_id: string; _viewer_id: string }
        Returns: boolean
      }
      can_execute_os_stage: {
        Args: { _os_id: string; _user_id: string }
        Returns: boolean
      }
      can_os_advance: {
        Args: { _os_id: string }
        Returns: {
          block_reason: string
          can_advance: boolean
          checklist_complete: boolean
          sla_status: string
        }[]
      }
      can_os_advance_to_stage: {
        Args: {
          _os_id: string
          _target_stage: Database["public"]["Enums"]["os_workflow_stage"]
        }
        Returns: {
          block_reason: string
          can_advance: boolean
        }[]
      }
      can_validate_stage: {
        Args: {
          _stage: Database["public"]["Enums"]["os_workflow_stage"]
          _user_id: string
        }
        Returns: boolean
      }
      check_operational_capacity: {
        Args: {
          _date?: string
          _department: Database["public"]["Enums"]["department_type"]
        }
        Returns: {
          available_slots: number
          has_capacity: boolean
          max_orders: number
          scheduled_orders: number
        }[]
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      generate_invite_token: { Args: never; Returns: string }
      generate_reset_code: { Args: never; Returns: string }
      generate_temp_password: { Args: never; Returns: string }
      generate_username: { Args: { dept_prefix: string }; Returns: string }
      get_branch_id: { Args: never; Returns: number }
      get_carbo_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["carbo_role"][]
      }
      get_carboze_order_sensitive: {
        Args: { _order_id: string }
        Returns: {
          cnpj: string
          customer_email: string
          customer_phone: string
          delivery_address: string
          delivery_city: string
          delivery_state: string
          delivery_zip: string
        }[]
      }
      get_last_login_summary: {
        Args: never
        Returns: {
          department: string
          full_name: string
          last_login_at: string
          last_replenishment_at: string
          orders_last_30_days: number
          region: string
          role: string
          user_area: string
          user_id: string
        }[]
      }
      get_notification_targets: {
        Args: { p_event_type: string }
        Returns: {
          full_name: string
          notification_channel: Database["public"]["Enums"]["notification_channel"]
          phone: string
          phone_country_code: string
          telegram_chat_id: string
          user_id: string
        }[]
      }
      get_os_current_stage: {
        Args: { _os_id: string }
        Returns: Database["public"]["Enums"]["os_workflow_stage"]
      }
      get_store_id: { Args: never; Returns: number }
      get_user_email_by_username: {
        Args: { p_username: string }
        Returns: string
      }
      get_user_licensee_id: { Args: { _user_id: string }; Returns: string }
      get_user_pdv_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: { Args: never; Returns: string }
      has_carbo_role: {
        Args: {
          _role: Database["public"]["Enums"]["carbo_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_ceo: { Args: { _user_id: string }; Returns: boolean }
      is_collaborator: { Args: never; Returns: boolean }
      is_gestor: { Args: { _user_id: string }; Returns: boolean }
      is_gestor_or_above: { Args: never; Returns: boolean }
      is_hub_admin: { Args: never; Returns: boolean }
      is_licensed_user: { Args: { _user_id: string }; Returns: boolean }
      is_manager_of: {
        Args: { _target_user_id: string; _viewer_id: string }
        Returns: boolean
      }
      is_manager_or_admin: { Args: { _user_id: string }; Returns: boolean }
      is_pdv_user: { Args: { _user_id: string }; Returns: boolean }
      lic_branch_id: { Args: never; Returns: number }
      lic_user_role: { Args: never; Returns: string }
      log_flow_block: {
        Args: {
          _action_type: string
          _department?: Database["public"]["Enums"]["department_type"]
          _details?: Json
          _reason: string
          _resource_id: string
          _resource_type: string
          _severity?: string
          _user_id: string
        }
        Returns: string
      }
      log_governance_action: {
        Args: {
          _action_type: string
          _department?: Database["public"]["Enums"]["department_type"]
          _details?: Json
          _macro_flow?: Database["public"]["Enums"]["macro_flow"]
          _resource_id?: string
          _resource_type: string
        }
        Returns: string
      }
      record_user_login: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "manager" | "operator" | "viewer"
      carbo_role:
        | "ceo"
        | "gestor_adm"
        | "gestor_fin"
        | "gestor_compras"
        | "operador_fiscal"
        | "operador"
        | "licensed_user"
      commission_status: "pending" | "approved" | "paid" | "cancelled"
      demand_source: "venda" | "recorrencia" | "safety_stock" | "pcp_manual"
      department_type:
        | "venda"
        | "preparacao"
        | "expedicao"
        | "operacao"
        | "pos_venda"
        | "b2b"
        | "command"
        | "expansao"
        | "finance"
        | "growth"
        | "ops"
      insight_severity: "critical" | "warning" | "stable"
      licensee_level: "bronze" | "prata" | "ouro" | "diamante"
      licensee_status: "active" | "inactive" | "pending" | "suspended"
      lot_status:
        | "criado"
        | "recebido"
        | "em_quarentena"
        | "amostrado"
        | "aprovado"
        | "bloqueado"
        | "reprovado"
        | "encerrado"
      machine_status: "operational" | "maintenance" | "offline" | "retired"
      macro_flow: "comercial" | "operacional" | "adm_financeiro"
      notification_channel: "whatsapp" | "telegram" | "both" | "none"
      op_status:
        | "rascunho"
        | "planejada"
        | "aguardando_separacao"
        | "separada"
        | "aguardando_liberacao"
        | "liberada_producao"
        | "em_producao"
        | "aguardando_confirmacao"
        | "confirmada"
        | "aguardando_qualidade"
        | "liberada"
        | "concluida"
        | "bloqueada"
        | "cancelada"
      operation_type: "carbo_vapt" | "carbo_ze"
      order_status:
        | "pending"
        | "confirmed"
        | "invoiced"
        | "shipped"
        | "delivered"
        | "cancelled"
      os_stage_type:
        | "nova"
        | "qualificacao"
        | "agendamento"
        | "confirmada"
        | "em_execucao"
        | "pos_servico"
        | "concluida"
        | "cancelada"
      os_status: "draft" | "active" | "paused" | "completed" | "cancelled"
      os_workflow_stage:
        | "comercial"
        | "operacoes"
        | "logistica"
        | "administrativo"
        | "fiscal"
        | "financeiro"
        | "pos_venda"
      payable_status: "programado" | "pago" | "atrasado" | "cancelado"
      purchase_order_status:
        | "gerada"
        | "enviada_fornecedor"
        | "parcialmente_recebida"
        | "recebida"
        | "cancelada"
      purchase_request_status:
        | "rascunho"
        | "aguardando_aprovacao"
        | "aprovada"
        | "rejeitada"
        | "cancelada"
      purchase_request_type: "estoque" | "uso_direto" | "investimento"
      quality_entity_type: "lot" | "production_order"
      quality_result: "aprovada" | "bloqueada" | "reprovada" | "pendente"
      receiving_status: "pendente" | "conferido_ok" | "conferido_divergencia"
      shipment_status:
        | "separacao_pendente"
        | "separando"
        | "separado"
        | "em_transporte"
        | "entregue"
        | "cancelado"
      sla_level: "basic" | "pro" | "premium"
      stage_status: "pending" | "in_progress" | "completed" | "blocked"
      suggestion_status:
        | "pendente"
        | "aprovada"
        | "convertida_em_rc"
        | "descartada"
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
      app_role: ["admin", "manager", "operator", "viewer"],
      carbo_role: [
        "ceo",
        "gestor_adm",
        "gestor_fin",
        "gestor_compras",
        "operador_fiscal",
        "operador",
        "licensed_user",
      ],
      commission_status: ["pending", "approved", "paid", "cancelled"],
      demand_source: ["venda", "recorrencia", "safety_stock", "pcp_manual"],
      department_type: [
        "venda",
        "preparacao",
        "expedicao",
        "operacao",
        "pos_venda",
        "b2b",
        "command",
        "expansao",
        "finance",
        "growth",
        "ops",
      ],
      insight_severity: ["critical", "warning", "stable"],
      licensee_level: ["bronze", "prata", "ouro", "diamante"],
      licensee_status: ["active", "inactive", "pending", "suspended"],
      lot_status: [
        "criado",
        "recebido",
        "em_quarentena",
        "amostrado",
        "aprovado",
        "bloqueado",
        "reprovado",
        "encerrado",
      ],
      machine_status: ["operational", "maintenance", "offline", "retired"],
      macro_flow: ["comercial", "operacional", "adm_financeiro"],
      notification_channel: ["whatsapp", "telegram", "both", "none"],
      op_status: [
        "rascunho",
        "planejada",
        "aguardando_separacao",
        "separada",
        "aguardando_liberacao",
        "liberada_producao",
        "em_producao",
        "aguardando_confirmacao",
        "confirmada",
        "aguardando_qualidade",
        "liberada",
        "concluida",
        "bloqueada",
        "cancelada",
      ],
      operation_type: ["carbo_vapt", "carbo_ze"],
      order_status: [
        "pending",
        "confirmed",
        "invoiced",
        "shipped",
        "delivered",
        "cancelled",
      ],
      os_stage_type: [
        "nova",
        "qualificacao",
        "agendamento",
        "confirmada",
        "em_execucao",
        "pos_servico",
        "concluida",
        "cancelada",
      ],
      os_status: ["draft", "active", "paused", "completed", "cancelled"],
      os_workflow_stage: [
        "comercial",
        "operacoes",
        "logistica",
        "administrativo",
        "fiscal",
        "financeiro",
        "pos_venda",
      ],
      payable_status: ["programado", "pago", "atrasado", "cancelado"],
      purchase_order_status: [
        "gerada",
        "enviada_fornecedor",
        "parcialmente_recebida",
        "recebida",
        "cancelada",
      ],
      purchase_request_status: [
        "rascunho",
        "aguardando_aprovacao",
        "aprovada",
        "rejeitada",
        "cancelada",
      ],
      purchase_request_type: ["estoque", "uso_direto", "investimento"],
      quality_entity_type: ["lot", "production_order"],
      quality_result: ["aprovada", "bloqueada", "reprovada", "pendente"],
      receiving_status: ["pendente", "conferido_ok", "conferido_divergencia"],
      shipment_status: [
        "separacao_pendente",
        "separando",
        "separado",
        "em_transporte",
        "entregue",
        "cancelado",
      ],
      sla_level: ["basic", "pro", "premium"],
      stage_status: ["pending", "in_progress", "completed", "blocked"],
      suggestion_status: [
        "pendente",
        "aprovada",
        "convertida_em_rc",
        "descartada",
      ],
    },
  },
} as const
