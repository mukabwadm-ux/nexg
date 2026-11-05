import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_booking_outbox_state" AS ENUM('pending', 'delivered', 'failed');
  CREATE TYPE "public"."enum_services_duration_type" AS ENUM('fixed', 'flexible', 'full-day');
  CREATE TYPE "public"."enum_services_allow_guest_booking" AS ENUM('inherit', 'enabled', 'disabled');
  CREATE TYPE "public"."enum_resources_capacity_mode" AS ENUM('per-reservation', 'per-guest');
  CREATE TYPE "public"."enum_resources_resource_type" AS ENUM('staff', 'asset', 'vehicle', 'room', 'space', 'equipment', 'capacity_pool');
  CREATE TYPE "public"."enum_schedules_recurring_slots_day" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
  CREATE TYPE "public"."enum_schedules_exceptions_type" AS ENUM('vacation', 'sick', 'personal', 'closure', 'other');
  CREATE TYPE "public"."enum_schedules_schedule_type" AS ENUM('recurring', 'manual');
  CREATE TYPE "public"."enum_reservations_status" AS ENUM('held', 'pending', 'confirmed', 'completed', 'cancelled', 'expired', 'no-show');
  CREATE TABLE "businesses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"business_id" varchar NOT NULL,
  	"booking_lock" varchar,
  	"business_key" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"configuration" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "booking_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"business_id" varchar NOT NULL,
  	"public_id" varchar NOT NULL,
  	"nexg" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "booking_operations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"business_id" varchar NOT NULL,
  	"operation_key" varchar NOT NULL,
  	"request_hash" varchar NOT NULL,
  	"result" jsonb NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "booking_audit" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"business_id" varchar NOT NULL,
  	"actor_id" varchar NOT NULL,
  	"operation" varchar NOT NULL,
  	"record_id" varchar,
  	"detail" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "booking_outbox" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"business_id" varchar NOT NULL,
  	"event_key" varchar NOT NULL,
  	"event_type" varchar NOT NULL,
  	"payload" jsonb NOT NULL,
  	"state" "enum_booking_outbox_state" DEFAULT 'pending',
  	"attempts" numeric DEFAULT 0,
  	"last_error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "booking_sessions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"business_id" varchar NOT NULL,
  	"session_key" varchar NOT NULL,
  	"public_id" varchar,
  	"capacity" numeric,
  	"resource_ids" jsonb,
  	"published" boolean DEFAULT false,
  	"version" numeric DEFAULT 1,
  	"location_id" varchar,
  	"reservation_id" varchar,
  	"offering_id" varchar NOT NULL,
  	"start_time" timestamp(3) with time zone NOT NULL,
  	"end_time" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "services" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"duration" numeric NOT NULL,
  	"duration_type" "enum_services_duration_type" DEFAULT 'fixed' NOT NULL,
  	"price" numeric,
  	"buffer_time_before" numeric DEFAULT 0,
  	"buffer_time_after" numeric DEFAULT 0,
  	"allow_guest_booking" "enum_services_allow_guest_booking" DEFAULT 'inherit',
  	"active" boolean DEFAULT true,
  	"business_id" varchar NOT NULL,
  	"public_id" varchar NOT NULL,
  	"nexg" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "services_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"resources_id" integer
  );
  
  CREATE TABLE "resources" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"active" boolean DEFAULT true,
  	"quantity" numeric DEFAULT 1 NOT NULL,
  	"capacity_mode" "enum_resources_capacity_mode" DEFAULT 'per-reservation',
  	"timezone" varchar,
  	"resource_type" "enum_resources_resource_type" DEFAULT 'staff',
  	"booking_lock" varchar,
  	"business_id" varchar NOT NULL,
  	"public_id" varchar NOT NULL,
  	"nexg" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "resources_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"services_id" integer
  );
  
  CREATE TABLE "schedules_recurring_slots" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"day" "enum_schedules_recurring_slots_day",
  	"start_time" varchar,
  	"end_time" varchar
  );
  
  CREATE TABLE "schedules_manual_slots" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"date" timestamp(3) with time zone,
  	"start_time" varchar,
  	"end_time" varchar
  );
  
  CREATE TABLE "schedules_exceptions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"end_date" timestamp(3) with time zone,
  	"type" "enum_schedules_exceptions_type",
  	"reason" varchar
  );
  
  CREATE TABLE "schedules" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"resource_id" integer NOT NULL,
  	"schedule_type" "enum_schedules_schedule_type" DEFAULT 'recurring',
  	"active" boolean DEFAULT true,
  	"business_id" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "reservations_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"resource_id" integer NOT NULL,
  	"service_id" integer,
  	"start_time" timestamp(3) with time zone,
  	"end_time" timestamp(3) with time zone,
  	"guest_count" numeric
  );
  
  CREATE TABLE "reservations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"service_id" integer NOT NULL,
  	"resource_id" integer NOT NULL,
  	"customer_id" integer,
  	"guest_name" varchar,
  	"guest_email" varchar,
  	"guest_phone" varchar,
  	"cancellation_token" varchar,
  	"start_time" timestamp(3) with time zone NOT NULL,
  	"end_time" timestamp(3) with time zone,
  	"status" "enum_reservations_status" DEFAULT 'held',
  	"cancellation_reason" varchar,
  	"guest_count" numeric DEFAULT 1,
  	"notes" varchar,
  	"idempotency_key" varchar,
  	"business_id" varchar NOT NULL,
  	"public_id" varchar NOT NULL,
  	"nexg" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "customers_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "customers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"first_name" varchar NOT NULL,
  	"last_name" varchar NOT NULL,
  	"phone" varchar,
  	"notes" varchar,
  	"business_id" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"businesses_id" integer,
  	"booking_requests_id" integer,
  	"booking_operations_id" integer,
  	"booking_audit_id" integer,
  	"booking_outbox_id" integer,
  	"booking_sessions_id" integer,
  	"services_id" integer,
  	"resources_id" integer,
  	"schedules_id" integer,
  	"reservations_id" integer,
  	"customers_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"customers_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "services_rels" ADD CONSTRAINT "services_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "services_rels" ADD CONSTRAINT "services_rels_resources_fk" FOREIGN KEY ("resources_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "resources_rels" ADD CONSTRAINT "resources_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "resources_rels" ADD CONSTRAINT "resources_rels_services_fk" FOREIGN KEY ("services_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "schedules_recurring_slots" ADD CONSTRAINT "schedules_recurring_slots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "schedules_manual_slots" ADD CONSTRAINT "schedules_manual_slots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "schedules_exceptions" ADD CONSTRAINT "schedules_exceptions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "schedules" ADD CONSTRAINT "schedules_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reservations_items" ADD CONSTRAINT "reservations_items_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reservations_items" ADD CONSTRAINT "reservations_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reservations_items" ADD CONSTRAINT "reservations_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reservations" ADD CONSTRAINT "reservations_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reservations" ADD CONSTRAINT "reservations_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "customers_sessions" ADD CONSTRAINT "customers_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_businesses_fk" FOREIGN KEY ("businesses_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_booking_requests_fk" FOREIGN KEY ("booking_requests_id") REFERENCES "public"."booking_requests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_booking_operations_fk" FOREIGN KEY ("booking_operations_id") REFERENCES "public"."booking_operations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_booking_audit_fk" FOREIGN KEY ("booking_audit_id") REFERENCES "public"."booking_audit"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_booking_outbox_fk" FOREIGN KEY ("booking_outbox_id") REFERENCES "public"."booking_outbox"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_booking_sessions_fk" FOREIGN KEY ("booking_sessions_id") REFERENCES "public"."booking_sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_services_fk" FOREIGN KEY ("services_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_resources_fk" FOREIGN KEY ("resources_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_schedules_fk" FOREIGN KEY ("schedules_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reservations_fk" FOREIGN KEY ("reservations_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_customers_fk" FOREIGN KEY ("customers_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_customers_fk" FOREIGN KEY ("customers_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "businesses_business_id_idx" ON "businesses" USING btree ("business_id");
  CREATE UNIQUE INDEX "businesses_business_key_idx" ON "businesses" USING btree ("business_key");
  CREATE INDEX "businesses_updated_at_idx" ON "businesses" USING btree ("updated_at");
  CREATE INDEX "businesses_created_at_idx" ON "businesses" USING btree ("created_at");
  CREATE INDEX "booking_requests_business_id_idx" ON "booking_requests" USING btree ("business_id");
  CREATE UNIQUE INDEX "booking_requests_public_id_idx" ON "booking_requests" USING btree ("public_id");
  CREATE INDEX "booking_requests_updated_at_idx" ON "booking_requests" USING btree ("updated_at");
  CREATE INDEX "booking_requests_created_at_idx" ON "booking_requests" USING btree ("created_at");
  CREATE INDEX "booking_operations_business_id_idx" ON "booking_operations" USING btree ("business_id");
  CREATE UNIQUE INDEX "booking_operations_operation_key_idx" ON "booking_operations" USING btree ("operation_key");
  CREATE INDEX "booking_operations_updated_at_idx" ON "booking_operations" USING btree ("updated_at");
  CREATE INDEX "booking_operations_created_at_idx" ON "booking_operations" USING btree ("created_at");
  CREATE INDEX "booking_audit_business_id_idx" ON "booking_audit" USING btree ("business_id");
  CREATE INDEX "booking_audit_updated_at_idx" ON "booking_audit" USING btree ("updated_at");
  CREATE INDEX "booking_audit_created_at_idx" ON "booking_audit" USING btree ("created_at");
  CREATE INDEX "booking_outbox_business_id_idx" ON "booking_outbox" USING btree ("business_id");
  CREATE UNIQUE INDEX "booking_outbox_event_key_idx" ON "booking_outbox" USING btree ("event_key");
  CREATE INDEX "booking_outbox_updated_at_idx" ON "booking_outbox" USING btree ("updated_at");
  CREATE INDEX "booking_outbox_created_at_idx" ON "booking_outbox" USING btree ("created_at");
  CREATE INDEX "booking_sessions_business_id_idx" ON "booking_sessions" USING btree ("business_id");
  CREATE UNIQUE INDEX "booking_sessions_session_key_idx" ON "booking_sessions" USING btree ("session_key");
  CREATE UNIQUE INDEX "booking_sessions_public_id_idx" ON "booking_sessions" USING btree ("public_id");
  CREATE INDEX "booking_sessions_updated_at_idx" ON "booking_sessions" USING btree ("updated_at");
  CREATE INDEX "booking_sessions_created_at_idx" ON "booking_sessions" USING btree ("created_at");
  CREATE INDEX "services_business_id_idx" ON "services" USING btree ("business_id");
  CREATE UNIQUE INDEX "services_public_id_idx" ON "services" USING btree ("public_id");
  CREATE INDEX "services_updated_at_idx" ON "services" USING btree ("updated_at");
  CREATE INDEX "services_created_at_idx" ON "services" USING btree ("created_at");
  CREATE INDEX "services_rels_order_idx" ON "services_rels" USING btree ("order");
  CREATE INDEX "services_rels_parent_idx" ON "services_rels" USING btree ("parent_id");
  CREATE INDEX "services_rels_path_idx" ON "services_rels" USING btree ("path");
  CREATE INDEX "services_rels_resources_id_idx" ON "services_rels" USING btree ("resources_id");
  CREATE INDEX "resources_business_id_idx" ON "resources" USING btree ("business_id");
  CREATE UNIQUE INDEX "resources_public_id_idx" ON "resources" USING btree ("public_id");
  CREATE INDEX "resources_updated_at_idx" ON "resources" USING btree ("updated_at");
  CREATE INDEX "resources_created_at_idx" ON "resources" USING btree ("created_at");
  CREATE INDEX "resources_rels_order_idx" ON "resources_rels" USING btree ("order");
  CREATE INDEX "resources_rels_parent_idx" ON "resources_rels" USING btree ("parent_id");
  CREATE INDEX "resources_rels_path_idx" ON "resources_rels" USING btree ("path");
  CREATE INDEX "resources_rels_services_id_idx" ON "resources_rels" USING btree ("services_id");
  CREATE INDEX "schedules_recurring_slots_order_idx" ON "schedules_recurring_slots" USING btree ("_order");
  CREATE INDEX "schedules_recurring_slots_parent_id_idx" ON "schedules_recurring_slots" USING btree ("_parent_id");
  CREATE INDEX "schedules_manual_slots_order_idx" ON "schedules_manual_slots" USING btree ("_order");
  CREATE INDEX "schedules_manual_slots_parent_id_idx" ON "schedules_manual_slots" USING btree ("_parent_id");
  CREATE INDEX "schedules_exceptions_order_idx" ON "schedules_exceptions" USING btree ("_order");
  CREATE INDEX "schedules_exceptions_parent_id_idx" ON "schedules_exceptions" USING btree ("_parent_id");
  CREATE INDEX "schedules_resource_idx" ON "schedules" USING btree ("resource_id");
  CREATE INDEX "schedules_business_id_idx" ON "schedules" USING btree ("business_id");
  CREATE INDEX "schedules_updated_at_idx" ON "schedules" USING btree ("updated_at");
  CREATE INDEX "schedules_created_at_idx" ON "schedules" USING btree ("created_at");
  CREATE INDEX "reservations_items_order_idx" ON "reservations_items" USING btree ("_order");
  CREATE INDEX "reservations_items_parent_id_idx" ON "reservations_items" USING btree ("_parent_id");
  CREATE INDEX "reservations_items_resource_idx" ON "reservations_items" USING btree ("resource_id");
  CREATE INDEX "reservations_items_service_idx" ON "reservations_items" USING btree ("service_id");
  CREATE INDEX "reservations_service_idx" ON "reservations" USING btree ("service_id");
  CREATE INDEX "reservations_resource_idx" ON "reservations" USING btree ("resource_id");
  CREATE INDEX "reservations_customer_idx" ON "reservations" USING btree ("customer_id");
  CREATE INDEX "reservations_cancellation_token_idx" ON "reservations" USING btree ("cancellation_token");
  CREATE UNIQUE INDEX "reservations_idempotency_key_idx" ON "reservations" USING btree ("idempotency_key");
  CREATE INDEX "reservations_business_id_idx" ON "reservations" USING btree ("business_id");
  CREATE UNIQUE INDEX "reservations_public_id_idx" ON "reservations" USING btree ("public_id");
  CREATE INDEX "reservations_updated_at_idx" ON "reservations" USING btree ("updated_at");
  CREATE INDEX "reservations_created_at_idx" ON "reservations" USING btree ("created_at");
  CREATE INDEX "customers_sessions_order_idx" ON "customers_sessions" USING btree ("_order");
  CREATE INDEX "customers_sessions_parent_id_idx" ON "customers_sessions" USING btree ("_parent_id");
  CREATE INDEX "customers_business_id_idx" ON "customers" USING btree ("business_id");
  CREATE INDEX "customers_updated_at_idx" ON "customers" USING btree ("updated_at");
  CREATE INDEX "customers_created_at_idx" ON "customers" USING btree ("created_at");
  CREATE UNIQUE INDEX "customers_email_idx" ON "customers" USING btree ("email");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_businesses_id_idx" ON "payload_locked_documents_rels" USING btree ("businesses_id");
  CREATE INDEX "payload_locked_documents_rels_booking_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("booking_requests_id");
  CREATE INDEX "payload_locked_documents_rels_booking_operations_id_idx" ON "payload_locked_documents_rels" USING btree ("booking_operations_id");
  CREATE INDEX "payload_locked_documents_rels_booking_audit_id_idx" ON "payload_locked_documents_rels" USING btree ("booking_audit_id");
  CREATE INDEX "payload_locked_documents_rels_booking_outbox_id_idx" ON "payload_locked_documents_rels" USING btree ("booking_outbox_id");
  CREATE INDEX "payload_locked_documents_rels_booking_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("booking_sessions_id");
  CREATE INDEX "payload_locked_documents_rels_services_id_idx" ON "payload_locked_documents_rels" USING btree ("services_id");
  CREATE INDEX "payload_locked_documents_rels_resources_id_idx" ON "payload_locked_documents_rels" USING btree ("resources_id");
  CREATE INDEX "payload_locked_documents_rels_schedules_id_idx" ON "payload_locked_documents_rels" USING btree ("schedules_id");
  CREATE INDEX "payload_locked_documents_rels_reservations_id_idx" ON "payload_locked_documents_rels" USING btree ("reservations_id");
  CREATE INDEX "payload_locked_documents_rels_customers_id_idx" ON "payload_locked_documents_rels" USING btree ("customers_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_customers_id_idx" ON "payload_preferences_rels" USING btree ("customers_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "businesses" CASCADE;
  DROP TABLE "booking_requests" CASCADE;
  DROP TABLE "booking_operations" CASCADE;
  DROP TABLE "booking_audit" CASCADE;
  DROP TABLE "booking_outbox" CASCADE;
  DROP TABLE "booking_sessions" CASCADE;
  DROP TABLE "services" CASCADE;
  DROP TABLE "services_rels" CASCADE;
  DROP TABLE "resources" CASCADE;
  DROP TABLE "resources_rels" CASCADE;
  DROP TABLE "schedules_recurring_slots" CASCADE;
  DROP TABLE "schedules_manual_slots" CASCADE;
  DROP TABLE "schedules_exceptions" CASCADE;
  DROP TABLE "schedules" CASCADE;
  DROP TABLE "reservations_items" CASCADE;
  DROP TABLE "reservations" CASCADE;
  DROP TABLE "customers_sessions" CASCADE;
  DROP TABLE "customers" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_booking_outbox_state";
  DROP TYPE "public"."enum_services_duration_type";
  DROP TYPE "public"."enum_services_allow_guest_booking";
  DROP TYPE "public"."enum_resources_capacity_mode";
  DROP TYPE "public"."enum_resources_resource_type";
  DROP TYPE "public"."enum_schedules_recurring_slots_day";
  DROP TYPE "public"."enum_schedules_exceptions_type";
  DROP TYPE "public"."enum_schedules_schedule_type";
  DROP TYPE "public"."enum_reservations_status";`)
}
