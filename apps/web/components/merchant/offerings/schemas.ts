import type { BookingModel } from '@nexg/booking-config/profiles';

export type Field = {
  key: string;
  label: string;
  type?: 'number' | 'text' | 'textarea' | 'select' | 'datetime-local';
  required?: boolean;
  min?: number;
  options?: string[];
  hint?: string;
  value?: string | number;
};
export type OfferingSchema = {
  id: string;
  label: string;
  plural: string;
  model: BookingModel;
  action: string;
  capacity: 'stock' | 'calendar' | 'session' | 'asset' | 'space' | 'scope' | 'storage';
  unit: string;
  priceModes: ('fixed' | 'unit' | 'quote' | 'enquiry')[];
  fields: Field[];
  resources: string[];
  guidance: string;
};
const text = (key: string, label: string, value = '', required = true): Field => ({
  key,
  label,
  value,
  required,
});
const number = (key: string, label: string, value: number, min = 1): Field => ({
  key,
  label,
  type: 'number',
  value,
  min,
  required: true,
});
const choice = (key: string, label: string, options: string[]): Field => ({
  key,
  label,
  type: 'select',
  options,
  value: options[0],
  required: true,
});
const terms = (key: string, label: string, value: string): Field => ({
  ...text(key, label, value),
  type: 'textarea',
});

