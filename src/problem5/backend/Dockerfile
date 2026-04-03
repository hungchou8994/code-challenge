FROM node:22-alpine AS base
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/

# Install all workspace deps
RUN npm ci --workspace=shared --workspace=backend

# Copy source
COPY shared/ ./shared/
COPY backend/ ./backend/
COPY tsconfig.base.json ./

# Generate Prisma client
WORKDIR /app/backend
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# ---- Runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/

RUN npm ci --workspace=shared --workspace=backend --omit=dev

COPY shared/ ./shared/
COPY --from=base /app/backend/dist ./backend/dist
COPY --from=base /app/backend/src/generated ./backend/src/generated
COPY backend/prisma ./backend/prisma
COPY backend/prisma.config.ts ./backend/
COPY tsconfig.base.json ./

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/backend/src/server.js"]
