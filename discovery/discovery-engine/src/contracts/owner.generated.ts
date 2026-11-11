// Generated from WORKFLOW_V1.openapi.json. Run npm run generate; do not edit.
export interface paths {
    "/capabilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** readWorkflowCapabilities */
        get: operations["readWorkflowCapabilities"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owners/{ownerId}/entitlement-plans/{planId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** readEntitlementPlan */
        get: operations["readEntitlementPlan"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owners/{ownerId}/entitlements/{entitlementId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** readPrivateEntitlement */
        get: operations["readPrivateEntitlement"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owners/{ownerId}/resources/availability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** queryResourceAvailability */
        post: operations["queryResourceAvailability"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owners/{ownerId}/series/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** previewFiniteSeries */
        post: operations["previewFiniteSeries"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owners/{ownerId}/telecom-products/{productId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** readTelecomProduct */
        get: operations["readTelecomProduct"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owners/{ownerId}/recipients/validations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** validatePrivateRecipientHandoff */
        post: operations["validatePrivateRecipientHandoff"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owners/{ownerId}/quotes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** quoteWorkflowIntent */
        post: operations["quoteWorkflowIntent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owners/{ownerId}/holds": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** holdQuotedScope */
        post: operations["holdQuotedScope"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owners/{ownerId}/holds/{holdId}/release": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** releaseOwnerHold */
        post: operations["releaseOwnerHold"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owners/{ownerId}/operations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** commitReviewedWorkflowIntent */
        post: operations["commitReviewedWorkflowIntent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owners/{ownerId}/operations/{operationId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** readOwnerOperation */
        get: operations["readOwnerOperation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/owners/{ownerId}/operation-lookups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** recoverIntentWithoutOperationId */
        post: operations["recoverIntentWithoutOperationId"];
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
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    readWorkflowCapabilities: {
        parameters: {
            query: {
                ownerId: string;
                merchantId: string;
                offeringId: string;
                releaseId: string;
            };
            header?: {
                "X-Request-ID"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authoritative response; status semantics remain separate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Capabilities"];
                };
            };
            /** @description Malformed request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Scope denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Source entity not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Version or intent conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Recognized unsupported/unknown/invalid semantics */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Bounded overload */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Owner unavailable; not evidence that a submitted command failed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    readEntitlementPlan: {
        parameters: {
            query?: never;
            header?: {
                "X-Request-ID"?: string;
            };
            path: {
                ownerId: string;
                planId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authoritative response; status semantics remain separate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EntitlementPlan"];
                };
            };
            /** @description Malformed request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Scope denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Source entity not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Version or intent conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Recognized unsupported/unknown/invalid semantics */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Bounded overload */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Owner unavailable; not evidence that a submitted command failed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    readPrivateEntitlement: {
        parameters: {
            query?: never;
            header?: {
                "X-Request-ID"?: string;
            };
            path: {
                ownerId: string;
                entitlementId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authoritative response; status semantics remain separate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Entitlement"];
                };
            };
            /** @description Malformed request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Scope denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Source entity not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Version or intent conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Recognized unsupported/unknown/invalid semantics */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Bounded overload */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Owner unavailable; not evidence that a submitted command failed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    queryResourceAvailability: {
        parameters: {
            query?: never;
            header?: {
                "X-Request-ID"?: string;
            };
            path: {
                ownerId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AvailabilityRequest"];
            };
        };
        responses: {
            /** @description Authoritative response; status semantics remain separate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Availability"];
                };
            };
            /** @description Malformed request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Scope denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Source entity not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Version or intent conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Recognized unsupported/unknown/invalid semantics */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Bounded overload */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Owner unavailable; not evidence that a submitted command failed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    previewFiniteSeries: {
        parameters: {
            query?: never;
            header?: {
                "X-Request-ID"?: string;
            };
            path: {
                ownerId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SeriesPreviewRequest"];
            };
        };
        responses: {
            /** @description Authoritative response; status semantics remain separate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeriesPreview"];
                };
            };
            /** @description Malformed request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Scope denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Source entity not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Version or intent conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Recognized unsupported/unknown/invalid semantics */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Bounded overload */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Owner unavailable; not evidence that a submitted command failed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    readTelecomProduct: {
        parameters: {
            query?: never;
            header?: {
                "X-Request-ID"?: string;
            };
            path: {
                ownerId: string;
                productId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authoritative response; status semantics remain separate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TelecomProduct"];
                };
            };
            /** @description Malformed request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Scope denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Source entity not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Version or intent conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Recognized unsupported/unknown/invalid semantics */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Bounded overload */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Owner unavailable; not evidence that a submitted command failed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    validatePrivateRecipientHandoff: {
        parameters: {
            query?: never;
            header?: {
                "X-Request-ID"?: string;
            };
            path: {
                ownerId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RecipientValidationRequest"];
            };
        };
        responses: {
            /** @description Authoritative response; status semantics remain separate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RecipientValidation"];
                };
            };
            /** @description Malformed request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Scope denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Source entity not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Version or intent conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Recognized unsupported/unknown/invalid semantics */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Bounded overload */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Owner unavailable; not evidence that a submitted command failed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    quoteWorkflowIntent: {
        parameters: {
            query?: never;
            header: {
                "X-Request-ID"?: string;
                /** @description Owner-scoped single-intent key; changed payload is a 409. Never generate a new key to recover an uncertain outcome. */
                "Idempotency-Key": string;
            };
            path: {
                ownerId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QuoteRequest"];
            };
        };
        responses: {
            /** @description Authoritative response; status semantics remain separate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Quote"];
                };
            };
            /** @description Malformed request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Scope denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Source entity not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Version or intent conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Recognized unsupported/unknown/invalid semantics */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Bounded overload */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Owner unavailable; not evidence that a submitted command failed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    holdQuotedScope: {
        parameters: {
            query?: never;
            header: {
                "X-Request-ID"?: string;
                /** @description Owner-scoped single-intent key; changed payload is a 409. Never generate a new key to recover an uncertain outcome. */
                "Idempotency-Key": string;
            };
            path: {
                ownerId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["HoldRequest"];
            };
        };
        responses: {
            /** @description Authoritative response; status semantics remain separate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Hold"];
                };
            };
            /** @description Malformed request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Scope denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Source entity not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Version or intent conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Recognized unsupported/unknown/invalid semantics */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Bounded overload */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Owner unavailable; not evidence that a submitted command failed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    releaseOwnerHold: {
        parameters: {
            query?: never;
            header: {
                "X-Request-ID"?: string;
                /** @description Owner-scoped single-intent key; changed payload is a 409. Never generate a new key to recover an uncertain outcome. */
                "Idempotency-Key": string;
            };
            path: {
                ownerId: string;
                holdId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ReleaseHoldRequest"];
            };
        };
        responses: {
            /** @description Authoritative response; status semantics remain separate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Operation"];
                };
            };
            /** @description Owner accepted/pending or submission outcome unknown; recover this intent, never infer confirmation */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Operation"];
                };
            };
            /** @description Malformed request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Scope denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Source entity not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Version or intent conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Recognized unsupported/unknown/invalid semantics */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Bounded overload */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Owner unavailable; not evidence that a submitted command failed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    commitReviewedWorkflowIntent: {
        parameters: {
            query?: never;
            header: {
                "X-Request-ID"?: string;
                /** @description Owner-scoped single-intent key; changed payload is a 409. Never generate a new key to recover an uncertain outcome. */
                "Idempotency-Key": string;
            };
            path: {
                ownerId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CommitRequest"];
            };
        };
        responses: {
            /** @description Authoritative response; status semantics remain separate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Operation"];
                };
            };
            /** @description Owner accepted/pending or submission outcome unknown; recover this intent, never infer confirmation */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Operation"];
                };
            };
            /** @description Malformed request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Scope denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Source entity not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Version or intent conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Recognized unsupported/unknown/invalid semantics */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Bounded overload */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Owner unavailable; not evidence that a submitted command failed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    readOwnerOperation: {
        parameters: {
            query?: never;
            header?: {
                "X-Request-ID"?: string;
            };
            path: {
                ownerId: string;
                operationId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Authoritative response; status semantics remain separate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Operation"];
                };
            };
            /** @description Malformed request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Scope denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Source entity not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Version or intent conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Recognized unsupported/unknown/invalid semantics */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Bounded overload */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Owner unavailable; not evidence that a submitted command failed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
    recoverIntentWithoutOperationId: {
        parameters: {
            query?: never;
            header?: {
                "X-Request-ID"?: string;
            };
            path: {
                ownerId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LookupRequest"];
            };
        };
        responses: {
            /** @description Authoritative response; status semantics remain separate */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Lookup"];
                };
            };
            /** @description Malformed request */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Authentication required */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Scope denied */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Source entity not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Version or intent conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Recognized unsupported/unknown/invalid semantics */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Bounded overload */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
            /** @description Owner unavailable; not evidence that a submitted command failed */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApiError"];
                };
            };
        };
    };
}
