# NEXG booking runtime. Build from the repository root:
#   docker build -f apps/booking-engine/Dockerfile .
# Needs BOOKING_DATABASE_URL, PAYLOAD_SECRET and BOOKING_BRIDGE_SECRET at runtime.
FROM node:22-slim
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY packages/config/package.json packages/config/
COPY packages/booking-config/package.json packages/booking-config/
COPY apps/booking-engine/package.json apps/booking-engine/
RUN pnpm install --frozen-lockfile --filter @nexg/booking-engine...
COPY packages/config packages/config
COPY packages/booking-config packages/booking-config
COPY apps/booking-engine apps/booking-engine
WORKDIR /repo/apps/booking-engine
ENV NODE_ENV=production BOOKING_HOST=0.0.0.0
EXPOSE 3003
# Apply any pending reviewed migrations, then serve.
CMD ["sh", "-c", "pnpm migrate && pnpm start"]
