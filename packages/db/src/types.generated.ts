export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
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
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
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
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
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
          key: string;
          label: string;
          section: string;
          sort: number;
        };
        Insert: {
          href?: string | null;
          key: string;
          label: string;
          section: string;
          sort: number;
        };
        Update: {
          href?: string | null;
          key?: string;
          label?: string;
          section?: string;
          sort?: number;
        };
        Relationships: [];
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
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
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
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
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
            referencedRelation: 'rider';
            referencedColumns: ['id'];
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
      merchant: {
        Row: {
          accepting_orders: boolean;
          accepting_orders_changed_at: string | null;
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
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
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          submitted_at: string | null;
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
          answers?: NonNullable<Json>;
          branch_count_band?: string | null;
          category?: Database['public']['Enums']['merchant_category'] | null;
          category_other?: string | null;
          city_id?: string | null;
          concierge_pick?: boolean;
          contact_email?: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path?: string | null;
          created_at?: string;
          credentials_sent_at?: string | null;
          explore_visible?: boolean;
          featured?: boolean;
          fleet_dispatch_preference?: string;
          has_own_riders?: boolean;
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
          password_set_at?: string | null;
          pay_on_delivery?: boolean;
          pay_on_delivery_cap_kes?: number | null;
          payout_account?: Json | null;
          payout_name_lookup?: Json | null;
          payout_rail?: string | null;
          phone_code_attempts?: number;
          phone_code_expires_at?: string | null;
          phone_code_hash?: string | null;
          phone_verified_at?: string | null;
          pickup_instructions?: string | null;
          prep_minutes?: number;
          price_band?: string | null;
          requires_ops_mapping?: boolean;
          resume_token_expires_at?: string | null;
          resume_token_hash?: string | null;
          rider_parking?: string | null;
          settlement_account?: Json | null;
          source_url?: string | null;
          status?: Database['public']['Enums']['partner_status'];
          status_reason?: string | null;
          submitted_at?: string | null;
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
          answers?: NonNullable<Json>;
          branch_count_band?: string | null;
          category?: Database['public']['Enums']['merchant_category'] | null;
          category_other?: string | null;
          city_id?: string | null;
          concierge_pick?: boolean;
          contact_email?: string | null;
          contact_name?: string;
          contact_phone?: string;
          cover_photo_path?: string | null;
          created_at?: string;
          credentials_sent_at?: string | null;
          explore_visible?: boolean;
          featured?: boolean;
          fleet_dispatch_preference?: string;
          has_own_riders?: boolean;
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
          password_set_at?: string | null;
          pay_on_delivery?: boolean;
          pay_on_delivery_cap_kes?: number | null;
          payout_account?: Json | null;
          payout_name_lookup?: Json | null;
          payout_rail?: string | null;
          phone_code_attempts?: number;
          phone_code_expires_at?: string | null;
          phone_code_hash?: string | null;
          phone_verified_at?: string | null;
          pickup_instructions?: string | null;
          prep_minutes?: number;
          price_band?: string | null;
          requires_ops_mapping?: boolean;
          resume_token_expires_at?: string | null;
          resume_token_hash?: string | null;
          rider_parking?: string | null;
          settlement_account?: Json | null;
          source_url?: string | null;
          status?: Database['public']['Enums']['partner_status'];
          status_reason?: string | null;
          submitted_at?: string | null;
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
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
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
            referencedRelation: 'rider';
            referencedColumns: ['id'];
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
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
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
      notification: {
        Row: {
          attempts: number;
          created_at: string;
          error: string | null;
          id: string;
          kind: Database['public']['Enums']['notification_kind'];
          plan_id: string | null;
          provider_message_id: string | null;
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
          plan_id?: string | null;
          provider_message_id?: string | null;
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
          plan_id?: string | null;
          provider_message_id?: string | null;
          sent_at?: string;
          status?: Database['public']['Enums']['notification_status'];
          ticket_id?: string | null;
          to_email?: string | null;
          to_phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plan';
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
            referencedRelation: 'rider';
            referencedColumns: ['id'];
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
          areas: string[];
          bike_max_km: number | null;
          cash_cap: number | null;
          cash_ok: boolean;
          city_id: string | null;
          created_at: string;
          employer_merchant_id: string | null;
          face_photo_path: string | null;
          first_name: string;
          id: string;
          insurance: Database['public']['Enums']['insurance_type'] | null;
          kit_has: string[];
          kit_issued_at: string | null;
          last_name: string | null;
          notes: string | null;
          onboarding_session_at: string | null;
          onboarding_slot_id: string | null;
          onboarding_step: number;
          owner_name: string | null;
          owner_phone: string | null;
          ownership: Database['public']['Enums']['vehicle_ownership'] | null;
          payout_msisdn: string | null;
          payout_name_lookup: Json | null;
          phone: string;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          plate_no: string | null;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          shifts: string[];
          source: string;
          status: Database['public']['Enums']['rider_status'];
          status_reason: string | null;
          submitted_at: string | null;
          updated_at: string;
          user_id: string | null;
          vehicle: Database['public']['Enums']['vehicle_type'] | null;
          waitlisted_at: string | null;
          years_riding: string | null;
        };
        Insert: {
          activated_at?: string | null;
          activated_by?: string | null;
          areas?: string[];
          bike_max_km?: number | null;
          cash_cap?: number | null;
          cash_ok?: boolean;
          city_id?: string | null;
          created_at?: string;
          employer_merchant_id?: string | null;
          face_photo_path?: string | null;
          first_name: string;
          id?: string;
          insurance?: Database['public']['Enums']['insurance_type'] | null;
          kit_has?: string[];
          kit_issued_at?: string | null;
          last_name?: string | null;
          notes?: string | null;
          onboarding_session_at?: string | null;
          onboarding_slot_id?: string | null;
          onboarding_step?: number;
          owner_name?: string | null;
          owner_phone?: string | null;
          ownership?: Database['public']['Enums']['vehicle_ownership'] | null;
          payout_msisdn?: string | null;
          payout_name_lookup?: Json | null;
          phone: string;
          phone_code_attempts?: number;
          phone_code_expires_at?: string | null;
          phone_code_hash?: string | null;
          phone_verified_at?: string | null;
          plate_no?: string | null;
          resume_token_expires_at?: string | null;
          resume_token_hash?: string | null;
          shifts?: string[];
          source?: string;
          status?: Database['public']['Enums']['rider_status'];
          status_reason?: string | null;
          submitted_at?: string | null;
          updated_at?: string;
          user_id?: string | null;
          vehicle?: Database['public']['Enums']['vehicle_type'] | null;
          waitlisted_at?: string | null;
          years_riding?: string | null;
        };
        Update: {
          activated_at?: string | null;
          activated_by?: string | null;
          areas?: string[];
          bike_max_km?: number | null;
          cash_cap?: number | null;
          cash_ok?: boolean;
          city_id?: string | null;
          created_at?: string;
          employer_merchant_id?: string | null;
          face_photo_path?: string | null;
          first_name?: string;
          id?: string;
          insurance?: Database['public']['Enums']['insurance_type'] | null;
          kit_has?: string[];
          kit_issued_at?: string | null;
          last_name?: string | null;
          notes?: string | null;
          onboarding_session_at?: string | null;
          onboarding_slot_id?: string | null;
          onboarding_step?: number;
          owner_name?: string | null;
          owner_phone?: string | null;
          ownership?: Database['public']['Enums']['vehicle_ownership'] | null;
          payout_msisdn?: string | null;
          payout_name_lookup?: Json | null;
          phone?: string;
          phone_code_attempts?: number;
          phone_code_expires_at?: string | null;
          phone_code_hash?: string | null;
          phone_verified_at?: string | null;
          plate_no?: string | null;
          resume_token_expires_at?: string | null;
          resume_token_hash?: string | null;
          shifts?: string[];
          source?: string;
          status?: Database['public']['Enums']['rider_status'];
          status_reason?: string | null;
          submitted_at?: string | null;
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
            referencedRelation: 'merchant';
            referencedColumns: ['id'];
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
    };
    Views: {
      catalogue_health: {
        Row: {
          cheapest_kes: number | null;
          city_id: string | null;
          drafts_without_a_price: number | null;
          live_components: number | null;
          mood: Database['public']['Enums']['mood'] | null;
          slot: Database['public']['Enums']['block_slot'] | null;
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
      merchant_public: {
        Row: {
          accepting_orders: boolean | null;
          branch_address: string | null;
          branch_latitude: number | null;
          branch_longitude: number | null;
          branch_name: string | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_name: string | null;
          city_slug: string | null;
          concierge_pick: boolean | null;
          cover_photo_path: string | null;
          explore_visible: boolean | null;
          featured: boolean | null;
          id: string | null;
          listed_at: string | null;
          trading_name: string | null;
        };
        Relationships: [];
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
      fn_component_cost: {
        Args: {
          p_basis: Database['public']['Enums']['price_basis'];
          p_party: number;
          p_price: number;
        };
        Returns: number;
      };
      fn_event_anchor_effects: { Args: { p_plan_id: string }; Returns: undefined };
      fn_expire_documents: { Args: Record<PropertyKey, never>; Returns: number };
      fn_fit_budget: { Args: { p_plan_id: string }; Returns: undefined };
      fn_load_available: { Args: { p_plan_id: string }; Returns: undefined };
      fn_merchant_draft_for_write: {
        Args: { p_merchant_id: string };
        Returns: {
          accepting_orders: boolean;
          accepting_orders_changed_at: string | null;
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
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
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          submitted_at: string | null;
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
      fn_rider_condition_matches: {
        Args: { p_condition: Json; p_rider: Database['public']['Tables']['rider']['Row'] };
        Returns: boolean;
      };
      fn_rider_draft_for_write: {
        Args: { p_rider_id: string };
        Returns: {
          activated_at: string | null;
          activated_by: string | null;
          areas: string[];
          bike_max_km: number | null;
          cash_cap: number | null;
          cash_ok: boolean;
          city_id: string | null;
          created_at: string;
          employer_merchant_id: string | null;
          face_photo_path: string | null;
          first_name: string;
          id: string;
          insurance: Database['public']['Enums']['insurance_type'] | null;
          kit_has: string[];
          kit_issued_at: string | null;
          last_name: string | null;
          notes: string | null;
          onboarding_session_at: string | null;
          onboarding_slot_id: string | null;
          onboarding_step: number;
          owner_name: string | null;
          owner_phone: string | null;
          ownership: Database['public']['Enums']['vehicle_ownership'] | null;
          payout_msisdn: string | null;
          payout_name_lookup: Json | null;
          phone: string;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          plate_no: string | null;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          shifts: string[];
          source: string;
          status: Database['public']['Enums']['rider_status'];
          status_reason: string | null;
          submitted_at: string | null;
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
      neighbourhoods_for_zone: { Args: { p_zone_id: string }; Returns: string[] };
      rpc_activate_rider: {
        Args: { p_reason?: string; p_rider_id: string };
        Returns: {
          activated_at: string | null;
          activated_by: string | null;
          areas: string[];
          bike_max_km: number | null;
          cash_cap: number | null;
          cash_ok: boolean;
          city_id: string | null;
          created_at: string;
          employer_merchant_id: string | null;
          face_photo_path: string | null;
          first_name: string;
          id: string;
          insurance: Database['public']['Enums']['insurance_type'] | null;
          kit_has: string[];
          kit_issued_at: string | null;
          last_name: string | null;
          notes: string | null;
          onboarding_session_at: string | null;
          onboarding_slot_id: string | null;
          onboarding_step: number;
          owner_name: string | null;
          owner_phone: string | null;
          ownership: Database['public']['Enums']['vehicle_ownership'] | null;
          payout_msisdn: string | null;
          payout_name_lookup: Json | null;
          phone: string;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          plate_no: string | null;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          shifts: string[];
          source: string;
          status: Database['public']['Enums']['rider_status'];
          status_reason: string | null;
          submitted_at: string | null;
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
      rpc_expire_quotes: { Args: Record<PropertyKey, never>; Returns: number };
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
      rpc_merchant_declare_fleet: {
        Args: { p_merchant_id: string; p_preference?: string; p_riders: Json };
        Returns: Json;
      };
      rpc_merchant_go_live: {
        Args: { p_merchant_id: string; p_reason?: string };
        Returns: {
          accepting_orders: boolean;
          accepting_orders_changed_at: string | null;
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
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
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          submitted_at: string | null;
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
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
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
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          submitted_at: string | null;
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
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
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
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          submitted_at: string | null;
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
          answers: NonNullable<Json>;
          branch_count_band: string | null;
          category: Database['public']['Enums']['merchant_category'] | null;
          category_other: string | null;
          city_id: string | null;
          concierge_pick: boolean;
          contact_email: string | null;
          contact_name: string;
          contact_phone: string;
          cover_photo_path: string | null;
          created_at: string;
          credentials_sent_at: string | null;
          explore_visible: boolean;
          featured: boolean;
          fleet_dispatch_preference: string;
          has_own_riders: boolean;
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
          password_set_at: string | null;
          pay_on_delivery: boolean;
          pay_on_delivery_cap_kes: number | null;
          payout_account: Json | null;
          payout_name_lookup: Json | null;
          payout_rail: string | null;
          phone_code_attempts: number;
          phone_code_expires_at: string | null;
          phone_code_hash: string | null;
          phone_verified_at: string | null;
          pickup_instructions: string | null;
          prep_minutes: number;
          price_band: string | null;
          requires_ops_mapping: boolean;
          resume_token_expires_at: string | null;
          resume_token_hash: string | null;
          rider_parking: string | null;
          settlement_account: Json | null;
          source_url: string | null;
          status: Database['public']['Enums']['partner_status'];
          status_reason: string | null;
          submitted_at: string | null;
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
      rpc_merchant_verify_phone_code: {
        Args: { p_code: string; p_merchant_id: string };
        Returns: Json;
      };
      rpc_merchant_waitlist: {
        Args: { p_area?: string; p_lat: number; p_lng: number; p_merchant_id: string };
        Returns: Json;
      };
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
      rpc_rider_issue_kit: { Args: { p_rider_id: string }; Returns: string };
      rpc_rider_payout_name_check: { Args: { p_rider_id: string }; Returns: Json };
      rpc_rider_request_phone_code: { Args: { p_rider_id: string }; Returns: Json };
      rpc_rider_resume_claim: { Args: { p_token: string }; Returns: Json };
      rpc_rider_resume_token: { Args: { p_rider_id: string }; Returns: string };
      rpc_rider_save_step: {
        Args: { p_patch?: Json; p_rider_id: string; p_step: number };
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
      rpc_rider_submit: { Args: { p_rider_id: string }; Returns: Json };
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
      actor_type: 'staff' | 'merchant_user' | 'rider' | 'guest' | 'host_user' | 'system';
      approval_kind: 'merchant_suspension' | 'staff_role_grant' | 'experience_refund';
      approval_status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
      audit_severity: 'info' | 'notice' | 'high';
      block_kind: 'activity' | 'meal' | 'venue' | 'transport' | 'stay' | 'event' | 'free';
      block_slot: 'early' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night' | 'late';
      city_status: 'live' | 'soft_launch' | 'waitlist';
      document_owner_type: 'rider' | 'merchant' | 'experience_partner';
      document_status: 'uploaded' | 'verified' | 'rejected' | 'expired';
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
      hold_status: 'none' | 'requested' | 'held' | 'declined' | 'expired';
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
        | 'event_submission_reviewed';
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
      review_display: 'initial' | 'full_name' | 'anonymous';
      review_status: 'received' | 'approved' | 'kept_private';
      rider_status:
        | 'applied'
        | 'documents_pending'
        | 'under_review'
        | 'active'
        | 'suspended'
        | 'offboarded';
      setting_scope: 'global' | 'city';
      staff_status: 'active' | 'suspended' | 'offboarded';
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
      actor_type: ['staff', 'merchant_user', 'rider', 'guest', 'host_user', 'system'],
      approval_kind: ['merchant_suspension', 'staff_role_grant', 'experience_refund'],
      approval_status: ['pending', 'approved', 'rejected', 'withdrawn'],
      audit_severity: ['info', 'notice', 'high'],
      block_kind: ['activity', 'meal', 'venue', 'transport', 'stay', 'event', 'free'],
      block_slot: ['early', 'morning', 'midday', 'afternoon', 'evening', 'night', 'late'],
      city_status: ['live', 'soft_launch', 'waitlist'],
      document_owner_type: ['rider', 'merchant', 'experience_partner'],
      document_status: ['uploaded', 'verified', 'rejected', 'expired'],
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
      hold_status: ['none', 'requested', 'held', 'declined', 'expired'],
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
      review_display: ['initial', 'full_name', 'anonymous'],
      review_status: ['received', 'approved', 'kept_private'],
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
      vehicle_ownership: ['own', 'rented', 'family'],
      vehicle_type: ['motorbike', 'bicycle', 'car', 'tuktuk'],
      zone_tier: ['core', 'extended', 'trial'],
    },
  },
} as const;
