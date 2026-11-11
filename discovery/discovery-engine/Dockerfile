# NexG discovery engine: the read-only Discovery service. Build from the repository root:
#   docker build -f discovery/discovery-engine/Dockerfile .
# At runtime it reads Supabase with the public key only:
#   DISCOVERY_SOURCE=supabase, SUPABASE_URL, SUPABASE_ANON_KEY
FROM node:24-slim AS build
WORKDIR /app/discovery/discovery-engine
COPY discovery/discovery-engine/package.json discovery/discovery-engine/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY discovery/discovery-engine/tsconfig.json ./
COPY discovery/discovery-engine/src ./src
COPY discovery/discovery-engine/engines ./engines
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production DISCOVERY_ENGINE_HOST=0.0.0.0 DISCOVERY_ENGINE_PORT=5190
WORKDIR /app/discovery/discovery-engine
COPY discovery/discovery-engine/package.json discovery/discovery-engine/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/discovery/discovery-engine/dist ./dist
# The pinned release approval and the API contracts the engine validates against.
COPY discovery/discovery-engine/config ./config
COPY discovery/discovery-engine/docs/contracts ./docs/contracts
# What the release and the Supabase connector read, relative to the discovery folder.
COPY discovery/docs/discovery /app/discovery/docs/discovery
COPY discovery/assets/icons-web /app/discovery/assets/icons-web
COPY discovery/demo-seed/subcategory-map.json /app/discovery/demo-seed/subcategory-map.json
USER node
EXPOSE 5190
CMD ["node", "dist/src/server/main.js"]