export const schemas: Record<string, OfferingSchema> = Object.fromEntries(
  (
    [
      {
        id: 'PRODUCT_CATALOG_V1',
        label: 'Product',
        plural: 'Products',
        model: 'ORDER',
        action: 'Buy',
        capacity: 'stock',
        unit: 'item',
        priceModes: ['fixed', 'unit'],
        resources: [],
        guidance:
          'Orders confirm automatically when the authoritative inventory source allocates stock.',
        fields: [
          text('sku', 'SKU / reference', '', false),
          choice('sale_unit', 'Sale unit', ['item', 'set', 'kg', 'g', 'litre', 'pack']),
          { ...number('preparation_minutes', 'Preparation (minutes)', 0, 0), required: false },
          terms(
            'stock_policy',
            'Stock policy',
            'Only sell quantities confirmed by the inventory source.',
          ),
        ],
      },
      {
        id: 'SERVICE_APPOINTMENT_V1',
        label: 'Service',
        plural: 'Services',
        model: 'APPOINTMENT',
        action: 'Book',
        capacity: 'calendar',
        unit: 'appointment',
        priceModes: ['fixed', 'unit'],
        resources: ['Amina W.', 'Faith N.'],
        guidance:
          'Customers book available staff slots automatically. Exact duration and linked calendars govern capacity.',
        fields: [
          number('duration_minutes', 'Duration (minutes)', 60),
          number('buffer_before_minutes', 'Buffer before (minutes)', 0, 0),
          number('buffer_after_minutes', 'Buffer after (minutes)', 15, 0),
          choice('service_location_modes', 'Service location', [
            'Merchant location',
            'Customer location',
          ]),
          terms(
            'confirmation_policy',
            'Confirmation policy',
            'Automatically confirm after the required resource and payment checks.',
          ),
        ],
      },
      {
        id: 'REMOTE_SESSION_V1',
        label: 'Remote session',
        plural: 'Remote sessions',
        model: 'APPOINTMENT',
        action: 'Book',
        capacity: 'calendar',
        unit: 'session',
        priceModes: ['fixed', 'unit'],
        resources: ['Remote provider'],
        guidance:
          'Reserve the provider’s available time. Access details stay private until the confirmed booking.',
        fields: [
          number('duration_minutes', 'Duration (minutes)', 45),
          choice('remote_channel_reference', 'Remote channel', [
            'Video call',
            'Phone call',
            'Secure messaging',
          ]),
          terms(
            'access_policy',
            'Access instructions',
            'Share the private access link with the confirmed customer.',
          ),
          text('deliverable_policy', 'Deliverable', '', false),
        ],
      },
      {
        id: 'FIELD_SERVICE_V1',
        label: 'On-site service',
        plural: 'On-site services',
        model: 'FIELD_VISIT',
        action: 'Book',
        capacity: 'calendar',
        unit: 'visit',
        priceModes: ['fixed', 'unit', 'quote'],
        resources: ['Mobile team'],
        guidance:
          'Check service area, travel buffers and the actual team calendar before confirming a visit.',
        fields: [
          terms('scope_fields', 'Included service scope', 'Describe the fixed service scope.'),
          text('service_area_reference', 'Service areas', 'Westlands, Kilimani'),
          number('duration_minutes', 'Service duration (minutes)', 90),
          number('travel_minutes', 'Travel buffer (minutes)', 30, 0),
          terms(
            'travel_policy',
            'Travel terms',
            'Only available within the configured service area.',
          ),
          text(
            'completion_evidence_policy',
            'Completion evidence',
            'Customer handover confirmation',
          ),
        ],
      },
      {
        id: 'RENTAL_ASSET_V1',
        label: 'Rental',
        plural: 'Rentals',
        model: 'ASSET_INTERVAL',
        action: 'Reserve',
        capacity: 'asset',
        unit: 'day',
        priceModes: ['fixed', 'unit', 'quote'],
        resources: ['Asset 01', 'Asset 02'],
        guidance:
          'Reserve an identified asset for the whole interval, including turnaround. The listing is separate from each asset.',
        fields: [
          choice('driver_mode', 'Driver inclusion', [
            'Self-drive / no driver',
            'Qualified driver included',
          ]),
          text('driver_reference', 'Driver resource', 'Driver 01', false),
          text('asset_class_reference', 'Asset class', 'Standard class'),
          choice('rental_unit', 'Rental unit', ['day', 'hour', 'night', 'week']),
          number('min_rental_quantity', 'Minimum rental units', 1),
          number('turnaround_minutes', 'Turnaround (minutes)', 60, 0),
          terms(
            'handover_policy',
            'Handover instructions',
            'Verify identity and record condition at handover.',
          ),
          terms(
            'return_policy',
            'Return instructions',
            'Return to the collection location; record the condition.',
          ),
          number('deposit_kes', 'Refundable deposit (KES)', 0, 0),
        ],
      },
      {
        id: 'TRANSFER_ROUTE_V1',
        label: 'Transfer',
        plural: 'Transfers',
        model: 'TRANSFER',
        action: 'Book',
        capacity: 'calendar',
        unit: 'trip',
        priceModes: ['fixed', 'unit', 'quote'],
        resources: ['Vehicle 01 + driver', 'Vehicle 02 + driver'],
        guidance:
          'Use the declared greeter-only or transport mode. Every actual greeter, vehicle and driver must fit the trip.',
        fields: [
          choice('transport_mode', 'Included service', ['Vehicle and driver', 'Greeter only']),
          text('greeter_reference', 'Greeter resource', 'Greeter 01', false),
          text('driver_reference', 'Driver resource', 'Driver 01', false),
          text('route_fields', 'Route / covered areas', 'JKIA ↔ Westlands'),
          text('vehicle_class_reference', 'Vehicle class', 'Standard sedan'),
          number('passenger_limit', 'Passenger limit', 3),
          number('luggage_limit', 'Luggage pieces', 2, 0),
          number('duration_minutes', 'Trip allocation (minutes)', 90),
          terms(
            'pickup_policy',
            'Pickup instructions',
            'Confirm the meeting point and passenger contact.',
          ),
        ],
      },
      {
        id: 'EVENT_TICKET_V1',
        label: 'Ticket',
        plural: 'Tickets',
        model: 'SESSION_CAPACITY',
        action: 'Reserve',
        capacity: 'session',
        unit: 'person',
        priceModes: ['fixed', 'unit'],
        resources: ['Admission pool'],
        guidance:
          'Each dated session has its own participant capacity. Tickets and remaining places are distinct.',
        fields: [
          choice('admission_type', 'Admission type', ['General admission', 'Reserved seat', 'VIP']),
          {
            key: 'session_start',
            label: 'Session starts (Nairobi time)',
            type: 'datetime-local',
            required: true,
            value: '2026-11-07T18:00',
          },
          number('duration_minutes', 'Duration (minutes)', 120),
          number('participant_limit', 'Places per session', 40),
          terms(
            'cancellation_policy',
            'Cancellation terms',
            'Explain refunds and event cancellation terms.',
          ),
        ],
      },
      {
        id: 'GROUP_SESSION_V1',
        label: 'Group session',
        plural: 'Group sessions',
        model: 'SESSION_CAPACITY',
        action: 'Book',
        capacity: 'session',
        unit: 'person',
        priceModes: ['fixed', 'unit'],
        resources: ['Instructor', 'Session room'],
        guidance:
          'Capacity is counted in participant places for each dated session, not in booking records.',
        fields: [
          {
            key: 'session_start',
            label: 'Session starts (Nairobi time)',
            type: 'datetime-local',
            required: true,
            value: '2026-11-07T10:00',
          },
          number('duration_minutes', 'Duration (minutes)', 60),
          number('group_size_min', 'Minimum participants', 1),
          number('group_size_max', 'Maximum participants', 12),
          terms(
            'go_decision_policy',
            'Minimum group policy',
            'Sessions run with the stated minimum; communicate changes to affected customers.',
          ),
        ],
      },
      {
        id: 'SPACE_RESERVATION_V1',
        label: 'Space',
        plural: 'Spaces',
        model: 'SPACE_RESERVATION',
        action: 'Reserve',
        capacity: 'space',
        unit: 'reservation',
        priceModes: ['fixed', 'unit'],
        resources: ['Space 01', 'Space 02'],
        guidance:
          'Match party size to compatible tables or spaces. Turnover and shared capacity affect availability.',
        fields: [
          text('space_policy_id', 'Space / seating policy', 'Only allocate compatible spaces.'),
          number('duration_minutes', 'Reservation duration (minutes)', 90),
          number('turnover_minutes', 'Turnover (minutes)', 15, 0),
          number('party_min', 'Minimum party size', 1),
          number('party_max', 'Maximum party size', 6),
          choice('capacity_mode', 'Capacity use', ['Exclusive space', 'Shared places']),
        ],
      },
      {
        id: 'TOUR_PACKAGE_V1',
        label: 'Tour',
        plural: 'Tours',
        model: 'TOUR',
        action: 'Book',
        capacity: 'session',
        unit: 'person',
        priceModes: ['fixed', 'unit', 'quote'],
        resources: ['Guide', 'Tour capacity pool'],
        guidance:
          'Each departure needs participant capacity and the required supplier resources. Transport is an explicit inclusion.',
        fields: [
          choice('departure_mode', 'Departure type', ['Shared departure', 'Private itinerary']),
          choice('tour_transport_mode', 'Included transport', [
            'No transport included',
            'Vehicle included',
          ]),
          text('tour_vehicle_reference', 'Tour vehicle resource', 'Tour vehicle 01', false),
          terms('itinerary_fields', 'Itinerary', 'Describe the itinerary and each included leg.'),
          {
            key: 'session_start',
            label: 'Departure (Nairobi time)',
            type: 'datetime-local',
            required: true,
            value: '2026-11-07T08:00',
          },
          number('duration_minutes', 'Duration (minutes)', 480),
          number('participant_limit', 'Participant limit', 8),
          text('supplier_requirements', 'Required suppliers', 'Guide'),
          terms(
            'inclusions_terms',
            'Inclusions and exclusions',
            'State exactly what the price includes.',
          ),
        ],
      },
      {
        id: 'REQUEST_QUOTE_V1',
        label: 'Quoted service',
        plural: 'Quoted services',
        model: 'REQUEST_QUOTE',
        action: 'Request quote',
        capacity: 'scope',
        unit: 'project',
        priceModes: ['quote', 'fixed', 'unit'],
        resources: ['Service coordinator'],
        guidance:
          'A customer request is not a confirmed capacity allocation. Agree scope and price before commitment.',
        fields: [
          terms(
            'request_fields',
            'Information customers provide',
            'Scope, preferred date and delivery location.',
          ),
          text('response_owner_reference', 'Quote owner', 'Service coordinator'),
          number('response_hours', 'Response window (hours)', 24),
          terms(
            'quote_terms_schema_reference',
            'Quote terms',
            'Describe scope, price, validity and delivery promise.',
          ),
          terms(
            'delivery_acceptance_policy',
            'Completion terms',
            'Agree the deliverables and evidence of completion.',
          ),
        ],
      },
      {
        id: 'MADE_TO_ORDER_V1',
        label: 'Custom item',
        plural: 'Custom items',
        model: 'PRODUCTION_DUE',
        action: 'Request quote',
        capacity: 'scope',
        unit: 'item',
        priceModes: ['quote', 'fixed', 'unit'],
        resources: ['Production team'],
        guidance:
          'Custom specifications may need explicit agreement. Fixed published variants do not require blanket order acceptance.',
        fields: [
          terms(
            'specification_fields',
            'Customer specification',
            'Measurements, materials and custom details.',
          ),
          choice('approval_policy', 'Specification agreement', [
            'Customer agrees specification and quote',
            'Fixed published specification',
          ]),
          number('production_duration_minutes', 'Production time (minutes)', 1440),
          text(
            'material_requirements',
            'Material requirements',
            'Materials confirmed for the agreed specification.',
          ),
          choice('handover_methods', 'Handover', ['Collection', 'Delivery']),
        ],
      },
      {
        id: 'PICKUP_RETURN_V1',
        label: 'Collection service',
        plural: 'Collection services',
        model: 'LINKED_WINDOWS',
        action: 'Book',
        capacity: 'calendar',
        unit: 'kg',
        priceModes: ['unit', 'fixed', 'quote'],
        resources: ['Collection team', 'Return team'],
        guidance: 'Collection, processing and return are linked commitments with separate windows.',
        fields: [
          choice('intake_unit', 'Intake unit', ['kg', 'item', 'bag', 'pair']),
          number('processing_minutes', 'Processing time (minutes)', 1440),
          terms(
            'inspection_policy',
            'Intake inspection',
            'Record quantity and condition at collection.',
          ),
          terms('processing_terms', 'Processing terms', 'Confirm treatment and any exclusions.'),
          terms('collection_policy', 'Collection terms', 'Use the agreed collection window.'),
          terms(
            'return_policy',
            'Return terms',
            'Use the agreed return window and record handover.',
          ),
        ],
      },
      {
        id: 'MEMBERSHIP_PLAN_V1',
        label: 'Membership',
        plural: 'Memberships',
        model: 'ENTITLEMENT',
        action: 'Join',
        capacity: 'scope',
        unit: 'month',
        priceModes: ['fixed', 'unit'],
        resources: [],
        guidance:
          'Membership validity and credits are separate from the availability of each session a member books.',
        fields: [
          text(
            'entitlement_schema_reference',
            'Included benefits',
            'Access to the configured member benefits.',
          ),
          number('validity_days', 'Validity (days)', 30),
          choice('usage_unit', 'Benefit unit', ['visit', 'session', 'credit', 'unlimited access']),
          number('included_units', 'Included units (0 for unlimited)', 8, 0),
          choice('renewal_policy', 'Renewal', [
            'Customer chooses renewal',
            'Recurring with explicit consent',
          ]),
          terms(
            'occurrence_policy',
            'Session booking terms',
            'Book each included session against its own availability.',
          ),
        ],
      },
      {
        id: 'FREIGHT_SHIPMENT_V1',
        label: 'Shipment service',
        plural: 'Shipment services',
        model: 'FREIGHT',
        action: 'Request quote',
        capacity: 'scope',
        unit: 'kg',
        priceModes: ['quote', 'unit'],
        resources: ['Carrier capacity pool'],
        guidance:
          'Quote against measured cargo, route and carrier capacity. Weight and volume keep distinct units.',
        fields: [
          terms(
            'cargo_fields',
            'Cargo information',
            'Description, weight, volume and handling needs.',
          ),
          text('supported_route_references', 'Supported routes', 'Nairobi ↔ Mombasa'),
          choice('measurement_units', 'Rate unit', ['kg', 'tonne', 'm³', 'pallet']),
          number('max_weight_kg', 'Maximum cargo weight (kg)', 1000),
          terms(
            'rate_basis_terms',
            'Rate and surcharge terms',
            'Confirm the final measured cargo and route.',
          ),
          terms('document_policy', 'Required documents', 'Cargo manifest and applicable permits.'),
          terms(
            'custody_policy',
            'Custody and delivery evidence',
            'Record each custody transfer and proof of delivery.',
          ),
        ],
      },
      {
        id: 'STORAGE_SPACE_V1',
        label: 'Storage',
        plural: 'Storage',
        model: 'STORAGE',
        action: 'Reserve',
        capacity: 'storage',
        unit: 'm² / month',
        priceModes: ['unit', 'quote'],
        resources: ['Storage zone A'],
        guidance:
          'Occupancy uses the declared quantity and custody period. Access visits do not release stored capacity.',
        fields: [
          choice('space_unit', 'Storage unit', ['m²', 'm³', 'pallet', 'locker']),
          text('storage_location_references', 'Storage location', 'Nairobi warehouse'),
          choice('billing_period', 'Billing period', ['month', 'day', 'week']),
          number('storage_capacity', 'Available storage quantity', 100),
          terms(
            'goods_intake_schema_reference',
            'Goods intake requirements',
            'Record goods, quantity and condition.',
          ),
          terms('access_policy', 'Access policy', 'Visits require an agreed access window.'),
          terms(
            'release_policy',
            'Release policy',
            'Release capacity only after authorized removal.',
          ),
        ],
      },
      {
        id: 'REGULATED_ENQUIRY_V1',
        label: 'Enquiry',
        plural: 'Enquiries',
        model: 'REQUEST_QUOTE',
        action: 'Enquire',
        capacity: 'scope',
        unit: 'enquiry',
        priceModes: ['enquiry'],
        resources: ['Provider liaison'],
        guidance:
          'Administrative enquiries and provider handoff only. Merchant answers do not verify licensing or authorize professional actions.',
        fields: [
          text('verified_provider_reference', 'Provider reference', ''),
          terms(
            'permitted_service_scope',
            'Permitted administrative scope',
            'Administrative information and provider referral only.',
          ),
          terms(
            'permitted_enquiry_fields',
            'Permitted enquiry information',
            'Contact details and requested administrative service. Do not collect sensitive clinical or financial records.',
          ),
          terms(
            'privacy_policy',
            'Privacy terms',
            'Use enquiry information only for the requested handoff.',
          ),
          terms(
            'handoff_policy',
            'Provider handoff',
            'The provider confirms the appropriate next step.',
          ),
        ],
      },
      {
        id: 'SERVICE_JOB_V1',
        label: 'Service job',
        plural: 'Service jobs',
        model: 'SERVICE_JOB',
        action: 'Request quote',
        capacity: 'scope',
        unit: 'job',
        priceModes: ['quote', 'fixed', 'unit'],
        resources: ['Technician'],
        guidance:
          'Record inspection, agreed scope, parts and quality evidence. A fixed-scope service can use its published price.',
        fields: [
          terms(
            'intake_schema_reference',
            'Intake information',
            'Item reference, condition and requested work.',
          ),
          terms(
            'diagnostic_policy',
            'Diagnosis terms',
            'Explain the diagnostic charge before inspection.',
          ),
          terms(
            'scope_approval_policy',
            'Scope agreement',
            'Customer agrees any additional work and price.',
          ),
          terms('parts_policy', 'Parts terms', 'Confirm required parts before additional work.'),
          terms('quality_policy', 'Quality check', 'Record the completed checks.'),
          terms('handover_policy', 'Handover', 'Record the customer handover and condition.'),
        ],
      },
    ] satisfies OfferingSchema[]
  ).map((s) => [s.id, s]),
);

export const modelSchema: Record<BookingModel, string> = {
  ORDER: 'PRODUCT_CATALOG_V1',
  APPOINTMENT: 'SERVICE_APPOINTMENT_V1',
  FIELD_VISIT: 'FIELD_SERVICE_V1',
  ASSET_INTERVAL: 'RENTAL_ASSET_V1',
  TRANSFER: 'TRANSFER_ROUTE_V1',
  SESSION_CAPACITY: 'GROUP_SESSION_V1',
  SPACE_RESERVATION: 'SPACE_RESERVATION_V1',
  TOUR: 'TOUR_PACKAGE_V1',
  PRODUCTION_DUE: 'MADE_TO_ORDER_V1',
  REQUEST_QUOTE: 'REQUEST_QUOTE_V1',
  LINKED_WINDOWS: 'PICKUP_RETURN_V1',
  SERVICE_JOB: 'SERVICE_JOB_V1',
  ENTITLEMENT: 'MEMBERSHIP_PLAN_V1',
  FREIGHT: 'FREIGHT_SHIPMENT_V1',
  STORAGE: 'STORAGE_SPACE_V1',
};
