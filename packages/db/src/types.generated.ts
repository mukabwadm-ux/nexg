export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  audit: {
    Tables: {
      audit_event: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_role: string | null;
          actor_type: Database['public']['Enums']['actor_type'];
          after: Json | null;
          approved_by: string | null;
          at: string;
          before: Json | null;
          city_id: string | null;
          hash: string;
          id: number;
          ip: unknown;
          module: string;
          prev_hash: string | null;
          reason: string | null;
          session_id: string | null;
          severity: Database['public']['Enums']['audit_severity'];
          target_id: string | null;
          target_type: string | null;
          user_agent: string | null;
          canonical: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_role?: string | null;
          actor_type: Database['public']['Enums']['actor_type'];
          after?: Json | null;
          approved_by?: string | null;
          at?: string;
          before?: Json | null;
          city_id?: string | null;
          hash: string;
          id?: never;
          ip?: unknown;
          module: string;
          prev_hash?: string | null;
          reason?: string | null;
          session_id?: string | null;
          severity?: Database['public']['Enums']['audit_severity'];
          target_id?: string | null;
          target_type?: string | null;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_role?: string | null;
          actor_type?: Database['public']['Enums']['actor_type'];
          after?: Json | null;
          approved_by?: string | null;
          at?: string;
          before?: Json | null;
          city_id?: string | null;
          hash?: string;
          id?: never;
          ip?: unknown;
          module?: string;
          prev_hash?: string | null;
          reason?: string | null;
          session_id?: string | null;
          severity?: Database['public']['Enums']['audit_severity'];
          target_id?: string | null;
          target_type?: string | null;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      chain_check: {
        Row: {
          detail: string | null;
          events_checked: number;
          first_bad_id: number | null;
          id: number;
          ok: boolean;
          ran_at: string;
        };
        Insert: {
          detail?: string | null;
          events_checked: number;
          first_bad_id?: number | null;
          id?: never;
          ok: boolean;
          ran_at?: string;
        };
        Update: {
          detail?: string | null;
          events_checked?: number;
          first_bad_id?: number | null;
          id?: never;
          ok?: boolean;
          ran_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      canonical: {
        Args: { e: Database['audit']['Tables']['audit_event']['Row'] };
        Returns: string;
      };
      log: {
        Args: {
          p_action: string;
          p_actor_id?: string;
          p_actor_role?: string;
          p_actor_type: Database['public']['Enums']['actor_type'];
          p_after?: Json;
          p_approved_by?: string;
          p_before?: Json;
          p_city_id?: string;
          p_module: string;
          p_reason?: string;
          p_severity?: Database['public']['Enums']['audit_severity'];
          p_target_id?: string;
          p_target_type?: string;
        };
        Returns: number;
      };
      run_chain_check: { Args: Record<PropertyKey, never>; Returns: undefined };
      verify_chain: {
        Args: Record<PropertyKey, never>;
        Returns: {
          detail: string;
          events_checked: number;
          first_bad_id: number;
          ok: boolean;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      city: {
        Row: {
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
      document: {
        Row: {
          created_at: string;
          expires_at: string | null;
          id: string;
          issued_at: string | null;
          mime: string;
          owner_id: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          rejection_reason: string | null;
          requirement_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
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
          owner_id: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          rejection_reason?: string | null;
          requirement_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
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
          owner_id?: string;
          owner_type?: Database['public']['Enums']['document_owner_type'];
          rejection_reason?: string | null;
          requirement_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
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
      document_requirement: {
        Row: {
          applies_when: NonNullable<Json>;
          created_at: string;
          has_expiry: boolean;
          help_text: string | null;
          id: string;
          kind: string;
          label: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          required: boolean;
          sort: number;
          updated_at: string;
        };
        Insert: {
          applies_when?: NonNullable<Json>;
          created_at?: string;
          has_expiry?: boolean;
          help_text?: string | null;
          id?: string;
          kind: string;
          label: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          required?: boolean;
          sort?: number;
          updated_at?: string;
        };
        Update: {
          applies_when?: NonNullable<Json>;
          created_at?: string;
          has_expiry?: boolean;
          help_text?: string | null;
          id?: string;
          kind?: string;
          label?: string;
          owner_type?: Database['public']['Enums']['document_owner_type'];
          required?: boolean;
          sort?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      merchant: {
        Row: {
          category: Database['public']['Enums']['merchant_category'];
          category_other: string | null;
          city_id: string;
          contact_email: string;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          featured: boolean;
          id: string;
          legal_name: string;
          settlement_account: Json | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          trading_name: string;
          updated_at: string;
          went_live_at: string | null;
          went_live_by: string | null;
        };
        Insert: {
          category: Database['public']['Enums']['merchant_category'];
          category_other?: string | null;
          city_id: string;
          contact_email: string;
          contact_name: string;
          contact_phone: string;
          cover_photo_path?: string | null;
          created_at?: string;
          featured?: boolean;
          id?: string;
          legal_name: string;
          settlement_account?: Json | null;
          status?: Database['public']['Enums']['partner_status'];
          status_reason?: string | null;
          trading_name: string;
          updated_at?: string;
          went_live_at?: string | null;
          went_live_by?: string | null;
        };
        Update: {
          category?: Database['public']['Enums']['merchant_category'];
          category_other?: string | null;
          city_id?: string;
          contact_email?: string;
          contact_name?: string;
          contact_phone?: string;
          cover_photo_path?: string | null;
          created_at?: string;
          featured?: boolean;
          id?: string;
          legal_name?: string;
          settlement_account?: Json | null;
          status?: Database['public']['Enums']['partner_status'];
          status_reason?: string | null;
          trading_name?: string;
          updated_at?: string;
          went_live_at?: string | null;
          went_live_by?: string | null;
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
          address_text: string;
          created_at: string;
          id: string;
          is_primary: boolean;
          latitude: number | null;
          longitude: number | null;
          merchant_id: string;
          name: string;
          updated_at: string;
          zone_id: string | null;
        };
        Insert: {
          address_text: string;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          merchant_id: string;
          name: string;
          updated_at?: string;
          zone_id?: string | null;
        };
        Update: {
          address_text?: string;
          created_at?: string;
          id?: string;
          is_primary?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          merchant_id?: string;
          name?: string;
          updated_at?: string;
          zone_id?: string | null;
        };
        Relationships: [
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
            referencedRelation: 'merchant_public';
            referencedColumns: ['id'];
          },
        ];
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
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
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
      rider: {
        Row: {
          activated_at: string | null;
          activated_by: string | null;
          city_id: string;
          created_at: string;
          first_name: string;
          id: string;
          kit_issued: boolean;
          last_name: string;
          onboarding_session_at: string | null;
          phone: string;
          plate_no: string | null;
          status: Database['public']['Enums']['rider_status'];
          status_reason: string | null;
          updated_at: string;
          user_id: string | null;
          vehicle: Database['public']['Enums']['vehicle_type'];
        };
        Insert: {
          activated_at?: string | null;
          activated_by?: string | null;
          city_id: string;
          created_at?: string;
          first_name: string;
          id?: string;
          kit_issued?: boolean;
          last_name: string;
          onboarding_session_at?: string | null;
          phone: string;
          plate_no?: string | null;
          status?: Database['public']['Enums']['rider_status'];
          status_reason?: string | null;
          updated_at?: string;
          user_id?: string | null;
          vehicle: Database['public']['Enums']['vehicle_type'];
        };
        Update: {
          activated_at?: string | null;
          activated_by?: string | null;
          city_id?: string;
          created_at?: string;
          first_name?: string;
          id?: string;
          kit_issued?: boolean;
          last_name?: string;
          onboarding_session_at?: string | null;
          phone?: string;
          plate_no?: string | null;
          status?: Database['public']['Enums']['rider_status'];
          status_reason?: string | null;
          updated_at?: string;
          user_id?: string | null;
          vehicle?: Database['public']['Enums']['vehicle_type'];
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
        ];
      };
      role: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          key: string;
          label: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          key: string;
          label: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          key?: string;
          label?: string;
          updated_at?: string;
        };
        Relationships: [];
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
    };
    Views: {
      merchant_public: {
        Row: {
          branch_address: string | null;
          branch_latitude: number | null;
          branch_longitude: number | null;
          branch_name: string | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_name: string | null;
          city_slug: string | null;
          cover_photo_path: string | null;
          featured: boolean | null;
          id: string | null;
          trading_name: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      fn_expire_documents: { Args: Record<PropertyKey, never>; Returns: number };
      fn_merchant_required_docs: {
        Args: { p_merchant_id: string };
        Returns: {
          applies_when: NonNullable<Json>;
          created_at: string;
          has_expiry: boolean;
          help_text: string | null;
          id: string;
          kind: string;
          label: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          required: boolean;
          sort: number;
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'document_requirement';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      fn_partner_recompute_status: {
        Args: {
          p_owner_id: string;
          p_owner_type: Database['public']['Enums']['document_owner_type'];
        };
        Returns: string;
      };
      fn_rider_required_docs: {
        Args: { p_rider_id: string };
        Returns: {
          applies_when: NonNullable<Json>;
          created_at: string;
          has_expiry: boolean;
          help_text: string | null;
          id: string;
          kind: string;
          label: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          required: boolean;
          sort: number;
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'document_requirement';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      rpc_activate_rider: {
        Args: { p_reason?: string; p_rider_id: string };
        Returns: {
          activated_at: string | null;
          activated_by: string | null;
          city_id: string;
          created_at: string;
          first_name: string;
          id: string;
          kit_issued: boolean;
          last_name: string;
          onboarding_session_at: string | null;
          phone: string;
          plate_no: string | null;
          status: Database['public']['Enums']['rider_status'];
          status_reason: string | null;
          updated_at: string;
          user_id: string | null;
          vehicle: Database['public']['Enums']['vehicle_type'];
        };
        SetofOptions: {
          from: '*';
          to: 'rider';
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
          owner_id: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          rejection_reason: string | null;
          requirement_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
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
      rpc_document_submit: {
        Args: {
          p_expires_at?: string;
          p_issued_at?: string;
          p_mime: string;
          p_owner_id: string;
          p_owner_type: Database['public']['Enums']['document_owner_type'];
          p_requirement_kind: string;
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
          owner_id: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          rejection_reason: string | null;
          requirement_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
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
      rpc_merchant_go_live: {
        Args: { p_merchant_id: string; p_reason?: string };
        Returns: {
          category: Database['public']['Enums']['merchant_category'];
          category_other: string | null;
          city_id: string;
          contact_email: string;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          featured: boolean;
          id: string;
          legal_name: string;
          settlement_account: Json | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          trading_name: string;
          updated_at: string;
          went_live_at: string | null;
          went_live_by: string | null;
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
    };
    Enums: {
      actor_type: 'staff' | 'merchant_user' | 'rider' | 'guest' | 'host_user' | 'system';
      audit_severity: 'info' | 'notice' | 'high';
      city_status: 'live' | 'soft_launch' | 'waitlist';
      document_owner_type: 'rider' | 'merchant';
      document_status: 'uploaded' | 'verified' | 'rejected' | 'expired';
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
      merchant_user_role: 'owner' | 'manager';
      partner_status:
        | 'applied'
        | 'documents_pending'
        | 'under_review'
        | 'live'
        | 'paused'
        | 'delisted';
      rider_status:
        | 'applied'
        | 'documents_pending'
        | 'under_review'
        | 'active'
        | 'suspended'
        | 'offboarded';
      setting_scope: 'global' | 'city';
      staff_status: 'active' | 'suspended' | 'offboarded';
      vehicle_type: 'motorbike' | 'bicycle' | 'car' | 'tuktuk';
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
  audit: {
    Enums: {},
  },
  public: {
    Enums: {
      actor_type: ['staff', 'merchant_user', 'rider', 'guest', 'host_user', 'system'],
      audit_severity: ['info', 'notice', 'high'],
      city_status: ['live', 'soft_launch', 'waitlist'],
      document_owner_type: ['rider', 'merchant'],
      document_status: ['uploaded', 'verified', 'rejected', 'expired'],
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
      merchant_user_role: ['owner', 'manager'],
      partner_status: [
        'applied',
        'documents_pending',
        'under_review',
        'live',
        'paused',
        'delisted',
      ],
      rider_status: [
        'applied',
        'documents_pending',
        'under_review',
        'active',
        'suspended',
        'offboarded',
      ],
      setting_scope: ['global', 'city'],
      staff_status: ['active', 'suspended', 'offboarded'],
      vehicle_type: ['motorbike', 'bicycle', 'car', 'tuktuk'],
    },
  },
} as const;
