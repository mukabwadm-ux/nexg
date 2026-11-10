# NexG Sandbox Bank. Build from the repository root:
#   docker build -f apps/bank-sandbox/Dockerfile -t nexg-bank-sandbox .
# Run with SANDBOX_API_KEY, SANDBOX_WEBHOOK_SECRET and PUBLIC_URL set.
FROM node:22-slim
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/bank-sandbox/package.json apps/bank-sandbox/
RUN pnpm install --frozen-lockfile --filter @nexg/bank-sandbox...
COPY apps/bank-sandbox apps/bank-sandbox
WORKDIR /repo/apps/bank-sandbox
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4010 DATA_FILE=/data/sandbox.json
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 4010
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4010/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "start"]
