// Generated from ENGINE_V1.openapi.json. Run npm run generate; do not edit.
export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** engineHealth */
        get: operations["engineHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/capabilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** readEngineCapabilities */
        get: operations["readEngineCapabilities"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/results": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** discoverResults */
        post: operations["discoverResults"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/collections": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** composeCollections */
        post: operations["composeCollections"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/merchants/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** readMerchantDetail */
        get: operations["readMerchantDetail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/merchants/{merchantId}/offerings/{offeringId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** readExactOfferingDetail */
        get: operations["readExactOfferingDetail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/areas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** readCatalogAreas */
        get: operations["readCatalogAreas"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/tasks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** discoverTaskComponents */
        post: operations["discoverTaskComponents"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * observeClientEvents
         * @description First-party NexG interaction ingestion. Requires a live delivery token, recorded consent and approved sink configuration. Handoff events remain unavailable until an owner integration exists. Browser events never confirm owner outcomes.
         */
        post: operations["observeClientEvents"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflow-assessments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** assessWorkflowReadiness */
        post: operations["assessWorkflowReadiness"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workflow-handoffs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** prepareOwnerHandoff */
        post: operations["prepareOwnerHandoff"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/internal/owner-outcomes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** observeVerifiedOwnerOutcome */
        post: operations["observeVerifiedOwnerOutcome"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/release": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read verified public release identity and collection labels */
        get: operations["readPublishedReleaseContext"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        SourceRef: {
            ownerId: string;
            id: string;
            revision: string;
        };
        ObservedRef: {
            ownerId: string;
            id: string;
            revision?: string;
        };
        Evidence: {
            source: components["schemas"]["ObservedRef"];
            /** Format: date-time */
            observedAt: string;
            /** Format: date-time */
            validUntil?: string;
        };
        Money: {
            minor: number;
            currency: string;
        };
        Quantity: {
            value: string;
            unitId: string;
        };
        Interval: {
            /** Format: date-time */
            start: string;
            /** Format: date-time */
            end: string;
            timezone: string;
            /** @constant */
            boundary: "start_inclusive_end_exclusive";
        };
        OfferingBinding: {
            merchantId: string;
            offeringId: string;
            workflowRef: components["schemas"]["SourceRef"];
        };
        Context: {
            /** @constant */
            contractVersion: "1";
            discoveryReleaseId: string;
            policyRevision: string;
        };
        Decision: {
            /** @enum {string} */
            state: "pass" | "fail" | "unknown" | "unsupported";
            reasonCodes: string[];
            evidence: components["schemas"]["Evidence"][];
        };
        Pricing: {
            /** @enum {string} */
            amountKind: "listed" | "estimate" | "quote" | "final";
            basisId: string;
            payableNow?: components["schemas"]["Money"];
            totalObligation?: components["schemas"]["Money"];
            refundableDeposit?: components["schemas"]["Money"];
            mandatoryChargesIncluded: boolean;
        };
        MoneyFact: {
            /** @constant */
            state: "known";
            value: components["schemas"]["Money"];
            evidence: components["schemas"]["Evidence"];
        } | {
            /** @constant */
            state: "unknown";
            /** @enum {string} */
            reason: "not_exposed" | "not_verified" | "stale" | "owner_unavailable" | "unsupported_contract";
        } | {
            /** @constant */
            state: "not_applicable";
            reasonCode: string;
            evidence: components["schemas"]["Evidence"];
        };
        QuantityFact: {
            /** @constant */
            state: "known";
            value: components["schemas"]["Quantity"];
            evidence: components["schemas"]["Evidence"];
        } | {
            /** @constant */
            state: "unknown";
            /** @enum {string} */
            reason: "not_exposed" | "not_verified" | "stale" | "owner_unavailable" | "unsupported_contract";
        } | {
            /** @constant */
            state: "not_applicable";
            reasonCode: string;
            evidence: components["schemas"]["Evidence"];
        };
        BooleanFact: {
            /** @constant */
            state: "known";
            value: boolean;
            evidence: components["schemas"]["Evidence"];
        } | {
            /** @constant */
            state: "unknown";
            /** @enum {string} */
            reason: "not_exposed" | "not_verified" | "stale" | "owner_unavailable" | "unsupported_contract";
        } | {
            /** @constant */
            state: "not_applicable";
            reasonCode: string;
            evidence: components["schemas"]["Evidence"];
        };
        PricingFact: {
            /** @constant */
            state: "known";
            value: components["schemas"]["Pricing"];
            evidence: components["schemas"]["Evidence"];
        } | {
            /** @constant */
            state: "unknown";
            /** @enum {string} */
            reason: "not_exposed" | "not_verified" | "stale" | "owner_unavailable" | "unsupported_contract";
        } | {
            /** @constant */
            state: "not_applicable";
            reasonCode: string;
            evidence: components["schemas"]["Evidence"];
        };
        Scope: {
            serviceRefs: components["schemas"]["SourceRef"][];
            siteRefs: components["schemas"]["SourceRef"][];
            modeIds: string[];
        };
        ScopeFact: {
            /** @constant */
            state: "known";
            value: components["schemas"]["Scope"];
            evidence: components["schemas"]["Evidence"];
        } | {
            /** @constant */
            state: "unknown";
            /** @enum {string} */
            reason: "not_exposed" | "not_verified" | "stale" | "owner_unavailable" | "unsupported_contract";
        } | {
            /** @constant */
            state: "not_applicable";
            reasonCode: string;
            evidence: components["schemas"]["Evidence"];
        };
        Validity: {
            /** @constant */
            kind: "fixed_window";
            interval: components["schemas"]["Interval"];
            /** @enum {string} */
            coverage: "start_only" | "whole_use";
            /** Format: date-time */
            redeemBy?: string;
        } | {
            /** @constant */
            kind: "owner_event";
            /** @enum {string} */
            trigger: "activation" | "first_use" | "issuance" | "purchase";
            ruleRef: components["schemas"]["SourceRef"];
            timezone: string;
        };
        ValidityFact: {
            /** @constant */
            state: "known";
            value: components["schemas"]["Validity"];
            evidence: components["schemas"]["Evidence"];
        } | {
            /** @constant */
            state: "unknown";
            /** @enum {string} */
            reason: "not_exposed" | "not_verified" | "stale" | "owner_unavailable" | "unsupported_contract";
        } | {
            /** @constant */
            state: "not_applicable";
            reasonCode: string;
            evidence: components["schemas"]["Evidence"];
        };
        Allowance: {
            /** @enum {string} */
            kind: "finite_uses" | "fixed_term_access" | "period_allowance";
            quantity?: components["schemas"]["Quantity"];
            consumptionEventId: string;
            ruleRef: components["schemas"]["SourceRef"];
        } & unknown;
        AllowanceFact: {
            /** @constant */
            state: "known";
            value: components["schemas"]["Allowance"];
            evidence: components["schemas"]["Evidence"];
        } | {
            /** @constant */
            state: "unknown";
            /** @enum {string} */
            reason: "not_exposed" | "not_verified" | "stale" | "owner_unavailable" | "unsupported_contract";
        } | {
            /** @constant */
            state: "not_applicable";
            reasonCode: string;
            evidence: components["schemas"]["Evidence"];
        };
        Capability: {
            /** @enum {string} */
            operation: "read" | "quote" | "hold" | "release_hold" | "acquire_entitlement" | "redeem_entitlement" | "reserve_resource" | "commit_series" | "activate_telecom" | "cancel";
            /** @enum {string} */
            state: "supported" | "unsupported" | "unknown" | "temporarily_unavailable";
            reasonCodes: string[];
            contractRef?: components["schemas"]["SourceRef"];
        } & unknown;
        Capabilities: {
            context: components["schemas"]["Context"];
            offering: components["schemas"]["OfferingBinding"];
            processKinds: ("ENTITLEMENT" | "RESOURCE_RESERVATION" | "TELECOM_ACTIVATION" | "RECURRENCE")[];
            operations: components["schemas"]["Capability"][];
            limits: {
                maxSeriesOccurrences: number;
                maxSeriesHorizonDays: number;
                /** @constant */
                maxBodyBytes: 65536;
            };
        };
        RenewalFact: {
            /** @constant */
            state: "known";
            /** @enum {string} */
            value: "none" | "manual" | "automatic";
            evidence: components["schemas"]["Evidence"];
        } | {
            /** @constant */
            state: "unknown";
            /** @enum {string} */
            reason: "not_exposed" | "not_verified" | "stale" | "owner_unavailable" | "unsupported_contract";
        } | {
            /** @constant */
            state: "not_applicable";
            reasonCode: string;
            evidence: components["schemas"]["Evidence"];
        };
        EntitlementPlan: {
            planRef: components["schemas"]["SourceRef"];
            offering: components["schemas"]["OfferingBinding"];
            scope: components["schemas"]["ScopeFact"];
            validity: components["schemas"]["ValidityFact"];
            allowance: components["schemas"]["AllowanceFact"];
            pricing: components["schemas"]["PricingFact"];
            renewalMode: components["schemas"]["RenewalFact"];
            termsRef: components["schemas"]["SourceRef"];
            operations: components["schemas"]["Capability"][];
        };
        Entitlement: {
            entitlementRef: components["schemas"]["SourceRef"];
            planRef: components["schemas"]["SourceRef"];
            holderToken: string;
            sourceState: string;
            /** @enum {string} */
            status: "pending" | "scheduled" | "active" | "frozen" | "suspended" | "exhausted" | "expired" | "cancelled" | "revoked" | "unknown";
            scope: components["schemas"]["ScopeFact"];
            validity: components["schemas"]["ValidityFact"];
            usableBalance: components["schemas"]["QuantityFact"];
            reservedBalance: components["schemas"]["QuantityFact"];
            decision: components["schemas"]["Decision"];
        };
        ResourceChoice: {
            /** @constant */
            kind: "named";
            resourceRef: components["schemas"]["SourceRef"];
        } | {
            /** @constant */
            kind: "class";
            classRef: components["schemas"]["SourceRef"];
        };
        Party: {
            adults: number;
            children?: number;
            infants?: number;
        };
        ResourceSelection: {
            offering: components["schemas"]["OfferingBinding"];
            siteRef: components["schemas"]["SourceRef"];
            resourceChoice: components["schemas"]["ResourceChoice"];
            interval: components["schemas"]["Interval"];
            units: components["schemas"]["Quantity"];
            party?: components["schemas"]["Party"];
            hardFeatureIds: string[];
            softFeatureIds: string[];
        };
        AvailabilityRequest: {
            context: components["schemas"]["Context"];
            selection: components["schemas"]["ResourceSelection"];
        };
        Availability: {
            availabilityRef: components["schemas"]["SourceRef"];
            selectionHash: string;
            decision: components["schemas"]["Decision"];
            /** Format: date-time */
            observedAt: string;
            /** Format: date-time */
            validUntil?: string;
            /** @enum {string} */
            allocationMode: "named_exclusive" | "class_guarantee" | "shared_capacity";
            guaranteedFeatureIds: string[];
            capacity: components["schemas"]["QuantityFact"];
        };
        OccurrenceDraft: {
            clientOccurrenceKey: string;
            interval: components["schemas"]["Interval"];
            units: components["schemas"]["Quantity"];
            configurationRef: components["schemas"]["SourceRef"];
        };
        SeriesSelection: {
            offering: components["schemas"]["OfferingBinding"];
            /** @enum {string} */
            commitmentMode: "all_or_nothing" | "per_occurrence";
            occurrences: components["schemas"]["OccurrenceDraft"][];
            requiredOccurrenceKeys: string[];
            partialAcceptance: boolean;
        };
        SeriesPreviewRequest: {
            context: components["schemas"]["Context"];
            selection: components["schemas"]["SeriesSelection"];
        };
        OccurrenceAssessment: {
            clientOccurrenceKey: string;
            decision: components["schemas"]["Decision"];
            interval: components["schemas"]["Interval"];
            sourceOccurrenceRef?: components["schemas"]["SourceRef"];
        };
        SeriesPreview: {
            previewRef: components["schemas"]["SourceRef"];
            selectionHash: string;
            /** @enum {string} */
            commitmentMode: "all_or_nothing" | "per_occurrence";
            occurrences: components["schemas"]["OccurrenceAssessment"][];
            wholeSeriesDecision: components["schemas"]["Decision"];
            pricing: components["schemas"]["PricingFact"];
        };
        RecipientValidationRequest: {
            context: components["schemas"]["Context"];
            offering: components["schemas"]["OfferingBinding"];
            productRef: components["schemas"]["SourceRef"];
            privateHandoffToken: string;
        };
        RecipientValidation: {
            recipientRef: components["schemas"]["SourceRef"];
            maskedDisplay: string;
            /** @enum {string} */
            recipientType: "phone_account" | "customer_account" | "sim_profile";
            decision: components["schemas"]["Decision"];
            /** Format: date-time */
            validUntil: string;
        };
        TelecomProduct: {
            productRef: components["schemas"]["SourceRef"];
            offering: components["schemas"]["OfferingBinding"];
            /** @enum {string} */
            promisedOutcome: "credit_posted" | "profile_provisioned" | "allowance_active" | "service_active";
            allowance: components["schemas"]["AllowanceFact"];
            validity: components["schemas"]["ValidityFact"];
            pricing: components["schemas"]["PricingFact"];
            termsRef: components["schemas"]["SourceRef"];
            operations: components["schemas"]["Capability"][];
        };
        EntitlementAcquireIntent: {
            /** @constant */
            kind: "entitlement_acquire";
            offering: components["schemas"]["OfferingBinding"];
            planRef: components["schemas"]["SourceRef"];
            holderToken: string;
        };
        EntitlementRedeemIntent: {
            /** @constant */
            kind: "entitlement_redeem";
            offering: components["schemas"]["OfferingBinding"];
            entitlementRef: components["schemas"]["SourceRef"];
            useRef: components["schemas"]["SourceRef"];
        };
        ResourceIntent: {
            /** @constant */
            kind: "resource_reservation";
            selection: components["schemas"]["ResourceSelection"];
            availabilityRef: components["schemas"]["SourceRef"];
        };
        SeriesIntent: {
            /** @constant */
            kind: "recurring_series";
            selection: components["schemas"]["SeriesSelection"];
            previewRef: components["schemas"]["SourceRef"];
        };
        TelecomIntent: {
            /** @constant */
            kind: "telecom_activation";
            offering: components["schemas"]["OfferingBinding"];
            productRef: components["schemas"]["SourceRef"];
            recipientRef: components["schemas"]["SourceRef"];
            /** @enum {string} */
            promisedOutcome: "credit_posted" | "profile_provisioned" | "allowance_active" | "service_active";
        };
        CancellationIntent: {
            /** @constant */
            kind: "cancellation";
            /** @enum {string} */
            targetKind: "entitlement" | "reservation" | "series" | "occurrence" | "activation";
            targetRef: components["schemas"]["SourceRef"];
            occurrenceRefs: components["schemas"]["SourceRef"][];
            reasonCode: string;
        };
        WorkflowIntent: components["schemas"]["EntitlementAcquireIntent"] | components["schemas"]["EntitlementRedeemIntent"] | components["schemas"]["ResourceIntent"] | components["schemas"]["SeriesIntent"] | components["schemas"]["TelecomIntent"] | components["schemas"]["CancellationIntent"];
        QuoteRequest: {
            context: components["schemas"]["Context"];
            clientIntentId: string;
            intent: components["schemas"]["WorkflowIntent"];
        };
        Quote: {
            quoteRef: components["schemas"]["SourceRef"];
            clientIntentId: string;
            /** @enum {string} */
            intentKind: "entitlement_acquire" | "entitlement_redeem" | "resource_reservation" | "recurring_series" | "telecom_activation" | "cancellation";
            selectionHash: string;
            /** Format: date-time */
            expiresAt: string;
            termsRef: components["schemas"]["SourceRef"];
            pricing: components["schemas"]["PricingFact"];
            paymentRequired: components["schemas"]["BooleanFact"];
            decision: components["schemas"]["Decision"];
            reviewToken: string;
            commitmentOwner: string;
            /** @enum {string} */
            atomicity: "single_owner" | "owner_coordinated" | "per_occurrence";
            cancellationEffects?: components["schemas"]["CancellationEffects"];
        } & unknown;
        CancellationEffects: {
            affectedRefs: components["schemas"]["SourceRef"][];
            /** Format: date-time */
            effectiveAt: string;
            /** @enum {string} */
            accessEffect: "ends" | "continues_to_term" | "unchanged" | "owner_review";
            refund: components["schemas"]["MoneyFact"];
            fee: components["schemas"]["MoneyFact"];
            forfeitedUnits: components["schemas"]["QuantityFact"];
        };
        HoldRequest: {
            context: components["schemas"]["Context"];
            clientIntentId: string;
            quoteRef: components["schemas"]["SourceRef"];
            reviewToken: string;
        };
        Hold: {
            holdRef: components["schemas"]["SourceRef"];
            quoteRef: components["schemas"]["SourceRef"];
            selectionHash: string;
            sourceState: string;
            /** @enum {string} */
            state: "held" | "expired" | "released" | "consumed" | "unknown";
            /** Format: date-time */
            expiresAt: string;
            components: components["schemas"]["SourceRef"][];
            decision: components["schemas"]["Decision"];
        };
        CommitRequest: {
            context: components["schemas"]["Context"];
            clientIntentId: string;
            /** @enum {string} */
            expectedIntentKind: "entitlement_acquire" | "entitlement_redeem" | "resource_reservation" | "recurring_series" | "telecom_activation" | "cancellation";
            quoteRef: components["schemas"]["SourceRef"];
            reviewToken: string;
            holdRef?: components["schemas"]["SourceRef"];
            paymentAuthorizationRef?: components["schemas"]["SourceRef"];
        };
        ReleaseHoldRequest: {
            context: components["schemas"]["Context"];
            clientIntentId: string;
            expectedHoldRevision: string;
        };
        LookupRequest: {
            context: components["schemas"]["Context"];
            clientIntentId: string;
            idempotencyKey: string;
            /** @enum {string} */
            stage: "quote" | "hold" | "commit" | "release_hold";
        };
        OwnerState: {
            sourceRef: components["schemas"]["SourceRef"];
            sourceState: string;
            /** @enum {string} */
            normalized: "not_required" | "pending" | "held" | "active" | "confirmed" | "fulfilled" | "credit_posted" | "profile_provisioned" | "allowance_active" | "service_active" | "partial" | "declined" | "failed" | "expired" | "suspended" | "revoked" | "cancelled" | "refund_pending" | "refunded" | "released" | "unknown" | "partially_refunded" | "cancellation_pending" | "no_show" | "waitlisted";
            reportedAmount?: components["schemas"]["MoneyFact"];
            refundedAmount?: components["schemas"]["MoneyFact"];
        };
        OwnerStateFact: {
            /** @constant */
            state: "known";
            value: components["schemas"]["OwnerState"];
            evidence: components["schemas"]["Evidence"];
        } | {
            /** @constant */
            state: "unknown";
            /** @enum {string} */
            reason: "not_exposed" | "not_verified" | "stale" | "owner_unavailable" | "unsupported_contract";
        } | {
            /** @constant */
            state: "not_applicable";
            reasonCode: string;
            evidence: components["schemas"]["Evidence"];
        };
        OccurrenceOutcome: {
            clientOccurrenceKey: string;
            state: components["schemas"]["OwnerStateFact"];
            occurrenceRef?: components["schemas"]["SourceRef"];
        };
        Operation: {
            clientIntentId: string;
            operationRef?: components["schemas"]["SourceRef"];
            /** @enum {string} */
            intentKind: "entitlement_acquire" | "entitlement_redeem" | "resource_reservation" | "recurring_series" | "telecom_activation" | "cancellation" | "release_hold";
            /** @enum {string} */
            progress: "accepted" | "pending" | "terminal" | "outcome_unknown";
            decision: components["schemas"]["Decision"];
            effects: {
                allocation: components["schemas"]["OwnerStateFact"];
                payment: components["schemas"]["OwnerStateFact"];
                entitlement: components["schemas"]["OwnerStateFact"];
                fulfillment: components["schemas"]["OwnerStateFact"];
                compensation: components["schemas"]["OwnerStateFact"];
            };
            occurrences?: components["schemas"]["OccurrenceOutcome"][];
            /** @enum {string} */
            nextAction: "poll_operation" | "lookup_intent" | "review" | "owner_support" | "none";
        } & unknown;
        Lookup: {
            /** @constant */
            state: "found";
            operation: components["schemas"]["Operation"];
        } | {
            /** @constant */
            state: "quote_found";
            quote: components["schemas"]["Quote"];
        } | {
            /** @constant */
            state: "hold_found";
            hold: components["schemas"]["Hold"];
        } | {
            /** @constant */
            state: "authoritatively_absent";
            /** @constant */
            recovery: "retry_same_key";
            /** Format: date-time */
            retryBefore: string;
            evidence: components["schemas"]["Evidence"];
        } | {
            /** @constant */
            state: "unknown";
            /** @enum {string} */
            recovery: "wait" | "owner_support";
            reasonCode: string;
        };
        ApiError: {
            /** @constant */
            contractVersion: "1";
            requestId: string;
            /** @enum {string} */
            code: "INVALID_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "RELEASE_INCOMPATIBLE" | "SOURCE_REVISION_CHANGED" | "IDEMPOTENCY_CONFLICT" | "UNSUPPORTED_CAPABILITY" | "REQUIRED_FACT_UNKNOWN" | "FACTS_TOO_STALE" | "CONSTRAINT_CONFLICT" | "QUOTE_EXPIRED" | "HOLD_EXPIRED" | "REVIEW_REQUIRED" | "LIMIT_EXCEEDED" | "RATE_LIMITED" | "OWNER_UNAVAILABLE" | "ACTION_OUTCOME_UNKNOWN";
            retryable: boolean;
            /** @enum {string} */
            recovery: "correct_request" | "authenticate" | "review" | "restart_preserving_constraints" | "retry_read" | "lookup_intent" | "wait" | "owner_support" | "none";
            fieldPaths: string[];
        };
        StringFact: {
            /** @constant */
            state: "known";
            value: string;
            evidence: components["schemas"]["Evidence"];
        } | {
            /** @constant */
            state: "unknown";
            /** @enum {string} */
            reason: "not_exposed" | "not_verified" | "stale" | "owner_unavailable" | "unsupported_contract";
        } | {
            /** @constant */
            state: "not_applicable";
            reasonCode: string;
            evidence: components["schemas"]["Evidence"];
        };
        SourceClassification: {
            sourceCategoryRefs: components["schemas"]["ObservedRef"][];
            sourceSubcategoryRefs: components["schemas"]["ObservedRef"][];
            evidenceRef: components["schemas"]["ObservedRef"];
        };
        ClassificationFact: {
            /** @constant */
            state: "known";
            value: components["schemas"]["SourceClassification"];
            evidence: components["schemas"]["Evidence"];
        } | {
            /** @constant */
            state: "unknown";
            /** @enum {string} */
            reason: "not_exposed" | "not_verified" | "stale" | "owner_unavailable" | "unsupported_contract";
        } | {
            /** @constant */
            state: "not_applicable";
            reasonCode: string;
            evidence: components["schemas"]["Evidence"];
        };
        ProvenanceFact: {
            /** @constant */
            state: "known";
            /** @enum {string} */
            value: "confirmed" | "demo" | "unknown";
            evidence: components["schemas"]["Evidence"];
        } | {
            /** @constant */
            state: "unknown";
            /** @enum {string} */
            reason: "not_exposed" | "not_verified" | "stale" | "owner_unavailable" | "unsupported_contract";
        } | {
            /** @constant */
            state: "not_applicable";
            reasonCode: string;
            evidence: components["schemas"]["Evidence"];
        };
        WorkflowRefsFact: {
            /** @constant */
            state: "known";
            value: components["schemas"]["SourceRef"][];
            evidence: components["schemas"]["Evidence"];
        } | {
            /** @constant */
            state: "unknown";
            /** @enum {string} */
            reason: "not_exposed" | "not_verified" | "stale" | "owner_unavailable" | "unsupported_contract";
        } | {
            /** @constant */
            state: "not_applicable";
            reasonCode: string;
            evidence: components["schemas"]["Evidence"];
        };
        CatalogProjection: {
            /** @enum {string} */
            entityKind: "merchant" | "offering";
            ownerId: string;
            id: string;
            merchantId: string;
            sourceRevision: components["schemas"]["StringFact"];
            label: string;
            classification: components["schemas"]["ClassificationFact"];
            provenance: components["schemas"]["ProvenanceFact"];
            listedPrice: components["schemas"]["MoneyFact"];
            workflowPaths: components["schemas"]["WorkflowRefsFact"];
            deleted: components["schemas"]["BooleanFact"];
            /** Format: date-time */
            observedAt: string;
        };
        Count: {
            /** @constant */
            kind: "exact";
            value: number;
        } | {
            /** @constant */
            kind: "lower_bound";
            value: number;
        } | {
            /** @constant */
            kind: "unknown";
        };
        CatalogProjectionPage: {
            records: components["schemas"]["CatalogProjection"][];
            count: components["schemas"]["Count"];
            /** @enum {string} */
            completion: "complete_scope" | "more" | "bounded_window" | "unknown";
            sourceSnapshot: components["schemas"]["StringFact"];
            nextCursor?: string;
        };
        ReferenceValidationRequest: {
            context: components["schemas"]["Context"];
            refs: components["schemas"]["ObservedRef"][];
        };
        EngineRef: {
            /** @enum {string} */
            kind: "merchant" | "offering";
            ownerId: string;
            id: string;
            merchantId: string;
        };
        Selection: {
            categoryId?: string;
            subcategoryId?: string;
            optionId?: string;
        };
        AreaFilter: {
            /** @constant */
            kind: "catalog_area";
            areaId: string;
        };
        OpenFilter: {
            /** @constant */
            kind: "merchant_open";
            /** @constant */
            value: true;
        };
        ListedPriceFilter: {
            /** @constant */
            kind: "listed_price";
            min: components["schemas"]["Money"];
            max?: components["schemas"]["Money"];
            basisId: string;
        } | {
            /** @constant */
            kind: "listed_price";
            min?: components["schemas"]["Money"];
            max: components["schemas"]["Money"];
            basisId: string;
        };
        TotalFilter: {
            /** @constant */
            kind: "comparable_total";
            max: components["schemas"]["Money"];
            scopeId: string;
        };
        FulfillmentFilter: {
            /** @constant */
            kind: "fulfillment";
            /** @enum {string} */
            method: "delivery" | "pickup" | "on_site" | "remote";
        };
        CoverageFilter: {
            /** @constant */
            kind: "service_area";
            contextToken: string;
        };
        AttributeFilter: {
            /** @constant */
            kind: "required_attributes";
            values: {
                key: string;
                valueId: string;
            }[];
        };
        AvailabilityFilter: {
            /** @constant */
            kind: "required_availability";
            /** Format: date-time */
            start: string;
            /** Format: date-time */
            end?: string;
            timezone: string;
        };
        PartyFilter: {
            /** @constant */
            kind: "party";
            adults: number;
            children?: number;
            infants?: number;
        };
        WorkflowFilter: {
            /** @constant */
            kind: "workflow_kind";
            /** @enum {string} */
            value: "PURCHASE" | "APPOINTMENT" | "RENTAL" | "TRANSFER" | "TICKET" | "TOUR" | "SERVICE" | "REQUEST" | "ENTITLEMENT" | "RESOURCE_RESERVATION" | "TELECOM_ACTIVATION";
        };
        SupportedFilter: components["schemas"]["AreaFilter"] | components["schemas"]["OpenFilter"] | components["schemas"]["ListedPriceFilter"] | components["schemas"]["TotalFilter"] | components["schemas"]["FulfillmentFilter"] | components["schemas"]["CoverageFilter"] | components["schemas"]["AttributeFilter"] | components["schemas"]["AvailabilityFilter"] | components["schemas"]["PartyFilter"] | components["schemas"]["WorkflowFilter"];
        EngineRequest: {
            /** @constant */
            contractVersion: "1";
            requestId: string;
            discoveryReleaseId: string;
            /** @enum {string} */
            mode: "merchant" | "offering";
            selection: components["schemas"]["Selection"];
            sourceScope?: {
                merchantId?: string;
                anchorRef?: components["schemas"]["EngineRef"];
            };
            query?: string;
            filters: components["schemas"]["SupportedFilter"][];
            /** @enum {string} */
            sort: "recommended" | "rating" | "delivery" | "price_low" | "price_high" | "listed_price_low" | "comparable_total_low";
            /** @default 24 */
            limit: number;
            cursor?: string;
            offset?: number;
            contextToken?: string;
        };
        Versions: {
            discoveryRelease: string;
            layout: string;
            taxonomy: string;
            mapping: string;
            policy: string;
            ranker: string;
            indexGeneration?: string;
            modelRevision?: string;
            sourceSnapshots: {
                ownerId: string;
                snapshot: components["schemas"]["StringFact"];
            }[];
            /** @description Server-owned runtime control revision. Changes invalidate paging and delivery tokens. */
            profileRevision?: string;
        };
        RetrievalWindow: {
            /** @enum {string} */
            scope: "exact_matches" | "bounded_candidates";
            windowId: string;
            candidateCount: number;
            /** @enum {string} */
            completion: "more_in_window" | "window_exhausted" | "catalog_exhausted" | "unknown";
        };
        EnginePage: {
            /** @constant */
            contractVersion: "1";
            requestId: string;
            refs: components["schemas"]["EngineRef"][];
            count: components["schemas"]["EngineCount"];
            nextCursor?: string;
            retrieval: components["schemas"]["RetrievalWindow"];
            versions: components["schemas"]["Versions"];
            applied: {
                selection: components["schemas"]["Selection"];
                filterHash: string;
                constraints: components["schemas"]["AppliedConstraint"][];
                /** @enum {string} */
                sort: "recommended" | "rating" | "delivery" | "price_low" | "price_high" | "listed_price_low" | "comparable_total_low";
                safeNormalizedQuery?: string;
            };
            /** @enum {string} */
            status: "ok" | "underfilled" | "unmapped";
            /** @enum {string} */
            fallback?: "deterministic" | "lexical";
            exposureToken?: string;
            presentations: {
                merchants: components["schemas"]["PublicMerchant"][];
                offerings: components["schemas"]["PublicOffering"][];
            };
            /** @description Opaque cursor for revalidating this exact bounded session page. */
            pageCursor?: string;
            /** @description Opaque previous-page cursor in the same pinned session. */
            previousCursor?: string;
        } & unknown;
        EngineCount: {
            /** @constant */
            kind: "exact";
            value: number;
            /** @enum {string} */
            scope: "eligible" | "matched";
        } | {
            /** @constant */
            kind: "lower_bound";
            value: number;
        } | {
            /** @constant */
            kind: "unknown";
        };
        AppliedConstraint: {
            value: components["schemas"]["SupportedFilter"];
            /** @enum {string} */
            origin: "explicit_control" | "explicit_text" | "permitted_preference" | "inferred";
            /** @enum {string} */
            strength: "hard" | "soft";
            /** @enum {string} */
            state: "supported" | "unsupported" | "ambiguous" | "conflicting";
            reasonCodes: string[];
        };
        CollectionRequest: {
            request: components["schemas"]["EngineRequest"];
            definitionIds: string[];
        };
        CollectionPage: {
            sections: {
                definitionId: string;
                titleKey: string;
                page: components["schemas"]["EnginePage"];
                viewAllRequest: components["schemas"]["EngineRequest"];
            }[];
            partial: boolean;
            reasonCodes: string[];
        };
        SharedConstraint: {
            value: components["schemas"]["SupportedFilter"];
            /** @enum {string} */
            origin: "explicit_control" | "explicit_text" | "permitted_preference" | "inferred";
            /** @enum {string} */
            strength: "hard" | "soft";
            evidence: string;
        };
        TaskRequest: {
            /** @constant */
            contractVersion: "1";
            requestId: string;
            discoveryReleaseId: string;
            components: {
                componentId: string;
                required: boolean;
                request: components["schemas"]["EngineRequest"];
            }[];
            sharedConstraints?: components["schemas"]["SharedConstraint"][];
        };
        TaskPage: {
            /** @enum {string} */
            status: "complete" | "partial" | "unavailable" | "needs_clarification";
            components: {
                componentId: string;
                page?: components["schemas"]["EnginePage"];
                reasonCodes: string[];
                /** @enum {string} */
                status: "ok" | "underfilled" | "unmapped" | "unsupported" | "needs_clarification" | "unavailable";
            }[];
        };
        EngineCapabilities: {
            /** @constant */
            contractVersion: "1";
            discoveryReleaseId: string;
            versions: components["schemas"]["Versions"];
            resultModes: ("merchant" | "offering")[];
            filterKinds: string[];
            sorts: string[];
            countKinds: ("exact" | "lower_bound" | "unknown")[];
            workflowKinds: string[];
            /** @enum {string} */
            readiness: "R0" | "R1" | "R2" | "R3" | "R4";
            limits: {
                /** @constant */
                maxPageSize: 48;
                /** @constant */
                maxTaskComponents: 4;
                /** @constant */
                maxRequiredTaskComponents: 3;
                /** @constant */
                maxBodyBytes: 65536;
                /** @constant */
                sessionLifetimeSeconds: 300;
            };
            policyCoverage: {
                nodeId: string;
                /** @enum {string} */
                state: "mapped" | "unmapped" | "partial" | "unsupported";
                reasonCodes: string[];
            }[];
        };
        PublicOffering: {
            ref: components["schemas"]["EngineRef"];
            name: string;
            description?: string;
            image?: string;
            listedPrice: components["schemas"]["MoneyFact"];
        };
        PublicMerchant: {
            ref: components["schemas"]["EngineRef"];
            name: string;
            area?: string;
            image?: string;
            items: components["schemas"]["PublicOffering"][];
            itemsCount: components["schemas"]["Count"];
            /** @enum {string} */
            itemsCompletion: "complete_scope" | "bounded_window" | "unknown";
        };
        Areas: {
            areas: string[];
        };
        WorkflowAssessmentRequest: {
            context: components["schemas"]["Context"];
            ref: components["schemas"]["EngineRef"];
            intent: components["schemas"]["WorkflowIntent"];
        };
        WorkflowAssessment: {
            assessmentRef: components["schemas"]["ObservedRef"];
            ref: components["schemas"]["EngineRef"];
            workflowRef?: components["schemas"]["SourceRef"];
            decisions: {
                canBrowse: components["schemas"]["Decision"];
                matchesHardRequest: components["schemas"]["Decision"];
                canSubmitRequest: components["schemas"]["Decision"];
                canTransact: components["schemas"]["Decision"];
            };
            versions: components["schemas"]["Versions"];
            /** Format: date-time */
            checkedAt: string;
            /** Format: date-time */
            validUntil?: string;
            allowedHandoffKinds: string[];
            reasonCodes: string[];
        };
        HandoffRequest: {
            assessmentRef: components["schemas"]["ObservedRef"];
            context: components["schemas"]["Context"];
            ref: components["schemas"]["EngineRef"];
            intent: components["schemas"]["WorkflowIntent"];
            handoffKind: string;
        };
        Handoff: {
            handoffRef: string;
            destinationKey: string;
            token: string;
            /** Format: date-time */
            expiresAt: string;
            /** @constant */
            businessEffect: "none";
            /** @constant */
            requiresOwnerRevalidation: true;
        };
        ClientEvent: {
            eventId: string;
            /** @enum {string} */
            type: "result_exposed" | "detail_opened" | "handoff_opened";
            ref: components["schemas"]["EngineRef"];
            exposureToken: string;
            /** Format: date-time */
            occurredAt: string;
            /** @description Zero-based position in the final delivered page, bound to exposureToken. */
            position?: number;
            exposure?: {
                visibleRatio: number;
                continuousVisibleMs: number;
                /** @constant */
                documentActive: true;
            };
        } & unknown;
        ClientEvents: {
            /** @constant */
            contractVersion: "1";
            events: components["schemas"]["ClientEvent"][];
        };
        OwnerOutcome: {
            eventId: string;
            ownerId: string;
            operationRef: components["schemas"]["SourceRef"];
            mappingRef: components["schemas"]["SourceRef"];
            /** @enum {string} */
            outcomeKind: "requested" | "confirmed" | "fulfilled" | "failed" | "cancelled" | "credit_posted" | "allowance_active" | "service_active" | "profile_provisioned";
            /** Format: date-time */
            occurredAt: string;
        };
        EventReceipt: {
            accepted: number;
            duplicates: number;
            rejected: number;
        };
        EngineHealth: {
            /** @enum {string} */
            status: "ok" | "degraded" | "unavailable";
            /** @constant */
            contractVersion: "1";
            /** @enum {string} */
            readiness: "R0" | "R1" | "R2" | "R3" | "R4";
        };
        EngineError: {
            /** @constant */
            contractVersion: "1";
            requestId: string;
            /** @enum {string} */
            code: "INVALID_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "RELEASE_INCOMPATIBLE" | "SOURCE_REVISION_CHANGED" | "IDEMPOTENCY_CONFLICT" | "UNSUPPORTED_CAPABILITY" | "REQUIRED_FACT_UNKNOWN" | "FACTS_TOO_STALE" | "CONSTRAINT_CONFLICT" | "QUOTE_EXPIRED" | "HOLD_EXPIRED" | "REVIEW_REQUIRED" | "LIMIT_EXCEEDED" | "RATE_LIMITED" | "OWNER_UNAVAILABLE" | "ACTION_OUTCOME_UNKNOWN" | "CLARIFICATION_REQUIRED" | "CURSOR_EXPIRED" | "CURSOR_RESTART_REQUIRED" | "CATALOG_UNAVAILABLE";
            retryable: boolean;
            /** @enum {string} */
            recovery: "correct_request" | "authenticate" | "review" | "restart_preserving_constraints" | "retry_read" | "lookup_intent" | "wait" | "owner_support" | "none" | "clarify";
            fieldPaths: string[];
            clarification?: {
                clarificationKey: string;
                messageKey: string;
                affectedPaths: string[];
                options: {
                    optionId: string;
                    labelKey: string;
                }[];
            };
        } & unknown;
        ReleaseContext: {
            /** @constant */
            contractVersion: "1";
            discoveryReleaseId: string;
            versions: components["schemas"]["Versions"];
            collections: ({
                id: string;
                categoryId: string;
                titleKey: string;
                title?: string;
            } | {
                id: string;
                categoryId: string;
                titleKey?: string;
                title: string;
            })[];
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    engineHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Typed read/decision result; no operational commitment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineHealth"];
                };
            };
            /** @description Typed failure preserving request constraints */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
        };
    };
    readEngineCapabilities: {
        parameters: {
            query: {
                releaseId: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Typed read/decision result; no operational commitment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineCapabilities"];
                };
            };
            /** @description Typed failure preserving request constraints */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
        };
    };
    discoverResults: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                /** @description Server-issued signed anonymous paging scope. Initial requests receive it through Set-Cookie; cursor/offset continuation requires the same caller cookie. This is not authentication. */
                nexg_discovery_page?: string;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EngineRequest"];
            };
        };
        responses: {
            /** @description Typed read/decision result; no operational commitment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EnginePage"];
                };
            };
            /** @description Typed failure preserving request constraints */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
        };
    };
    composeCollections: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: {
                /** @description Server-issued signed anonymous paging scope. Initial requests receive it through Set-Cookie; cursor/offset continuation requires the same caller cookie. This is not authentication. */
                nexg_discovery_page?: string;
            };
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CollectionRequest"];
            };
        };
        responses: {
            /** @description Typed read/decision result; no operational commitment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CollectionPage"];
                };
            };
            /** @description Typed failure preserving request constraints */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
        };
    };
    readMerchantDetail: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Typed read/decision result; no operational commitment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicMerchant"];
                };
            };
            /** @description Typed failure preserving request constraints */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
        };
    };
    readExactOfferingDetail: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                merchantId: string;
                offeringId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Typed read/decision result; no operational commitment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicOffering"];
                };
            };
            /** @description Typed failure preserving request constraints */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
        };
    };
    readCatalogAreas: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Typed read/decision result; no operational commitment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Areas"];
                };
            };
            /** @description Typed failure preserving request constraints */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
        };
    };
    discoverTaskComponents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TaskRequest"];
            };
        };
        responses: {
            /** @description Typed read/decision result; no operational commitment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaskPage"];
                };
            };
            /** @description Typed failure preserving request constraints */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
        };
    };
    observeClientEvents: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClientEvents"];
            };
        };
        responses: {
            /** @description Typed read/decision result; no operational commitment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventReceipt"];
                };
            };
            /** @description Typed failure preserving request constraints */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
        };
    };
    assessWorkflowReadiness: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["WorkflowAssessmentRequest"];
            };
        };
        responses: {
            /** @description Typed read/decision result; no operational commitment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WorkflowAssessment"];
                };
            };
            /** @description Typed failure preserving request constraints */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
        };
    };
    prepareOwnerHandoff: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HandoffRequest"];
            };
        };
        responses: {
            /** @description Typed read/decision result; no operational commitment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Handoff"];
                };
            };
            /** @description Typed failure preserving request constraints */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
        };
    };
    observeVerifiedOwnerOutcome: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OwnerOutcome"];
            };
        };
        responses: {
            /** @description Typed read/decision result; no operational commitment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EventReceipt"];
                };
            };
            /** @description Typed failure preserving request constraints */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
        };
    };
    readPublishedReleaseContext: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Typed read/decision result; no operational commitment */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ReleaseContext"];
                };
            };
            /** @description Typed failure preserving request constraints */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
            /** @description Typed failure preserving request constraints */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EngineError"];
                };
            };
        };
    };
}
