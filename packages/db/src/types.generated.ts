export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      acquisition_source_rule: {
        Row: {
          channel: Database['public']['Enums']['acquisition_channel'];
          id: string;
          note: string | null;
          pattern: string;
        };
        Insert: {
          channel: Database['public']['Enums']['acquisition_channel'];
          id?: string;
          note?: string | null;
          pattern: string;
        };
        Update: {
          channel?: Database['public']['Enums']['acquisition_channel'];
          id?: string;
          note?: string | null;
          pattern?: string;
        };
        Relationships: [];
      };
      approval_request: {
        Row: {
          city_id: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          id: string;
          kind: Database['public']['Enums']['approval_kind'];
          payload: NonNullable<Json>;
          reason: string;
          requested_by: string;
          status: Database['public']['Enums']['approval_status'];
          target_id: string;
          target_type: string;
          updated_at: string;
        };
        Insert: {
          city_id?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          kind: Database['public']['Enums']['approval_kind'];
          payload?: NonNullable<Json>;
          reason: string;
          requested_by: string;
          status?: Database['public']['Enums']['approval_status'];
          target_id: string;
          target_type: string;
          updated_at?: string;
        };
        Update: {
          city_id?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_note?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['approval_kind'];
          payload?: NonNullable<Json>;
          reason?: string;
          requested_by?: string;
          status?: Database['public']['Enums']['approval_status'];
          target_id?: string;
          target_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'approval_request_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approval_request_decided_by_fkey';
            columns: ['decided_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approval_request_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      auto_message_rule: {
        Row: {
          city_id: string | null;
          enabled: boolean;
          id: string;
          key: string;
          params: NonNullable<Json>;
        };
        Insert: {
          city_id?: string | null;
          enabled?: boolean;
          id?: string;
          key: string;
          params?: NonNullable<Json>;
        };
        Update: {
          city_id?: string | null;
          enabled?: boolean;
          id?: string;
          key?: string;
          params?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: 'auto_message_rule_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
      branch_override: {
        Row: {
          branch_id: string;
          field: string;
          set_at: string;
          set_by: string | null;
          value: NonNullable<Json>;
        };
        Insert: {
          branch_id: string;
          field: string;
          set_at?: string;
          set_by?: string | null;
          value: NonNullable<Json>;
        };
        Update: {
          branch_id?: string;
          field?: string;
          set_at?: string;
          set_by?: string | null;
          value?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: 'branch_override_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['branch_id'];
          },
          {
            foreignKeyName: 'branch_override_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_branch';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'branch_override_set_by_fkey';
            columns: ['set_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      broadcast: {
        Row: {
          audience: NonNullable<Json>;
          body: string;
          channel: string;
          created_at: string;
          created_by: string | null;
          delivered_count: number;
          id: string;
          read_count: number;
          reply_count: number;
          scheduled_for: string | null;
          sent_at: string | null;
          sent_count: number;
          status: Database['public']['Enums']['broadcast_status'];
          template_id: string | null;
          title: string;
        };
        Insert: {
          audience?: NonNullable<Json>;
          body: string;
          channel: string;
          created_at?: string;
          created_by?: string | null;
          delivered_count?: number;
          id?: string;
          read_count?: number;
          reply_count?: number;
          scheduled_for?: string | null;
          sent_at?: string | null;
          sent_count?: number;
          status?: Database['public']['Enums']['broadcast_status'];
          template_id?: string | null;
          title: string;
        };
        Update: {
          audience?: NonNullable<Json>;
          body?: string;
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          delivered_count?: number;
          id?: string;
          read_count?: number;
          reply_count?: number;
          scheduled_for?: string | null;
          sent_at?: string | null;
          sent_count?: number;
          status?: Database['public']['Enums']['broadcast_status'];
          template_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'broadcast_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'broadcast_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'message_template';
            referencedColumns: ['id'];
          },
        ];
      };
      broadcast_recipient: {
        Row: {
          broadcast_id: string;
          merchant_id: string;
          notification_id: string | null;
          state: string;
        };
        Insert: {
          broadcast_id: string;
          merchant_id: string;
          notification_id?: string | null;
          state?: string;
        };
        Update: {
          broadcast_id?: string;
          merchant_id?: string;
          notification_id?: string | null;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'broadcast_recipient_broadcast_id_fkey';
            columns: ['broadcast_id'];
            isOneToOne: false;
            referencedRelation: 'broadcast';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'broadcast_recipient_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'broadcast_recipient_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'broadcast_recipient_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'broadcast_recipient_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'broadcast_recipient_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'broadcast_recipient_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'broadcast_recipient_notification_id_fkey';
            columns: ['notification_id'];
            isOneToOne: false;
            referencedRelation: 'notification';
            referencedColumns: ['id'];
          },
        ];
      };
      broadcast_rider_recipient: {
        Row: {
          broadcast_id: string;
          deferred_reason: string | null;
          notification_id: string | null;
          rider_id: string;
          state: string;
        };
        Insert: {
          broadcast_id: string;
          deferred_reason?: string | null;
          notification_id?: string | null;
          rider_id: string;
          state?: string;
        };
        Update: {
          broadcast_id?: string;
          deferred_reason?: string | null;
          notification_id?: string | null;
          rider_id?: string;
          state?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'broadcast_rider_recipient_broadcast_id_fkey';
            columns: ['broadcast_id'];
            isOneToOne: false;
            referencedRelation: 'broadcast';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'broadcast_rider_recipient_notification_id_fkey';
            columns: ['notification_id'];
            isOneToOne: false;
            referencedRelation: 'notification';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'broadcast_rider_recipient_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'broadcast_rider_recipient_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'broadcast_rider_recipient_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'broadcast_rider_recipient_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'broadcast_rider_recipient_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'broadcast_rider_recipient_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'broadcast_rider_recipient_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      campaign_spend: {
        Row: {
          amount_kes: number;
          channel: Database['public']['Enums']['acquisition_channel'];
          entered_by: string | null;
          id: string;
          period_end: string;
          period_start: string;
        };
        Insert: {
          amount_kes: number;
          channel: Database['public']['Enums']['acquisition_channel'];
          entered_by?: string | null;
          id?: string;
          period_end: string;
          period_start: string;
        };
        Update: {
          amount_kes?: number;
          channel?: Database['public']['Enums']['acquisition_channel'];
          entered_by?: string | null;
          id?: string;
          period_end?: string;
          period_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'campaign_spend_entered_by_fkey';
            columns: ['entered_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      cash_deposit: {
        Row: {
          account_reference: string | null;
          amount_kes: number;
          created_at: string;
          id: string;
          match_status: Database['public']['Enums']['deposit_match_status'];
          matched_at: string | null;
          matched_by: string | null;
          msisdn: string | null;
          paid_at: string;
          provider_ref: string;
          rider_id: string | null;
        };
        Insert: {
          account_reference?: string | null;
          amount_kes: number;
          created_at?: string;
          id?: string;
          match_status?: Database['public']['Enums']['deposit_match_status'];
          matched_at?: string | null;
          matched_by?: string | null;
          msisdn?: string | null;
          paid_at?: string;
          provider_ref: string;
          rider_id?: string | null;
        };
        Update: {
          account_reference?: string | null;
          amount_kes?: number;
          created_at?: string;
          id?: string;
          match_status?: Database['public']['Enums']['deposit_match_status'];
          matched_at?: string | null;
          matched_by?: string | null;
          msisdn?: string | null;
          paid_at?: string;
          provider_ref?: string;
          rider_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cash_deposit_matched_by_fkey';
            columns: ['matched_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cash_deposit_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cash_deposit_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'cash_deposit_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'cash_deposit_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'cash_deposit_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cash_deposit_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'cash_deposit_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      cash_event: {
        Row: {
          amount_kes: number;
          created_at: string;
          created_by: string | null;
          deposit_id: string | null;
          id: number;
          kind: Database['public']['Enums']['cash_event_kind'];
          note: string | null;
          order_reference: string | null;
          rider_id: string;
          settlement_line_id: string | null;
        };
        Insert: {
          amount_kes: number;
          created_at?: string;
          created_by?: string | null;
          deposit_id?: string | null;
          id?: number;
          kind: Database['public']['Enums']['cash_event_kind'];
          note?: string | null;
          order_reference?: string | null;
          rider_id: string;
          settlement_line_id?: string | null;
        };
        Update: {
          amount_kes?: number;
          created_at?: string;
          created_by?: string | null;
          deposit_id?: string | null;
          id?: number;
          kind?: Database['public']['Enums']['cash_event_kind'];
          note?: string | null;
          order_reference?: string | null;
          rider_id?: string;
          settlement_line_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cash_event_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cash_event_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cash_event_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'cash_event_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'cash_event_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'cash_event_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cash_event_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'cash_event_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      cash_rule: {
        Row: {
          cap_default_kes: number | null;
          cap_new_rider_days: number;
          cap_new_rider_kes: number | null;
          city_id: string;
          netting_cutoff: string;
          pause_at_pct: number;
          prefer_mpesa_at_door: boolean;
          recovery_grace_days: number;
          remind_at_pct: number;
          two_person_threshold_kes: number | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          cap_default_kes?: number | null;
          cap_new_rider_days?: number;
          cap_new_rider_kes?: number | null;
          city_id: string;
          netting_cutoff?: string;
          pause_at_pct?: number;
          prefer_mpesa_at_door?: boolean;
          recovery_grace_days?: number;
          remind_at_pct?: number;
          two_person_threshold_kes?: number | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          cap_default_kes?: number | null;
          cap_new_rider_days?: number;
          cap_new_rider_kes?: number | null;
          city_id?: string;
          netting_cutoff?: string;
          pause_at_pct?: number;
          prefer_mpesa_at_door?: boolean;
          recovery_grace_days?: number;
          remind_at_pct?: number;
          two_person_threshold_kes?: number | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cash_rule_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: true;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cash_rule_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      catalogue_edit_request: {
        Row: {
          catalogue_item_id: string | null;
          created_at: string;
          id: string;
          kind: string;
          merchant_id: string;
          payload: NonNullable<Json>;
          reason: string | null;
          requested_by: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database['public']['Enums']['edit_approval_status'];
        };
        Insert: {
          catalogue_item_id?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          merchant_id: string;
          payload?: NonNullable<Json>;
          reason?: string | null;
          requested_by?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database['public']['Enums']['edit_approval_status'];
        };
        Update: {
          catalogue_item_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          merchant_id?: string;
          payload?: NonNullable<Json>;
          reason?: string | null;
          requested_by?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database['public']['Enums']['edit_approval_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'catalogue_edit_request_catalogue_item_id_fkey';
            columns: ['catalogue_item_id'];
            isOneToOne: false;
            referencedRelation: 'catalogue_item';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_edit_request_catalogue_item_id_fkey';
            columns: ['catalogue_item_id'];
            isOneToOne: false;
            referencedRelation: 'catalogue_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_edit_request_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_edit_request_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_edit_request_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_edit_request_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_edit_request_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_edit_request_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_edit_request_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      catalogue_import: {
        Row: {
          applied_by: string | null;
          created_at: string;
          error: string | null;
          id: string;
          items_found: number | null;
          merchant_id: string;
          source: string;
          status: string;
          storage_path: string | null;
        };
        Insert: {
          applied_by?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          items_found?: number | null;
          merchant_id: string;
          source: string;
          status?: string;
          storage_path?: string | null;
        };
        Update: {
          applied_by?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          items_found?: number | null;
          merchant_id?: string;
          source?: string;
          status?: string;
          storage_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'catalogue_import_applied_by_fkey';
            columns: ['applied_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_import_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_import_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_import_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_import_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_import_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_import_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      catalogue_item: {
        Row: {
          age_restricted: boolean;
          available: boolean;
          created_at: string;
          description: string | null;
          highlighted: boolean;
          id: string;
          merchant_id: string;
          name: string;
          photo_path: string | null;
          price_kes: number | null;
          section_id: string;
          sort: number;
          updated_at: string;
        };
        Insert: {
          age_restricted?: boolean;
          available?: boolean;
          created_at?: string;
          description?: string | null;
          highlighted?: boolean;
          id?: string;
          merchant_id: string;
          name: string;
          photo_path?: string | null;
          price_kes?: number | null;
          section_id: string;
          sort?: number;
          updated_at?: string;
        };
        Update: {
          age_restricted?: boolean;
          available?: boolean;
          created_at?: string;
          description?: string | null;
          highlighted?: boolean;
          id?: string;
          merchant_id?: string;
          name?: string;
          photo_path?: string | null;
          price_kes?: number | null;
          section_id?: string;
          sort?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalogue_item_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_item_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_item_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_item_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_item_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_item_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_item_section_id_fkey';
            columns: ['section_id'];
            isOneToOne: false;
            referencedRelation: 'catalogue_section';
            referencedColumns: ['id'];
          },
        ];
      };
      catalogue_photo_task: {
        Row: {
          assignee_id: string | null;
          booked_for: string | null;
          catalogue_item_id: string | null;
          created_at: string;
          id: string;
          merchant_id: string;
          status: string;
        };
        Insert: {
          assignee_id?: string | null;
          booked_for?: string | null;
          catalogue_item_id?: string | null;
          created_at?: string;
          id?: string;
          merchant_id: string;
          status?: string;
        };
        Update: {
          assignee_id?: string | null;
          booked_for?: string | null;
          catalogue_item_id?: string | null;
          created_at?: string;
          id?: string;
          merchant_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalogue_photo_task_assignee_id_fkey';
            columns: ['assignee_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_photo_task_catalogue_item_id_fkey';
            columns: ['catalogue_item_id'];
            isOneToOne: false;
            referencedRelation: 'catalogue_item';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_photo_task_catalogue_item_id_fkey';
            columns: ['catalogue_item_id'];
            isOneToOne: false;
            referencedRelation: 'catalogue_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_photo_task_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_photo_task_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_photo_task_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_photo_task_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_photo_task_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_photo_task_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      catalogue_price_flag: {
        Row: {
          app_price_kes: number | null;
          catalogue_item_id: string;
          drift_pct: number | null;
          id: string;
          merchant_id: string;
          observed_at: string;
          observed_price_kes: number | null;
          observed_source: string;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database['public']['Enums']['price_flag_status'];
        };
        Insert: {
          app_price_kes?: number | null;
          catalogue_item_id: string;
          drift_pct?: number | null;
          id?: string;
          merchant_id: string;
          observed_at?: string;
          observed_price_kes?: number | null;
          observed_source: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database['public']['Enums']['price_flag_status'];
        };
        Update: {
          app_price_kes?: number | null;
          catalogue_item_id?: string;
          drift_pct?: number | null;
          id?: string;
          merchant_id?: string;
          observed_at?: string;
          observed_price_kes?: number | null;
          observed_source?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database['public']['Enums']['price_flag_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'catalogue_price_flag_catalogue_item_id_fkey';
            columns: ['catalogue_item_id'];
            isOneToOne: false;
            referencedRelation: 'catalogue_item';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_price_flag_catalogue_item_id_fkey';
            columns: ['catalogue_item_id'];
            isOneToOne: false;
            referencedRelation: 'catalogue_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_price_flag_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_price_flag_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_price_flag_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_price_flag_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_price_flag_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_price_flag_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_price_flag_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      catalogue_section: {
        Row: {
          blurb: string | null;
          created_at: string;
          id: string;
          merchant_id: string;
          name: string;
          sort: number;
          updated_at: string;
        };
        Insert: {
          blurb?: string | null;
          created_at?: string;
          id?: string;
          merchant_id: string;
          name: string;
          sort?: number;
          updated_at?: string;
        };
        Update: {
          blurb?: string | null;
          created_at?: string;
          id?: string;
          merchant_id?: string;
          name?: string;
          sort?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'catalogue_section_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_section_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_section_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_section_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_section_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_section_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      category_config: {
        Row: {
          badge_rules: NonNullable<Json>;
          card_kind: string;
          category: Database['public']['Enums']['merchant_category'];
          created_at: string;
          eta_style: string;
          extra_doc_rules: NonNullable<Json>;
          featured_eligible: boolean;
          icon: string;
          label: string;
          questions: NonNullable<Json>;
          requires_ops_mapping: boolean;
          sort: number;
          updated_at: string;
        };
        Insert: {
          badge_rules?: NonNullable<Json>;
          card_kind: string;
          category: Database['public']['Enums']['merchant_category'];
          created_at?: string;
          eta_style: string;
          extra_doc_rules?: NonNullable<Json>;
          featured_eligible?: boolean;
          icon: string;
          label: string;
          questions?: NonNullable<Json>;
          requires_ops_mapping?: boolean;
          sort?: number;
          updated_at?: string;
        };
        Update: {
          badge_rules?: NonNullable<Json>;
          card_kind?: string;
          category?: Database['public']['Enums']['merchant_category'];
          created_at?: string;
          eta_style?: string;
          extra_doc_rules?: NonNullable<Json>;
          featured_eligible?: boolean;
          icon?: string;
          label?: string;
          questions?: NonNullable<Json>;
          requires_ops_mapping?: boolean;
          sort?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      city: {
        Row: {
          centre: unknown;
          country: string;
          created_at: string;
          currency: string;
          id: string;
          name: string;
          slug: string;
          sort: number;
          status: Database['public']['Enums']['city_status'];
          timezone: string;
          updated_at: string;
        };
        Insert: {
          centre?: unknown;
          country: string;
          created_at?: string;
          currency: string;
          id?: string;
          name: string;
          slug: string;
          sort?: number;
          status?: Database['public']['Enums']['city_status'];
          timezone: string;
          updated_at?: string;
        };
        Update: {
          centre?: unknown;
          country?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          name?: string;
          slug?: string;
          sort?: number;
          status?: Database['public']['Enums']['city_status'];
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      city_hours_exception: {
        Row: {
          applies_to_categories: string[] | null;
          city_id: string;
          created_at: string;
          date: string;
          default_close: string | null;
          enabled: boolean;
          id: string;
          label: string;
        };
        Insert: {
          applies_to_categories?: string[] | null;
          city_id: string;
          created_at?: string;
          date: string;
          default_close?: string | null;
          enabled?: boolean;
          id?: string;
          label: string;
        };
        Update: {
          applies_to_categories?: string[] | null;
          city_id?: string;
          created_at?: string;
          date?: string;
          default_close?: string | null;
          enabled?: boolean;
          id?: string;
          label?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'city_hours_exception_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
      commission_tier: {
        Row: {
          code: Database['public']['Enums']['commission_tier_code'];
          criteria: string | null;
          default_pct: number | null;
          label: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          code: Database['public']['Enums']['commission_tier_code'];
          criteria?: string | null;
          default_pct?: number | null;
          label: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          code?: Database['public']['Enums']['commission_tier_code'];
          criteria?: string | null;
          default_pct?: number | null;
          label?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'commission_tier_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      component_availability: {
        Row: {
          available: boolean;
          capacity_override: number | null;
          component_id: string;
          date: string;
          note: string | null;
          price_override_kes: number | null;
        };
        Insert: {
          available?: boolean;
          capacity_override?: number | null;
          component_id: string;
          date: string;
          note?: string | null;
          price_override_kes?: number | null;
        };
        Update: {
          available?: boolean;
          capacity_override?: number | null;
          component_id?: string;
          date?: string;
          note?: string | null;
          price_override_kes?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'component_availability_component_id_fkey';
            columns: ['component_id'];
            isOneToOne: false;
            referencedRelation: 'component_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'component_availability_component_id_fkey';
            columns: ['component_id'];
            isOneToOne: false;
            referencedRelation: 'experience_component';
            referencedColumns: ['id'];
          },
        ];
      };
      concierge_shift: {
        Row: {
          capacity: number;
          city_id: string;
          online: boolean;
          since: string;
          staff_user_id: string;
        };
        Insert: {
          capacity?: number;
          city_id: string;
          online?: boolean;
          since?: string;
          staff_user_id: string;
        };
        Update: {
          capacity?: number;
          city_id?: string;
          online?: boolean;
          since?: string;
          staff_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'concierge_shift_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'concierge_shift_staff_user_id_fkey';
            columns: ['staff_user_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      console_module: {
        Row: {
          href: string | null;
          icon: string | null;
          key: string;
          label: string;
          section: string;
          sort: number;
        };
        Insert: {
          href?: string | null;
          icon?: string | null;
          key: string;
          label: string;
          section: string;
          sort: number;
        };
        Update: {
          href?: string | null;
          icon?: string | null;
          key?: string;
          label?: string;
          section?: string;
          sort?: number;
        };
        Relationships: [];
      };
      coverage_gap: {
        Row: {
          assigned_to: string | null;
          category: Database['public']['Enums']['merchant_category'];
          city_id: string;
          computed_at: string;
          filled_at: string | null;
          hotel_count: number;
          id: string;
          merchant_count: number;
          recruit_target_note: string | null;
          severity: string;
          status: string;
          zone_id: string | null;
        };
        Insert: {
          assigned_to?: string | null;
          category: Database['public']['Enums']['merchant_category'];
          city_id: string;
          computed_at?: string;
          filled_at?: string | null;
          hotel_count?: number;
          id?: string;
          merchant_count?: number;
          recruit_target_note?: string | null;
          severity: string;
          status?: string;
          zone_id?: string | null;
        };
        Update: {
          assigned_to?: string | null;
          category?: Database['public']['Enums']['merchant_category'];
          city_id?: string;
          computed_at?: string;
          filled_at?: string | null;
          hotel_count?: number;
          id?: string;
          merchant_count?: number;
          recruit_target_note?: string | null;
          severity?: string;
          status?: string;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'coverage_gap_assigned_to_fkey';
            columns: ['assigned_to'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coverage_gap_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coverage_gap_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coverage_gap_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone_bounds';
            referencedColumns: ['id'];
          },
        ];
      };
      curated_day: {
        Row: {
          badge: string | null;
          city_id: string;
          cover_path: string | null;
          created_at: string;
          duration: string;
          featured: boolean;
          id: string;
          party_types: string[];
          price_per_person_kes: number | null;
          slug: string;
          sort: number;
          status: string;
          tagline: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          badge?: string | null;
          city_id: string;
          cover_path?: string | null;
          created_at?: string;
          duration?: string;
          featured?: boolean;
          id?: string;
          party_types?: string[];
          price_per_person_kes?: number | null;
          slug: string;
          sort?: number;
          status?: string;
          tagline?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          badge?: string | null;
          city_id?: string;
          cover_path?: string | null;
          created_at?: string;
          duration?: string;
          featured?: boolean;
          id?: string;
          party_types?: string[];
          price_per_person_kes?: number | null;
          slug?: string;
          sort?: number;
          status?: string;
          tagline?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'curated_day_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
      curated_day_block: {
        Row: {
          component_id: string;
          curated_day_id: string;
          id: string;
          slot: Database['public']['Enums']['block_slot'];
          sort: number;
          start_time: string | null;
        };
        Insert: {
          component_id: string;
          curated_day_id: string;
          id?: string;
          slot: Database['public']['Enums']['block_slot'];
          sort?: number;
          start_time?: string | null;
        };
        Update: {
          component_id?: string;
          curated_day_id?: string;
          id?: string;
          slot?: Database['public']['Enums']['block_slot'];
          sort?: number;
          start_time?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'curated_day_block_component_id_fkey';
            columns: ['component_id'];
            isOneToOne: false;
            referencedRelation: 'component_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'curated_day_block_component_id_fkey';
            columns: ['component_id'];
            isOneToOne: false;
            referencedRelation: 'experience_component';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'curated_day_block_curated_day_id_fkey';
            columns: ['curated_day_id'];
            isOneToOne: false;
            referencedRelation: 'curated_day';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'curated_day_block_curated_day_id_fkey';
            columns: ['curated_day_id'];
            isOneToOne: false;
            referencedRelation: 'curated_day_public';
            referencedColumns: ['id'];
          },
        ];
      };
      dispatch_zone_setting: {
        Row: {
          expires_at: string | null;
          radius_km: number | null;
          set_at: string;
          set_by: string | null;
          zone_id: string;
        };
        Insert: {
          expires_at?: string | null;
          radius_km?: number | null;
          set_at?: string;
          set_by?: string | null;
          zone_id: string;
        };
        Update: {
          expires_at?: string | null;
          radius_km?: number | null;
          set_at?: string;
          set_by?: string | null;
          zone_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dispatch_zone_setting_set_by_fkey';
            columns: ['set_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dispatch_zone_setting_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: true;
            referencedRelation: 'zone';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dispatch_zone_setting_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: true;
            referencedRelation: 'zone_bounds';
            referencedColumns: ['id'];
          },
        ];
      };
      dispute: {
        Row: {
          amount_claimed_kes: number | null;
          amount_refunded_kes: number;
          branch_id: string | null;
          charged_to: string | null;
          evidence: NonNullable<Json>;
          fault: Database['public']['Enums']['dispute_fault'];
          guest_note: string | null;
          guest_user_id: string | null;
          id: string;
          merchant_id: string;
          merchant_reply: string | null;
          merchant_reply_due_at: string | null;
          opened_at: string;
          opened_by: string | null;
          order_reference: string | null;
          reason: string;
          resolution: Database['public']['Enums']['dispute_resolution'] | null;
          resolved_at: string | null;
          resolved_by: string | null;
          rider_id: string | null;
          status: Database['public']['Enums']['dispute_status'];
        };
        Insert: {
          amount_claimed_kes?: number | null;
          amount_refunded_kes?: number;
          branch_id?: string | null;
          charged_to?: string | null;
          evidence?: NonNullable<Json>;
          fault?: Database['public']['Enums']['dispute_fault'];
          guest_note?: string | null;
          guest_user_id?: string | null;
          id?: string;
          merchant_id: string;
          merchant_reply?: string | null;
          merchant_reply_due_at?: string | null;
          opened_at?: string;
          opened_by?: string | null;
          order_reference?: string | null;
          reason: string;
          resolution?: Database['public']['Enums']['dispute_resolution'] | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          rider_id?: string | null;
          status?: Database['public']['Enums']['dispute_status'];
        };
        Update: {
          amount_claimed_kes?: number | null;
          amount_refunded_kes?: number;
          branch_id?: string | null;
          charged_to?: string | null;
          evidence?: NonNullable<Json>;
          fault?: Database['public']['Enums']['dispute_fault'];
          guest_note?: string | null;
          guest_user_id?: string | null;
          id?: string;
          merchant_id?: string;
          merchant_reply?: string | null;
          merchant_reply_due_at?: string | null;
          opened_at?: string;
          opened_by?: string | null;
          order_reference?: string | null;
          reason?: string;
          resolution?: Database['public']['Enums']['dispute_resolution'] | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          rider_id?: string | null;
          status?: Database['public']['Enums']['dispute_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'dispute_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['branch_id'];
          },
          {
            foreignKeyName: 'dispute_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_branch';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dispute_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dispute_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'dispute_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'dispute_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dispute_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'dispute_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dispute_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dispute_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dispute_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'dispute_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'dispute_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'dispute_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dispute_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'dispute_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      document: {
        Row: {
          created_at: string;
          expires_at: string | null;
          id: string;
          issued_at: string | null;
          mime: string;
          ocr: Json | null;
          owner_id: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          quality: Json | null;
          rejection_reason: string | null;
          requirement_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          side: string | null;
          size_bytes: number;
          status: Database['public']['Enums']['document_status'];
          storage_path: string;
          superseded_at: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          issued_at?: string | null;
          mime: string;
          ocr?: Json | null;
          owner_id: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          quality?: Json | null;
          rejection_reason?: string | null;
          requirement_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          side?: string | null;
          size_bytes: number;
          status?: Database['public']['Enums']['document_status'];
          storage_path: string;
          superseded_at?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          issued_at?: string | null;
          mime?: string;
          ocr?: Json | null;
          owner_id?: string;
          owner_type?: Database['public']['Enums']['document_owner_type'];
          quality?: Json | null;
          rejection_reason?: string | null;
          requirement_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          side?: string | null;
          size_bytes?: number;
          status?: Database['public']['Enums']['document_status'];
          storage_path?: string;
          superseded_at?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'document_requirement_id_fkey';
            columns: ['requirement_id'];
            isOneToOne: false;
            referencedRelation: 'document_requirement';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      document_automation_rule: {
        Row: {
          enabled: boolean;
          key: string;
          label: string;
          params: NonNullable<Json>;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          enabled?: boolean;
          key: string;
          label: string;
          params?: NonNullable<Json>;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          enabled?: boolean;
          key?: string;
          label?: string;
          params?: NonNullable<Json>;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'document_automation_rule_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      document_request: {
        Row: {
          channel: string;
          created_at: string;
          fulfilled_document_id: string | null;
          id: string;
          owner_id: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          requirement_id: string;
          sent_at: string;
          updated_at: string;
        };
        Insert: {
          channel?: string;
          created_at?: string;
          fulfilled_document_id?: string | null;
          id?: string;
          owner_id: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          requirement_id: string;
          sent_at?: string;
          updated_at?: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          fulfilled_document_id?: string | null;
          id?: string;
          owner_id?: string;
          owner_type?: Database['public']['Enums']['document_owner_type'];
          requirement_id?: string;
          sent_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_request_fulfilled_document_id_fkey';
            columns: ['fulfilled_document_id'];
            isOneToOne: false;
            referencedRelation: 'document';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_request_requirement_id_fkey';
            columns: ['requirement_id'];
            isOneToOne: false;
            referencedRelation: 'document_requirement';
            referencedColumns: ['id'];
          },
        ];
      };
      document_requirement: {
        Row: {
          applies_when: NonNullable<Json>;
          created_at: string;
          essential: boolean;
          has_expiry: boolean;
          help_text: string | null;
          id: string;
          kind: string;
          label: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          required: boolean;
          sort: number;
          updated_at: string;
          why_text: string | null;
        };
        Insert: {
          applies_when?: NonNullable<Json>;
          created_at?: string;
          essential?: boolean;
          has_expiry?: boolean;
          help_text?: string | null;
          id?: string;
          kind: string;
          label: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          required?: boolean;
          sort?: number;
          updated_at?: string;
          why_text?: string | null;
        };
        Update: {
          applies_when?: NonNullable<Json>;
          created_at?: string;
          essential?: boolean;
          has_expiry?: boolean;
          help_text?: string | null;
          id?: string;
          kind?: string;
          label?: string;
          owner_type?: Database['public']['Enums']['document_owner_type'];
          required?: boolean;
          sort?: number;
          updated_at?: string;
          why_text?: string | null;
        };
        Relationships: [];
      };
      event: {
        Row: {
          anchor_slot: Database['public']['Enums']['block_slot'];
          category: Database['public']['Enums']['event_category'];
          city_id: string;
          cover_path: string | null;
          created_at: string;
          doors_at: string | null;
          ends_at: string | null;
          featured: boolean;
          id: string;
          name: string;
          nexg_can_hold_tickets: boolean;
          organiser_name: string | null;
          organiser_url: string | null;
          practical_note: string | null;
          published_at: string | null;
          published_by: string | null;
          rejected_reason: string | null;
          reviewed_by: string | null;
          source: string;
          source_ref: string | null;
          starts_at: string;
          starts_on: string | null;
          status: Database['public']['Enums']['event_status'];
          submission_note: string | null;
          submitted_by_partner_id: string | null;
          suggested_blocks: NonNullable<Json>;
          ticket_bands: NonNullable<Json>;
          ticket_partner_id: string | null;
          ticket_url: string | null;
          updated_at: string;
          venue_address: string | null;
          venue_name: string | null;
          venue_point: unknown;
        };
        Insert: {
          anchor_slot?: Database['public']['Enums']['block_slot'];
          category?: Database['public']['Enums']['event_category'];
          city_id: string;
          cover_path?: string | null;
          created_at?: string;
          doors_at?: string | null;
          ends_at?: string | null;
          featured?: boolean;
          id?: string;
          name: string;
          nexg_can_hold_tickets?: boolean;
          organiser_name?: string | null;
          organiser_url?: string | null;
          practical_note?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          rejected_reason?: string | null;
          reviewed_by?: string | null;
          source?: string;
          source_ref?: string | null;
          starts_at: string;
          starts_on?: never;
          status?: Database['public']['Enums']['event_status'];
          submission_note?: string | null;
          submitted_by_partner_id?: string | null;
          suggested_blocks?: NonNullable<Json>;
          ticket_bands?: NonNullable<Json>;
          ticket_partner_id?: string | null;
          ticket_url?: string | null;
          updated_at?: string;
          venue_address?: string | null;
          venue_name?: string | null;
          venue_point?: unknown;
        };
        Update: {
          anchor_slot?: Database['public']['Enums']['block_slot'];
          category?: Database['public']['Enums']['event_category'];
          city_id?: string;
          cover_path?: string | null;
          created_at?: string;
          doors_at?: string | null;
          ends_at?: string | null;
          featured?: boolean;
          id?: string;
          name?: string;
          nexg_can_hold_tickets?: boolean;
          organiser_name?: string | null;
          organiser_url?: string | null;
          practical_note?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          rejected_reason?: string | null;
          reviewed_by?: string | null;
          source?: string;
          source_ref?: string | null;
          starts_at?: string;
          starts_on?: never;
          status?: Database['public']['Enums']['event_status'];
          submission_note?: string | null;
          submitted_by_partner_id?: string | null;
          suggested_blocks?: NonNullable<Json>;
          ticket_bands?: NonNullable<Json>;
          ticket_partner_id?: string | null;
          ticket_url?: string | null;
          updated_at?: string;
          venue_address?: string | null;
          venue_name?: string | null;
          venue_point?: unknown;
        };
        Relationships: [
          {
            foreignKeyName: 'event_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_published_by_fkey';
            columns: ['published_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_submitted_by_partner_id_fkey';
            columns: ['submitted_by_partner_id'];
            isOneToOne: false;
            referencedRelation: 'experience_partner';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_ticket_partner_id_fkey';
            columns: ['ticket_partner_id'];
            isOneToOne: false;
            referencedRelation: 'experience_partner';
            referencedColumns: ['id'];
          },
        ];
      };
      event_feed: {
        Row: {
          auth: Json | null;
          city_id: string;
          created_at: string;
          enabled: boolean;
          id: string;
          kind: string;
          last_result: Json | null;
          last_run_at: string | null;
          name: string;
          updated_at: string;
          url: string;
        };
        Insert: {
          auth?: Json | null;
          city_id: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          kind: string;
          last_result?: Json | null;
          last_run_at?: string | null;
          name: string;
          updated_at?: string;
          url: string;
        };
        Update: {
          auth?: Json | null;
          city_id?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          kind?: string;
          last_result?: Json | null;
          last_run_at?: string | null;
          name?: string;
          updated_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_feed_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
      experience_component: {
        Row: {
          booking_lead_hours: number;
          capacity_per_day: number | null;
          city_id: string;
          cover_path: string | null;
          created_at: string;
          default_slot: Database['public']['Enums']['block_slot'];
          description: string | null;
          duration_min: number;
          earliest_start: string | null;
          id: string;
          includes: string[];
          kind: Database['public']['Enums']['block_kind'];
          latest_start: string | null;
          location: unknown;
          max_party: number | null;
          min_party: number;
          mood: Database['public']['Enums']['mood'];
          partner_id: string;
          party_types: string[];
          pay_on_day: NonNullable<Json>;
          price_basis: Database['public']['Enums']['price_basis'];
          price_kes: number | null;
          sort: number;
          status: string;
          subtitle: string | null;
          swap_group: string;
          tags: string[];
          tier: number;
          title: string;
          updated_at: string;
          zone_id: string | null;
        };
        Insert: {
          booking_lead_hours?: number;
          capacity_per_day?: number | null;
          city_id: string;
          cover_path?: string | null;
          created_at?: string;
          default_slot: Database['public']['Enums']['block_slot'];
          description?: string | null;
          duration_min: number;
          earliest_start?: string | null;
          id?: string;
          includes?: string[];
          kind: Database['public']['Enums']['block_kind'];
          latest_start?: string | null;
          location?: unknown;
          max_party?: number | null;
          min_party?: number;
          mood: Database['public']['Enums']['mood'];
          partner_id: string;
          party_types?: string[];
          pay_on_day?: NonNullable<Json>;
          price_basis?: Database['public']['Enums']['price_basis'];
          price_kes?: number | null;
          sort?: number;
          status?: string;
          subtitle?: string | null;
          swap_group: string;
          tags?: string[];
          tier?: number;
          title: string;
          updated_at?: string;
          zone_id?: string | null;
        };
        Update: {
          booking_lead_hours?: number;
          capacity_per_day?: number | null;
          city_id?: string;
          cover_path?: string | null;
          created_at?: string;
          default_slot?: Database['public']['Enums']['block_slot'];
          description?: string | null;
          duration_min?: number;
          earliest_start?: string | null;
          id?: string;
          includes?: string[];
          kind?: Database['public']['Enums']['block_kind'];
          latest_start?: string | null;
          location?: unknown;
          max_party?: number | null;
          min_party?: number;
          mood?: Database['public']['Enums']['mood'];
          partner_id?: string;
          party_types?: string[];
          pay_on_day?: NonNullable<Json>;
          price_basis?: Database['public']['Enums']['price_basis'];
          price_kes?: number | null;
          sort?: number;
          status?: string;
          subtitle?: string | null;
          swap_group?: string;
          tags?: string[];
          tier?: number;
          title?: string;
          updated_at?: string;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'experience_component_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'experience_component_partner_id_fkey';
            columns: ['partner_id'];
            isOneToOne: false;
            referencedRelation: 'experience_partner';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'experience_component_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'experience_component_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone_bounds';
            referencedColumns: ['id'];
          },
        ];
      };
      experience_partner: {
        Row: {
          can_answer_holds: boolean;
          city_id: string;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          created_at: string;
          id: string;
          kind: Database['public']['Enums']['experience_partner_kind'];
          merchant_id: string | null;
          name: string;
          portal_user_id: string | null;
          preferred_channel: string;
          response_time_median_min: number | null;
          settlement_account: Json | null;
          status: Database['public']['Enums']['partner_status'];
          terms: NonNullable<Json>;
          updated_at: string;
          went_live_at: string | null;
        };
        Insert: {
          can_answer_holds?: boolean;
          city_id: string;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          id?: string;
          kind: Database['public']['Enums']['experience_partner_kind'];
          merchant_id?: string | null;
          name: string;
          portal_user_id?: string | null;
          preferred_channel?: string;
          response_time_median_min?: number | null;
          settlement_account?: Json | null;
          status?: Database['public']['Enums']['partner_status'];
          terms?: NonNullable<Json>;
          updated_at?: string;
          went_live_at?: string | null;
        };
        Update: {
          can_answer_holds?: boolean;
          city_id?: string;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          id?: string;
          kind?: Database['public']['Enums']['experience_partner_kind'];
          merchant_id?: string | null;
          name?: string;
          portal_user_id?: string | null;
          preferred_channel?: string;
          response_time_median_min?: number | null;
          settlement_account?: Json | null;
          status?: Database['public']['Enums']['partner_status'];
          terms?: NonNullable<Json>;
          updated_at?: string;
          went_live_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'experience_partner_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'experience_partner_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'experience_partner_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'experience_partner_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'experience_partner_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'experience_partner_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'experience_partner_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      fraud_rule: {
        Row: {
          enabled: boolean;
          kind: Database['public']['Enums']['fraud_signal_kind'];
          label: string;
          params: NonNullable<Json>;
          updated_by: string | null;
        };
        Insert: {
          enabled?: boolean;
          kind: Database['public']['Enums']['fraud_signal_kind'];
          label: string;
          params?: NonNullable<Json>;
          updated_by?: string | null;
        };
        Update: {
          enabled?: boolean;
          kind?: Database['public']['Enums']['fraud_signal_kind'];
          label?: string;
          params?: NonNullable<Json>;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'fraud_rule_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      fraud_signal: {
        Row: {
          details: NonNullable<Json>;
          detected_at: string;
          id: string;
          kind: Database['public']['Enums']['fraud_signal_kind'];
          order_reference: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          rider_id: string;
          score: number | null;
          status: string;
        };
        Insert: {
          details?: NonNullable<Json>;
          detected_at?: string;
          id?: string;
          kind: Database['public']['Enums']['fraud_signal_kind'];
          order_reference?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          rider_id: string;
          score?: number | null;
          status?: string;
        };
        Update: {
          details?: NonNullable<Json>;
          detected_at?: string;
          id?: string;
          kind?: Database['public']['Enums']['fraud_signal_kind'];
          order_reference?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          rider_id?: string;
          score?: number | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fraud_signal_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fraud_signal_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fraud_signal_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'fraud_signal_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'fraud_signal_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'fraud_signal_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fraud_signal_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'fraud_signal_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      health_weight_config: {
        Row: {
          key: string;
          label: string;
          target: number | null;
          updated_at: string;
          updated_by: string | null;
          weight_pct: number;
        };
        Insert: {
          key: string;
          label: string;
          target?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          weight_pct: number;
        };
        Update: {
          key?: string;
          label?: string;
          target?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          weight_pct?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'health_weight_config_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      incident: {
        Row: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          assignee_id: string | null;
          compensation_kes: number | null;
          created_at: string;
          description: string | null;
          evidence: NonNullable<Json>;
          guest_user_id: string | null;
          happened_at: string;
          id: string;
          injury: boolean;
          insurance_claim_ref: string | null;
          insurance_claim_status: string | null;
          kind: Database['public']['Enums']['incident_kind'];
          location: unknown;
          merchant_id: string | null;
          order_reference: string | null;
          police_ref: string | null;
          redispatched_order_reference: string | null;
          reported_by_id: string | null;
          reported_by_type: string;
          resolution: string | null;
          resolved_at: string | null;
          rider_id: string | null;
          severity: Database['public']['Enums']['incident_severity'];
          status: Database['public']['Enums']['incident_status'];
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          assignee_id?: string | null;
          compensation_kes?: number | null;
          created_at?: string;
          description?: string | null;
          evidence?: NonNullable<Json>;
          guest_user_id?: string | null;
          happened_at?: string;
          id?: string;
          injury?: boolean;
          insurance_claim_ref?: string | null;
          insurance_claim_status?: string | null;
          kind: Database['public']['Enums']['incident_kind'];
          location?: unknown;
          merchant_id?: string | null;
          order_reference?: string | null;
          police_ref?: string | null;
          redispatched_order_reference?: string | null;
          reported_by_id?: string | null;
          reported_by_type: string;
          resolution?: string | null;
          resolved_at?: string | null;
          rider_id?: string | null;
          severity?: Database['public']['Enums']['incident_severity'];
          status?: Database['public']['Enums']['incident_status'];
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          assignee_id?: string | null;
          compensation_kes?: number | null;
          created_at?: string;
          description?: string | null;
          evidence?: NonNullable<Json>;
          guest_user_id?: string | null;
          happened_at?: string;
          id?: string;
          injury?: boolean;
          insurance_claim_ref?: string | null;
          insurance_claim_status?: string | null;
          kind?: Database['public']['Enums']['incident_kind'];
          location?: unknown;
          merchant_id?: string | null;
          order_reference?: string | null;
          police_ref?: string | null;
          redispatched_order_reference?: string | null;
          reported_by_id?: string | null;
          reported_by_type?: string;
          resolution?: string | null;
          resolved_at?: string | null;
          rider_id?: string | null;
          severity?: Database['public']['Enums']['incident_severity'];
          status?: Database['public']['Enums']['incident_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'incident_acknowledged_by_fkey';
            columns: ['acknowledged_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'incident_assignee_id_fkey';
            columns: ['assignee_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'incident_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'incident_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'incident_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'incident_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'incident_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'incident_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'incident_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'incident_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'incident_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'incident_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'incident_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'incident_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'incident_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      incident_note: {
        Row: {
          author_id: string | null;
          body: string;
          created_at: string;
          id: number;
          incident_id: string;
        };
        Insert: {
          author_id?: string | null;
          body: string;
          created_at?: string;
          id?: number;
          incident_id: string;
        };
        Update: {
          author_id?: string | null;
          body?: string;
          created_at?: string;
          id?: number;
          incident_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'incident_note_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'incident_note_incident_id_fkey';
            columns: ['incident_id'];
            isOneToOne: false;
            referencedRelation: 'incident';
            referencedColumns: ['id'];
          },
        ];
      };
      job_application: {
        Row: {
          city_id: string | null;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          link: string | null;
          note: string | null;
          phone: string | null;
          role_title: string;
          team: string | null;
        };
        Insert: {
          city_id?: string | null;
          created_at?: string;
          email: string;
          full_name: string;
          id?: string;
          link?: string | null;
          note?: string | null;
          phone?: string | null;
          role_title: string;
          team?: string | null;
        };
        Update: {
          city_id?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          link?: string | null;
          note?: string | null;
          phone?: string | null;
          role_title?: string;
          team?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'job_application_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
      legal_acceptance: {
        Row: {
          accepted_at: string;
          accepted_by_name: string | null;
          created_at: string;
          document: Database['public']['Enums']['legal_document_key'];
          id: string;
          ip: unknown;
          merchant_id: string | null;
          rider_id: string | null;
          user_agent: string | null;
          user_id: string | null;
          version: string;
        };
        Insert: {
          accepted_at?: string;
          accepted_by_name?: string | null;
          created_at?: string;
          document: Database['public']['Enums']['legal_document_key'];
          id?: string;
          ip?: unknown;
          merchant_id?: string | null;
          rider_id?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
          version: string;
        };
        Update: {
          accepted_at?: string;
          accepted_by_name?: string | null;
          created_at?: string;
          document?: Database['public']['Enums']['legal_document_key'];
          id?: string;
          ip?: unknown;
          merchant_id?: string | null;
          rider_id?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'legal_acceptance_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'legal_acceptance_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'legal_acceptance_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'legal_acceptance_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'legal_acceptance_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'legal_acceptance_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'legal_acceptance_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'legal_acceptance_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'legal_acceptance_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'legal_acceptance_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'legal_acceptance_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'legal_acceptance_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'legal_acceptance_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      locale_request: {
        Row: {
          first_seen: string;
          generated_at: string | null;
          last_seen: string;
          locale: string;
          requests: number;
        };
        Insert: {
          first_seen?: string;
          generated_at?: string | null;
          last_seen?: string;
          locale: string;
          requests?: number;
        };
        Update: {
          first_seen?: string;
          generated_at?: string | null;
          last_seen?: string;
          locale?: string;
          requests?: number;
        };
        Relationships: [];
      };
      merchant: {
        Row: {
          accepting_orders: boolean;
          accepting_orders_changed_at: string | null;
          accepting_orders_source: Database['public']['Enums']['merchant_control_source'] | null;
          acquisition_channel: Database['public']['Enums']['acquisition_channel'] | null;
          acquisition_source: string | null;
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          busy_mode_until: string | null;
          capacity_per_15min: number | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          closed_early_at: string | null;
          commission_pct: number | null;
          commission_tier: Database['public']['Enums']['commission_tier_code'];
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          delisted_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_delivery_pay_to_merchant: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
          health_band: Database['public']['Enums']['health_band'] | null;
          health_score: number | null;
          hours: Json | null;
          hours_pattern: string | null;
          id: string;
          landmark: string | null;
          late_night_until: string | null;
          legal_name: string | null;
          onboarding_call_at: string | null;
          onboarding_source: string | null;
          onboarding_step: number;
          order_channels: string[];
          packaging: string | null;
          parent_merchant_id: string | null;
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_hold: boolean;
          payout_hold_reason: string | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          referred_by_id: string | null;
          referred_by_type: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          trading_name: string;
          updated_at: string;
          waitlisted_at: string | null;
          went_live_at: string | null;
          went_live_by: string | null;
          when_busy: string;
        };
        Insert: {
          accepting_orders?: boolean;
          accepting_orders_changed_at?: string | null;
          accepting_orders_source?: Database['public']['Enums']['merchant_control_source'] | null;
          acquisition_channel?: Database['public']['Enums']['acquisition_channel'] | null;
          acquisition_source?: string | null;
          answers?: NonNullable<Json>;
          branch_count_band?: string | null;
          busy_mode_until?: string | null;
          capacity_per_15min?: number | null;
          category?: Database['public']['Enums']['merchant_category'] | null;
          category_other?: string | null;
          city_id?: string | null;
          closed_early_at?: string | null;
          commission_pct?: number | null;
          commission_tier?: Database['public']['Enums']['commission_tier_code'];
          concierge_pick?: boolean;
          contact_email?: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path?: string | null;
          created_at?: string;
          credentials_sent_at?: string | null;
          delisted_at?: string | null;
          explore_visible?: boolean;
          featured?: boolean;
          fleet_delivery_pay_to_merchant?: boolean;
          fleet_dispatch_preference?: string;
          has_own_riders?: boolean;
          health_band?: Database['public']['Enums']['health_band'] | null;
          health_score?: number | null;
          hours?: Json | null;
          hours_pattern?: string | null;
          id?: string;
          landmark?: string | null;
          late_night_until?: string | null;
          legal_name?: string | null;
          onboarding_call_at?: string | null;
          onboarding_source?: string | null;
          onboarding_step?: number;
          order_channels?: string[];
          packaging?: string | null;
          parent_merchant_id?: string | null;
          password_set_at?: string | null;
          pay_on_delivery?: boolean;
          pay_on_delivery_cap_kes?: number | null;
          payout_account?: Json | null;
          payout_hold?: boolean;
          payout_hold_reason?: string | null;
          payout_name_lookup?: Json | null;
          payout_rail?: string | null;
          phone_code_attempts?: number;
          phone_code_expires_at?: string | null;
          phone_code_hash?: string | null;
          phone_verified_at?: string | null;
          pickup_instructions?: string | null;
          prep_minutes?: number;
          price_band?: string | null;
          referred_by_id?: string | null;
          referred_by_type?: string | null;
          requires_ops_mapping?: boolean;
          resume_token_expires_at?: string | null;
          resume_token_hash?: string | null;
          rider_parking?: string | null;
          settlement_account?: Json | null;
          source_url?: string | null;
          status?: Database['public']['Enums']['partner_status'];
          status_reason?: string | null;
          strike_count?: number;
          submitted_at?: string | null;
          suspended_at?: string | null;
          suspended_by?: string | null;
          suspension_reason?: string | null;
          suspension_second_approver?: string | null;
          trading_name: string;
          updated_at?: string;
          waitlisted_at?: string | null;
          went_live_at?: string | null;
          went_live_by?: string | null;
          when_busy?: string;
        };
        Update: {
          accepting_orders?: boolean;
          accepting_orders_changed_at?: string | null;
          accepting_orders_source?: Database['public']['Enums']['merchant_control_source'] | null;
          acquisition_channel?: Database['public']['Enums']['acquisition_channel'] | null;
          acquisition_source?: string | null;
          answers?: NonNullable<Json>;
          branch_count_band?: string | null;
          busy_mode_until?: string | null;
          capacity_per_15min?: number | null;
          category?: Database['public']['Enums']['merchant_category'] | null;
          category_other?: string | null;
          city_id?: string | null;
          closed_early_at?: string | null;
          commission_pct?: number | null;
          commission_tier?: Database['public']['Enums']['commission_tier_code'];
          concierge_pick?: boolean;
          contact_email?: string | null;
          contact_name?: string;
          contact_phone?: string;
          cover_photo_path?: string | null;
          created_at?: string;
          credentials_sent_at?: string | null;
          delisted_at?: string | null;
          explore_visible?: boolean;
          featured?: boolean;
          fleet_delivery_pay_to_merchant?: boolean;
          fleet_dispatch_preference?: string;
          has_own_riders?: boolean;
          health_band?: Database['public']['Enums']['health_band'] | null;
          health_score?: number | null;
          hours?: Json | null;
          hours_pattern?: string | null;
          id?: string;
          landmark?: string | null;
          late_night_until?: string | null;
          legal_name?: string | null;
          onboarding_call_at?: string | null;
          onboarding_source?: string | null;
          onboarding_step?: number;
          order_channels?: string[];
          packaging?: string | null;
          parent_merchant_id?: string | null;
          password_set_at?: string | null;
          pay_on_delivery?: boolean;
          pay_on_delivery_cap_kes?: number | null;
          payout_account?: Json | null;
          payout_hold?: boolean;
          payout_hold_reason?: string | null;
          payout_name_lookup?: Json | null;
          payout_rail?: string | null;
          phone_code_attempts?: number;
          phone_code_expires_at?: string | null;
          phone_code_hash?: string | null;
          phone_verified_at?: string | null;
          pickup_instructions?: string | null;
          prep_minutes?: number;
          price_band?: string | null;
          referred_by_id?: string | null;
          referred_by_type?: string | null;
          requires_ops_mapping?: boolean;
          resume_token_expires_at?: string | null;
          resume_token_hash?: string | null;
          rider_parking?: string | null;
          settlement_account?: Json | null;
          source_url?: string | null;
          status?: Database['public']['Enums']['partner_status'];
          status_reason?: string | null;
          strike_count?: number;
          submitted_at?: string | null;
          suspended_at?: string | null;
          suspended_by?: string | null;
          suspension_reason?: string | null;
          suspension_second_approver?: string | null;
          trading_name?: string;
          updated_at?: string;
          waitlisted_at?: string | null;
          went_live_at?: string | null;
          went_live_by?: string | null;
          when_busy?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_suspended_by_fkey';
            columns: ['suspended_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_suspension_second_approver_fkey';
            columns: ['suspension_second_approver'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_went_live_by_fkey';
            columns: ['went_live_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_branch: {
        Row: {
          address_text: string | null;
          created_at: string;
          id: string;
          inherits_hours: boolean;
          is_primary: boolean;
          latitude: number | null;
          location: unknown;
          longitude: number | null;
          merchant_id: string;
          name: string | null;
          sort: number;
          source: string;
          updated_at: string;
          zone_id: string | null;
        };
        Insert: {
          address_text?: string | null;
          created_at?: string;
          id?: string;
          inherits_hours?: boolean;
          is_primary?: boolean;
          latitude?: number | null;
          location?: unknown;
          longitude?: number | null;
          merchant_id: string;
          name?: string | null;
          sort?: number;
          source?: string;
          updated_at?: string;
          zone_id?: string | null;
        };
        Update: {
          address_text?: string | null;
          created_at?: string;
          id?: string;
          inherits_hours?: boolean;
          is_primary?: boolean;
          latitude?: number | null;
          location?: unknown;
          longitude?: number | null;
          merchant_id?: string;
          name?: string | null;
          sort?: number;
          source?: string;
          updated_at?: string;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_branch_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_branch_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_branch_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_branch_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_branch_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_branch_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_branch_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_branch_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone_bounds';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_chain_setting: {
        Row: {
          consolidated_statement: boolean;
          parent_id: string;
          shared_catalogue: boolean;
          shared_hours: boolean;
          single_payout: boolean;
        };
        Insert: {
          consolidated_statement?: boolean;
          parent_id: string;
          shared_catalogue?: boolean;
          shared_hours?: boolean;
          single_payout?: boolean;
        };
        Update: {
          consolidated_statement?: boolean;
          parent_id?: string;
          shared_catalogue?: boolean;
          shared_hours?: boolean;
          single_payout?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_chain_setting_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: true;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_chain_setting_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: true;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_chain_setting_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: true;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_chain_setting_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: true;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_chain_setting_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: true;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_chain_setting_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: true;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_fleet_rider: {
        Row: {
          branch_id: string | null;
          created_at: string;
          declared_by: string | null;
          id: string;
          invite_expires_at: string | null;
          invite_status: Database['public']['Enums']['fleet_invite_status'];
          invite_token_hash: string | null;
          invited_at: string | null;
          merchant_id: string;
          name: string;
          phone: string;
          plate_no: string | null;
          rider_id: string | null;
          updated_at: string;
          vehicle: Database['public']['Enums']['vehicle_type'];
        };
        Insert: {
          branch_id?: string | null;
          created_at?: string;
          declared_by?: string | null;
          id?: string;
          invite_expires_at?: string | null;
          invite_status?: Database['public']['Enums']['fleet_invite_status'];
          invite_token_hash?: string | null;
          invited_at?: string | null;
          merchant_id: string;
          name: string;
          phone: string;
          plate_no?: string | null;
          rider_id?: string | null;
          updated_at?: string;
          vehicle: Database['public']['Enums']['vehicle_type'];
        };
        Update: {
          branch_id?: string | null;
          created_at?: string;
          declared_by?: string | null;
          id?: string;
          invite_expires_at?: string | null;
          invite_status?: Database['public']['Enums']['fleet_invite_status'];
          invite_token_hash?: string | null;
          invited_at?: string | null;
          merchant_id?: string;
          name?: string;
          phone?: string;
          plate_no?: string | null;
          rider_id?: string | null;
          updated_at?: string;
          vehicle?: Database['public']['Enums']['vehicle_type'];
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_fleet_rider_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['branch_id'];
          },
          {
            foreignKeyName: 'merchant_fleet_rider_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_branch';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_fleet_rider_declared_by_fkey';
            columns: ['declared_by'];
            isOneToOne: false;
            referencedRelation: 'merchant_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_fleet_rider_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_fleet_rider_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_fleet_rider_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_fleet_rider_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_fleet_rider_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_fleet_rider_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_fleet_rider_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_fleet_rider_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'merchant_fleet_rider_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'merchant_fleet_rider_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'merchant_fleet_rider_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_fleet_rider_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'merchant_fleet_rider_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_health_snapshot: {
        Row: {
          acceptance_pct: number | null;
          as_of: string;
          band: Database['public']['Enums']['health_band'] | null;
          cancel_pct: number | null;
          created_at: string;
          dashboard_response_s: number | null;
          merchant_id: string;
          missing_item_pct: number | null;
          on_time_ready_pct: number | null;
          orders_30d: number;
          rating_avg: number | null;
          score: number | null;
          trend: number[];
          weights: NonNullable<Json>;
        };
        Insert: {
          acceptance_pct?: number | null;
          as_of: string;
          band?: Database['public']['Enums']['health_band'] | null;
          cancel_pct?: number | null;
          created_at?: string;
          dashboard_response_s?: number | null;
          merchant_id: string;
          missing_item_pct?: number | null;
          on_time_ready_pct?: number | null;
          orders_30d?: number;
          rating_avg?: number | null;
          score?: number | null;
          trend?: number[];
          weights?: NonNullable<Json>;
        };
        Update: {
          acceptance_pct?: number | null;
          as_of?: string;
          band?: Database['public']['Enums']['health_band'] | null;
          cancel_pct?: number | null;
          created_at?: string;
          dashboard_response_s?: number | null;
          merchant_id?: string;
          missing_item_pct?: number | null;
          on_time_ready_pct?: number | null;
          orders_30d?: number;
          rating_avg?: number | null;
          score?: number | null;
          trend?: number[];
          weights?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_health_snapshot_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_health_snapshot_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_health_snapshot_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_health_snapshot_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_health_snapshot_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_health_snapshot_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_hours: {
        Row: {
          closed: boolean;
          closes: string | null;
          created_at: string;
          day_of_week: number;
          id: string;
          merchant_id: string;
          opens: string | null;
          updated_at: string;
        };
        Insert: {
          closed?: boolean;
          closes?: string | null;
          created_at?: string;
          day_of_week: number;
          id?: string;
          merchant_id: string;
          opens?: string | null;
          updated_at?: string;
        };
        Update: {
          closed?: boolean;
          closes?: string | null;
          created_at?: string;
          day_of_week?: number;
          id?: string;
          merchant_id?: string;
          opens?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_hours_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_hours_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_hours_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_hours_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_hours_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_hours_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_hours_override: {
        Row: {
          branch_id: string | null;
          closed: boolean;
          closes: string | null;
          created_at: string;
          created_by: string | null;
          date: string;
          id: string;
          merchant_id: string;
          opens: string | null;
          reason: string | null;
          source: Database['public']['Enums']['merchant_control_source'];
        };
        Insert: {
          branch_id?: string | null;
          closed?: boolean;
          closes?: string | null;
          created_at?: string;
          created_by?: string | null;
          date: string;
          id?: string;
          merchant_id: string;
          opens?: string | null;
          reason?: string | null;
          source?: Database['public']['Enums']['merchant_control_source'];
        };
        Update: {
          branch_id?: string | null;
          closed?: boolean;
          closes?: string | null;
          created_at?: string;
          created_by?: string | null;
          date?: string;
          id?: string;
          merchant_id?: string;
          opens?: string | null;
          reason?: string | null;
          source?: Database['public']['Enums']['merchant_control_source'];
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_hours_override_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['branch_id'];
          },
          {
            foreignKeyName: 'merchant_hours_override_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_branch';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_hours_override_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_hours_override_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_hours_override_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_hours_override_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_hours_override_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_hours_override_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_hours_override_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_message: {
        Row: {
          actor_id: string | null;
          body: string;
          channel: string;
          created_at: string;
          direction: string;
          id: string;
          merchant_id: string;
          notification_id: string | null;
          read_at: string | null;
          subject: string | null;
        };
        Insert: {
          actor_id?: string | null;
          body: string;
          channel: string;
          created_at?: string;
          direction: string;
          id?: string;
          merchant_id: string;
          notification_id?: string | null;
          read_at?: string | null;
          subject?: string | null;
        };
        Update: {
          actor_id?: string | null;
          body?: string;
          channel?: string;
          created_at?: string;
          direction?: string;
          id?: string;
          merchant_id?: string;
          notification_id?: string | null;
          read_at?: string | null;
          subject?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_message_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_message_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_message_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_message_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_message_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_message_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_message_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_message_notification_id_fkey';
            columns: ['notification_id'];
            isOneToOne: false;
            referencedRelation: 'notification';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_penalty: {
        Row: {
          amount_kes: number;
          applied_by: string | null;
          created_at: string;
          dispute_id: string | null;
          id: string;
          kind: string;
          merchant_id: string;
          order_reference: string | null;
          status: string;
        };
        Insert: {
          amount_kes: number;
          applied_by?: string | null;
          created_at?: string;
          dispute_id?: string | null;
          id?: string;
          kind: string;
          merchant_id: string;
          order_reference?: string | null;
          status?: string;
        };
        Update: {
          amount_kes?: number;
          applied_by?: string | null;
          created_at?: string;
          dispute_id?: string | null;
          id?: string;
          kind?: string;
          merchant_id?: string;
          order_reference?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_penalty_applied_by_fkey';
            columns: ['applied_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_penalty_dispute_id_fkey';
            columns: ['dispute_id'];
            isOneToOne: false;
            referencedRelation: 'dispute';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_penalty_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_penalty_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_penalty_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_penalty_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_penalty_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_penalty_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_review: {
        Row: {
          checklist: NonNullable<Json>;
          finished_at: string | null;
          id: string;
          merchant_id: string;
          notes: string | null;
          outcome: string | null;
          reviewer_id: string;
          started_at: string;
        };
        Insert: {
          checklist?: NonNullable<Json>;
          finished_at?: string | null;
          id?: string;
          merchant_id: string;
          notes?: string | null;
          outcome?: string | null;
          reviewer_id: string;
          started_at?: string;
        };
        Update: {
          checklist?: NonNullable<Json>;
          finished_at?: string | null;
          id?: string;
          merchant_id?: string;
          notes?: string | null;
          outcome?: string | null;
          reviewer_id?: string;
          started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_review_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_review_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_review_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_review_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_review_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_review_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_review_reviewer_id_fkey';
            columns: ['reviewer_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_statement: {
        Row: {
          adjustments_kes: number;
          approved_by: string | null;
          commission_kes: number;
          created_at: string;
          gross_kes: number;
          id: string;
          ledger_hash: string | null;
          merchant_id: string;
          net_kes: number;
          paid_at: string | null;
          pdf_path: string | null;
          penalties_kes: number;
          period_end: string;
          period_start: string;
          provider_ref: string | null;
          second_approver_id: string | null;
          status: Database['public']['Enums']['statement_status'];
          tax_withheld_kes: number;
          updated_at: string;
        };
        Insert: {
          adjustments_kes?: number;
          approved_by?: string | null;
          commission_kes?: number;
          created_at?: string;
          gross_kes?: number;
          id?: string;
          ledger_hash?: string | null;
          merchant_id: string;
          net_kes?: number;
          paid_at?: string | null;
          pdf_path?: string | null;
          penalties_kes?: number;
          period_end: string;
          period_start: string;
          provider_ref?: string | null;
          second_approver_id?: string | null;
          status?: Database['public']['Enums']['statement_status'];
          tax_withheld_kes?: number;
          updated_at?: string;
        };
        Update: {
          adjustments_kes?: number;
          approved_by?: string | null;
          commission_kes?: number;
          created_at?: string;
          gross_kes?: number;
          id?: string;
          ledger_hash?: string | null;
          merchant_id?: string;
          net_kes?: number;
          paid_at?: string | null;
          pdf_path?: string | null;
          penalties_kes?: number;
          period_end?: string;
          period_start?: string;
          provider_ref?: string | null;
          second_approver_id?: string | null;
          status?: Database['public']['Enums']['statement_status'];
          tax_withheld_kes?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_statement_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_statement_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_statement_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_statement_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_statement_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_statement_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_statement_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_statement_second_approver_id_fkey';
            columns: ['second_approver_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_status_change: {
        Row: {
          actor_id: string | null;
          created_at: string;
          from_status: Database['public']['Enums']['partner_status'] | null;
          id: number;
          merchant_id: string;
          reason: string | null;
          second_approver_id: string | null;
          to_status: Database['public']['Enums']['partner_status'];
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          from_status?: Database['public']['Enums']['partner_status'] | null;
          id?: number;
          merchant_id: string;
          reason?: string | null;
          second_approver_id?: string | null;
          to_status: Database['public']['Enums']['partner_status'];
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          from_status?: Database['public']['Enums']['partner_status'] | null;
          id?: number;
          merchant_id?: string;
          reason?: string | null;
          second_approver_id?: string | null;
          to_status?: Database['public']['Enums']['partner_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_status_change_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_status_change_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_status_change_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_status_change_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_status_change_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_status_change_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_status_change_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_status_change_second_approver_id_fkey';
            columns: ['second_approver_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_strike: {
        Row: {
          cleared_at: string | null;
          cleared_by: string | null;
          expires_at: string | null;
          id: string;
          issued_at: string;
          issued_by: string | null;
          level: number;
          merchant_id: string;
          reason: string;
        };
        Insert: {
          cleared_at?: string | null;
          cleared_by?: string | null;
          expires_at?: string | null;
          id?: string;
          issued_at?: string;
          issued_by?: string | null;
          level: number;
          merchant_id: string;
          reason: string;
        };
        Update: {
          cleared_at?: string | null;
          cleared_by?: string | null;
          expires_at?: string | null;
          id?: string;
          issued_at?: string;
          issued_by?: string | null;
          level?: number;
          merchant_id?: string;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_strike_cleared_by_fkey';
            columns: ['cleared_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_strike_issued_by_fkey';
            columns: ['issued_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_strike_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_strike_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_strike_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_strike_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_strike_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_strike_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_terms_acceptance: {
        Row: {
          accepted_at: string;
          accepted_by: string | null;
          ip: unknown;
          merchant_id: string;
          terms_version_id: string;
        };
        Insert: {
          accepted_at?: string;
          accepted_by?: string | null;
          ip?: unknown;
          merchant_id: string;
          terms_version_id: string;
        };
        Update: {
          accepted_at?: string;
          accepted_by?: string | null;
          ip?: unknown;
          merchant_id?: string;
          terms_version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_terms_acceptance_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_terms_acceptance_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_terms_acceptance_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_terms_acceptance_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_terms_acceptance_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_terms_acceptance_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_terms_acceptance_terms_version_id_fkey';
            columns: ['terms_version_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_terms_version';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_terms_version: {
        Row: {
          created_at: string;
          effective_from: string;
          id: string;
          pdf_path: string | null;
          requires_reacceptance: boolean;
          status: string;
          version: string;
        };
        Insert: {
          created_at?: string;
          effective_from: string;
          id?: string;
          pdf_path?: string | null;
          requires_reacceptance?: boolean;
          status?: string;
          version: string;
        };
        Update: {
          created_at?: string;
          effective_from?: string;
          id?: string;
          pdf_path?: string | null;
          requires_reacceptance?: boolean;
          status?: string;
          version?: string;
        };
        Relationships: [];
      };
      merchant_user: {
        Row: {
          created_at: string;
          id: string;
          merchant_id: string;
          role: Database['public']['Enums']['merchant_user_role'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          merchant_id: string;
          role?: Database['public']['Enums']['merchant_user_role'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          merchant_id?: string;
          role?: Database['public']['Enums']['merchant_user_role'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_user_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_user_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_user_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_user_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_user_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_user_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      message_template: {
        Row: {
          approved: boolean;
          body: string;
          channel: string;
          created_at: string;
          id: string;
          key: string;
          label: string;
          provider_template_id: string | null;
          updated_at: string;
          variables: string[];
        };
        Insert: {
          approved?: boolean;
          body: string;
          channel: string;
          created_at?: string;
          id?: string;
          key: string;
          label: string;
          provider_template_id?: string | null;
          updated_at?: string;
          variables?: string[];
        };
        Update: {
          approved?: boolean;
          body?: string;
          channel?: string;
          created_at?: string;
          id?: string;
          key?: string;
          label?: string;
          provider_template_id?: string | null;
          updated_at?: string;
          variables?: string[];
        };
        Relationships: [];
      };
      notification: {
        Row: {
          attempts: number;
          created_at: string;
          error: string | null;
          id: string;
          kind: Database['public']['Enums']['notification_kind'];
          merchant_id: string | null;
          plan_id: string | null;
          provider_message_id: string | null;
          rider_id: string | null;
          sent_at: string;
          status: Database['public']['Enums']['notification_status'];
          ticket_id: string | null;
          to_email: string | null;
          to_phone: string | null;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          error?: string | null;
          id?: string;
          kind: Database['public']['Enums']['notification_kind'];
          merchant_id?: string | null;
          plan_id?: string | null;
          provider_message_id?: string | null;
          rider_id?: string | null;
          sent_at?: string;
          status?: Database['public']['Enums']['notification_status'];
          ticket_id?: string | null;
          to_email?: string | null;
          to_phone?: string | null;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          error?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['notification_kind'];
          merchant_id?: string | null;
          plan_id?: string | null;
          provider_message_id?: string | null;
          rider_id?: string | null;
          sent_at?: string;
          status?: Database['public']['Enums']['notification_status'];
          ticket_id?: string | null;
          to_email?: string | null;
          to_phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'notification_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'notification_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'notification_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plan';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'notification_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'notification_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'notification_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'notification_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_ticket_id_fkey';
            columns: ['ticket_id'];
            isOneToOne: false;
            referencedRelation: 'support_ticket';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_log: {
        Row: {
          channel: string;
          created_at: string;
          error: string | null;
          id: string;
          payload: NonNullable<Json>;
          provider_id: string | null;
          recipient: string;
          sent_at: string | null;
          status: string;
          template: string;
        };
        Insert: {
          channel: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          payload?: NonNullable<Json>;
          provider_id?: string | null;
          recipient: string;
          sent_at?: string | null;
          status?: string;
          template: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          error?: string | null;
          id?: string;
          payload?: NonNullable<Json>;
          provider_id?: string | null;
          recipient?: string;
          sent_at?: string | null;
          status?: string;
          template?: string;
        };
        Relationships: [];
      };
      onboarding_slot: {
        Row: {
          booked: number;
          capacity: number;
          city_id: string;
          created_at: string;
          hub_name: string;
          id: string;
          starts_at: string;
          updated_at: string;
        };
        Insert: {
          booked?: number;
          capacity: number;
          city_id: string;
          created_at?: string;
          hub_name: string;
          id?: string;
          starts_at: string;
          updated_at?: string;
        };
        Update: {
          booked?: number;
          capacity?: number;
          city_id?: string;
          created_at?: string;
          hub_name?: string;
          id?: string;
          starts_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'onboarding_slot_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
      partner_hold: {
        Row: {
          channel: string;
          created_at: string;
          holds_until: string | null;
          id: string;
          message_sent: string | null;
          partner_id: string;
          plan_block_id: string;
          requested_by: string | null;
          responded_at: string | null;
          response_note: string | null;
          status: Database['public']['Enums']['hold_status'];
        };
        Insert: {
          channel: string;
          created_at?: string;
          holds_until?: string | null;
          id?: string;
          message_sent?: string | null;
          partner_id: string;
          plan_block_id: string;
          requested_by?: string | null;
          responded_at?: string | null;
          response_note?: string | null;
          status?: Database['public']['Enums']['hold_status'];
        };
        Update: {
          channel?: string;
          created_at?: string;
          holds_until?: string | null;
          id?: string;
          message_sent?: string | null;
          partner_id?: string;
          plan_block_id?: string;
          requested_by?: string | null;
          responded_at?: string | null;
          response_note?: string | null;
          status?: Database['public']['Enums']['hold_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'partner_hold_partner_id_fkey';
            columns: ['partner_id'];
            isOneToOne: false;
            referencedRelation: 'experience_partner';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'partner_hold_plan_block_id_fkey';
            columns: ['plan_block_id'];
            isOneToOne: false;
            referencedRelation: 'plan_block';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'partner_hold_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      plan: {
        Row: {
          answers: NonNullable<Json>;
          approved_at: string | null;
          budget_kes: number | null;
          cancel_reason: string | null;
          city_id: string;
          claimed_at: string | null;
          completed_at: string | null;
          concierge_fee_kes: number | null;
          concierge_id: string | null;
          created_at: string;
          curated_day_id: string | null;
          date: string | null;
          duration: string;
          end_date: string | null;
          estimate_total_kes: number | null;
          expires_at: string | null;
          first_reply_at: string | null;
          flags: NonNullable<Json>;
          guest_name: string | null;
          guest_phone: string | null;
          handover_note: string | null;
          id: string;
          moods: Database['public']['Enums']['mood'][];
          notes: string | null;
          paid_at: string | null;
          party_size: number;
          party_type: string;
          pay_on_day_total_kes: number | null;
          payment_reference: string | null;
          quote_total_kes: number | null;
          quoted_at: string | null;
          reference: string;
          review_requested_at: string | null;
          sent_at: string | null;
          share_token_hash: string | null;
          sla_first_reply_due_at: string | null;
          sla_quote_due_at: string | null;
          status: Database['public']['Enums']['plan_status'];
          stay_label: string | null;
          stay_point: unknown;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          answers?: NonNullable<Json>;
          approved_at?: string | null;
          budget_kes?: number | null;
          cancel_reason?: string | null;
          city_id: string;
          claimed_at?: string | null;
          completed_at?: string | null;
          concierge_fee_kes?: number | null;
          concierge_id?: string | null;
          created_at?: string;
          curated_day_id?: string | null;
          date?: string | null;
          duration?: string;
          end_date?: string | null;
          estimate_total_kes?: number | null;
          expires_at?: string | null;
          first_reply_at?: string | null;
          flags?: NonNullable<Json>;
          guest_name?: string | null;
          guest_phone?: string | null;
          handover_note?: string | null;
          id?: string;
          moods?: Database['public']['Enums']['mood'][];
          notes?: string | null;
          paid_at?: string | null;
          party_size?: number;
          party_type?: string;
          pay_on_day_total_kes?: number | null;
          payment_reference?: string | null;
          quote_total_kes?: number | null;
          quoted_at?: string | null;
          reference?: string;
          review_requested_at?: string | null;
          sent_at?: string | null;
          share_token_hash?: string | null;
          sla_first_reply_due_at?: string | null;
          sla_quote_due_at?: string | null;
          status?: Database['public']['Enums']['plan_status'];
          stay_label?: string | null;
          stay_point?: unknown;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          answers?: NonNullable<Json>;
          approved_at?: string | null;
          budget_kes?: number | null;
          cancel_reason?: string | null;
          city_id?: string;
          claimed_at?: string | null;
          completed_at?: string | null;
          concierge_fee_kes?: number | null;
          concierge_id?: string | null;
          created_at?: string;
          curated_day_id?: string | null;
          date?: string | null;
          duration?: string;
          end_date?: string | null;
          estimate_total_kes?: number | null;
          expires_at?: string | null;
          first_reply_at?: string | null;
          flags?: NonNullable<Json>;
          guest_name?: string | null;
          guest_phone?: string | null;
          handover_note?: string | null;
          id?: string;
          moods?: Database['public']['Enums']['mood'][];
          notes?: string | null;
          paid_at?: string | null;
          party_size?: number;
          party_type?: string;
          pay_on_day_total_kes?: number | null;
          payment_reference?: string | null;
          quote_total_kes?: number | null;
          quoted_at?: string | null;
          reference?: string;
          review_requested_at?: string | null;
          sent_at?: string | null;
          share_token_hash?: string | null;
          sla_first_reply_due_at?: string | null;
          sla_quote_due_at?: string | null;
          status?: Database['public']['Enums']['plan_status'];
          stay_label?: string | null;
          stay_point?: unknown;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_concierge_id_fkey';
            columns: ['concierge_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_curated_day_id_fkey';
            columns: ['curated_day_id'];
            isOneToOne: false;
            referencedRelation: 'curated_day';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_curated_day_id_fkey';
            columns: ['curated_day_id'];
            isOneToOne: false;
            referencedRelation: 'curated_day_public';
            referencedColumns: ['id'];
          },
        ];
      };
      plan_assignment_event: {
        Row: {
          at: string;
          from_concierge_id: string | null;
          id: number;
          plan_id: string;
          reason: string | null;
          to_concierge_id: string | null;
        };
        Insert: {
          at?: string;
          from_concierge_id?: string | null;
          id?: number;
          plan_id: string;
          reason?: string | null;
          to_concierge_id?: string | null;
        };
        Update: {
          at?: string;
          from_concierge_id?: string | null;
          id?: number;
          plan_id?: string;
          reason?: string | null;
          to_concierge_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_assignment_event_from_concierge_id_fkey';
            columns: ['from_concierge_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_assignment_event_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plan';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_assignment_event_to_concierge_id_fkey';
            columns: ['to_concierge_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      plan_block: {
        Row: {
          anchored: boolean;
          assigned_driver_partner_id: string | null;
          assigned_rider_id: string | null;
          change_note: string | null;
          changed_from: Json | null;
          component_id: string | null;
          created_at: string;
          done_at: string | null;
          end_time: string | null;
          event_id: string | null;
          hold_expires_at: string | null;
          hold_requested_at: string | null;
          hold_status: Database['public']['Enums']['hold_status'];
          id: string;
          included_by: string | null;
          kind: Database['public']['Enums']['block_kind'];
          partner_contact_log: NonNullable<Json>;
          pay_on_day: NonNullable<Json>;
          plan_id: string;
          price_estimate_kes: number | null;
          price_quoted_kes: number | null;
          slot: Database['public']['Enums']['block_slot'];
          sort: number;
          start_time: string | null;
          status: Database['public']['Enums']['plan_block_status'];
          subtitle_snapshot: string | null;
          swap_group: string | null;
          ticket_asset_paths: string[];
          title_snapshot: string;
          updated_at: string;
        };
        Insert: {
          anchored?: boolean;
          assigned_driver_partner_id?: string | null;
          assigned_rider_id?: string | null;
          change_note?: string | null;
          changed_from?: Json | null;
          component_id?: string | null;
          created_at?: string;
          done_at?: string | null;
          end_time?: string | null;
          event_id?: string | null;
          hold_expires_at?: string | null;
          hold_requested_at?: string | null;
          hold_status?: Database['public']['Enums']['hold_status'];
          id?: string;
          included_by?: string | null;
          kind: Database['public']['Enums']['block_kind'];
          partner_contact_log?: NonNullable<Json>;
          pay_on_day?: NonNullable<Json>;
          plan_id: string;
          price_estimate_kes?: number | null;
          price_quoted_kes?: number | null;
          slot: Database['public']['Enums']['block_slot'];
          sort?: number;
          start_time?: string | null;
          status?: Database['public']['Enums']['plan_block_status'];
          subtitle_snapshot?: string | null;
          swap_group?: string | null;
          ticket_asset_paths?: string[];
          title_snapshot: string;
          updated_at?: string;
        };
        Update: {
          anchored?: boolean;
          assigned_driver_partner_id?: string | null;
          assigned_rider_id?: string | null;
          change_note?: string | null;
          changed_from?: Json | null;
          component_id?: string | null;
          created_at?: string;
          done_at?: string | null;
          end_time?: string | null;
          event_id?: string | null;
          hold_expires_at?: string | null;
          hold_requested_at?: string | null;
          hold_status?: Database['public']['Enums']['hold_status'];
          id?: string;
          included_by?: string | null;
          kind?: Database['public']['Enums']['block_kind'];
          partner_contact_log?: NonNullable<Json>;
          pay_on_day?: NonNullable<Json>;
          plan_id?: string;
          price_estimate_kes?: number | null;
          price_quoted_kes?: number | null;
          slot?: Database['public']['Enums']['block_slot'];
          sort?: number;
          start_time?: string | null;
          status?: Database['public']['Enums']['plan_block_status'];
          subtitle_snapshot?: string | null;
          swap_group?: string | null;
          ticket_asset_paths?: string[];
          title_snapshot?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_block_assigned_driver_partner_id_fkey';
            columns: ['assigned_driver_partner_id'];
            isOneToOne: false;
            referencedRelation: 'experience_partner';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_block_assigned_rider_id_fkey';
            columns: ['assigned_rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_block_assigned_rider_id_fkey';
            columns: ['assigned_rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'plan_block_assigned_rider_id_fkey';
            columns: ['assigned_rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'plan_block_assigned_rider_id_fkey';
            columns: ['assigned_rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'plan_block_assigned_rider_id_fkey';
            columns: ['assigned_rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_block_assigned_rider_id_fkey';
            columns: ['assigned_rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'plan_block_assigned_rider_id_fkey';
            columns: ['assigned_rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_block_component_id_fkey';
            columns: ['component_id'];
            isOneToOne: false;
            referencedRelation: 'component_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_block_component_id_fkey';
            columns: ['component_id'];
            isOneToOne: false;
            referencedRelation: 'experience_component';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_block_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'event';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_block_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'event_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_block_included_by_fkey';
            columns: ['included_by'];
            isOneToOne: false;
            referencedRelation: 'plan_block';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_block_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plan';
            referencedColumns: ['id'];
          },
        ];
      };
      plan_event: {
        Row: {
          actor: string | null;
          at: string;
          from_status: Database['public']['Enums']['plan_status'] | null;
          id: number;
          meta: NonNullable<Json>;
          plan_id: string;
          to_status: Database['public']['Enums']['plan_status'];
        };
        Insert: {
          actor?: string | null;
          at?: string;
          from_status?: Database['public']['Enums']['plan_status'] | null;
          id?: number;
          meta?: NonNullable<Json>;
          plan_id: string;
          to_status: Database['public']['Enums']['plan_status'];
        };
        Update: {
          actor?: string | null;
          at?: string;
          from_status?: Database['public']['Enums']['plan_status'] | null;
          id?: number;
          meta?: NonNullable<Json>;
          plan_id?: string;
          to_status?: Database['public']['Enums']['plan_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'plan_event_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plan';
            referencedColumns: ['id'];
          },
        ];
      };
      plan_message: {
        Row: {
          attachments: NonNullable<Json>;
          author_id: string | null;
          author_type: Database['public']['Enums']['actor_type'];
          body: string;
          created_at: string;
          id: string;
          plan_id: string;
          read_at: string | null;
        };
        Insert: {
          attachments?: NonNullable<Json>;
          author_id?: string | null;
          author_type: Database['public']['Enums']['actor_type'];
          body: string;
          created_at?: string;
          id?: string;
          plan_id: string;
          read_at?: string | null;
        };
        Update: {
          attachments?: NonNullable<Json>;
          author_id?: string | null;
          author_type?: Database['public']['Enums']['actor_type'];
          body?: string;
          created_at?: string;
          id?: string;
          plan_id?: string;
          read_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_message_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plan';
            referencedColumns: ['id'];
          },
        ];
      };
      referral: {
        Row: {
          bonus_amount_kes: number | null;
          code: string | null;
          created_at: string;
          id: string;
          merchant_id: string;
          paid_at: string | null;
          referrer_id: string;
          referrer_type: string;
          status: string;
          went_live_at: string | null;
        };
        Insert: {
          bonus_amount_kes?: number | null;
          code?: string | null;
          created_at?: string;
          id?: string;
          merchant_id: string;
          paid_at?: string | null;
          referrer_id: string;
          referrer_type: string;
          status?: string;
          went_live_at?: string | null;
        };
        Update: {
          bonus_amount_kes?: number | null;
          code?: string | null;
          created_at?: string;
          id?: string;
          merchant_id?: string;
          paid_at?: string | null;
          referrer_id?: string;
          referrer_type?: string;
          status?: string;
          went_live_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'referral_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: true;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'referral_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: true;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'referral_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: true;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'referral_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: true;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'referral_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: true;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'referral_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: true;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      review: {
        Row: {
          area_snapshot: string | null;
          body: string;
          channel: string;
          checks: NonNullable<Json>;
          consent_display: Database['public']['Enums']['review_display'];
          consent_publish: boolean;
          created_at: string;
          day_title_snapshot: string | null;
          decided_at: string | null;
          decided_by: string | null;
          decision_reason: string | null;
          display_name_snapshot: string | null;
          id: string;
          plan_id: string;
          published_at: string | null;
          rating: number;
          received_at: string;
          reply_body: string | null;
          reply_sent_at: string | null;
          status: Database['public']['Enums']['review_status'];
          user_id: string | null;
          word_count: number;
        };
        Insert: {
          area_snapshot?: string | null;
          body: string;
          channel?: string;
          checks?: NonNullable<Json>;
          consent_display?: Database['public']['Enums']['review_display'];
          consent_publish?: boolean;
          created_at?: string;
          day_title_snapshot?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_reason?: string | null;
          display_name_snapshot?: string | null;
          id?: string;
          plan_id: string;
          published_at?: string | null;
          rating: number;
          received_at?: string;
          reply_body?: string | null;
          reply_sent_at?: string | null;
          status?: Database['public']['Enums']['review_status'];
          user_id?: string | null;
          word_count?: number;
        };
        Update: {
          area_snapshot?: string | null;
          body?: string;
          channel?: string;
          checks?: NonNullable<Json>;
          consent_display?: Database['public']['Enums']['review_display'];
          consent_publish?: boolean;
          created_at?: string;
          day_title_snapshot?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_reason?: string | null;
          display_name_snapshot?: string | null;
          id?: string;
          plan_id?: string;
          published_at?: string | null;
          rating?: number;
          received_at?: string;
          reply_body?: string | null;
          reply_sent_at?: string | null;
          status?: Database['public']['Enums']['review_status'];
          user_id?: string | null;
          word_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'review_decided_by_fkey';
            columns: ['decided_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'review_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: true;
            referencedRelation: 'plan';
            referencedColumns: ['id'];
          },
        ];
      };
      review_request: {
        Row: {
          channel: string;
          expires_at: string;
          id: string;
          opened_at: string | null;
          plan_id: string;
          sent_at: string;
          token_hash: string;
        };
        Insert: {
          channel?: string;
          expires_at: string;
          id?: string;
          opened_at?: string | null;
          plan_id: string;
          sent_at?: string;
          token_hash: string;
        };
        Update: {
          channel?: string;
          expires_at?: string;
          id?: string;
          opened_at?: string | null;
          plan_id?: string;
          sent_at?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'review_request_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: true;
            referencedRelation: 'plan';
            referencedColumns: ['id'];
          },
        ];
      };
      rider: {
        Row: {
          activated_at: string | null;
          activated_by: string | null;
          alcohol_eligible: boolean;
          areas: string[];
          background_check: NonNullable<Json>;
          bike_max_km: number | null;
          can_receive_offers: boolean;
          can_receive_offers_source: Database['public']['Enums']['rider_control_source'] | null;
          cash_cap: number | null;
          cash_ok: boolean;
          cash_on_hand: number;
          city_id: string | null;
          cooldown_reason: string | null;
          cooldown_until: string | null;
          created_at: string;
          current_order_reference: string | null;
          device_fingerprint: string | null;
          employer_merchant_id: string | null;
          face_photo_path: string | null;
          first_name: string;
          health_band: Database['public']['Enums']['rider_health_band'] | null;
          health_score: number | null;
          id: string;
          insurance: Database['public']['Enums']['insurance_type'] | null;
          kit_deposit_kes: number | null;
          kit_deposit_status: string | null;
          kit_has: string[];
          kit_issued_at: string | null;
          large_items_eligible: boolean;
          last_location: unknown;
          last_location_at: string | null;
          last_name: string | null;
          last_seen_at: string | null;
          notes: string | null;
          offboard_reason: string | null;
          offboarded_at: string | null;
          offers_paused_reason: string | null;
          onboarding_session_at: string | null;
          onboarding_slot_id: string | null;
          onboarding_step: number;
          owner_name: string | null;
          owner_phone: string | null;
          ownership: Database['public']['Enums']['vehicle_ownership'] | null;
          pay_on_delivery_eligible: boolean;
          payout_msisdn: string | null;
          payout_name_lookup: Json | null;
          phone: string;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          plate_no: string | null;
          presence: Database['public']['Enums']['rider_presence'];
          presence_changed_at: string | null;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          shifts: string[];
          source: string;
          staff_notes: string | null;
          status: Database['public']['Enums']['rider_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          top_decile: boolean;
          training: NonNullable<Json>;
          updated_at: string;
          user_id: string | null;
          vehicle: Database['public']['Enums']['vehicle_type'] | null;
          waitlisted_at: string | null;
          years_riding: string | null;
        };
        Insert: {
          activated_at?: string | null;
          activated_by?: string | null;
          alcohol_eligible?: boolean;
          areas?: string[];
          background_check?: NonNullable<Json>;
          bike_max_km?: number | null;
          can_receive_offers?: boolean;
          can_receive_offers_source?: Database['public']['Enums']['rider_control_source'] | null;
          cash_cap?: number | null;
          cash_ok?: boolean;
          cash_on_hand?: number;
          city_id?: string | null;
          cooldown_reason?: string | null;
          cooldown_until?: string | null;
          created_at?: string;
          current_order_reference?: string | null;
          device_fingerprint?: string | null;
          employer_merchant_id?: string | null;
          face_photo_path?: string | null;
          first_name: string;
          health_band?: Database['public']['Enums']['rider_health_band'] | null;
          health_score?: number | null;
          id?: string;
          insurance?: Database['public']['Enums']['insurance_type'] | null;
          kit_deposit_kes?: number | null;
          kit_deposit_status?: string | null;
          kit_has?: string[];
          kit_issued_at?: string | null;
          large_items_eligible?: boolean;
          last_location?: unknown;
          last_location_at?: string | null;
          last_name?: string | null;
          last_seen_at?: string | null;
          notes?: string | null;
          offboard_reason?: string | null;
          offboarded_at?: string | null;
          offers_paused_reason?: string | null;
          onboarding_session_at?: string | null;
          onboarding_slot_id?: string | null;
          onboarding_step?: number;
          owner_name?: string | null;
          owner_phone?: string | null;
          ownership?: Database['public']['Enums']['vehicle_ownership'] | null;
          pay_on_delivery_eligible?: boolean;
          payout_msisdn?: string | null;
          payout_name_lookup?: Json | null;
          phone: string;
          phone_code_attempts?: number;
          phone_code_expires_at?: string | null;
          phone_code_hash?: string | null;
          phone_verified_at?: string | null;
          plate_no?: string | null;
          presence?: Database['public']['Enums']['rider_presence'];
          presence_changed_at?: string | null;
          resume_token_expires_at?: string | null;
          resume_token_hash?: string | null;
          shifts?: string[];
          source?: string;
          staff_notes?: string | null;
          status?: Database['public']['Enums']['rider_status'];
          status_reason?: string | null;
          strike_count?: number;
          submitted_at?: string | null;
          suspended_at?: string | null;
          suspended_by?: string | null;
          suspension_reason?: string | null;
          suspension_second_approver?: string | null;
          top_decile?: boolean;
          training?: NonNullable<Json>;
          updated_at?: string;
          user_id?: string | null;
          vehicle?: Database['public']['Enums']['vehicle_type'] | null;
          waitlisted_at?: string | null;
          years_riding?: string | null;
        };
        Update: {
          activated_at?: string | null;
          activated_by?: string | null;
          alcohol_eligible?: boolean;
          areas?: string[];
          background_check?: NonNullable<Json>;
          bike_max_km?: number | null;
          can_receive_offers?: boolean;
          can_receive_offers_source?: Database['public']['Enums']['rider_control_source'] | null;
          cash_cap?: number | null;
          cash_ok?: boolean;
          cash_on_hand?: number;
          city_id?: string | null;
          cooldown_reason?: string | null;
          cooldown_until?: string | null;
          created_at?: string;
          current_order_reference?: string | null;
          device_fingerprint?: string | null;
          employer_merchant_id?: string | null;
          face_photo_path?: string | null;
          first_name?: string;
          health_band?: Database['public']['Enums']['rider_health_band'] | null;
          health_score?: number | null;
          id?: string;
          insurance?: Database['public']['Enums']['insurance_type'] | null;
          kit_deposit_kes?: number | null;
          kit_deposit_status?: string | null;
          kit_has?: string[];
          kit_issued_at?: string | null;
          large_items_eligible?: boolean;
          last_location?: unknown;
          last_location_at?: string | null;
          last_name?: string | null;
          last_seen_at?: string | null;
          notes?: string | null;
          offboard_reason?: string | null;
          offboarded_at?: string | null;
          offers_paused_reason?: string | null;
          onboarding_session_at?: string | null;
          onboarding_slot_id?: string | null;
          onboarding_step?: number;
          owner_name?: string | null;
          owner_phone?: string | null;
          ownership?: Database['public']['Enums']['vehicle_ownership'] | null;
          pay_on_delivery_eligible?: boolean;
          payout_msisdn?: string | null;
          payout_name_lookup?: Json | null;
          phone?: string;
          phone_code_attempts?: number;
          phone_code_expires_at?: string | null;
          phone_code_hash?: string | null;
          phone_verified_at?: string | null;
          plate_no?: string | null;
          presence?: Database['public']['Enums']['rider_presence'];
          presence_changed_at?: string | null;
          resume_token_expires_at?: string | null;
          resume_token_hash?: string | null;
          shifts?: string[];
          source?: string;
          staff_notes?: string | null;
          status?: Database['public']['Enums']['rider_status'];
          status_reason?: string | null;
          strike_count?: number;
          submitted_at?: string | null;
          suspended_at?: string | null;
          suspended_by?: string | null;
          suspension_reason?: string | null;
          suspension_second_approver?: string | null;
          top_decile?: boolean;
          training?: NonNullable<Json>;
          updated_at?: string;
          user_id?: string | null;
          vehicle?: Database['public']['Enums']['vehicle_type'] | null;
          waitlisted_at?: string | null;
          years_riding?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_activated_by_fkey';
            columns: ['activated_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_onboarding_slot_id_fkey';
            columns: ['onboarding_slot_id'];
            isOneToOne: false;
            referencedRelation: 'onboarding_slot';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_suspended_by_fkey';
            columns: ['suspended_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_suspension_second_approver_fkey';
            columns: ['suspension_second_approver'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_adjustment: {
        Row: {
          amount_kes: number;
          approved_by: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          kind: string;
          reason: string;
          rider_id: string;
        };
        Insert: {
          amount_kes: number;
          approved_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind: string;
          reason: string;
          rider_id: string;
        };
        Update: {
          amount_kes?: number;
          approved_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind?: string;
          reason?: string;
          rider_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_adjustment_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_adjustment_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_adjustment_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_adjustment_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_adjustment_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_adjustment_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_adjustment_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_adjustment_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_adjustment_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_agreement_acceptance: {
        Row: {
          accepted_at: string;
          accepted_by: string | null;
          agreement_version_id: string;
          ip: unknown;
          rider_id: string;
        };
        Insert: {
          accepted_at?: string;
          accepted_by?: string | null;
          agreement_version_id: string;
          ip?: unknown;
          rider_id: string;
        };
        Update: {
          accepted_at?: string;
          accepted_by?: string | null;
          agreement_version_id?: string;
          ip?: unknown;
          rider_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_agreement_acceptance_agreement_version_id_fkey';
            columns: ['agreement_version_id'];
            isOneToOne: false;
            referencedRelation: 'rider_agreement_version';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_agreement_acceptance_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_agreement_acceptance_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_agreement_acceptance_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_agreement_acceptance_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_agreement_acceptance_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_agreement_acceptance_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_agreement_acceptance_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_agreement_version: {
        Row: {
          created_at: string;
          effective_from: string;
          id: string;
          pdf_path: string | null;
          requires_reacceptance: boolean;
          status: string;
          version: string;
        };
        Insert: {
          created_at?: string;
          effective_from: string;
          id?: string;
          pdf_path?: string | null;
          requires_reacceptance?: boolean;
          status?: string;
          version: string;
        };
        Update: {
          created_at?: string;
          effective_from?: string;
          id?: string;
          pdf_path?: string | null;
          requires_reacceptance?: boolean;
          status?: string;
          version?: string;
        };
        Relationships: [];
      };
      rider_bonus_rule: {
        Row: {
          city_id: string | null;
          created_at: string;
          created_by: string | null;
          enabled: boolean;
          expires_at: string | null;
          id: string;
          key: string;
          params: NonNullable<Json>;
          zone_id: string | null;
        };
        Insert: {
          city_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          expires_at?: string | null;
          id?: string;
          key: string;
          params?: NonNullable<Json>;
          zone_id?: string | null;
        };
        Update: {
          city_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          enabled?: boolean;
          expires_at?: string | null;
          id?: string;
          key?: string;
          params?: NonNullable<Json>;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_bonus_rule_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_bonus_rule_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_bonus_rule_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_bonus_rule_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone_bounds';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_document_automation_rule: {
        Row: {
          enabled: boolean;
          key: string;
          label: string;
          params: NonNullable<Json>;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          enabled?: boolean;
          key: string;
          label: string;
          params?: NonNullable<Json>;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          enabled?: boolean;
          key?: string;
          label?: string;
          params?: NonNullable<Json>;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_document_automation_rule_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_earning: {
        Row: {
          base_kes: number;
          cash_collected_kes: number;
          distance_kes: number;
          earned_at: string;
          id: string;
          is_test: boolean;
          order_reference: string | null;
          peak_bonus_kes: number;
          penalty_kes: number;
          pickup_bonus_kes: number;
          rate_card_id: string | null;
          rider_id: string;
          tip_kes: number;
          total_kes: number;
          waiting_kes: number;
        };
        Insert: {
          base_kes?: number;
          cash_collected_kes?: number;
          distance_kes?: number;
          earned_at?: string;
          id?: string;
          is_test?: boolean;
          order_reference?: string | null;
          peak_bonus_kes?: number;
          penalty_kes?: number;
          pickup_bonus_kes?: number;
          rate_card_id?: string | null;
          rider_id: string;
          tip_kes?: number;
          total_kes?: number;
          waiting_kes?: number;
        };
        Update: {
          base_kes?: number;
          cash_collected_kes?: number;
          distance_kes?: number;
          earned_at?: string;
          id?: string;
          is_test?: boolean;
          order_reference?: string | null;
          peak_bonus_kes?: number;
          penalty_kes?: number;
          pickup_bonus_kes?: number;
          rate_card_id?: string | null;
          rider_id?: string;
          tip_kes?: number;
          total_kes?: number;
          waiting_kes?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_earning_rate_card_id_fkey';
            columns: ['rate_card_id'];
            isOneToOne: false;
            referencedRelation: 'rider_rate_card';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_earning_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_earning_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_earning_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_earning_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_earning_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_earning_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_earning_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_health_snapshot: {
        Row: {
          acceptance_pct: number | null;
          as_of: string;
          band: Database['public']['Enums']['rider_health_band'] | null;
          cancel_after_accept_pct: number | null;
          created_at: string;
          handoff_compliance_pct: number | null;
          issues_30d: number;
          on_time_pct: number | null;
          rating_avg: number | null;
          rider_id: string;
          safety_pct: number | null;
          score: number | null;
          trend: number[];
          trips_30d: number;
          weights: NonNullable<Json>;
        };
        Insert: {
          acceptance_pct?: number | null;
          as_of: string;
          band?: Database['public']['Enums']['rider_health_band'] | null;
          cancel_after_accept_pct?: number | null;
          created_at?: string;
          handoff_compliance_pct?: number | null;
          issues_30d?: number;
          on_time_pct?: number | null;
          rating_avg?: number | null;
          rider_id: string;
          safety_pct?: number | null;
          score?: number | null;
          trend?: number[];
          trips_30d?: number;
          weights?: NonNullable<Json>;
        };
        Update: {
          acceptance_pct?: number | null;
          as_of?: string;
          band?: Database['public']['Enums']['rider_health_band'] | null;
          cancel_after_accept_pct?: number | null;
          created_at?: string;
          handoff_compliance_pct?: number | null;
          issues_30d?: number;
          on_time_pct?: number | null;
          rating_avg?: number | null;
          rider_id?: string;
          safety_pct?: number | null;
          score?: number | null;
          trend?: number[];
          trips_30d?: number;
          weights?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_health_snapshot_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_health_snapshot_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_health_snapshot_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_health_snapshot_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_health_snapshot_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_health_snapshot_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_health_snapshot_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_health_weight_config: {
        Row: {
          key: string;
          label: string;
          target: number | null;
          updated_at: string;
          updated_by: string | null;
          weight_pct: number;
        };
        Insert: {
          key: string;
          label: string;
          target?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          weight_pct: number;
        };
        Update: {
          key?: string;
          label?: string;
          target?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          weight_pct?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_health_weight_config_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_message: {
        Row: {
          actor_id: string | null;
          body: string;
          channel: string;
          created_at: string;
          direction: string;
          id: string;
          notification_id: string | null;
          read_at: string | null;
          rider_id: string;
          subject: string | null;
        };
        Insert: {
          actor_id?: string | null;
          body: string;
          channel: string;
          created_at?: string;
          direction: string;
          id?: string;
          notification_id?: string | null;
          read_at?: string | null;
          rider_id: string;
          subject?: string | null;
        };
        Update: {
          actor_id?: string | null;
          body?: string;
          channel?: string;
          created_at?: string;
          direction?: string;
          id?: string;
          notification_id?: string | null;
          read_at?: string | null;
          rider_id?: string;
          subject?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_message_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_message_notification_id_fkey';
            columns: ['notification_id'];
            isOneToOne: false;
            referencedRelation: 'notification';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_message_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_message_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_message_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_message_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_message_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_message_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_message_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_presence_event: {
        Row: {
          at: string;
          id: number;
          location: unknown;
          presence: Database['public']['Enums']['rider_presence'];
          rider_id: string;
          source: Database['public']['Enums']['rider_control_source'];
          zone_id: string | null;
        };
        Insert: {
          at?: string;
          id?: number;
          location?: unknown;
          presence: Database['public']['Enums']['rider_presence'];
          rider_id: string;
          source?: Database['public']['Enums']['rider_control_source'];
          zone_id?: string | null;
        };
        Update: {
          at?: string;
          id?: number;
          location?: unknown;
          presence?: Database['public']['Enums']['rider_presence'];
          rider_id?: string;
          source?: Database['public']['Enums']['rider_control_source'];
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_presence_event_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_presence_event_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_presence_event_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_presence_event_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_presence_event_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_presence_event_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_presence_event_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_presence_event_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_presence_event_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone_bounds';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_rate_card: {
        Row: {
          approved_by: string | null;
          base_per_trip_kes: number | null;
          cancellation_after_pickup_kes: number | null;
          city_id: string;
          created_at: string;
          effective_from: string;
          guest_tips_pass_through_pct: number;
          id: string;
          paid_waiting_per_5min_kes: number | null;
          peak_bonus_dinner_kes: number | null;
          peak_bonus_rain_kes: number | null;
          per_km_after_2km_kes: number | null;
          second_approver_id: string | null;
          second_pickup_bonus_kes: number | null;
          status: string;
          version: string;
        };
        Insert: {
          approved_by?: string | null;
          base_per_trip_kes?: number | null;
          cancellation_after_pickup_kes?: number | null;
          city_id: string;
          created_at?: string;
          effective_from: string;
          guest_tips_pass_through_pct?: number;
          id?: string;
          paid_waiting_per_5min_kes?: number | null;
          peak_bonus_dinner_kes?: number | null;
          peak_bonus_rain_kes?: number | null;
          per_km_after_2km_kes?: number | null;
          second_approver_id?: string | null;
          second_pickup_bonus_kes?: number | null;
          status?: string;
          version: string;
        };
        Update: {
          approved_by?: string | null;
          base_per_trip_kes?: number | null;
          cancellation_after_pickup_kes?: number | null;
          city_id?: string;
          created_at?: string;
          effective_from?: string;
          guest_tips_pass_through_pct?: number;
          id?: string;
          paid_waiting_per_5min_kes?: number | null;
          peak_bonus_dinner_kes?: number | null;
          peak_bonus_rain_kes?: number | null;
          per_km_after_2km_kes?: number | null;
          second_approver_id?: string | null;
          second_pickup_bonus_kes?: number | null;
          status?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_rate_card_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_rate_card_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_rate_card_second_approver_id_fkey';
            columns: ['second_approver_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_reference_check: {
        Row: {
          called_at: string | null;
          called_by: string | null;
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          outcome: string | null;
          phone: string | null;
          relationship: string | null;
          rider_id: string;
        };
        Insert: {
          called_at?: string | null;
          called_by?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          outcome?: string | null;
          phone?: string | null;
          relationship?: string | null;
          rider_id: string;
        };
        Update: {
          called_at?: string | null;
          called_by?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          outcome?: string | null;
          phone?: string | null;
          relationship?: string | null;
          rider_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_reference_check_called_by_fkey';
            columns: ['called_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_reference_check_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_reference_check_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_reference_check_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_reference_check_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_reference_check_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_reference_check_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_reference_check_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_review: {
        Row: {
          checklist: NonNullable<Json>;
          finished_at: string | null;
          id: string;
          notes: string | null;
          outcome: string | null;
          reviewer_id: string;
          rider_id: string;
          started_at: string;
        };
        Insert: {
          checklist?: NonNullable<Json>;
          finished_at?: string | null;
          id?: string;
          notes?: string | null;
          outcome?: string | null;
          reviewer_id: string;
          rider_id: string;
          started_at?: string;
        };
        Update: {
          checklist?: NonNullable<Json>;
          finished_at?: string | null;
          id?: string;
          notes?: string | null;
          outcome?: string | null;
          reviewer_id?: string;
          rider_id?: string;
          started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_review_reviewer_id_fkey';
            columns: ['reviewer_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_review_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_review_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_review_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_review_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_review_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_review_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_review_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_settlement_line: {
        Row: {
          bonuses_kes: number;
          cash_collected_kes: number;
          cash_deposited_kes: number;
          cash_net_kes: number;
          earnings_kes: number;
          failure_reason: string | null;
          id: string;
          net_pay_kes: number;
          paid_at: string | null;
          paid_to_merchant_id: string | null;
          payout_msisdn: string | null;
          payout_name: string | null;
          provider_ref: string | null;
          retry_count: number;
          rider_id: string;
          run_id: string;
          status: Database['public']['Enums']['settlement_line_status'];
          tips_kes: number;
          trips: number;
        };
        Insert: {
          bonuses_kes?: number;
          cash_collected_kes?: number;
          cash_deposited_kes?: number;
          cash_net_kes?: number;
          earnings_kes?: number;
          failure_reason?: string | null;
          id?: string;
          net_pay_kes?: number;
          paid_at?: string | null;
          paid_to_merchant_id?: string | null;
          payout_msisdn?: string | null;
          payout_name?: string | null;
          provider_ref?: string | null;
          retry_count?: number;
          rider_id: string;
          run_id: string;
          status?: Database['public']['Enums']['settlement_line_status'];
          tips_kes?: number;
          trips?: number;
        };
        Update: {
          bonuses_kes?: number;
          cash_collected_kes?: number;
          cash_deposited_kes?: number;
          cash_net_kes?: number;
          earnings_kes?: number;
          failure_reason?: string | null;
          id?: string;
          net_pay_kes?: number;
          paid_at?: string | null;
          paid_to_merchant_id?: string | null;
          payout_msisdn?: string | null;
          payout_name?: string | null;
          provider_ref?: string | null;
          retry_count?: number;
          rider_id?: string;
          run_id?: string;
          status?: Database['public']['Enums']['settlement_line_status'];
          tips_kes?: number;
          trips?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_settlement_line_paid_to_merchant_id_fkey';
            columns: ['paid_to_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_settlement_line_paid_to_merchant_id_fkey';
            columns: ['paid_to_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_settlement_line_paid_to_merchant_id_fkey';
            columns: ['paid_to_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_settlement_line_paid_to_merchant_id_fkey';
            columns: ['paid_to_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_settlement_line_paid_to_merchant_id_fkey';
            columns: ['paid_to_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_settlement_line_paid_to_merchant_id_fkey';
            columns: ['paid_to_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_settlement_line_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_settlement_line_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_settlement_line_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_settlement_line_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_settlement_line_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_settlement_line_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_settlement_line_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_settlement_line_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'rider_settlement_run';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_settlement_run: {
        Row: {
          approved_by: string | null;
          b2c_file_path: string | null;
          city_id: string | null;
          created_at: string;
          id: string;
          period_end: string;
          period_start: string;
          provider_batch_ref: string | null;
          second_approver_id: string | null;
          status: string;
          total_cash_netted_kes: number;
          total_gross_kes: number;
          total_net_kes: number;
        };
        Insert: {
          approved_by?: string | null;
          b2c_file_path?: string | null;
          city_id?: string | null;
          created_at?: string;
          id?: string;
          period_end: string;
          period_start: string;
          provider_batch_ref?: string | null;
          second_approver_id?: string | null;
          status?: string;
          total_cash_netted_kes?: number;
          total_gross_kes?: number;
          total_net_kes?: number;
        };
        Update: {
          approved_by?: string | null;
          b2c_file_path?: string | null;
          city_id?: string | null;
          created_at?: string;
          id?: string;
          period_end?: string;
          period_start?: string;
          provider_batch_ref?: string | null;
          second_approver_id?: string | null;
          status?: string;
          total_cash_netted_kes?: number;
          total_gross_kes?: number;
          total_net_kes?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_settlement_run_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_settlement_run_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_settlement_run_second_approver_id_fkey';
            columns: ['second_approver_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_status_change: {
        Row: {
          actor_id: string | null;
          created_at: string;
          from_status: Database['public']['Enums']['rider_status'] | null;
          id: number;
          reason: string | null;
          rider_id: string;
          second_approver_id: string | null;
          to_status: Database['public']['Enums']['rider_status'];
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          from_status?: Database['public']['Enums']['rider_status'] | null;
          id?: number;
          reason?: string | null;
          rider_id: string;
          second_approver_id?: string | null;
          to_status: Database['public']['Enums']['rider_status'];
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          from_status?: Database['public']['Enums']['rider_status'] | null;
          id?: number;
          reason?: string | null;
          rider_id?: string;
          second_approver_id?: string | null;
          to_status?: Database['public']['Enums']['rider_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'rider_status_change_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_status_change_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_status_change_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_status_change_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_status_change_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_status_change_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_status_change_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_status_change_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_status_change_second_approver_id_fkey';
            columns: ['second_approver_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_strike: {
        Row: {
          cleared_at: string | null;
          cleared_by: string | null;
          expires_at: string | null;
          id: string;
          issued_at: string;
          issued_by: string | null;
          level: number;
          reason: string;
          rider_id: string;
        };
        Insert: {
          cleared_at?: string | null;
          cleared_by?: string | null;
          expires_at?: string | null;
          id?: string;
          issued_at?: string;
          issued_by?: string | null;
          level: number;
          reason: string;
          rider_id: string;
        };
        Update: {
          cleared_at?: string | null;
          cleared_by?: string | null;
          expires_at?: string | null;
          id?: string;
          issued_at?: string;
          issued_by?: string | null;
          level?: number;
          reason?: string;
          rider_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_strike_cleared_by_fkey';
            columns: ['cleared_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_strike_issued_by_fkey';
            columns: ['issued_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_strike_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_strike_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_strike_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_strike_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_strike_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_strike_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_strike_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_test_trip: {
        Row: {
          assessor_id: string | null;
          created_at: string;
          id: string;
          notes: string | null;
          order_reference: string | null;
          outcome: string | null;
          rider_id: string;
        };
        Insert: {
          assessor_id?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          order_reference?: string | null;
          outcome?: string | null;
          rider_id: string;
        };
        Update: {
          assessor_id?: string | null;
          created_at?: string;
          id?: string;
          notes?: string | null;
          order_reference?: string | null;
          outcome?: string | null;
          rider_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_test_trip_assessor_id_fkey';
            columns: ['assessor_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_test_trip_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_test_trip_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_test_trip_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_test_trip_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_test_trip_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_test_trip_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_test_trip_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_training: {
        Row: {
          attempts: number;
          completed_at: string | null;
          module: string;
          passed: boolean;
          rider_id: string;
          score: number | null;
        };
        Insert: {
          attempts?: number;
          completed_at?: string | null;
          module: string;
          passed?: boolean;
          rider_id: string;
          score?: number | null;
        };
        Update: {
          attempts?: number;
          completed_at?: string | null;
          module?: string;
          passed?: boolean;
          rider_id?: string;
          score?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_training_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_training_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_training_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_training_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_training_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_training_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'rider_training_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
        ];
      };
      role: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          key: string;
          label: string;
          landing_module: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          key: string;
          label: string;
          landing_module?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          key?: string;
          label?: string;
          landing_module?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'role_landing_module_fkey';
            columns: ['landing_module'];
            isOneToOne: false;
            referencedRelation: 'console_module';
            referencedColumns: ['key'];
          },
        ];
      };
      role_grant: {
        Row: {
          approved_by: string | null;
          city_id: string | null;
          created_at: string;
          expires_at: string | null;
          granted_by: string;
          id: string;
          revoked_at: string | null;
          role_id: string;
          staff_user_id: string;
          updated_at: string;
        };
        Insert: {
          approved_by?: string | null;
          city_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          granted_by: string;
          id?: string;
          revoked_at?: string | null;
          role_id: string;
          staff_user_id: string;
          updated_at?: string;
        };
        Update: {
          approved_by?: string | null;
          city_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          granted_by?: string;
          id?: string;
          revoked_at?: string | null;
          role_id?: string;
          staff_user_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'role_grant_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'role_grant_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'role_grant_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'role_grant_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'role';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'role_grant_staff_user_id_fkey';
            columns: ['staff_user_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      role_module_access: {
        Row: {
          level: string;
          module_key: string;
          note: string | null;
          role_key: string;
        };
        Insert: {
          level: string;
          module_key: string;
          note?: string | null;
          role_key: string;
        };
        Update: {
          level?: string;
          module_key?: string;
          note?: string | null;
          role_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'role_module_access_role_key_fkey';
            columns: ['role_key'];
            isOneToOne: false;
            referencedRelation: 'role';
            referencedColumns: ['key'];
          },
        ];
      };
      setting: {
        Row: {
          approved_by: string | null;
          city_id: string | null;
          created_at: string;
          effective_from: string;
          id: string;
          key: string;
          scope: Database['public']['Enums']['setting_scope'];
          updated_at: string;
          value: Json | null;
        };
        Insert: {
          approved_by?: string | null;
          city_id?: string | null;
          created_at?: string;
          effective_from?: string;
          id?: string;
          key: string;
          scope?: Database['public']['Enums']['setting_scope'];
          updated_at?: string;
          value?: Json | null;
        };
        Update: {
          approved_by?: string | null;
          city_id?: string | null;
          created_at?: string;
          effective_from?: string;
          id?: string;
          key?: string;
          scope?: Database['public']['Enums']['setting_scope'];
          updated_at?: string;
          value?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'setting_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'setting_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
      shift_commitment: {
        Row: {
          committed_at: string;
          date: string;
          id: string;
          rider_id: string;
          showed_at: string | null;
          status: Database['public']['Enums']['shift_commitment_status'];
          time_window: string;
          zone_id: string;
        };
        Insert: {
          committed_at?: string;
          date: string;
          id?: string;
          rider_id: string;
          showed_at?: string | null;
          status?: Database['public']['Enums']['shift_commitment_status'];
          time_window: string;
          zone_id: string;
        };
        Update: {
          committed_at?: string;
          date?: string;
          id?: string;
          rider_id?: string;
          showed_at?: string | null;
          status?: Database['public']['Enums']['shift_commitment_status'];
          time_window?: string;
          zone_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shift_commitment_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'console_rider_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shift_commitment_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'shift_commitment_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'finance_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'shift_commitment_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_fleet_rider_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'shift_commitment_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shift_commitment_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_app_me_v';
            referencedColumns: ['rider_id'];
          },
          {
            foreignKeyName: 'shift_commitment_rider_id_fkey';
            columns: ['rider_id'];
            isOneToOne: false;
            referencedRelation: 'rider_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shift_commitment_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shift_commitment_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone_bounds';
            referencedColumns: ['id'];
          },
        ];
      };
      staff_user: {
        Row: {
          created_at: string;
          display_name: string;
          email: string;
          id: string;
          status: Database['public']['Enums']['staff_status'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          email: string;
          id?: string;
          status?: Database['public']['Enums']['staff_status'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          email?: string;
          id?: string;
          status?: Database['public']['Enums']['staff_status'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      supply_action: {
        Row: {
          applied_at: string;
          applied_by: string | null;
          expires_at: string | null;
          id: string;
          kind: string;
          params: NonNullable<Json>;
          result: Json | null;
          zone_id: string;
        };
        Insert: {
          applied_at?: string;
          applied_by?: string | null;
          expires_at?: string | null;
          id?: string;
          kind: string;
          params?: NonNullable<Json>;
          result?: Json | null;
          zone_id: string;
        };
        Update: {
          applied_at?: string;
          applied_by?: string | null;
          expires_at?: string | null;
          id?: string;
          kind?: string;
          params?: NonNullable<Json>;
          result?: Json | null;
          zone_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'supply_action_applied_by_fkey';
            columns: ['applied_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supply_action_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'supply_action_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone_bounds';
            referencedColumns: ['id'];
          },
        ];
      };
      support_message: {
        Row: {
          body: string;
          created_at: string;
          from_staff_id: string | null;
          id: string;
          internal: boolean;
          ticket_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          from_staff_id?: string | null;
          id?: string;
          internal?: boolean;
          ticket_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          from_staff_id?: string | null;
          id?: string;
          internal?: boolean;
          ticket_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'support_message_from_staff_id_fkey';
            columns: ['from_staff_id'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_message_ticket_id_fkey';
            columns: ['ticket_id'];
            isOneToOne: false;
            referencedRelation: 'support_ticket';
            referencedColumns: ['id'];
          },
        ];
      };
      support_ticket: {
        Row: {
          assigned_to: string | null;
          body: string;
          channel: Database['public']['Enums']['ticket_channel'];
          city_id: string | null;
          created_at: string;
          email: string | null;
          first_reply_at: string | null;
          from_role: Database['public']['Enums']['ticket_from'];
          full_name: string | null;
          id: string;
          order_reference: string | null;
          phone: string | null;
          reference: string;
          resolved_at: string | null;
          status: Database['public']['Enums']['ticket_status'];
          topic: Database['public']['Enums']['ticket_topic'];
          updated_at: string;
        };
        Insert: {
          assigned_to?: string | null;
          body: string;
          channel?: Database['public']['Enums']['ticket_channel'];
          city_id?: string | null;
          created_at?: string;
          email?: string | null;
          first_reply_at?: string | null;
          from_role?: Database['public']['Enums']['ticket_from'];
          full_name?: string | null;
          id?: string;
          order_reference?: string | null;
          phone?: string | null;
          reference: string;
          resolved_at?: string | null;
          status?: Database['public']['Enums']['ticket_status'];
          topic?: Database['public']['Enums']['ticket_topic'];
          updated_at?: string;
        };
        Update: {
          assigned_to?: string | null;
          body?: string;
          channel?: Database['public']['Enums']['ticket_channel'];
          city_id?: string | null;
          created_at?: string;
          email?: string | null;
          first_reply_at?: string | null;
          from_role?: Database['public']['Enums']['ticket_from'];
          full_name?: string | null;
          id?: string;
          order_reference?: string | null;
          phone?: string | null;
          reference?: string;
          resolved_at?: string | null;
          status?: Database['public']['Enums']['ticket_status'];
          topic?: Database['public']['Enums']['ticket_topic'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'support_ticket_assigned_to_fkey';
            columns: ['assigned_to'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_ticket_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
      translation: {
        Row: {
          created_at: string;
          engine: Database['public']['Enums']['translation_engine'];
          locale: string;
          reviewed: boolean;
          reviewed_by: string | null;
          source_hash: string;
          source_key: string;
          source_text: string;
          translated: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          engine?: Database['public']['Enums']['translation_engine'];
          locale: string;
          reviewed?: boolean;
          reviewed_by?: string | null;
          source_hash: string;
          source_key: string;
          source_text: string;
          translated: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          engine?: Database['public']['Enums']['translation_engine'];
          locale?: string;
          reviewed?: boolean;
          reviewed_by?: string | null;
          source_hash?: string;
          source_key?: string;
          source_text?: string;
          translated?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'translation_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'staff_user';
            referencedColumns: ['id'];
          },
        ];
      };
      waitlist_signup: {
        Row: {
          city_id: string | null;
          consent_marketing: boolean;
          created_at: string;
          email: string | null;
          id: string;
          payload: Json | null;
          source: string;
          updated_at: string;
        };
        Insert: {
          city_id?: string | null;
          consent_marketing?: boolean;
          created_at?: string;
          email?: string | null;
          id?: string;
          payload?: Json | null;
          source: string;
          updated_at?: string;
        };
        Update: {
          city_id?: string | null;
          consent_marketing?: boolean;
          created_at?: string;
          email?: string | null;
          id?: string;
          payload?: Json | null;
          source?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'waitlist_signup_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
      zone: {
        Row: {
          active: boolean;
          city_id: string;
          cod_allowed: boolean;
          created_at: string;
          eta_max: number;
          eta_min: number;
          id: string;
          name: string;
          polygon: unknown;
          tier: Database['public']['Enums']['zone_tier'];
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          city_id: string;
          cod_allowed?: boolean;
          created_at?: string;
          eta_max: number;
          eta_min: number;
          id?: string;
          name: string;
          polygon: unknown;
          tier: Database['public']['Enums']['zone_tier'];
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          city_id?: string;
          cod_allowed?: boolean;
          created_at?: string;
          eta_max?: number;
          eta_min?: number;
          id?: string;
          name?: string;
          polygon?: unknown;
          tier?: Database['public']['Enums']['zone_tier'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'zone_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
      zone_demand_forecast: {
        Row: {
          dow: number;
          expected_orders: number | null;
          hour: number;
          refreshed_at: string;
          riders_needed: number | null;
          zone_id: string;
        };
        Insert: {
          dow: number;
          expected_orders?: number | null;
          hour: number;
          refreshed_at?: string;
          riders_needed?: number | null;
          zone_id: string;
        };
        Update: {
          dow?: number;
          expected_orders?: number | null;
          hour?: number;
          refreshed_at?: string;
          riders_needed?: number | null;
          zone_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'zone_demand_forecast_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'zone_demand_forecast_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone_bounds';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      catalogue_health: {
        Row: {
          cheapest_kes: number | null;
          city_id: string | null;
          drafts_without_a_price: number | null;
          live_components: number | null;
          mood: Database['public']['Enums']['mood'] | null;
          slots: string[] | null;
          swap_group: string | null;
          tiers: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'experience_component_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
      catalogue_public: {
        Row: {
          age_restricted: boolean | null;
          available: boolean | null;
          description: string | null;
          highlighted: boolean | null;
          id: string | null;
          merchant_id: string | null;
          name: string | null;
          price_kes: number | null;
          section_id: string | null;
          sort: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'catalogue_item_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_item_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_item_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_item_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_item_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'catalogue_item_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'catalogue_item_section_id_fkey';
            columns: ['section_id'];
            isOneToOne: false;
            referencedRelation: 'catalogue_section';
            referencedColumns: ['id'];
          },
        ];
      };
      component_public: {
        Row: {
          booking_lead_hours: number | null;
          city_id: string | null;
          cover_path: string | null;
          default_slot: Database['public']['Enums']['block_slot'] | null;
          description: string | null;
          duration_min: number | null;
          earliest_start: string | null;
          id: string | null;
          includes: string[] | null;
          kind: Database['public']['Enums']['block_kind'] | null;
          latest_start: string | null;
          max_party: number | null;
          min_party: number | null;
          mood: Database['public']['Enums']['mood'] | null;
          party_types: string[] | null;
          pay_on_day: Json | null;
          price_basis: Database['public']['Enums']['price_basis'] | null;
          price_kes: number | null;
          sort: number | null;
          subtitle: string | null;
          swap_group: string | null;
          tags: string[] | null;
          tier: number | null;
          title: string | null;
          zone_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'experience_component_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'experience_component_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'experience_component_zone_id_fkey';
            columns: ['zone_id'];
            isOneToOne: false;
            referencedRelation: 'zone_bounds';
            referencedColumns: ['id'];
          },
        ];
      };
      console_merchant_directory_v: {
        Row: {
          accepting_orders: boolean | null;
          branch_name: string | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          city_name: string | null;
          city_slug: string | null;
          concierge_pick: boolean | null;
          created_at: string | null;
          explore_visible: boolean | null;
          featured: boolean | null;
          gmv_30d_kes: number | null;
          health_band: Database['public']['Enums']['health_band'] | null;
          health_score: number | null;
          id: string | null;
          on_time_ready_pct: number | null;
          open_disputes: number | null;
          orders_30d: number | null;
          parent_merchant_id: string | null;
          payout_hold: boolean | null;
          status: Database['public']['Enums']['partner_status'] | null;
          submitted_at: string | null;
          trading_name: string | null;
          went_live_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      console_rider_badges_v: {
        Row: {
          active: number | null;
          cash_all: number | null;
          failed_payouts: number | null;
          fleet: number | null;
          fraud_open: number | null;
          incidents_open: number | null;
          on_cooldown: number | null;
          on_trip: number | null;
          onboarding: number | null;
          online_now: number | null;
          riders_holding_cash: number | null;
          sos_open: number | null;
          suspended: number | null;
          unmatched_deposits: number | null;
        };
        Relationships: [];
      };
      console_rider_directory_v: {
        Row: {
          acceptance_pct: number | null;
          activated_at: string | null;
          active_strikes: number | null;
          can_receive_offers: boolean | null;
          cash_cap_effective: number | null;
          cash_on_hand: number | null;
          city_id: string | null;
          city_name: string | null;
          cooldown_until: string | null;
          created_at: string | null;
          documents_expired: number | null;
          documents_expiring: number | null;
          employer_merchant_id: string | null;
          employer_name: string | null;
          face_photo_path: string | null;
          first_name: string | null;
          health_band: Database['public']['Enums']['rider_health_band'] | null;
          health_score: number | null;
          id: string | null;
          issues_30d: number | null;
          last_deposit_at: string | null;
          last_name: string | null;
          offers_paused_reason: string | null;
          oldest_undeposited_at: string | null;
          on_time_pct: number | null;
          open_incidents: number | null;
          pay_on_delivery_eligible: boolean | null;
          phone: string | null;
          plate_no: string | null;
          presence: Database['public']['Enums']['rider_presence'] | null;
          rating_avg: number | null;
          source: string | null;
          status: Database['public']['Enums']['rider_status'] | null;
          top_decile: boolean | null;
          trips_30d: number | null;
          vehicle: Database['public']['Enums']['vehicle_type'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      curated_day_public: {
        Row: {
          badge: string | null;
          city_id: string | null;
          cover_path: string | null;
          duration: string | null;
          featured: boolean | null;
          id: string | null;
          party_types: string[] | null;
          price_per_person_kes: number | null;
          slug: string | null;
          sort: number | null;
          tagline: string | null;
          title: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'curated_day_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
      dispatch_merchant_v: {
        Row: {
          accepting_orders: boolean | null;
          branch_id: string | null;
          busy_mode_until: string | null;
          fleet_dispatch_preference: string | null;
          has_active_fleet_riders: boolean | null;
          landmark: string | null;
          location: unknown;
          merchant_id: string | null;
          pickup_instructions: string | null;
          prep_minutes: number | null;
          rider_parking: string | null;
          status: Database['public']['Enums']['partner_status'] | null;
        };
        Relationships: [];
      };
      dispatch_rider_v: {
        Row: {
          alcohol_eligible: boolean | null;
          capacity_class: string | null;
          cash_ok: boolean | null;
          city_id: string | null;
          employer_merchant_id: string | null;
          health_band: Database['public']['Enums']['rider_health_band'] | null;
          large_items_eligible: boolean | null;
          last_location: unknown;
          last_location_at: string | null;
          offerable: boolean | null;
          presence: Database['public']['Enums']['rider_presence'] | null;
          rider_id: string | null;
          source: string | null;
          top_decile: boolean | null;
          vehicle: Database['public']['Enums']['vehicle_type'] | null;
          zones: string[] | null;
        };
        Insert: {
          alcohol_eligible?: boolean | null;
          capacity_class?: never;
          cash_ok?: never;
          city_id?: string | null;
          employer_merchant_id?: string | null;
          health_band?: Database['public']['Enums']['rider_health_band'] | null;
          large_items_eligible?: boolean | null;
          last_location?: unknown;
          last_location_at?: string | null;
          offerable?: never;
          presence?: Database['public']['Enums']['rider_presence'] | null;
          rider_id?: string | null;
          source?: string | null;
          top_decile?: boolean | null;
          vehicle?: Database['public']['Enums']['vehicle_type'] | null;
          zones?: string[] | null;
        };
        Update: {
          alcohol_eligible?: boolean | null;
          capacity_class?: never;
          cash_ok?: never;
          city_id?: string | null;
          employer_merchant_id?: string | null;
          health_band?: Database['public']['Enums']['rider_health_band'] | null;
          large_items_eligible?: boolean | null;
          last_location?: unknown;
          last_location_at?: string | null;
          offerable?: never;
          presence?: Database['public']['Enums']['rider_presence'] | null;
          rider_id?: string | null;
          source?: string | null;
          top_decile?: boolean | null;
          vehicle?: Database['public']['Enums']['vehicle_type'] | null;
          zones?: string[] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      event_public: {
        Row: {
          anchor_slot: Database['public']['Enums']['block_slot'] | null;
          category: Database['public']['Enums']['event_category'] | null;
          city_id: string | null;
          cover_path: string | null;
          doors_at: string | null;
          ends_at: string | null;
          featured: boolean | null;
          id: string | null;
          name: string | null;
          nexg_can_hold_tickets: boolean | null;
          organiser_name: string | null;
          organiser_url: string | null;
          practical_note: string | null;
          starts_at: string | null;
          suggested_blocks: Json | null;
          ticket_bands: Json | null;
          ticket_url: string | null;
          venue_address: string | null;
          venue_name: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'event_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
      finance_merchant_v: {
        Row: {
          city_id: string | null;
          commission_is_negotiated: boolean | null;
          commission_tier: Database['public']['Enums']['commission_tier_code'] | null;
          consolidated_statement: boolean | null;
          effective_commission_pct: number | null;
          merchant_id: string | null;
          parent_merchant_id: string | null;
          payout_account_masked: string | null;
          payout_hold: boolean | null;
          payout_hold_reason: string | null;
          payout_rail: string | null;
          single_payout: boolean | null;
          trading_name: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      finance_rider_v: {
        Row: {
          cash_cap_effective: number | null;
          cash_on_hand: number | null;
          city_id: string | null;
          employer_merchant_id: string | null;
          first_name: string | null;
          held_lines: number | null;
          kit_deposit_kes: number | null;
          kit_deposit_status: string | null;
          last_name: string | null;
          payout_msisdn_masked: string | null;
          payout_name_lookup: Json | null;
          rider_id: string | null;
          status: Database['public']['Enums']['rider_status'] | null;
        };
        Insert: {
          cash_cap_effective?: never;
          cash_on_hand?: number | null;
          city_id?: string | null;
          employer_merchant_id?: string | null;
          first_name?: string | null;
          held_lines?: never;
          kit_deposit_kes?: number | null;
          kit_deposit_status?: string | null;
          last_name?: string | null;
          payout_msisdn_masked?: never;
          payout_name_lookup?: Json | null;
          rider_id?: string | null;
          status?: Database['public']['Enums']['rider_status'] | null;
        };
        Update: {
          cash_cap_effective?: never;
          cash_on_hand?: number | null;
          city_id?: string | null;
          employer_merchant_id?: string | null;
          first_name?: string | null;
          held_lines?: never;
          kit_deposit_kes?: number | null;
          kit_deposit_status?: string | null;
          last_name?: string | null;
          payout_msisdn_masked?: never;
          payout_name_lookup?: Json | null;
          rider_id?: string | null;
          status?: Database['public']['Enums']['rider_status'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['employer_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_dashboard_v: {
        Row: {
          accepting_orders: boolean | null;
          accepting_orders_source: Database['public']['Enums']['merchant_control_source'] | null;
          busy_mode_until: string | null;
          closed_early_at: string | null;
          disputes_awaiting_reply: number | null;
          edits_pending: number | null;
          explore_visible: boolean | null;
          health_band: Database['public']['Enums']['health_band'] | null;
          health_score: number | null;
          merchant_id: string | null;
          next_reply_due_at: string | null;
          pay_on_delivery: boolean | null;
          pay_on_delivery_cap_kes: number | null;
          payout_hold: boolean | null;
          payout_hold_reason: string | null;
          status: Database['public']['Enums']['partner_status'] | null;
          status_reason: string | null;
          strike_count: number | null;
          suspension_reason: string | null;
          terms_to_accept: boolean | null;
          trading_name: string | null;
          unread_messages: number | null;
        };
        Insert: {
          accepting_orders?: boolean | null;
          accepting_orders_source?: Database['public']['Enums']['merchant_control_source'] | null;
          busy_mode_until?: string | null;
          closed_early_at?: string | null;
          disputes_awaiting_reply?: never;
          edits_pending?: never;
          explore_visible?: boolean | null;
          health_band?: Database['public']['Enums']['health_band'] | null;
          health_score?: number | null;
          merchant_id?: string | null;
          next_reply_due_at?: never;
          pay_on_delivery?: boolean | null;
          pay_on_delivery_cap_kes?: number | null;
          payout_hold?: boolean | null;
          payout_hold_reason?: string | null;
          status?: Database['public']['Enums']['partner_status'] | null;
          status_reason?: string | null;
          strike_count?: number | null;
          suspension_reason?: string | null;
          terms_to_accept?: never;
          trading_name?: string | null;
          unread_messages?: never;
        };
        Update: {
          accepting_orders?: boolean | null;
          accepting_orders_source?: Database['public']['Enums']['merchant_control_source'] | null;
          busy_mode_until?: string | null;
          closed_early_at?: string | null;
          disputes_awaiting_reply?: never;
          edits_pending?: never;
          explore_visible?: boolean | null;
          health_band?: Database['public']['Enums']['health_band'] | null;
          health_score?: number | null;
          merchant_id?: string | null;
          next_reply_due_at?: never;
          pay_on_delivery?: boolean | null;
          pay_on_delivery_cap_kes?: number | null;
          payout_hold?: boolean | null;
          payout_hold_reason?: string | null;
          status?: Database['public']['Enums']['partner_status'] | null;
          status_reason?: string | null;
          strike_count?: number | null;
          suspension_reason?: string | null;
          terms_to_accept?: never;
          trading_name?: string | null;
          unread_messages?: never;
        };
        Relationships: [];
      };
      merchant_fleet_rider_v: {
        Row: {
          activated_at: string | null;
          first_name: string | null;
          merchant_id: string | null;
          plate_no: string | null;
          presence: Database['public']['Enums']['rider_presence'] | null;
          rider_id: string | null;
          status: Database['public']['Enums']['rider_status'] | null;
          trips_this_week: number | null;
          vehicle: Database['public']['Enums']['vehicle_type'] | null;
        };
        Insert: {
          activated_at?: string | null;
          first_name?: string | null;
          merchant_id?: string | null;
          plate_no?: string | null;
          presence?: Database['public']['Enums']['rider_presence'] | null;
          rider_id?: string | null;
          status?: Database['public']['Enums']['rider_status'] | null;
          trips_this_week?: never;
          vehicle?: Database['public']['Enums']['vehicle_type'] | null;
        };
        Update: {
          activated_at?: string | null;
          first_name?: string | null;
          merchant_id?: string | null;
          plate_no?: string | null;
          presence?: Database['public']['Enums']['rider_presence'] | null;
          rider_id?: string | null;
          status?: Database['public']['Enums']['rider_status'] | null;
          trips_this_week?: never;
          vehicle?: Database['public']['Enums']['vehicle_type'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'rider_employer_merchant_id_fkey';
            columns: ['merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      merchant_public: {
        Row: {
          accepting_orders: boolean | null;
          branch_address: string | null;
          branch_latitude: number | null;
          branch_longitude: number | null;
          branch_name: string | null;
          busy_mode_until: string | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_name: string | null;
          city_slug: string | null;
          closed_early_at: string | null;
          closed_today: boolean | null;
          closes_today: string | null;
          concierge_pick: boolean | null;
          cover_photo_path: string | null;
          explore_visible: boolean | null;
          featured: boolean | null;
          health_badge: string | null;
          id: string | null;
          listed_at: string | null;
          opens_today: string | null;
          parent_merchant_id: string | null;
          pay_on_delivery_cap_kes: number | null;
          pay_on_delivery_enabled: boolean | null;
          prep_minutes: number | null;
          trading_name: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'console_merchant_directory_v';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'dispatch_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'finance_merchant_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_dashboard_v';
            referencedColumns: ['merchant_id'];
          },
          {
            foreignKeyName: 'merchant_parent_merchant_id_fkey';
            columns: ['parent_merchant_id'];
            isOneToOne: false;
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
      };
      review_public: {
        Row: {
          area_snapshot: string | null;
          body: string | null;
          day_title_snapshot: string | null;
          display_name_snapshot: string | null;
          published_at: string | null;
          rating: number | null;
        };
        Insert: {
          area_snapshot?: string | null;
          body?: string | null;
          day_title_snapshot?: string | null;
          display_name_snapshot?: string | null;
          published_at?: string | null;
          rating?: number | null;
        };
        Update: {
          area_snapshot?: string | null;
          body?: string | null;
          day_title_snapshot?: string | null;
          display_name_snapshot?: string | null;
          published_at?: string | null;
          rating?: number | null;
        };
        Relationships: [];
      };
      rider_app_me_v: {
        Row: {
          active_strikes: Json | null;
          agreement_to_accept: string | null;
          can_receive_offers: boolean | null;
          can_receive_offers_source: Database['public']['Enums']['rider_control_source'] | null;
          cash_cap_effective: number | null;
          cash_on_hand: number | null;
          city_id: string | null;
          city_name: string | null;
          cooldown_reason: string | null;
          cooldown_until: string | null;
          documents_expired: number | null;
          documents_expiring: number | null;
          earnings_today_kes: number | null;
          earnings_week_kes: number | null;
          first_name: string | null;
          health_band: Database['public']['Enums']['rider_health_band'] | null;
          health_score: number | null;
          live_bonuses: Json | null;
          next_settlement_kes: number | null;
          offers_paused_reason: string | null;
          oldest_undeposited_at: string | null;
          open_incidents: number | null;
          pay_on_delivery_eligible: boolean | null;
          plate_no: string | null;
          presence: Database['public']['Enums']['rider_presence'] | null;
          rate_card: Json | null;
          rider_id: string | null;
          shifts: Json | null;
          status: Database['public']['Enums']['rider_status'] | null;
          top_decile: boolean | null;
          user_id: string | null;
          vehicle: Database['public']['Enums']['vehicle_type'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
      rider_public: {
        Row: {
          city_id: string | null;
          face_photo_path: string | null;
          first_name: string | null;
          id: string | null;
          plate_no: string | null;
          vehicle: Database['public']['Enums']['vehicle_type'] | null;
        };
        Insert: {
          city_id?: string | null;
          face_photo_path?: string | null;
          first_name?: string | null;
          id?: string | null;
          plate_no?: string | null;
          vehicle?: Database['public']['Enums']['vehicle_type'] | null;
        };
        Update: {
          city_id?: string | null;
          face_photo_path?: string | null;
          first_name?: string | null;
          id?: string | null;
          plate_no?: string | null;
          vehicle?: Database['public']['Enums']['vehicle_type'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rider_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
      zone_bounds: {
        Row: {
          city_id: string | null;
          cod_allowed: boolean | null;
          east: number | null;
          eta_max: number | null;
          eta_min: number | null;
          id: string | null;
          name: string | null;
          north: number | null;
          south: number | null;
          tier: Database['public']['Enums']['zone_tier'] | null;
          west: number | null;
        };
        Insert: {
          city_id?: string | null;
          cod_allowed?: boolean | null;
          east?: never;
          eta_max?: number | null;
          eta_min?: number | null;
          id?: string | null;
          name?: string | null;
          north?: never;
          south?: never;
          tier?: Database['public']['Enums']['zone_tier'] | null;
          west?: never;
        };
        Update: {
          city_id?: string | null;
          cod_allowed?: boolean | null;
          east?: never;
          eta_max?: number | null;
          eta_min?: number | null;
          id?: string | null;
          name?: string | null;
          north?: never;
          south?: never;
          tier?: Database['public']['Enums']['zone_tier'] | null;
          west?: never;
        };
        Relationships: [
          {
            foreignKeyName: 'zone_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'city';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      distance_to_nearest_zone: {
        Args: { p_lat: number; p_lng: number };
        Returns: {
          city_id: string;
          city_name: string;
          km: number;
          zone_name: string;
        }[];
      };
      fn_answer_matches: { Args: { p_answers: Json; p_condition: Json }; Returns: boolean };
      fn_available_components: {
        Args: { p_plan_id: string };
        Returns: {
          default_slot: Database['public']['Enums']['block_slot'];
          duration_min: number;
          earliest_start: string;
          id: string;
          kind: Database['public']['Enums']['block_kind'];
          latest_start: string;
          location: unknown;
          mood: Database['public']['Enums']['mood'];
          partner_id: string;
          pay_on_day: Json;
          price_basis: Database['public']['Enums']['price_basis'];
          price_kes: number;
          subtitle: string;
          swap_group: string;
          tier: number;
          title: string;
        }[];
      };
      fn_block_time: {
        Args: {
          p_earliest: string;
          p_latest: string;
          p_slot: Database['public']['Enums']['block_slot'];
        };
        Returns: string;
      };
      fn_build_plan: { Args: { p_plan_id: string }; Returns: undefined };
      fn_cash_guard: { Args: { p_rider_id: string }; Returns: undefined };
      fn_catalogue_edit_needs_review: {
        Args: { p_current_price: number; p_kind: string; p_payload: Json };
        Returns: boolean;
      };
      fn_city_for_point: {
        Args: { p_lat: number; p_lng: number };
        Returns: {
          distance_m: number;
          id: string;
          inside_a_zone: boolean;
          name: string;
          slug: string;
          status: Database['public']['Enums']['city_status'];
        }[];
      };
      fn_component_cost: {
        Args: {
          p_basis: Database['public']['Enums']['price_basis'];
          p_party: number;
          p_price: number;
        };
        Returns: number;
      };
      fn_compute_rider_health: { Args: { p_as_of?: string }; Returns: number };
      fn_event_anchor_effects: { Args: { p_plan_id: string }; Returns: undefined };
      fn_expire_documents: { Args: Record<PropertyKey, never>; Returns: number };
      fn_fit_budget: { Args: { p_plan_id: string }; Returns: undefined };
      fn_load_available: { Args: { p_plan_id: string }; Returns: undefined };
      fn_match_deposit: {
        Args: { p_deposit_id: string };
        Returns: {
          account_reference: string | null;
          amount_kes: number;
          created_at: string;
          id: string;
          match_status: Database['public']['Enums']['deposit_match_status'];
          matched_at: string | null;
          matched_by: string | null;
          msisdn: string | null;
          paid_at: string;
          provider_ref: string;
          rider_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'cash_deposit';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      fn_merchant_draft_for_write: {
        Args: { p_merchant_id: string };
        Returns: {
          accepting_orders: boolean;
          accepting_orders_changed_at: string | null;
          accepting_orders_source: Database['public']['Enums']['merchant_control_source'] | null;
          acquisition_channel: Database['public']['Enums']['acquisition_channel'] | null;
          acquisition_source: string | null;
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          busy_mode_until: string | null;
          capacity_per_15min: number | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          closed_early_at: string | null;
          commission_pct: number | null;
          commission_tier: Database['public']['Enums']['commission_tier_code'];
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          delisted_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_delivery_pay_to_merchant: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
          health_band: Database['public']['Enums']['health_band'] | null;
          health_score: number | null;
          hours: Json | null;
          hours_pattern: string | null;
          id: string;
          landmark: string | null;
          late_night_until: string | null;
          legal_name: string | null;
          onboarding_call_at: string | null;
          onboarding_source: string | null;
          onboarding_step: number;
          order_channels: string[];
          packaging: string | null;
          parent_merchant_id: string | null;
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_hold: boolean;
          payout_hold_reason: string | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          referred_by_id: string | null;
          referred_by_type: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          trading_name: string;
          updated_at: string;
          waitlisted_at: string | null;
          went_live_at: string | null;
          went_live_by: string | null;
          when_busy: string;
        };
        SetofOptions: {
          from: '*';
          to: 'merchant';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      fn_merchant_effective_hours: {
        Args: { p_branch_id?: string; p_date?: string; p_merchant_id: string };
        Returns: {
          closed: boolean;
          closes: string;
          opens: string;
          source: string;
        }[];
      };
      fn_merchant_is_live: { Args: { p_merchant_id: string }; Returns: boolean };
      fn_merchant_readiness: { Args: { p_merchant_id: string }; Returns: Json };
      fn_merchant_required_docs: {
        Args: { p_merchant_id: string };
        Returns: {
          applies_when: NonNullable<Json>;
          created_at: string;
          essential: boolean;
          has_expiry: boolean;
          help_text: string | null;
          id: string;
          kind: string;
          label: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          required: boolean;
          sort: number;
          updated_at: string;
          why_text: string | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'document_requirement';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      fn_mood_chips: {
        Args: { p_city_id: string };
        Returns: {
          default_slot: Database['public']['Enums']['block_slot'];
          id: string;
          mood: Database['public']['Enums']['mood'];
          price_basis: Database['public']['Enums']['price_basis'];
          price_kes: number;
          swap_group: string;
          tier: number;
          title: string;
        }[];
      };
      fn_partner_recompute_status: {
        Args: {
          p_owner_id: string;
          p_owner_type: Database['public']['Enums']['document_owner_type'];
        };
        Returns: string;
      };
      fn_pick_concierge: { Args: { p_city_id: string }; Returns: string };
      fn_plan_flags: { Args: { p_plan_id: string }; Returns: Json };
      fn_plan_totals: {
        Args: { p_plan_id: string };
        Returns: {
          mood: string;
          total_kes: number;
        }[];
      };
      fn_plan_view: { Args: { p_plan_id: string }; Returns: Json };
      fn_plate_matches: { Args: { p_plate: string; p_read: string }; Returns: boolean };
      fn_review_checks: { Args: { p_body: string; p_plan_id: string }; Returns: Json };
      fn_rider_cash_cap: { Args: { p_rider_id: string }; Returns: number };
      fn_rider_condition_matches: {
        Args: { p_condition: Json; p_rider: Database['public']['Tables']['rider']['Row'] };
        Returns: boolean;
      };
      fn_rider_document_state: {
        Args: { p_rider_id: string };
        Returns: {
          awaiting: number;
          expired: number;
          expiring: number;
          required: number;
          soonest_expiry: string;
          verified: number;
        }[];
      };
      fn_rider_draft_for_write: {
        Args: { p_rider_id: string };
        Returns: {
          activated_at: string | null;
          activated_by: string | null;
          alcohol_eligible: boolean;
          areas: string[];
          background_check: NonNullable<Json>;
          bike_max_km: number | null;
          can_receive_offers: boolean;
          can_receive_offers_source: Database['public']['Enums']['rider_control_source'] | null;
          cash_cap: number | null;
          cash_ok: boolean;
          cash_on_hand: number;
          city_id: string | null;
          cooldown_reason: string | null;
          cooldown_until: string | null;
          created_at: string;
          current_order_reference: string | null;
          device_fingerprint: string | null;
          employer_merchant_id: string | null;
          face_photo_path: string | null;
          first_name: string;
          health_band: Database['public']['Enums']['rider_health_band'] | null;
          health_score: number | null;
          id: string;
          insurance: Database['public']['Enums']['insurance_type'] | null;
          kit_deposit_kes: number | null;
          kit_deposit_status: string | null;
          kit_has: string[];
          kit_issued_at: string | null;
          large_items_eligible: boolean;
          last_location: unknown;
          last_location_at: string | null;
          last_name: string | null;
          last_seen_at: string | null;
          notes: string | null;
          offboard_reason: string | null;
          offboarded_at: string | null;
          offers_paused_reason: string | null;
          onboarding_session_at: string | null;
          onboarding_slot_id: string | null;
          onboarding_step: number;
          owner_name: string | null;
          owner_phone: string | null;
          ownership: Database['public']['Enums']['vehicle_ownership'] | null;
          pay_on_delivery_eligible: boolean;
          payout_msisdn: string | null;
          payout_name_lookup: Json | null;
          phone: string;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          plate_no: string | null;
          presence: Database['public']['Enums']['rider_presence'];
          presence_changed_at: string | null;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          shifts: string[];
          source: string;
          staff_notes: string | null;
          status: Database['public']['Enums']['rider_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          top_decile: boolean;
          training: NonNullable<Json>;
          updated_at: string;
          user_id: string | null;
          vehicle: Database['public']['Enums']['vehicle_type'] | null;
          waitlisted_at: string | null;
          years_riding: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'rider';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      fn_rider_readiness: { Args: { p_rider_id: string }; Returns: Json };
      fn_rider_required_docs: {
        Args: { p_rider_id: string };
        Returns: {
          applies_when: NonNullable<Json>;
          created_at: string;
          essential: boolean;
          has_expiry: boolean;
          help_text: string | null;
          id: string;
          kind: string;
          label: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          required: boolean;
          sort: number;
          updated_at: string;
          why_text: string | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'document_requirement';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      fn_setting_int: { Args: { p_default: number; p_key: string }; Returns: number };
      fn_slot_order: {
        Args: { p_slot: Database['public']['Enums']['block_slot'] };
        Returns: number;
      };
      fn_slot_time: {
        Args: { p_slot: Database['public']['Enums']['block_slot'] };
        Returns: string;
      };
      fn_swap_options: {
        Args: { p_block_id: string };
        Returns: {
          delta_kes: number;
          direction: string;
          id: string;
          price_kes: number;
          subtitle: string;
          tier: number;
          title: string;
        }[];
      };
      fn_translations: { Args: { p_locale: string }; Returns: Json };
      fn_zone_supply_gap: {
        Args: { p_at?: string; p_zone_id: string };
        Returns: {
          gap: number;
          on_trip: number;
          online_now: number;
          riders_needed: number;
          zone_id: string;
          zone_name: string;
        }[];
      };
      neighbourhoods_for_zone: { Args: { p_zone_id: string }; Returns: string[] };
      rpc_activate_rider: {
        Args: { p_reason?: string; p_rider_id: string };
        Returns: {
          activated_at: string | null;
          activated_by: string | null;
          alcohol_eligible: boolean;
          areas: string[];
          background_check: NonNullable<Json>;
          bike_max_km: number | null;
          can_receive_offers: boolean;
          can_receive_offers_source: Database['public']['Enums']['rider_control_source'] | null;
          cash_cap: number | null;
          cash_ok: boolean;
          cash_on_hand: number;
          city_id: string | null;
          cooldown_reason: string | null;
          cooldown_until: string | null;
          created_at: string;
          current_order_reference: string | null;
          device_fingerprint: string | null;
          employer_merchant_id: string | null;
          face_photo_path: string | null;
          first_name: string;
          health_band: Database['public']['Enums']['rider_health_band'] | null;
          health_score: number | null;
          id: string;
          insurance: Database['public']['Enums']['insurance_type'] | null;
          kit_deposit_kes: number | null;
          kit_deposit_status: string | null;
          kit_has: string[];
          kit_issued_at: string | null;
          large_items_eligible: boolean;
          last_location: unknown;
          last_location_at: string | null;
          last_name: string | null;
          last_seen_at: string | null;
          notes: string | null;
          offboard_reason: string | null;
          offboarded_at: string | null;
          offers_paused_reason: string | null;
          onboarding_session_at: string | null;
          onboarding_slot_id: string | null;
          onboarding_step: number;
          owner_name: string | null;
          owner_phone: string | null;
          ownership: Database['public']['Enums']['vehicle_ownership'] | null;
          pay_on_delivery_eligible: boolean;
          payout_msisdn: string | null;
          payout_name_lookup: Json | null;
          phone: string;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          plate_no: string | null;
          presence: Database['public']['Enums']['rider_presence'];
          presence_changed_at: string | null;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          shifts: string[];
          source: string;
          staff_notes: string | null;
          status: Database['public']['Enums']['rider_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          top_decile: boolean;
          training: NonNullable<Json>;
          updated_at: string;
          user_id: string | null;
          vehicle: Database['public']['Enums']['vehicle_type'] | null;
          waitlisted_at: string | null;
          years_riding: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'rider';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_add_block: {
        Args: { p_component_id: string; p_plan_id: string; p_start_time?: string };
        Returns: {
          anchored: boolean;
          assigned_driver_partner_id: string | null;
          assigned_rider_id: string | null;
          change_note: string | null;
          changed_from: Json | null;
          component_id: string | null;
          created_at: string;
          done_at: string | null;
          end_time: string | null;
          event_id: string | null;
          hold_expires_at: string | null;
          hold_requested_at: string | null;
          hold_status: Database['public']['Enums']['hold_status'];
          id: string;
          included_by: string | null;
          kind: Database['public']['Enums']['block_kind'];
          partner_contact_log: NonNullable<Json>;
          pay_on_day: NonNullable<Json>;
          plan_id: string;
          price_estimate_kes: number | null;
          price_quoted_kes: number | null;
          slot: Database['public']['Enums']['block_slot'];
          sort: number;
          start_time: string | null;
          status: Database['public']['Enums']['plan_block_status'];
          subtitle_snapshot: string | null;
          swap_group: string | null;
          ticket_asset_paths: string[];
          title_snapshot: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'plan_block';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_answer_hold: {
        Args: {
          p_hold_id: string;
          p_note?: string;
          p_status: Database['public']['Enums']['hold_status'];
        };
        Returns: {
          channel: string;
          created_at: string;
          holds_until: string | null;
          id: string;
          message_sent: string | null;
          partner_id: string;
          plan_block_id: string;
          requested_by: string | null;
          responded_at: string | null;
          response_note: string | null;
          status: Database['public']['Enums']['hold_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'partner_hold';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_approval_decide: {
        Args: { p_approve: boolean; p_note?: string; p_request_id: string };
        Returns: {
          city_id: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          id: string;
          kind: Database['public']['Enums']['approval_kind'];
          payload: NonNullable<Json>;
          reason: string;
          requested_by: string;
          status: Database['public']['Enums']['approval_status'];
          target_id: string;
          target_type: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'approval_request';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_approve_plan: {
        Args: { p_plan_id: string };
        Returns: {
          answers: NonNullable<Json>;
          approved_at: string | null;
          budget_kes: number | null;
          cancel_reason: string | null;
          city_id: string;
          claimed_at: string | null;
          completed_at: string | null;
          concierge_fee_kes: number | null;
          concierge_id: string | null;
          created_at: string;
          curated_day_id: string | null;
          date: string | null;
          duration: string;
          end_date: string | null;
          estimate_total_kes: number | null;
          expires_at: string | null;
          first_reply_at: string | null;
          flags: NonNullable<Json>;
          guest_name: string | null;
          guest_phone: string | null;
          handover_note: string | null;
          id: string;
          moods: Database['public']['Enums']['mood'][];
          notes: string | null;
          paid_at: string | null;
          party_size: number;
          party_type: string;
          pay_on_day_total_kes: number | null;
          payment_reference: string | null;
          quote_total_kes: number | null;
          quoted_at: string | null;
          reference: string;
          review_requested_at: string | null;
          sent_at: string | null;
          share_token_hash: string | null;
          sla_first_reply_due_at: string | null;
          sla_quote_due_at: string | null;
          status: Database['public']['Enums']['plan_status'];
          stay_label: string | null;
          stay_point: unknown;
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'plan';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_assign_driver: {
        Args: { p_partner_id?: string; p_plan_id: string; p_rider_id?: string };
        Returns: {
          anchored: boolean;
          assigned_driver_partner_id: string | null;
          assigned_rider_id: string | null;
          change_note: string | null;
          changed_from: Json | null;
          component_id: string | null;
          created_at: string;
          done_at: string | null;
          end_time: string | null;
          event_id: string | null;
          hold_expires_at: string | null;
          hold_requested_at: string | null;
          hold_status: Database['public']['Enums']['hold_status'];
          id: string;
          included_by: string | null;
          kind: Database['public']['Enums']['block_kind'];
          partner_contact_log: NonNullable<Json>;
          pay_on_day: NonNullable<Json>;
          plan_id: string;
          price_estimate_kes: number | null;
          price_quoted_kes: number | null;
          slot: Database['public']['Enums']['block_slot'];
          sort: number;
          start_time: string | null;
          status: Database['public']['Enums']['plan_block_status'];
          subtitle_snapshot: string | null;
          swap_group: string | null;
          ticket_asset_paths: string[];
          title_snapshot: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'plan_block';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_attach_tickets: {
        Args: { p_block_id: string; p_paths: string[] };
        Returns: {
          anchored: boolean;
          assigned_driver_partner_id: string | null;
          assigned_rider_id: string | null;
          change_note: string | null;
          changed_from: Json | null;
          component_id: string | null;
          created_at: string;
          done_at: string | null;
          end_time: string | null;
          event_id: string | null;
          hold_expires_at: string | null;
          hold_requested_at: string | null;
          hold_status: Database['public']['Enums']['hold_status'];
          id: string;
          included_by: string | null;
          kind: Database['public']['Enums']['block_kind'];
          partner_contact_log: NonNullable<Json>;
          pay_on_day: NonNullable<Json>;
          plan_id: string;
          price_estimate_kes: number | null;
          price_quoted_kes: number | null;
          slot: Database['public']['Enums']['block_slot'];
          sort: number;
          start_time: string | null;
          status: Database['public']['Enums']['plan_block_status'];
          subtitle_snapshot: string | null;
          swap_group: string | null;
          ticket_asset_paths: string[];
          title_snapshot: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'plan_block';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_audit_recent: {
        Args: { p_limit?: number; p_module?: string };
        Returns: {
          action: string;
          actor_type: Database['public']['Enums']['actor_type'];
          at: string;
          city_id: string;
          city_name: string;
          id: number;
          module: string;
          reason: string;
          severity: Database['public']['Enums']['audit_severity'];
          target_id: string;
          target_type: string;
        }[];
      };
      rpc_block_done: {
        Args: { p_block_id: string };
        Returns: {
          anchored: boolean;
          assigned_driver_partner_id: string | null;
          assigned_rider_id: string | null;
          change_note: string | null;
          changed_from: Json | null;
          component_id: string | null;
          created_at: string;
          done_at: string | null;
          end_time: string | null;
          event_id: string | null;
          hold_expires_at: string | null;
          hold_requested_at: string | null;
          hold_status: Database['public']['Enums']['hold_status'];
          id: string;
          included_by: string | null;
          kind: Database['public']['Enums']['block_kind'];
          partner_contact_log: NonNullable<Json>;
          pay_on_day: NonNullable<Json>;
          plan_id: string;
          price_estimate_kes: number | null;
          price_quoted_kes: number | null;
          slot: Database['public']['Enums']['block_slot'];
          sort: number;
          start_time: string | null;
          status: Database['public']['Enums']['plan_block_status'];
          subtitle_snapshot: string | null;
          swap_group: string | null;
          ticket_asset_paths: string[];
          title_snapshot: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'plan_block';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_block_unavailable: { Args: { p_block_id: string; p_note: string }; Returns: Json };
      rpc_book_slot: { Args: { p_rider_id: string; p_slot_id: string }; Returns: Json };
      rpc_bootstrap_super_admin: { Args: Record<PropertyKey, never>; Returns: string };
      rpc_cancel_plan: {
        Args: { p_plan_id: string; p_reason: string };
        Returns: {
          answers: NonNullable<Json>;
          approved_at: string | null;
          budget_kes: number | null;
          cancel_reason: string | null;
          city_id: string;
          claimed_at: string | null;
          completed_at: string | null;
          concierge_fee_kes: number | null;
          concierge_id: string | null;
          created_at: string;
          curated_day_id: string | null;
          date: string | null;
          duration: string;
          end_date: string | null;
          estimate_total_kes: number | null;
          expires_at: string | null;
          first_reply_at: string | null;
          flags: NonNullable<Json>;
          guest_name: string | null;
          guest_phone: string | null;
          handover_note: string | null;
          id: string;
          moods: Database['public']['Enums']['mood'][];
          notes: string | null;
          paid_at: string | null;
          party_size: number;
          party_type: string;
          pay_on_day_total_kes: number | null;
          payment_reference: string | null;
          quote_total_kes: number | null;
          quoted_at: string | null;
          reference: string;
          review_requested_at: string | null;
          sent_at: string | null;
          share_token_hash: string | null;
          sla_first_reply_due_at: string | null;
          sla_quote_due_at: string | null;
          status: Database['public']['Enums']['plan_status'];
          stay_label: string | null;
          stay_point: unknown;
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'plan';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_cash_manual_adjustment: {
        Args: { p_amount_kes: number; p_reason: string; p_rider_id: string };
        Returns: {
          amount_kes: number;
          created_at: string;
          created_by: string | null;
          deposit_id: string | null;
          id: number;
          kind: Database['public']['Enums']['cash_event_kind'];
          note: string | null;
          order_reference: string | null;
          rider_id: string;
          settlement_line_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'cash_event';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_catalogue_edit_review: {
        Args: { p_approve: boolean; p_reason?: string; p_request_id: string };
        Returns: {
          catalogue_item_id: string | null;
          created_at: string;
          id: string;
          kind: string;
          merchant_id: string;
          payload: NonNullable<Json>;
          reason: string | null;
          requested_by: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database['public']['Enums']['edit_approval_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'catalogue_edit_request';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_change_block: {
        Args: { p_block_id: string; p_note: string; p_patch: Json };
        Returns: {
          anchored: boolean;
          assigned_driver_partner_id: string | null;
          assigned_rider_id: string | null;
          change_note: string | null;
          changed_from: Json | null;
          component_id: string | null;
          created_at: string;
          done_at: string | null;
          end_time: string | null;
          event_id: string | null;
          hold_expires_at: string | null;
          hold_requested_at: string | null;
          hold_status: Database['public']['Enums']['hold_status'];
          id: string;
          included_by: string | null;
          kind: Database['public']['Enums']['block_kind'];
          partner_contact_log: NonNullable<Json>;
          pay_on_day: NonNullable<Json>;
          plan_id: string;
          price_estimate_kes: number | null;
          price_quoted_kes: number | null;
          slot: Database['public']['Enums']['block_slot'];
          sort: number;
          start_time: string | null;
          status: Database['public']['Enums']['plan_block_status'];
          subtitle_snapshot: string | null;
          swap_group: string | null;
          ticket_asset_paths: string[];
          title_snapshot: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'plan_block';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_claim_plan: {
        Args: { p_plan_id: string };
        Returns: {
          answers: NonNullable<Json>;
          approved_at: string | null;
          budget_kes: number | null;
          cancel_reason: string | null;
          city_id: string;
          claimed_at: string | null;
          completed_at: string | null;
          concierge_fee_kes: number | null;
          concierge_id: string | null;
          created_at: string;
          curated_day_id: string | null;
          date: string | null;
          duration: string;
          end_date: string | null;
          estimate_total_kes: number | null;
          expires_at: string | null;
          first_reply_at: string | null;
          flags: NonNullable<Json>;
          guest_name: string | null;
          guest_phone: string | null;
          handover_note: string | null;
          id: string;
          moods: Database['public']['Enums']['mood'][];
          notes: string | null;
          paid_at: string | null;
          party_size: number;
          party_type: string;
          pay_on_day_total_kes: number | null;
          payment_reference: string | null;
          quote_total_kes: number | null;
          quoted_at: string | null;
          reference: string;
          review_requested_at: string | null;
          sent_at: string | null;
          share_token_hash: string | null;
          sla_first_reply_due_at: string | null;
          sla_quote_due_at: string | null;
          status: Database['public']['Enums']['plan_status'];
          stay_label: string | null;
          stay_point: unknown;
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'plan';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_complete_plan: {
        Args: { p_override_note?: string; p_plan_id: string };
        Returns: {
          answers: NonNullable<Json>;
          approved_at: string | null;
          budget_kes: number | null;
          cancel_reason: string | null;
          city_id: string;
          claimed_at: string | null;
          completed_at: string | null;
          concierge_fee_kes: number | null;
          concierge_id: string | null;
          created_at: string;
          curated_day_id: string | null;
          date: string | null;
          duration: string;
          end_date: string | null;
          estimate_total_kes: number | null;
          expires_at: string | null;
          first_reply_at: string | null;
          flags: NonNullable<Json>;
          guest_name: string | null;
          guest_phone: string | null;
          handover_note: string | null;
          id: string;
          moods: Database['public']['Enums']['mood'][];
          notes: string | null;
          paid_at: string | null;
          party_size: number;
          party_type: string;
          pay_on_day_total_kes: number | null;
          payment_reference: string | null;
          quote_total_kes: number | null;
          quoted_at: string | null;
          reference: string;
          review_requested_at: string | null;
          sent_at: string | null;
          share_token_hash: string | null;
          sla_first_reply_due_at: string | null;
          sla_quote_due_at: string | null;
          status: Database['public']['Enums']['plan_status'];
          stay_label: string | null;
          stay_point: unknown;
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'plan';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_confirm_block: {
        Args: { p_block_id: string; p_price_kes?: number };
        Returns: {
          anchored: boolean;
          assigned_driver_partner_id: string | null;
          assigned_rider_id: string | null;
          change_note: string | null;
          changed_from: Json | null;
          component_id: string | null;
          created_at: string;
          done_at: string | null;
          end_time: string | null;
          event_id: string | null;
          hold_expires_at: string | null;
          hold_requested_at: string | null;
          hold_status: Database['public']['Enums']['hold_status'];
          id: string;
          included_by: string | null;
          kind: Database['public']['Enums']['block_kind'];
          partner_contact_log: NonNullable<Json>;
          pay_on_day: NonNullable<Json>;
          plan_id: string;
          price_estimate_kes: number | null;
          price_quoted_kes: number | null;
          slot: Database['public']['Enums']['block_slot'];
          sort: number;
          start_time: string | null;
          status: Database['public']['Enums']['plan_block_status'];
          subtitle_snapshot: string | null;
          swap_group: string | null;
          ticket_asset_paths: string[];
          title_snapshot: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'plan_block';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_decide_review: {
        Args: {
          p_decision: Database['public']['Enums']['review_status'];
          p_display?: Database['public']['Enums']['review_display'];
          p_reason?: string;
          p_review_id: string;
        };
        Returns: {
          area_snapshot: string | null;
          body: string;
          channel: string;
          checks: NonNullable<Json>;
          consent_display: Database['public']['Enums']['review_display'];
          consent_publish: boolean;
          created_at: string;
          day_title_snapshot: string | null;
          decided_at: string | null;
          decided_by: string | null;
          decision_reason: string | null;
          display_name_snapshot: string | null;
          id: string;
          plan_id: string;
          published_at: string | null;
          rating: number;
          received_at: string;
          reply_body: string | null;
          reply_sent_at: string | null;
          status: Database['public']['Enums']['review_status'];
          user_id: string | null;
          word_count: number;
        };
        SetofOptions: {
          from: '*';
          to: 'review';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_deposit_match_manual: {
        Args: { p_deposit_id: string; p_rider_id: string };
        Returns: {
          account_reference: string | null;
          amount_kes: number;
          created_at: string;
          id: string;
          match_status: Database['public']['Enums']['deposit_match_status'];
          matched_at: string | null;
          matched_by: string | null;
          msisdn: string | null;
          paid_at: string;
          provider_ref: string;
          rider_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'cash_deposit';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_deposit_reject: {
        Args: { p_deposit_id: string; p_reason: string };
        Returns: {
          account_reference: string | null;
          amount_kes: number;
          created_at: string;
          id: string;
          match_status: Database['public']['Enums']['deposit_match_status'];
          matched_at: string | null;
          matched_by: string | null;
          msisdn: string | null;
          paid_at: string;
          provider_ref: string;
          rider_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'cash_deposit';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_dispute_ask_merchant: {
        Args: { p_dispute_id: string; p_due_hours?: number };
        Returns: {
          amount_claimed_kes: number | null;
          amount_refunded_kes: number;
          branch_id: string | null;
          charged_to: string | null;
          evidence: NonNullable<Json>;
          fault: Database['public']['Enums']['dispute_fault'];
          guest_note: string | null;
          guest_user_id: string | null;
          id: string;
          merchant_id: string;
          merchant_reply: string | null;
          merchant_reply_due_at: string | null;
          opened_at: string;
          opened_by: string | null;
          order_reference: string | null;
          reason: string;
          resolution: Database['public']['Enums']['dispute_resolution'] | null;
          resolved_at: string | null;
          resolved_by: string | null;
          rider_id: string | null;
          status: Database['public']['Enums']['dispute_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'dispute';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_dispute_merchant_reply: {
        Args: { p_dispute_id: string; p_reply: string };
        Returns: {
          amount_claimed_kes: number | null;
          amount_refunded_kes: number;
          branch_id: string | null;
          charged_to: string | null;
          evidence: NonNullable<Json>;
          fault: Database['public']['Enums']['dispute_fault'];
          guest_note: string | null;
          guest_user_id: string | null;
          id: string;
          merchant_id: string;
          merchant_reply: string | null;
          merchant_reply_due_at: string | null;
          opened_at: string;
          opened_by: string | null;
          order_reference: string | null;
          reason: string;
          resolution: Database['public']['Enums']['dispute_resolution'] | null;
          resolved_at: string | null;
          resolved_by: string | null;
          rider_id: string | null;
          status: Database['public']['Enums']['dispute_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'dispute';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_dispute_open: {
        Args: {
          p_amount_kes?: number;
          p_evidence?: Json;
          p_merchant_id: string;
          p_note?: string;
          p_order_reference?: string;
          p_reason: string;
        };
        Returns: {
          amount_claimed_kes: number | null;
          amount_refunded_kes: number;
          branch_id: string | null;
          charged_to: string | null;
          evidence: NonNullable<Json>;
          fault: Database['public']['Enums']['dispute_fault'];
          guest_note: string | null;
          guest_user_id: string | null;
          id: string;
          merchant_id: string;
          merchant_reply: string | null;
          merchant_reply_due_at: string | null;
          opened_at: string;
          opened_by: string | null;
          order_reference: string | null;
          reason: string;
          resolution: Database['public']['Enums']['dispute_resolution'] | null;
          resolved_at: string | null;
          resolved_by: string | null;
          rider_id: string | null;
          status: Database['public']['Enums']['dispute_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'dispute';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_dispute_resolve: {
        Args: {
          p_amount_kes?: number;
          p_dispute_id: string;
          p_fault?: Database['public']['Enums']['dispute_fault'];
          p_note?: string;
          p_resolution: Database['public']['Enums']['dispute_resolution'];
        };
        Returns: {
          amount_claimed_kes: number | null;
          amount_refunded_kes: number;
          branch_id: string | null;
          charged_to: string | null;
          evidence: NonNullable<Json>;
          fault: Database['public']['Enums']['dispute_fault'];
          guest_note: string | null;
          guest_user_id: string | null;
          id: string;
          merchant_id: string;
          merchant_reply: string | null;
          merchant_reply_due_at: string | null;
          opened_at: string;
          opened_by: string | null;
          order_reference: string | null;
          reason: string;
          resolution: Database['public']['Enums']['dispute_resolution'] | null;
          resolved_at: string | null;
          resolved_by: string | null;
          rider_id: string | null;
          status: Database['public']['Enums']['dispute_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'dispute';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_document_reject: {
        Args: { p_document_id: string; p_reason: string };
        Returns: {
          created_at: string;
          expires_at: string | null;
          id: string;
          issued_at: string | null;
          mime: string;
          ocr: Json | null;
          owner_id: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          quality: Json | null;
          rejection_reason: string | null;
          requirement_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          side: string | null;
          size_bytes: number;
          status: Database['public']['Enums']['document_status'];
          storage_path: string;
          superseded_at: string | null;
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: '*';
          to: 'document';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_document_request_via_whatsapp:
        | { Args: { p_merchant_id: string; p_requirement_kind: string }; Returns: Json }
        | {
            Args: {
              p_owner_id: string;
              p_owner_type: Database['public']['Enums']['document_owner_type'];
              p_requirement_kind: string;
            };
            Returns: Json;
          };
      rpc_document_submit: {
        Args: {
          p_expires_at?: string;
          p_issued_at?: string;
          p_mime: string;
          p_owner_id: string;
          p_owner_type: Database['public']['Enums']['document_owner_type'];
          p_requirement_kind: string;
          p_side?: string;
          p_size_bytes: number;
          p_storage_path: string;
        };
        Returns: string;
      };
      rpc_document_verify: {
        Args: { p_document_id: string };
        Returns: {
          created_at: string;
          expires_at: string | null;
          id: string;
          issued_at: string | null;
          mime: string;
          ocr: Json | null;
          owner_id: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          quality: Json | null;
          rejection_reason: string | null;
          requirement_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          side: string | null;
          size_bytes: number;
          status: Database['public']['Enums']['document_status'];
          storage_path: string;
          superseded_at: string | null;
          updated_at: string;
          version: number;
        };
        SetofOptions: {
          from: '*';
          to: 'document';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_experience_guests: {
        Args: { p_city_id?: string; p_filter?: string };
        Returns: {
          city_name: string;
          completed_days: number;
          days: number;
          first_day: string;
          guest_name: string;
          guest_phone: string;
          is_repeat: boolean;
          last_date: string;
          last_plan_id: string;
          last_reference: string;
          last_status: Database['public']['Enums']['plan_status'];
          last_title: string;
          review_asked_at: string;
          review_id: string;
          review_rating: number;
          review_status: Database['public']['Enums']['review_status'];
          spent_kes: number;
          stay_label: string;
          user_id: string;
        }[];
      };
      rpc_experience_queue: {
        Args: { p_city_id?: string };
        Returns: {
          blocks_settled: number;
          blocks_total: number;
          budget_kes: number;
          city_name: string;
          concierge_id: string;
          concierge_name: string;
          date: string;
          estimate_total_kes: number;
          first_reply_at: string;
          first_reply_due_in_s: number;
          flags: Json;
          guest_name: string;
          holds_pending: number;
          id: string;
          moods: Database['public']['Enums']['mood'][];
          party_size: number;
          party_type: string;
          quote_expires_in_s: number;
          quote_total_kes: number;
          reference: string;
          sent_at: string;
          status: Database['public']['Enums']['plan_status'];
          stay_label: string;
          title: string;
        }[];
      };
      rpc_experience_stats: { Args: { p_city_id?: string }; Returns: Json };
      rpc_expire_quotes: { Args: Record<PropertyKey, never>; Returns: number };
      rpc_fraud_signal_review: {
        Args: { p_action: string; p_signal_id: string };
        Returns: {
          details: NonNullable<Json>;
          detected_at: string;
          id: string;
          kind: Database['public']['Enums']['fraud_signal_kind'];
          order_reference: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          rider_id: string;
          score: number | null;
          status: string;
        };
        SetofOptions: {
          from: '*';
          to: 'fraud_signal';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_handover_plan: {
        Args: { p_plan_id: string; p_reason: string; p_to: string };
        Returns: {
          answers: NonNullable<Json>;
          approved_at: string | null;
          budget_kes: number | null;
          cancel_reason: string | null;
          city_id: string;
          claimed_at: string | null;
          completed_at: string | null;
          concierge_fee_kes: number | null;
          concierge_id: string | null;
          created_at: string;
          curated_day_id: string | null;
          date: string | null;
          duration: string;
          end_date: string | null;
          estimate_total_kes: number | null;
          expires_at: string | null;
          first_reply_at: string | null;
          flags: NonNullable<Json>;
          guest_name: string | null;
          guest_phone: string | null;
          handover_note: string | null;
          id: string;
          moods: Database['public']['Enums']['mood'][];
          notes: string | null;
          paid_at: string | null;
          party_size: number;
          party_type: string;
          pay_on_day_total_kes: number | null;
          payment_reference: string | null;
          quote_total_kes: number | null;
          quoted_at: string | null;
          reference: string;
          review_requested_at: string | null;
          sent_at: string | null;
          share_token_hash: string | null;
          sla_first_reply_due_at: string | null;
          sla_quote_due_at: string | null;
          status: Database['public']['Enums']['plan_status'];
          stay_label: string | null;
          stay_point: unknown;
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'plan';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_incident_open: {
        Args: {
          p_description?: string;
          p_kind: Database['public']['Enums']['incident_kind'];
          p_order_reference?: string;
          p_reported_by_type?: string;
          p_rider_id?: string;
          p_severity?: Database['public']['Enums']['incident_severity'];
        };
        Returns: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          assignee_id: string | null;
          compensation_kes: number | null;
          created_at: string;
          description: string | null;
          evidence: NonNullable<Json>;
          guest_user_id: string | null;
          happened_at: string;
          id: string;
          injury: boolean;
          insurance_claim_ref: string | null;
          insurance_claim_status: string | null;
          kind: Database['public']['Enums']['incident_kind'];
          location: unknown;
          merchant_id: string | null;
          order_reference: string | null;
          police_ref: string | null;
          redispatched_order_reference: string | null;
          reported_by_id: string | null;
          reported_by_type: string;
          resolution: string | null;
          resolved_at: string | null;
          rider_id: string | null;
          severity: Database['public']['Enums']['incident_severity'];
          status: Database['public']['Enums']['incident_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'incident';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_incident_resolve: {
        Args: {
          p_compensation_kes?: number;
          p_incident_id: string;
          p_redispatch?: boolean;
          p_resolution: string;
        };
        Returns: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          assignee_id: string | null;
          compensation_kes: number | null;
          created_at: string;
          description: string | null;
          evidence: NonNullable<Json>;
          guest_user_id: string | null;
          happened_at: string;
          id: string;
          injury: boolean;
          insurance_claim_ref: string | null;
          insurance_claim_status: string | null;
          kind: Database['public']['Enums']['incident_kind'];
          location: unknown;
          merchant_id: string | null;
          order_reference: string | null;
          police_ref: string | null;
          redispatched_order_reference: string | null;
          reported_by_id: string | null;
          reported_by_type: string;
          resolution: string | null;
          resolved_at: string | null;
          rider_id: string | null;
          severity: Database['public']['Enums']['incident_severity'];
          status: Database['public']['Enums']['incident_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'incident';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_incident_sos_ack: {
        Args: { p_incident_id: string };
        Returns: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          assignee_id: string | null;
          compensation_kes: number | null;
          created_at: string;
          description: string | null;
          evidence: NonNullable<Json>;
          guest_user_id: string | null;
          happened_at: string;
          id: string;
          injury: boolean;
          insurance_claim_ref: string | null;
          insurance_claim_status: string | null;
          kind: Database['public']['Enums']['incident_kind'];
          location: unknown;
          merchant_id: string | null;
          order_reference: string | null;
          police_ref: string | null;
          redispatched_order_reference: string | null;
          reported_by_id: string | null;
          reported_by_type: string;
          resolution: string | null;
          resolved_at: string | null;
          rider_id: string | null;
          severity: Database['public']['Enums']['incident_severity'];
          status: Database['public']['Enums']['incident_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'incident';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_incident_update: {
        Args: { p_incident_id: string; p_note?: string; p_patch: Json };
        Returns: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          assignee_id: string | null;
          compensation_kes: number | null;
          created_at: string;
          description: string | null;
          evidence: NonNullable<Json>;
          guest_user_id: string | null;
          happened_at: string;
          id: string;
          injury: boolean;
          insurance_claim_ref: string | null;
          insurance_claim_status: string | null;
          kind: Database['public']['Enums']['incident_kind'];
          location: unknown;
          merchant_id: string | null;
          order_reference: string | null;
          police_ref: string | null;
          redispatched_order_reference: string | null;
          reported_by_id: string | null;
          reported_by_type: string;
          resolution: string | null;
          resolved_at: string | null;
          rider_id: string | null;
          severity: Database['public']['Enums']['incident_severity'];
          status: Database['public']['Enums']['incident_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'incident';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_job_apply: {
        Args: {
          p_email: string;
          p_full_name: string;
          p_link?: string;
          p_note?: string;
          p_phone?: string;
          p_role_title: string;
          p_team?: string;
        };
        Returns: string;
      };
      rpc_legal_accept: {
        Args: {
          p_accepted_by_name?: string;
          p_document: Database['public']['Enums']['legal_document_key'];
          p_merchant_id?: string;
          p_rider_id?: string;
          p_version: string;
        };
        Returns: {
          accepted_at: string;
          accepted_by_name: string | null;
          created_at: string;
          document: Database['public']['Enums']['legal_document_key'];
          id: string;
          ip: unknown;
          merchant_id: string | null;
          rider_id: string | null;
          user_agent: string | null;
          user_id: string | null;
          version: string;
        };
        SetofOptions: {
          from: '*';
          to: 'legal_acceptance';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_mark_paid: {
        Args: { p_plan_id: string; p_reference: string };
        Returns: {
          answers: NonNullable<Json>;
          approved_at: string | null;
          budget_kes: number | null;
          cancel_reason: string | null;
          city_id: string;
          claimed_at: string | null;
          completed_at: string | null;
          concierge_fee_kes: number | null;
          concierge_id: string | null;
          created_at: string;
          curated_day_id: string | null;
          date: string | null;
          duration: string;
          end_date: string | null;
          estimate_total_kes: number | null;
          expires_at: string | null;
          first_reply_at: string | null;
          flags: NonNullable<Json>;
          guest_name: string | null;
          guest_phone: string | null;
          handover_note: string | null;
          id: string;
          moods: Database['public']['Enums']['mood'][];
          notes: string | null;
          paid_at: string | null;
          party_size: number;
          party_type: string;
          pay_on_day_total_kes: number | null;
          payment_reference: string | null;
          quote_total_kes: number | null;
          quoted_at: string | null;
          reference: string;
          review_requested_at: string | null;
          sent_at: string | null;
          share_token_hash: string | null;
          sla_first_reply_due_at: string | null;
          sla_quote_due_at: string | null;
          status: Database['public']['Enums']['plan_status'];
          stay_label: string | null;
          stay_point: unknown;
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'plan';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_merchant_apply: {
        Args: {
          p_category: Database['public']['Enums']['merchant_category'];
          p_category_other?: string;
          p_city_id: string;
          p_contact_email: string;
          p_contact_name: string;
          p_contact_phone: string;
          p_legal_name: string;
          p_trading_name: string;
        };
        Returns: string;
      };
      rpc_merchant_console_counts: { Args: { p_city_id?: string }; Returns: Json };
      rpc_merchant_control: {
        Args: {
          p_control: string;
          p_merchant_id: string;
          p_reason?: string;
          p_source?: Database['public']['Enums']['merchant_control_source'];
          p_value: Json;
        };
        Returns: {
          accepting_orders: boolean;
          accepting_orders_changed_at: string | null;
          accepting_orders_source: Database['public']['Enums']['merchant_control_source'] | null;
          acquisition_channel: Database['public']['Enums']['acquisition_channel'] | null;
          acquisition_source: string | null;
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          busy_mode_until: string | null;
          capacity_per_15min: number | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          closed_early_at: string | null;
          commission_pct: number | null;
          commission_tier: Database['public']['Enums']['commission_tier_code'];
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          delisted_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_delivery_pay_to_merchant: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
          health_band: Database['public']['Enums']['health_band'] | null;
          health_score: number | null;
          hours: Json | null;
          hours_pattern: string | null;
          id: string;
          landmark: string | null;
          late_night_until: string | null;
          legal_name: string | null;
          onboarding_call_at: string | null;
          onboarding_source: string | null;
          onboarding_step: number;
          order_channels: string[];
          packaging: string | null;
          parent_merchant_id: string | null;
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_hold: boolean;
          payout_hold_reason: string | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          referred_by_id: string | null;
          referred_by_type: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          trading_name: string;
          updated_at: string;
          waitlisted_at: string | null;
          went_live_at: string | null;
          went_live_by: string | null;
          when_busy: string;
        };
        SetofOptions: {
          from: '*';
          to: 'merchant';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_merchant_declare_fleet: {
        Args: { p_merchant_id: string; p_preference?: string; p_riders: Json };
        Returns: Json;
      };
      rpc_merchant_go_live: {
        Args: { p_merchant_id: string; p_reason?: string };
        Returns: {
          accepting_orders: boolean;
          accepting_orders_changed_at: string | null;
          accepting_orders_source: Database['public']['Enums']['merchant_control_source'] | null;
          acquisition_channel: Database['public']['Enums']['acquisition_channel'] | null;
          acquisition_source: string | null;
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          busy_mode_until: string | null;
          capacity_per_15min: number | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          closed_early_at: string | null;
          commission_pct: number | null;
          commission_tier: Database['public']['Enums']['commission_tier_code'];
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          delisted_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_delivery_pay_to_merchant: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
          health_band: Database['public']['Enums']['health_band'] | null;
          health_score: number | null;
          hours: Json | null;
          hours_pattern: string | null;
          id: string;
          landmark: string | null;
          late_night_until: string | null;
          legal_name: string | null;
          onboarding_call_at: string | null;
          onboarding_source: string | null;
          onboarding_step: number;
          order_channels: string[];
          packaging: string | null;
          parent_merchant_id: string | null;
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_hold: boolean;
          payout_hold_reason: string | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          referred_by_id: string | null;
          referred_by_type: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          trading_name: string;
          updated_at: string;
          waitlisted_at: string | null;
          went_live_at: string | null;
          went_live_by: string | null;
          when_busy: string;
        };
        SetofOptions: {
          from: '*';
          to: 'merchant';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_merchant_hours_override: {
        Args: {
          p_branch_id?: string;
          p_closed?: boolean;
          p_closes?: string;
          p_date: string;
          p_merchant_id: string;
          p_opens?: string;
          p_reason?: string;
          p_source?: Database['public']['Enums']['merchant_control_source'];
        };
        Returns: {
          branch_id: string | null;
          closed: boolean;
          closes: string | null;
          created_at: string;
          created_by: string | null;
          date: string;
          id: string;
          merchant_id: string;
          opens: string | null;
          reason: string | null;
          source: Database['public']['Enums']['merchant_control_source'];
        };
        SetofOptions: {
          from: '*';
          to: 'merchant_hours_override';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_merchant_payout_name_check: { Args: { p_merchant_id: string }; Returns: Json };
      rpc_merchant_request_phone_code: { Args: { p_merchant_id: string }; Returns: Json };
      rpc_merchant_request_suspension: {
        Args: { p_merchant_id: string; p_reason: string };
        Returns: {
          city_id: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          id: string;
          kind: Database['public']['Enums']['approval_kind'];
          payload: NonNullable<Json>;
          reason: string;
          requested_by: string;
          status: Database['public']['Enums']['approval_status'];
          target_id: string;
          target_type: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'approval_request';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_merchant_resume_claim: { Args: { p_token: string }; Returns: Json };
      rpc_merchant_resume_token: { Args: { p_merchant_id: string }; Returns: string };
      rpc_merchant_return_to_applicant: {
        Args: { p_merchant_id: string; p_reasons: Json };
        Returns: {
          accepting_orders: boolean;
          accepting_orders_changed_at: string | null;
          accepting_orders_source: Database['public']['Enums']['merchant_control_source'] | null;
          acquisition_channel: Database['public']['Enums']['acquisition_channel'] | null;
          acquisition_source: string | null;
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          busy_mode_until: string | null;
          capacity_per_15min: number | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          closed_early_at: string | null;
          commission_pct: number | null;
          commission_tier: Database['public']['Enums']['commission_tier_code'];
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          delisted_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_delivery_pay_to_merchant: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
          health_band: Database['public']['Enums']['health_band'] | null;
          health_score: number | null;
          hours: Json | null;
          hours_pattern: string | null;
          id: string;
          landmark: string | null;
          late_night_until: string | null;
          legal_name: string | null;
          onboarding_call_at: string | null;
          onboarding_source: string | null;
          onboarding_step: number;
          order_channels: string[];
          packaging: string | null;
          parent_merchant_id: string | null;
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_hold: boolean;
          payout_hold_reason: string | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          referred_by_id: string | null;
          referred_by_type: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          trading_name: string;
          updated_at: string;
          waitlisted_at: string | null;
          went_live_at: string | null;
          went_live_by: string | null;
          when_busy: string;
        };
        SetofOptions: {
          from: '*';
          to: 'merchant';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_merchant_review_save: {
        Args: { p_checklist: Json; p_notes?: string; p_review_id: string };
        Returns: {
          checklist: NonNullable<Json>;
          finished_at: string | null;
          id: string;
          merchant_id: string;
          notes: string | null;
          outcome: string | null;
          reviewer_id: string;
          started_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'merchant_review';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_merchant_review_start: {
        Args: { p_merchant_id: string };
        Returns: {
          checklist: NonNullable<Json>;
          finished_at: string | null;
          id: string;
          merchant_id: string;
          notes: string | null;
          outcome: string | null;
          reviewer_id: string;
          started_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'merchant_review';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_merchant_save_step: {
        Args: { p_merchant_id: string; p_patch?: Json; p_step: number };
        Returns: Json;
      };
      rpc_merchant_set_branches: {
        Args: { p_branches: Json; p_merchant_id: string };
        Returns: Json;
      };
      rpc_merchant_set_category: {
        Args: {
          p_answers?: Json;
          p_category: Database['public']['Enums']['merchant_category'];
          p_category_other?: string;
          p_merchant_id: string;
        };
        Returns: Json;
      };
      rpc_merchant_set_controls: {
        Args: {
          p_accepting_orders?: boolean;
          p_clear_cap?: boolean;
          p_concierge_pick?: boolean;
          p_explore_visible?: boolean;
          p_merchant_id: string;
          p_pay_on_delivery?: boolean;
          p_pay_on_delivery_cap_kes?: number;
          p_reason?: string;
        };
        Returns: {
          accepting_orders: boolean;
          accepting_orders_changed_at: string | null;
          accepting_orders_source: Database['public']['Enums']['merchant_control_source'] | null;
          acquisition_channel: Database['public']['Enums']['acquisition_channel'] | null;
          acquisition_source: string | null;
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          busy_mode_until: string | null;
          capacity_per_15min: number | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          closed_early_at: string | null;
          commission_pct: number | null;
          commission_tier: Database['public']['Enums']['commission_tier_code'];
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          delisted_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_delivery_pay_to_merchant: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
          health_band: Database['public']['Enums']['health_band'] | null;
          health_score: number | null;
          hours: Json | null;
          hours_pattern: string | null;
          id: string;
          landmark: string | null;
          late_night_until: string | null;
          legal_name: string | null;
          onboarding_call_at: string | null;
          onboarding_source: string | null;
          onboarding_step: number;
          order_channels: string[];
          packaging: string | null;
          parent_merchant_id: string | null;
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_hold: boolean;
          payout_hold_reason: string | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          referred_by_id: string | null;
          referred_by_type: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          trading_name: string;
          updated_at: string;
          waitlisted_at: string | null;
          went_live_at: string | null;
          went_live_by: string | null;
          when_busy: string;
        };
        SetofOptions: {
          from: '*';
          to: 'merchant';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_merchant_set_featured: {
        Args: { p_featured: boolean; p_merchant_id: string; p_reason?: string };
        Returns: {
          accepting_orders: boolean;
          accepting_orders_changed_at: string | null;
          accepting_orders_source: Database['public']['Enums']['merchant_control_source'] | null;
          acquisition_channel: Database['public']['Enums']['acquisition_channel'] | null;
          acquisition_source: string | null;
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          busy_mode_until: string | null;
          capacity_per_15min: number | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          closed_early_at: string | null;
          commission_pct: number | null;
          commission_tier: Database['public']['Enums']['commission_tier_code'];
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          delisted_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_delivery_pay_to_merchant: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
          health_band: Database['public']['Enums']['health_band'] | null;
          health_score: number | null;
          hours: Json | null;
          hours_pattern: string | null;
          id: string;
          landmark: string | null;
          late_night_until: string | null;
          legal_name: string | null;
          onboarding_call_at: string | null;
          onboarding_source: string | null;
          onboarding_step: number;
          order_channels: string[];
          packaging: string | null;
          parent_merchant_id: string | null;
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_hold: boolean;
          payout_hold_reason: string | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          referred_by_id: string | null;
          referred_by_type: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          trading_name: string;
          updated_at: string;
          waitlisted_at: string | null;
          went_live_at: string | null;
          went_live_by: string | null;
          when_busy: string;
        };
        SetofOptions: {
          from: '*';
          to: 'merchant';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_merchant_set_pause: {
        Args: { p_merchant_id: string; p_paused: boolean; p_reason?: string };
        Returns: {
          accepting_orders: boolean;
          accepting_orders_changed_at: string | null;
          accepting_orders_source: Database['public']['Enums']['merchant_control_source'] | null;
          acquisition_channel: Database['public']['Enums']['acquisition_channel'] | null;
          acquisition_source: string | null;
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          busy_mode_until: string | null;
          capacity_per_15min: number | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          closed_early_at: string | null;
          commission_pct: number | null;
          commission_tier: Database['public']['Enums']['commission_tier_code'];
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          delisted_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_delivery_pay_to_merchant: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
          health_band: Database['public']['Enums']['health_band'] | null;
          health_score: number | null;
          hours: Json | null;
          hours_pattern: string | null;
          id: string;
          landmark: string | null;
          late_night_until: string | null;
          legal_name: string | null;
          onboarding_call_at: string | null;
          onboarding_source: string | null;
          onboarding_step: number;
          order_channels: string[];
          packaging: string | null;
          parent_merchant_id: string | null;
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_hold: boolean;
          payout_hold_reason: string | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          referred_by_id: string | null;
          referred_by_type: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          trading_name: string;
          updated_at: string;
          waitlisted_at: string | null;
          went_live_at: string | null;
          went_live_by: string | null;
          when_busy: string;
        };
        SetofOptions: {
          from: '*';
          to: 'merchant';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_merchant_set_paused: {
        Args: { p_merchant_id: string; p_paused: boolean; p_reason?: string };
        Returns: {
          accepting_orders: boolean;
          accepting_orders_changed_at: string | null;
          accepting_orders_source: Database['public']['Enums']['merchant_control_source'] | null;
          acquisition_channel: Database['public']['Enums']['acquisition_channel'] | null;
          acquisition_source: string | null;
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          busy_mode_until: string | null;
          capacity_per_15min: number | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          closed_early_at: string | null;
          commission_pct: number | null;
          commission_tier: Database['public']['Enums']['commission_tier_code'];
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          delisted_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_delivery_pay_to_merchant: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
          health_band: Database['public']['Enums']['health_band'] | null;
          health_score: number | null;
          hours: Json | null;
          hours_pattern: string | null;
          id: string;
          landmark: string | null;
          late_night_until: string | null;
          legal_name: string | null;
          onboarding_call_at: string | null;
          onboarding_source: string | null;
          onboarding_step: number;
          order_channels: string[];
          packaging: string | null;
          parent_merchant_id: string | null;
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_hold: boolean;
          payout_hold_reason: string | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          referred_by_id: string | null;
          referred_by_type: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          trading_name: string;
          updated_at: string;
          waitlisted_at: string | null;
          went_live_at: string | null;
          went_live_by: string | null;
          when_busy: string;
        };
        SetofOptions: {
          from: '*';
          to: 'merchant';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_merchant_set_primary_branch: {
        Args: {
          p_address_text: string;
          p_latitude?: number;
          p_longitude?: number;
          p_merchant_id: string;
          p_name?: string;
        };
        Returns: string;
      };
      rpc_merchant_start: {
        Args: {
          p_contact_email?: string;
          p_contact_name: string;
          p_contact_phone: string;
          p_source?: string;
          p_source_url?: string;
          p_trading_name: string;
        };
        Returns: string;
      };
      rpc_merchant_submit: { Args: { p_merchant_id: string }; Returns: Json };
      rpc_merchant_two_person_approve: {
        Args: { p_request_id: string };
        Returns: {
          accepting_orders: boolean;
          accepting_orders_changed_at: string | null;
          accepting_orders_source: Database['public']['Enums']['merchant_control_source'] | null;
          acquisition_channel: Database['public']['Enums']['acquisition_channel'] | null;
          acquisition_source: string | null;
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          busy_mode_until: string | null;
          capacity_per_15min: number | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          closed_early_at: string | null;
          commission_pct: number | null;
          commission_tier: Database['public']['Enums']['commission_tier_code'];
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          delisted_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_delivery_pay_to_merchant: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
          health_band: Database['public']['Enums']['health_band'] | null;
          health_score: number | null;
          hours: Json | null;
          hours_pattern: string | null;
          id: string;
          landmark: string | null;
          late_night_until: string | null;
          legal_name: string | null;
          onboarding_call_at: string | null;
          onboarding_source: string | null;
          onboarding_step: number;
          order_channels: string[];
          packaging: string | null;
          parent_merchant_id: string | null;
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_hold: boolean;
          payout_hold_reason: string | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          referred_by_id: string | null;
          referred_by_type: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          trading_name: string;
          updated_at: string;
          waitlisted_at: string | null;
          went_live_at: string | null;
          went_live_by: string | null;
          when_busy: string;
        };
        SetofOptions: {
          from: '*';
          to: 'merchant';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_merchant_two_person_request: {
        Args: { p_kind: string; p_merchant_id: string; p_payload?: Json; p_reason: string };
        Returns: {
          city_id: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          id: string;
          kind: Database['public']['Enums']['approval_kind'];
          payload: NonNullable<Json>;
          reason: string;
          requested_by: string;
          status: Database['public']['Enums']['approval_status'];
          target_id: string;
          target_type: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'approval_request';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_merchant_verify_phone_code: {
        Args: { p_code: string; p_merchant_id: string };
        Returns: Json;
      };
      rpc_merchant_waitlist: {
        Args: { p_area?: string; p_lat: number; p_lng: number; p_merchant_id: string };
        Returns: Json;
      };
      rpc_note_locale: { Args: { p_locale: string }; Returns: undefined };
      rpc_notification_mark: {
        Args: {
          p_error?: string;
          p_notification_id: string;
          p_provider_message_id?: string;
          p_status: Database['public']['Enums']['notification_status'];
        };
        Returns: undefined;
      };
      rpc_partner_go_live: {
        Args: { p_partner_id: string };
        Returns: {
          can_answer_holds: boolean;
          city_id: string;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          created_at: string;
          id: string;
          kind: Database['public']['Enums']['experience_partner_kind'];
          merchant_id: string | null;
          name: string;
          portal_user_id: string | null;
          preferred_channel: string;
          response_time_median_min: number | null;
          settlement_account: Json | null;
          status: Database['public']['Enums']['partner_status'];
          terms: NonNullable<Json>;
          updated_at: string;
          went_live_at: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'experience_partner';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_plan_message: {
        Args: { p_body: string; p_plan_id: string };
        Returns: {
          attachments: NonNullable<Json>;
          author_id: string | null;
          author_type: Database['public']['Enums']['actor_type'];
          body: string;
          created_at: string;
          id: string;
          plan_id: string;
          read_at: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'plan_message';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_price_flag_resolve: {
        Args: { p_action: string; p_flag_id: string };
        Returns: {
          app_price_kes: number | null;
          catalogue_item_id: string;
          drift_pct: number | null;
          id: string;
          merchant_id: string;
          observed_at: string;
          observed_price_kes: number | null;
          observed_source: string;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database['public']['Enums']['price_flag_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'catalogue_price_flag';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_publish_curated_day: {
        Args: { p_day_id: string };
        Returns: {
          badge: string | null;
          city_id: string;
          cover_path: string | null;
          created_at: string;
          duration: string;
          featured: boolean;
          id: string;
          party_types: string[];
          price_per_person_kes: number | null;
          slug: string;
          sort: number;
          status: string;
          tagline: string | null;
          title: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'curated_day';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_publish_event: {
        Args: { p_event_id: string };
        Returns: {
          anchor_slot: Database['public']['Enums']['block_slot'];
          category: Database['public']['Enums']['event_category'];
          city_id: string;
          cover_path: string | null;
          created_at: string;
          doors_at: string | null;
          ends_at: string | null;
          featured: boolean;
          id: string;
          name: string;
          nexg_can_hold_tickets: boolean;
          organiser_name: string | null;
          organiser_url: string | null;
          practical_note: string | null;
          published_at: string | null;
          published_by: string | null;
          rejected_reason: string | null;
          reviewed_by: string | null;
          source: string;
          source_ref: string | null;
          starts_at: string;
          starts_on: string | null;
          status: Database['public']['Enums']['event_status'];
          submission_note: string | null;
          submitted_by_partner_id: string | null;
          suggested_blocks: NonNullable<Json>;
          ticket_bands: NonNullable<Json>;
          ticket_partner_id: string | null;
          ticket_url: string | null;
          updated_at: string;
          venue_address: string | null;
          venue_name: string | null;
          venue_point: unknown;
        };
        SetofOptions: {
          from: '*';
          to: 'event';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_quote_plan: {
        Args: { p_plan_id: string };
        Returns: {
          answers: NonNullable<Json>;
          approved_at: string | null;
          budget_kes: number | null;
          cancel_reason: string | null;
          city_id: string;
          claimed_at: string | null;
          completed_at: string | null;
          concierge_fee_kes: number | null;
          concierge_id: string | null;
          created_at: string;
          curated_day_id: string | null;
          date: string | null;
          duration: string;
          end_date: string | null;
          estimate_total_kes: number | null;
          expires_at: string | null;
          first_reply_at: string | null;
          flags: NonNullable<Json>;
          guest_name: string | null;
          guest_phone: string | null;
          handover_note: string | null;
          id: string;
          moods: Database['public']['Enums']['mood'][];
          notes: string | null;
          paid_at: string | null;
          party_size: number;
          party_type: string;
          pay_on_day_total_kes: number | null;
          payment_reference: string | null;
          quote_total_kes: number | null;
          quoted_at: string | null;
          reference: string;
          review_requested_at: string | null;
          sent_at: string | null;
          share_token_hash: string | null;
          sla_first_reply_due_at: string | null;
          sla_quote_due_at: string | null;
          status: Database['public']['Enums']['plan_status'];
          stay_label: string | null;
          stay_point: unknown;
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'plan';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_rate_card_publish: {
        Args: { p_card_id: string };
        Returns: {
          approved_by: string | null;
          base_per_trip_kes: number | null;
          cancellation_after_pickup_kes: number | null;
          city_id: string;
          created_at: string;
          effective_from: string;
          guest_tips_pass_through_pct: number;
          id: string;
          paid_waiting_per_5min_kes: number | null;
          peak_bonus_dinner_kes: number | null;
          peak_bonus_rain_kes: number | null;
          per_km_after_2km_kes: number | null;
          second_approver_id: string | null;
          second_pickup_bonus_kes: number | null;
          status: string;
          version: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rider_rate_card';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_reject_event_submission: {
        Args: { p_event_id: string; p_reason: string };
        Returns: {
          anchor_slot: Database['public']['Enums']['block_slot'];
          category: Database['public']['Enums']['event_category'];
          city_id: string;
          cover_path: string | null;
          created_at: string;
          doors_at: string | null;
          ends_at: string | null;
          featured: boolean;
          id: string;
          name: string;
          nexg_can_hold_tickets: boolean;
          organiser_name: string | null;
          organiser_url: string | null;
          practical_note: string | null;
          published_at: string | null;
          published_by: string | null;
          rejected_reason: string | null;
          reviewed_by: string | null;
          source: string;
          source_ref: string | null;
          starts_at: string;
          starts_on: string | null;
          status: Database['public']['Enums']['event_status'];
          submission_note: string | null;
          submitted_by_partner_id: string | null;
          suggested_blocks: NonNullable<Json>;
          ticket_bands: NonNullable<Json>;
          ticket_partner_id: string | null;
          ticket_url: string | null;
          updated_at: string;
          venue_address: string | null;
          venue_name: string | null;
          venue_point: unknown;
        };
        SetofOptions: {
          from: '*';
          to: 'event';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_remove_block: { Args: { p_block_id: string; p_note: string }; Returns: undefined };
      rpc_reply_review: {
        Args: { p_body: string; p_review_id: string };
        Returns: {
          area_snapshot: string | null;
          body: string;
          channel: string;
          checks: NonNullable<Json>;
          consent_display: Database['public']['Enums']['review_display'];
          consent_publish: boolean;
          created_at: string;
          day_title_snapshot: string | null;
          decided_at: string | null;
          decided_by: string | null;
          decision_reason: string | null;
          display_name_snapshot: string | null;
          id: string;
          plan_id: string;
          published_at: string | null;
          rating: number;
          received_at: string;
          reply_body: string | null;
          reply_sent_at: string | null;
          status: Database['public']['Enums']['review_status'];
          user_id: string | null;
          word_count: number;
        };
        SetofOptions: {
          from: '*';
          to: 'review';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_request_changes: {
        Args: { p_message: string; p_plan_id: string };
        Returns: {
          answers: NonNullable<Json>;
          approved_at: string | null;
          budget_kes: number | null;
          cancel_reason: string | null;
          city_id: string;
          claimed_at: string | null;
          completed_at: string | null;
          concierge_fee_kes: number | null;
          concierge_id: string | null;
          created_at: string;
          curated_day_id: string | null;
          date: string | null;
          duration: string;
          end_date: string | null;
          estimate_total_kes: number | null;
          expires_at: string | null;
          first_reply_at: string | null;
          flags: NonNullable<Json>;
          guest_name: string | null;
          guest_phone: string | null;
          handover_note: string | null;
          id: string;
          moods: Database['public']['Enums']['mood'][];
          notes: string | null;
          paid_at: string | null;
          party_size: number;
          party_type: string;
          pay_on_day_total_kes: number | null;
          payment_reference: string | null;
          quote_total_kes: number | null;
          quoted_at: string | null;
          reference: string;
          review_requested_at: string | null;
          sent_at: string | null;
          share_token_hash: string | null;
          sla_first_reply_due_at: string | null;
          sla_quote_due_at: string | null;
          status: Database['public']['Enums']['plan_status'];
          stay_label: string | null;
          stay_point: unknown;
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'plan';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_request_hold: {
        Args: { p_block_id: string; p_channel: string; p_message?: string };
        Returns: {
          channel: string;
          created_at: string;
          holds_until: string | null;
          id: string;
          message_sent: string | null;
          partner_id: string;
          plan_block_id: string;
          requested_by: string | null;
          responded_at: string | null;
          response_note: string | null;
          status: Database['public']['Enums']['hold_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'partner_hold';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_request_review: { Args: { p_plan_id: string }; Returns: string };
      rpc_rider_apply: {
        Args: {
          p_city_id: string;
          p_first_name: string;
          p_last_name: string;
          p_phone: string;
          p_plate_no?: string;
          p_vehicle: Database['public']['Enums']['vehicle_type'];
        };
        Returns: string;
      };
      rpc_rider_console_counts: { Args: Record<PropertyKey, never>; Returns: Json };
      rpc_rider_cooldown: {
        Args: { p_hours: number; p_reason: string; p_rider_id: string };
        Returns: {
          activated_at: string | null;
          activated_by: string | null;
          alcohol_eligible: boolean;
          areas: string[];
          background_check: NonNullable<Json>;
          bike_max_km: number | null;
          can_receive_offers: boolean;
          can_receive_offers_source: Database['public']['Enums']['rider_control_source'] | null;
          cash_cap: number | null;
          cash_ok: boolean;
          cash_on_hand: number;
          city_id: string | null;
          cooldown_reason: string | null;
          cooldown_until: string | null;
          created_at: string;
          current_order_reference: string | null;
          device_fingerprint: string | null;
          employer_merchant_id: string | null;
          face_photo_path: string | null;
          first_name: string;
          health_band: Database['public']['Enums']['rider_health_band'] | null;
          health_score: number | null;
          id: string;
          insurance: Database['public']['Enums']['insurance_type'] | null;
          kit_deposit_kes: number | null;
          kit_deposit_status: string | null;
          kit_has: string[];
          kit_issued_at: string | null;
          large_items_eligible: boolean;
          last_location: unknown;
          last_location_at: string | null;
          last_name: string | null;
          last_seen_at: string | null;
          notes: string | null;
          offboard_reason: string | null;
          offboarded_at: string | null;
          offers_paused_reason: string | null;
          onboarding_session_at: string | null;
          onboarding_slot_id: string | null;
          onboarding_step: number;
          owner_name: string | null;
          owner_phone: string | null;
          ownership: Database['public']['Enums']['vehicle_ownership'] | null;
          pay_on_delivery_eligible: boolean;
          payout_msisdn: string | null;
          payout_name_lookup: Json | null;
          phone: string;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          plate_no: string | null;
          presence: Database['public']['Enums']['rider_presence'];
          presence_changed_at: string | null;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          shifts: string[];
          source: string;
          staff_notes: string | null;
          status: Database['public']['Enums']['rider_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          top_decile: boolean;
          training: NonNullable<Json>;
          updated_at: string;
          user_id: string | null;
          vehicle: Database['public']['Enums']['vehicle_type'] | null;
          waitlisted_at: string | null;
          years_riding: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'rider';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_rider_cooldown_clear: {
        Args: { p_reason?: string; p_rider_id: string };
        Returns: {
          activated_at: string | null;
          activated_by: string | null;
          alcohol_eligible: boolean;
          areas: string[];
          background_check: NonNullable<Json>;
          bike_max_km: number | null;
          can_receive_offers: boolean;
          can_receive_offers_source: Database['public']['Enums']['rider_control_source'] | null;
          cash_cap: number | null;
          cash_ok: boolean;
          cash_on_hand: number;
          city_id: string | null;
          cooldown_reason: string | null;
          cooldown_until: string | null;
          created_at: string;
          current_order_reference: string | null;
          device_fingerprint: string | null;
          employer_merchant_id: string | null;
          face_photo_path: string | null;
          first_name: string;
          health_band: Database['public']['Enums']['rider_health_band'] | null;
          health_score: number | null;
          id: string;
          insurance: Database['public']['Enums']['insurance_type'] | null;
          kit_deposit_kes: number | null;
          kit_deposit_status: string | null;
          kit_has: string[];
          kit_issued_at: string | null;
          large_items_eligible: boolean;
          last_location: unknown;
          last_location_at: string | null;
          last_name: string | null;
          last_seen_at: string | null;
          notes: string | null;
          offboard_reason: string | null;
          offboarded_at: string | null;
          offers_paused_reason: string | null;
          onboarding_session_at: string | null;
          onboarding_slot_id: string | null;
          onboarding_step: number;
          owner_name: string | null;
          owner_phone: string | null;
          ownership: Database['public']['Enums']['vehicle_ownership'] | null;
          pay_on_delivery_eligible: boolean;
          payout_msisdn: string | null;
          payout_name_lookup: Json | null;
          phone: string;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          plate_no: string | null;
          presence: Database['public']['Enums']['rider_presence'];
          presence_changed_at: string | null;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          shifts: string[];
          source: string;
          staff_notes: string | null;
          status: Database['public']['Enums']['rider_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          top_decile: boolean;
          training: NonNullable<Json>;
          updated_at: string;
          user_id: string | null;
          vehicle: Database['public']['Enums']['vehicle_type'] | null;
          waitlisted_at: string | null;
          years_riding: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'rider';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_rider_issue_kit:
        | { Args: { p_rider_id: string }; Returns: string }
        | {
            Args: { p_deposit_kes?: number; p_rider_id: string };
            Returns: {
              activated_at: string | null;
              activated_by: string | null;
              alcohol_eligible: boolean;
              areas: string[];
              background_check: NonNullable<Json>;
              bike_max_km: number | null;
              can_receive_offers: boolean;
              can_receive_offers_source: Database['public']['Enums']['rider_control_source'] | null;
              cash_cap: number | null;
              cash_ok: boolean;
              cash_on_hand: number;
              city_id: string | null;
              cooldown_reason: string | null;
              cooldown_until: string | null;
              created_at: string;
              current_order_reference: string | null;
              device_fingerprint: string | null;
              employer_merchant_id: string | null;
              face_photo_path: string | null;
              first_name: string;
              health_band: Database['public']['Enums']['rider_health_band'] | null;
              health_score: number | null;
              id: string;
              insurance: Database['public']['Enums']['insurance_type'] | null;
              kit_deposit_kes: number | null;
              kit_deposit_status: string | null;
              kit_has: string[];
              kit_issued_at: string | null;
              large_items_eligible: boolean;
              last_location: unknown;
              last_location_at: string | null;
              last_name: string | null;
              last_seen_at: string | null;
              notes: string | null;
              offboard_reason: string | null;
              offboarded_at: string | null;
              offers_paused_reason: string | null;
              onboarding_session_at: string | null;
              onboarding_slot_id: string | null;
              onboarding_step: number;
              owner_name: string | null;
              owner_phone: string | null;
              ownership: Database['public']['Enums']['vehicle_ownership'] | null;
              pay_on_delivery_eligible: boolean;
              payout_msisdn: string | null;
              payout_name_lookup: Json | null;
              phone: string;
              phone_code_attempts: number;
              phone_code_expires_at: string | null;
              phone_code_hash: string | null;
              phone_verified_at: string | null;
              plate_no: string | null;
              presence: Database['public']['Enums']['rider_presence'];
              presence_changed_at: string | null;
              resume_token_expires_at: string | null;
              resume_token_hash: string | null;
              shifts: string[];
              source: string;
              staff_notes: string | null;
              status: Database['public']['Enums']['rider_status'];
              status_reason: string | null;
              strike_count: number;
              submitted_at: string | null;
              suspended_at: string | null;
              suspended_by: string | null;
              suspension_reason: string | null;
              suspension_second_approver: string | null;
              top_decile: boolean;
              training: NonNullable<Json>;
              updated_at: string;
              user_id: string | null;
              vehicle: Database['public']['Enums']['vehicle_type'] | null;
              waitlisted_at: string | null;
              years_riding: string | null;
            };
            SetofOptions: {
              from: '*';
              to: 'rider';
              isOneToOne: true;
              isSetofReturn: false;
            };
          };
      rpc_rider_live_location: { Args: { p_reason?: string; p_rider_id: string }; Returns: Json };
      rpc_rider_log_call: {
        Args: { p_note: string; p_rider_id: string };
        Returns: {
          actor_id: string | null;
          body: string;
          channel: string;
          created_at: string;
          direction: string;
          id: string;
          notification_id: string | null;
          read_at: string | null;
          rider_id: string;
          subject: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'rider_message';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_rider_message_send: {
        Args: { p_body: string; p_channel: string; p_rider_id: string; p_subject?: string };
        Returns: {
          actor_id: string | null;
          body: string;
          channel: string;
          created_at: string;
          direction: string;
          id: string;
          notification_id: string | null;
          read_at: string | null;
          rider_id: string;
          subject: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'rider_message';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_rider_payout_name_check: { Args: { p_rider_id: string }; Returns: Json };
      rpc_rider_reference_log: {
        Args: {
          p_name: string;
          p_notes?: string;
          p_outcome: string;
          p_phone: string;
          p_rider_id: string;
        };
        Returns: {
          called_at: string | null;
          called_by: string | null;
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          outcome: string | null;
          phone: string | null;
          relationship: string | null;
          rider_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rider_reference_check';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_rider_reinstate: {
        Args: { p_reason: string; p_rider_id: string };
        Returns: {
          activated_at: string | null;
          activated_by: string | null;
          alcohol_eligible: boolean;
          areas: string[];
          background_check: NonNullable<Json>;
          bike_max_km: number | null;
          can_receive_offers: boolean;
          can_receive_offers_source: Database['public']['Enums']['rider_control_source'] | null;
          cash_cap: number | null;
          cash_ok: boolean;
          cash_on_hand: number;
          city_id: string | null;
          cooldown_reason: string | null;
          cooldown_until: string | null;
          created_at: string;
          current_order_reference: string | null;
          device_fingerprint: string | null;
          employer_merchant_id: string | null;
          face_photo_path: string | null;
          first_name: string;
          health_band: Database['public']['Enums']['rider_health_band'] | null;
          health_score: number | null;
          id: string;
          insurance: Database['public']['Enums']['insurance_type'] | null;
          kit_deposit_kes: number | null;
          kit_deposit_status: string | null;
          kit_has: string[];
          kit_issued_at: string | null;
          large_items_eligible: boolean;
          last_location: unknown;
          last_location_at: string | null;
          last_name: string | null;
          last_seen_at: string | null;
          notes: string | null;
          offboard_reason: string | null;
          offboarded_at: string | null;
          offers_paused_reason: string | null;
          onboarding_session_at: string | null;
          onboarding_slot_id: string | null;
          onboarding_step: number;
          owner_name: string | null;
          owner_phone: string | null;
          ownership: Database['public']['Enums']['vehicle_ownership'] | null;
          pay_on_delivery_eligible: boolean;
          payout_msisdn: string | null;
          payout_name_lookup: Json | null;
          phone: string;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          plate_no: string | null;
          presence: Database['public']['Enums']['rider_presence'];
          presence_changed_at: string | null;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          shifts: string[];
          source: string;
          staff_notes: string | null;
          status: Database['public']['Enums']['rider_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          top_decile: boolean;
          training: NonNullable<Json>;
          updated_at: string;
          user_id: string | null;
          vehicle: Database['public']['Enums']['vehicle_type'] | null;
          waitlisted_at: string | null;
          years_riding: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'rider';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_rider_request_phone_code: { Args: { p_rider_id: string }; Returns: Json };
      rpc_rider_resume_claim: { Args: { p_token: string }; Returns: Json };
      rpc_rider_resume_token: { Args: { p_rider_id: string }; Returns: string };
      rpc_rider_save_step: {
        Args: { p_patch?: Json; p_rider_id: string; p_step: number };
        Returns: Json;
      };
      rpc_rider_set_control: {
        Args: {
          p_control: string;
          p_reason?: string;
          p_rider_id: string;
          p_source?: Database['public']['Enums']['rider_control_source'];
          p_value: Json;
        };
        Returns: {
          activated_at: string | null;
          activated_by: string | null;
          alcohol_eligible: boolean;
          areas: string[];
          background_check: NonNullable<Json>;
          bike_max_km: number | null;
          can_receive_offers: boolean;
          can_receive_offers_source: Database['public']['Enums']['rider_control_source'] | null;
          cash_cap: number | null;
          cash_ok: boolean;
          cash_on_hand: number;
          city_id: string | null;
          cooldown_reason: string | null;
          cooldown_until: string | null;
          created_at: string;
          current_order_reference: string | null;
          device_fingerprint: string | null;
          employer_merchant_id: string | null;
          face_photo_path: string | null;
          first_name: string;
          health_band: Database['public']['Enums']['rider_health_band'] | null;
          health_score: number | null;
          id: string;
          insurance: Database['public']['Enums']['insurance_type'] | null;
          kit_deposit_kes: number | null;
          kit_deposit_status: string | null;
          kit_has: string[];
          kit_issued_at: string | null;
          large_items_eligible: boolean;
          last_location: unknown;
          last_location_at: string | null;
          last_name: string | null;
          last_seen_at: string | null;
          notes: string | null;
          offboard_reason: string | null;
          offboarded_at: string | null;
          offers_paused_reason: string | null;
          onboarding_session_at: string | null;
          onboarding_slot_id: string | null;
          onboarding_step: number;
          owner_name: string | null;
          owner_phone: string | null;
          ownership: Database['public']['Enums']['vehicle_ownership'] | null;
          pay_on_delivery_eligible: boolean;
          payout_msisdn: string | null;
          payout_name_lookup: Json | null;
          phone: string;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          plate_no: string | null;
          presence: Database['public']['Enums']['rider_presence'];
          presence_changed_at: string | null;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          shifts: string[];
          source: string;
          staff_notes: string | null;
          status: Database['public']['Enums']['rider_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          top_decile: boolean;
          training: NonNullable<Json>;
          updated_at: string;
          user_id: string | null;
          vehicle: Database['public']['Enums']['vehicle_type'] | null;
          waitlisted_at: string | null;
          years_riding: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'rider';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_rider_set_presence: {
        Args: { p_presence: Database['public']['Enums']['rider_presence'] };
        Returns: Json;
      };
      rpc_rider_set_vehicle: {
        Args: { p_rider_id: string; p_vehicle: Database['public']['Enums']['vehicle_type'] };
        Returns: Json;
      };
      rpc_rider_start: {
        Args: { p_city_id?: string; p_first_name: string; p_fleet_token?: string; p_phone: string };
        Returns: string;
      };
      rpc_rider_strike: {
        Args: { p_level: number; p_reason: string; p_rider_id: string };
        Returns: {
          cleared_at: string | null;
          cleared_by: string | null;
          expires_at: string | null;
          id: string;
          issued_at: string;
          issued_by: string | null;
          level: number;
          reason: string;
          rider_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'rider_strike';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_rider_submit: { Args: { p_rider_id: string }; Returns: Json };
      rpc_rider_training_record: {
        Args: { p_module: string; p_passed: boolean; p_rider_id: string; p_score: number };
        Returns: {
          attempts: number;
          completed_at: string | null;
          module: string;
          passed: boolean;
          rider_id: string;
          score: number | null;
        };
        SetofOptions: {
          from: '*';
          to: 'rider_training';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_rider_two_person_approve: {
        Args: { p_request_id: string };
        Returns: {
          activated_at: string | null;
          activated_by: string | null;
          alcohol_eligible: boolean;
          areas: string[];
          background_check: NonNullable<Json>;
          bike_max_km: number | null;
          can_receive_offers: boolean;
          can_receive_offers_source: Database['public']['Enums']['rider_control_source'] | null;
          cash_cap: number | null;
          cash_ok: boolean;
          cash_on_hand: number;
          city_id: string | null;
          cooldown_reason: string | null;
          cooldown_until: string | null;
          created_at: string;
          current_order_reference: string | null;
          device_fingerprint: string | null;
          employer_merchant_id: string | null;
          face_photo_path: string | null;
          first_name: string;
          health_band: Database['public']['Enums']['rider_health_band'] | null;
          health_score: number | null;
          id: string;
          insurance: Database['public']['Enums']['insurance_type'] | null;
          kit_deposit_kes: number | null;
          kit_deposit_status: string | null;
          kit_has: string[];
          kit_issued_at: string | null;
          large_items_eligible: boolean;
          last_location: unknown;
          last_location_at: string | null;
          last_name: string | null;
          last_seen_at: string | null;
          notes: string | null;
          offboard_reason: string | null;
          offboarded_at: string | null;
          offers_paused_reason: string | null;
          onboarding_session_at: string | null;
          onboarding_slot_id: string | null;
          onboarding_step: number;
          owner_name: string | null;
          owner_phone: string | null;
          ownership: Database['public']['Enums']['vehicle_ownership'] | null;
          pay_on_delivery_eligible: boolean;
          payout_msisdn: string | null;
          payout_name_lookup: Json | null;
          phone: string;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          plate_no: string | null;
          presence: Database['public']['Enums']['rider_presence'];
          presence_changed_at: string | null;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          shifts: string[];
          source: string;
          staff_notes: string | null;
          status: Database['public']['Enums']['rider_status'];
          status_reason: string | null;
          strike_count: number;
          submitted_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspension_reason: string | null;
          suspension_second_approver: string | null;
          top_decile: boolean;
          training: NonNullable<Json>;
          updated_at: string;
          user_id: string | null;
          vehicle: Database['public']['Enums']['vehicle_type'] | null;
          waitlisted_at: string | null;
          years_riding: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'rider';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_rider_two_person_request: {
        Args: { p_kind: string; p_payload?: Json; p_reason: string; p_rider_id: string };
        Returns: {
          city_id: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          id: string;
          kind: Database['public']['Enums']['approval_kind'];
          payload: NonNullable<Json>;
          reason: string;
          requested_by: string;
          status: Database['public']['Enums']['approval_status'];
          target_id: string;
          target_type: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'approval_request';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_rider_verify_phone_code: { Args: { p_code: string; p_rider_id: string }; Returns: Json };
      rpc_rider_waitlist: { Args: { p_city_id: string; p_rider_id: string }; Returns: Json };
      rpc_role_grant_request: {
        Args: { p_reason: string; p_role: string; p_staff_id: string };
        Returns: {
          city_id: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_note: string | null;
          id: string;
          kind: Database['public']['Enums']['approval_kind'];
          payload: NonNullable<Json>;
          reason: string;
          requested_by: string;
          status: Database['public']['Enums']['approval_status'];
          target_id: string;
          target_type: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'approval_request';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_send_plan: {
        Args: { p_guest_name?: string; p_guest_phone?: string; p_plan_id: string };
        Returns: {
          answers: NonNullable<Json>;
          approved_at: string | null;
          budget_kes: number | null;
          cancel_reason: string | null;
          city_id: string;
          claimed_at: string | null;
          completed_at: string | null;
          concierge_fee_kes: number | null;
          concierge_id: string | null;
          created_at: string;
          curated_day_id: string | null;
          date: string | null;
          duration: string;
          end_date: string | null;
          estimate_total_kes: number | null;
          expires_at: string | null;
          first_reply_at: string | null;
          flags: NonNullable<Json>;
          guest_name: string | null;
          guest_phone: string | null;
          handover_note: string | null;
          id: string;
          moods: Database['public']['Enums']['mood'][];
          notes: string | null;
          paid_at: string | null;
          party_size: number;
          party_type: string;
          pay_on_day_total_kes: number | null;
          payment_reference: string | null;
          quote_total_kes: number | null;
          quoted_at: string | null;
          reference: string;
          review_requested_at: string | null;
          sent_at: string | null;
          share_token_hash: string | null;
          sla_first_reply_due_at: string | null;
          sla_quote_due_at: string | null;
          status: Database['public']['Enums']['plan_status'];
          stay_label: string | null;
          stay_point: unknown;
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'plan';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_settlement_approve: {
        Args: { p_run_id: string };
        Returns: {
          approved_by: string | null;
          b2c_file_path: string | null;
          city_id: string | null;
          created_at: string;
          id: string;
          period_end: string;
          period_start: string;
          provider_batch_ref: string | null;
          second_approver_id: string | null;
          status: string;
          total_cash_netted_kes: number;
          total_gross_kes: number;
          total_net_kes: number;
        };
        SetofOptions: {
          from: '*';
          to: 'rider_settlement_run';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_settlement_build: {
        Args: { p_city_id: string; p_period_end: string; p_period_start: string };
        Returns: {
          approved_by: string | null;
          b2c_file_path: string | null;
          city_id: string | null;
          created_at: string;
          id: string;
          period_end: string;
          period_start: string;
          provider_batch_ref: string | null;
          second_approver_id: string | null;
          status: string;
          total_cash_netted_kes: number;
          total_gross_kes: number;
          total_net_kes: number;
        };
        SetofOptions: {
          from: '*';
          to: 'rider_settlement_run';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_settlement_line_result: {
        Args: {
          p_failure_reason?: string;
          p_line_id: string;
          p_ok: boolean;
          p_provider_ref?: string;
        };
        Returns: {
          bonuses_kes: number;
          cash_collected_kes: number;
          cash_deposited_kes: number;
          cash_net_kes: number;
          earnings_kes: number;
          failure_reason: string | null;
          id: string;
          net_pay_kes: number;
          paid_at: string | null;
          paid_to_merchant_id: string | null;
          payout_msisdn: string | null;
          payout_name: string | null;
          provider_ref: string | null;
          retry_count: number;
          rider_id: string;
          run_id: string;
          status: Database['public']['Enums']['settlement_line_status'];
          tips_kes: number;
          trips: number;
        };
        SetofOptions: {
          from: '*';
          to: 'rider_settlement_line';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_shift_commit: {
        Args: { p_date: string; p_window: string; p_zone_id: string };
        Returns: {
          committed_at: string;
          date: string;
          id: string;
          rider_id: string;
          showed_at: string | null;
          status: Database['public']['Enums']['shift_commitment_status'];
          time_window: string;
          zone_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'shift_commitment';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_shift_release: {
        Args: { p_shift_id: string };
        Returns: {
          committed_at: string;
          date: string;
          id: string;
          rider_id: string;
          showed_at: string | null;
          status: Database['public']['Enums']['shift_commitment_status'];
          time_window: string;
          zone_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'shift_commitment';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_staff_directory: {
        Args: Record<PropertyKey, never>;
        Returns: {
          access_expires_at: string;
          active_sessions: number;
          all_cities: boolean;
          cities: string[];
          created_at: string;
          display_name: string;
          email: string;
          invited: boolean;
          last_sign_in_at: string;
          mfa_enrolled: boolean;
          primary_role: string;
          primary_role_label: string;
          role_labels: string[];
          roles: string[];
          staff_id: string;
          status: Database['public']['Enums']['staff_status'];
        }[];
      };
      rpc_staff_invite: {
        Args: { p_display_name: string; p_email: string; p_roles?: string[] };
        Returns: Json;
      };
      rpc_staff_set_roles: { Args: { p_roles: string[]; p_staff_id: string }; Returns: string[] };
      rpc_staff_set_scope: {
        Args: { p_city_id?: string; p_expires_at?: string; p_staff_id: string };
        Returns: number;
      };
      rpc_staff_set_status: {
        Args: {
          p_reason?: string;
          p_staff_id: string;
          p_status: Database['public']['Enums']['staff_status'];
        };
        Returns: Database['public']['Enums']['staff_status'];
      };
      rpc_staff_sign_out_everywhere: { Args: { p_staff_id: string }; Returns: number };
      rpc_submit_review: {
        Args: {
          p_body: string;
          p_consent_display?: Database['public']['Enums']['review_display'];
          p_consent_publish: boolean;
          p_rating: number;
          p_token: string;
        };
        Returns: string;
      };
      rpc_supply_action: {
        Args: { p_kind: string; p_params?: Json; p_zone_id: string };
        Returns: {
          applied_at: string;
          applied_by: string | null;
          expires_at: string | null;
          id: string;
          kind: string;
          params: NonNullable<Json>;
          result: Json | null;
          zone_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'supply_action';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_support_ticket_create: {
        Args: {
          p_body: string;
          p_email?: string;
          p_from_role?: Database['public']['Enums']['ticket_from'];
          p_full_name?: string;
          p_order_reference?: string;
          p_phone?: string;
          p_topic?: Database['public']['Enums']['ticket_topic'];
        };
        Returns: Json;
      };
      rpc_support_ticket_reply: {
        Args: { p_body: string; p_internal?: boolean; p_ticket_id: string };
        Returns: {
          assigned_to: string | null;
          body: string;
          channel: Database['public']['Enums']['ticket_channel'];
          city_id: string | null;
          created_at: string;
          email: string | null;
          first_reply_at: string | null;
          from_role: Database['public']['Enums']['ticket_from'];
          full_name: string | null;
          id: string;
          order_reference: string | null;
          phone: string | null;
          reference: string;
          resolved_at: string | null;
          status: Database['public']['Enums']['ticket_status'];
          topic: Database['public']['Enums']['ticket_topic'];
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'support_ticket';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_support_ticket_set_status: {
        Args: {
          p_assign_to_me?: boolean;
          p_status: Database['public']['Enums']['ticket_status'];
          p_ticket_id: string;
        };
        Returns: {
          assigned_to: string | null;
          body: string;
          channel: Database['public']['Enums']['ticket_channel'];
          city_id: string | null;
          created_at: string;
          email: string | null;
          first_reply_at: string | null;
          from_role: Database['public']['Enums']['ticket_from'];
          full_name: string | null;
          id: string;
          order_reference: string | null;
          phone: string | null;
          reference: string;
          resolved_at: string | null;
          status: Database['public']['Enums']['ticket_status'];
          topic: Database['public']['Enums']['ticket_topic'];
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'support_ticket';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      rpc_translations_put: { Args: { p_locale: string; p_rows: Json }; Returns: number };
      zone_for_point: {
        Args: { p_lat: number; p_lng: number };
        Returns: {
          city_id: string;
          cod_allowed: boolean;
          eta_max: number;
          eta_min: number;
          id: string;
          name: string;
          tier: Database['public']['Enums']['zone_tier'];
        }[];
      };
    };
    Enums: {
      acquisition_channel:
        | 'hotel_referral'
        | 'city_lead'
        | 'merchant_referral'
        | 'self_signup'
        | 'concierge_gap'
        | 'paid_social'
        | 'events';
      actor_type: 'staff' | 'merchant_user' | 'rider' | 'guest' | 'host_user' | 'system';
      approval_kind:
        | 'merchant_suspension'
        | 'staff_role_grant'
        | 'experience_refund'
        | 'merchant_delist'
        | 'commission_tier_change'
        | 'rider_suspension'
        | 'rider_offboard'
        | 'rider_cash_write_off'
        | 'rider_rate_card'
        | 'rider_settlement_run';
      approval_status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
      audit_severity: 'info' | 'notice' | 'high';
      block_kind: 'activity' | 'meal' | 'venue' | 'transport' | 'stay' | 'event' | 'free';
      block_slot: 'early' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night' | 'late';
      broadcast_status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
      cash_event_kind:
        | 'collected'
        | 'deposit'
        | 'netted'
        | 'write_off'
        | 'manual_adjustment'
        | 'recovery_payment';
      city_status: 'live' | 'soft_launch' | 'waitlist';
      commission_tier_code: 'T1' | 'T2' | 'T3';
      deposit_match_status: 'auto_matched' | 'manual_matched' | 'unmatched' | 'rejected';
      dispute_fault: 'merchant' | 'rider' | 'guest' | 'nexg' | 'unknown';
      dispute_resolution:
        | 'full_refund_charge_merchant'
        | 'partial_refund_charge_merchant'
        | 'credit_wallet'
        | 'no_refund'
        | 'chargeback';
      dispute_status: 'open' | 'awaiting_merchant' | 'resolved' | 'chargeback';
      document_owner_type: 'rider' | 'merchant' | 'experience_partner';
      document_status: 'uploaded' | 'verified' | 'rejected' | 'expired';
      edit_approval_status: 'pending' | 'approved' | 'rejected';
      event_category:
        | 'sport'
        | 'music'
        | 'food_drink'
        | 'culture'
        | 'family'
        | 'nightlife'
        | 'other';
      event_status: 'draft' | 'published' | 'sold_out' | 'cancelled' | 'ended';
      experience_partner_kind:
        | 'operator'
        | 'driver'
        | 'venue'
        | 'organiser'
        | 'host'
        | 'merchant_link';
      fleet_invite_status:
        | 'invited'
        | 'started'
        | 'under_review'
        | 'active'
        | 'declined'
        | 'expired';
      fraud_signal_kind:
        | 'gps_jump'
        | 'delivered_far_from_pin'
        | 'delivered_too_fast'
        | 'shared_device'
        | 'plate_photo_mismatch'
        | 'cash_marked_mpesa'
        | 'offer_farming';
      health_band: 'green' | 'amber' | 'red';
      hold_status: 'none' | 'requested' | 'held' | 'declined' | 'expired';
      incident_kind:
        | 'accident'
        | 'harassment'
        | 'theft'
        | 'guest_complaint'
        | 'rider_complaint'
        | 'police_stop'
        | 'breakdown'
        | 'sos'
        | 'other';
      incident_severity: 'minor' | 'major' | 'critical';
      incident_status: 'open' | 'investigating' | 'resolved' | 'closed';
      insurance_type: 'comprehensive' | 'third_party' | 'none';
      legal_document_key:
        | 'terms'
        | 'privacy'
        | 'cookies'
        | 'refunds'
        | 'merchant_terms'
        | 'rider_agreement';
      merchant_category:
        | 'restaurant'
        | 'bar_liquor'
        | 'laundry'
        | 'florist'
        | 'beauty_fashion'
        | 'pharmacy'
        | 'supermarket'
        | 'gift_shop'
        | 'other';
      merchant_control_source: 'merchant' | 'staff' | 'system';
      merchant_user_role: 'owner' | 'manager';
      mood: 'wild' | 'taste' | 'night' | 'slow' | 'stay' | 'events';
      notification_kind:
        | 'ticket_received'
        | 'ticket_resolved'
        | 'plan_received'
        | 'plan_first_reply'
        | 'plan_quoted'
        | 'plan_quote_expiring'
        | 'plan_quote_expired'
        | 'plan_changes_needed'
        | 'plan_approved'
        | 'plan_paid'
        | 'plan_driver_assigned'
        | 'plan_reminder_day_before'
        | 'plan_completed'
        | 'partner_hold_request'
        | 'desk_new_plan'
        | 'desk_sla_breach'
        | 'review_request'
        | 'review_reply'
        | 'event_submission_reviewed'
        | 'merchant_live'
        | 'merchant_returned'
        | 'merchant_paused'
        | 'merchant_resumed'
        | 'merchant_suspended'
        | 'open_now_reminder'
        | 'dispute_awaiting_reply'
        | 'dispute_outcome'
        | 'edit_approved'
        | 'edit_rejected'
        | 'price_align_request'
        | 'statement_ready'
        | 'payout_sent'
        | 'document_expiring'
        | 'document_expired_paused'
        | 'terms_updated'
        | 'health_warning_l1'
        | 'merchant_broadcast'
        | 'referral_bonus_paid'
        | 'rider_activated'
        | 'rider_returned'
        | 'rider_cooldown'
        | 'rider_cooldown_cleared'
        | 'rider_suspended'
        | 'rider_reinstated'
        | 'offers_paused_document'
        | 'offers_paused_over_cap'
        | 'deposit_reminder'
        | 'deposit_matched'
        | 'netting_warning'
        | 'netted_from_payout'
        | 'rider_payout_sent'
        | 'payout_failed_name_mismatch'
        | 'rate_card_changing'
        | 'zone_bonus_live'
        | 'rain_mode_on'
        | 'shift_reminder'
        | 'shift_open_broadcast'
        | 'rider_document_expiring'
        | 'agreement_updated'
        | 'rider_health_warning'
        | 'strike_issued'
        | 'incident_received'
        | 'incident_resolved'
        | 'sos_ack';
      notification_status: 'pending' | 'sent' | 'failed' | 'no_address';
      partner_status:
        | 'applied'
        | 'documents_pending'
        | 'under_review'
        | 'live'
        | 'paused'
        | 'suspended'
        | 'delisted';
      plan_block_status: 'proposed' | 'confirmed' | 'changed' | 'unavailable' | 'removed' | 'done';
      plan_status:
        | 'draft'
        | 'sent'
        | 'confirming'
        | 'quoted'
        | 'changes_requested'
        | 'approved'
        | 'paid'
        | 'in_progress'
        | 'completed'
        | 'cancelled'
        | 'expired';
      price_basis: 'per_person' | 'per_group' | 'per_vehicle' | 'per_night' | 'face_value';
      price_flag_status: 'open' | 'aligned' | 'dismissed';
      review_display: 'initial' | 'full_name' | 'anonymous';
      review_status: 'received' | 'approved' | 'kept_private';
      rider_control_source: 'rider' | 'staff' | 'system';
      rider_health_band: 'green' | 'amber' | 'red';
      rider_presence: 'offline' | 'online' | 'on_trip' | 'cooldown';
      rider_status:
        | 'applied'
        | 'documents_pending'
        | 'under_review'
        | 'active'
        | 'suspended'
        | 'offboarded';
      setting_scope: 'global' | 'city';
      settlement_line_status:
        | 'ready'
        | 'cash_netted'
        | 'name_mismatch'
        | 'held'
        | 'failed'
        | 'paid';
      shift_commitment_status: 'committed' | 'showed' | 'no_show' | 'released';
      staff_status: 'active' | 'suspended' | 'offboarded';
      statement_status: 'draft' | 'ready' | 'sent' | 'disputed' | 'paid';
      ticket_channel: 'web_form' | 'whatsapp' | 'phone' | 'email' | 'in_app';
      ticket_from: 'guest' | 'rider' | 'merchant' | 'hotel';
      ticket_status: 'open' | 'assigned' | 'answered' | 'resolved' | 'closed';
      ticket_topic:
        | 'order_problem'
        | 'payment_or_refund'
        | 'account'
        | 'concierge_request'
        | 'partner_rider'
        | 'partner_merchant'
        | 'hotel_partnership'
        | 'something_else';
      translation_engine: 'human' | 'machine';
      vehicle_ownership: 'own' | 'rented' | 'family';
      vehicle_type: 'motorbike' | 'bicycle' | 'car' | 'tuktuk';
      zone_tier: 'core' | 'extended' | 'trial';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      acquisition_channel: [
        'hotel_referral',
        'city_lead',
        'merchant_referral',
        'self_signup',
        'concierge_gap',
        'paid_social',
        'events',
      ],
      actor_type: ['staff', 'merchant_user', 'rider', 'guest', 'host_user', 'system'],
      approval_kind: [
        'merchant_suspension',
        'staff_role_grant',
        'experience_refund',
        'merchant_delist',
        'commission_tier_change',
        'rider_suspension',
        'rider_offboard',
        'rider_cash_write_off',
        'rider_rate_card',
        'rider_settlement_run',
      ],
      approval_status: ['pending', 'approved', 'rejected', 'withdrawn'],
      audit_severity: ['info', 'notice', 'high'],
      block_kind: ['activity', 'meal', 'venue', 'transport', 'stay', 'event', 'free'],
      block_slot: ['early', 'morning', 'midday', 'afternoon', 'evening', 'night', 'late'],
      broadcast_status: ['draft', 'scheduled', 'sending', 'sent', 'cancelled'],
      cash_event_kind: [
        'collected',
        'deposit',
        'netted',
        'write_off',
        'manual_adjustment',
        'recovery_payment',
      ],
      city_status: ['live', 'soft_launch', 'waitlist'],
      commission_tier_code: ['T1', 'T2', 'T3'],
      deposit_match_status: ['auto_matched', 'manual_matched', 'unmatched', 'rejected'],
      dispute_fault: ['merchant', 'rider', 'guest', 'nexg', 'unknown'],
      dispute_resolution: [
        'full_refund_charge_merchant',
        'partial_refund_charge_merchant',
        'credit_wallet',
        'no_refund',
        'chargeback',
      ],
      dispute_status: ['open', 'awaiting_merchant', 'resolved', 'chargeback'],
      document_owner_type: ['rider', 'merchant', 'experience_partner'],
      document_status: ['uploaded', 'verified', 'rejected', 'expired'],
      edit_approval_status: ['pending', 'approved', 'rejected'],
      event_category: ['sport', 'music', 'food_drink', 'culture', 'family', 'nightlife', 'other'],
      event_status: ['draft', 'published', 'sold_out', 'cancelled', 'ended'],
      experience_partner_kind: [
        'operator',
        'driver',
        'venue',
        'organiser',
        'host',
        'merchant_link',
      ],
      fleet_invite_status: ['invited', 'started', 'under_review', 'active', 'declined', 'expired'],
      fraud_signal_kind: [
        'gps_jump',
        'delivered_far_from_pin',
        'delivered_too_fast',
        'shared_device',
        'plate_photo_mismatch',
        'cash_marked_mpesa',
        'offer_farming',
      ],
      health_band: ['green', 'amber', 'red'],
      hold_status: ['none', 'requested', 'held', 'declined', 'expired'],
      incident_kind: [
        'accident',
        'harassment',
        'theft',
        'guest_complaint',
        'rider_complaint',
        'police_stop',
        'breakdown',
        'sos',
        'other',
      ],
      incident_severity: ['minor', 'major', 'critical'],
      incident_status: ['open', 'investigating', 'resolved', 'closed'],
      insurance_type: ['comprehensive', 'third_party', 'none'],
      legal_document_key: [
        'terms',
        'privacy',
        'cookies',
        'refunds',
        'merchant_terms',
        'rider_agreement',
      ],
      merchant_category: [
        'restaurant',
        'bar_liquor',
        'laundry',
        'florist',
        'beauty_fashion',
        'pharmacy',
        'supermarket',
        'gift_shop',
        'other',
      ],
      merchant_control_source: ['merchant', 'staff', 'system'],
      merchant_user_role: ['owner', 'manager'],
      mood: ['wild', 'taste', 'night', 'slow', 'stay', 'events'],
      notification_kind: [
        'ticket_received',
        'ticket_resolved',
        'plan_received',
        'plan_first_reply',
        'plan_quoted',
        'plan_quote_expiring',
        'plan_quote_expired',
        'plan_changes_needed',
        'plan_approved',
        'plan_paid',
        'plan_driver_assigned',
        'plan_reminder_day_before',
        'plan_completed',
        'partner_hold_request',
        'desk_new_plan',
        'desk_sla_breach',
        'review_request',
        'review_reply',
        'event_submission_reviewed',
        'merchant_live',
        'merchant_returned',
        'merchant_paused',
        'merchant_resumed',
        'merchant_suspended',
        'open_now_reminder',
        'dispute_awaiting_reply',
        'dispute_outcome',
        'edit_approved',
        'edit_rejected',
        'price_align_request',
        'statement_ready',
        'payout_sent',
        'document_expiring',
        'document_expired_paused',
        'terms_updated',
        'health_warning_l1',
        'merchant_broadcast',
        'referral_bonus_paid',
        'rider_activated',
        'rider_returned',
        'rider_cooldown',
        'rider_cooldown_cleared',
        'rider_suspended',
        'rider_reinstated',
        'offers_paused_document',
        'offers_paused_over_cap',
        'deposit_reminder',
        'deposit_matched',
        'netting_warning',
        'netted_from_payout',
        'rider_payout_sent',
        'payout_failed_name_mismatch',
        'rate_card_changing',
        'zone_bonus_live',
        'rain_mode_on',
        'shift_reminder',
        'shift_open_broadcast',
        'rider_document_expiring',
        'agreement_updated',
        'rider_health_warning',
        'strike_issued',
        'incident_received',
        'incident_resolved',
        'sos_ack',
      ],
      notification_status: ['pending', 'sent', 'failed', 'no_address'],
      partner_status: [
        'applied',
        'documents_pending',
        'under_review',
        'live',
        'paused',
        'suspended',
        'delisted',
      ],
      plan_block_status: ['proposed', 'confirmed', 'changed', 'unavailable', 'removed', 'done'],
      plan_status: [
        'draft',
        'sent',
        'confirming',
        'quoted',
        'changes_requested',
        'approved',
        'paid',
        'in_progress',
        'completed',
        'cancelled',
        'expired',
      ],
      price_basis: ['per_person', 'per_group', 'per_vehicle', 'per_night', 'face_value'],
      price_flag_status: ['open', 'aligned', 'dismissed'],
      review_display: ['initial', 'full_name', 'anonymous'],
      review_status: ['received', 'approved', 'kept_private'],
      rider_control_source: ['rider', 'staff', 'system'],
      rider_health_band: ['green', 'amber', 'red'],
      rider_presence: ['offline', 'online', 'on_trip', 'cooldown'],
      rider_status: [
        'applied',
        'documents_pending',
        'under_review',
        'active',
        'suspended',
        'offboarded',
      ],
      setting_scope: ['global', 'city'],
      settlement_line_status: ['ready', 'cash_netted', 'name_mismatch', 'held', 'failed', 'paid'],
      shift_commitment_status: ['committed', 'showed', 'no_show', 'released'],
      staff_status: ['active', 'suspended', 'offboarded'],
      statement_status: ['draft', 'ready', 'sent', 'disputed', 'paid'],
      ticket_channel: ['web_form', 'whatsapp', 'phone', 'email', 'in_app'],
      ticket_from: ['guest', 'rider', 'merchant', 'hotel'],
      ticket_status: ['open', 'assigned', 'answered', 'resolved', 'closed'],
      ticket_topic: [
        'order_problem',
        'payment_or_refund',
        'account',
        'concierge_request',
        'partner_rider',
        'partner_merchant',
        'hotel_partnership',
        'something_else',
      ],
      translation_engine: ['human', 'machine'],
      vehicle_ownership: ['own', 'rented', 'family'],
      vehicle_type: ['motorbike', 'bicycle', 'car', 'tuktuk'],
      zone_tier: ['core', 'extended', 'trial'],
    },
  },
} as const;
