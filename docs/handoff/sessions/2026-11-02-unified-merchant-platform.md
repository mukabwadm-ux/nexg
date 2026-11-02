# Unified merchant platform

The current merchant workspace changes and the newer platform mainline have been combined in the Derrick NEXG checkout. Continue implementation from this checkout rather than maintaining a second copy. The former merchant workspace remains locally as a backup and may still host an existing development server; it is not the source of the unified branch.

The integration preserves the merchant application review and the platform's deactivated/deleted merchant sections. Catalogue entry retains the platform's batch and photo support with the merchant workspace's owner and section checks. The platform's bookings board and the workspace calendar are retained as distinct existing routes pending any deliberate consolidation of their underlying workflows.

Local environment files and the Resend key remain ignored by Git. Auth email delivery is configured only for the local Supabase instance; a hosted project still needs its own configuration and a real inbox journey check. Email verification does not itself establish approval or prove that every setup service is ready.
