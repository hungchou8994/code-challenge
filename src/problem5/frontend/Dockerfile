FROM node:22-alpine AS base
WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/

# Install all workspace deps
RUN npm ci --workspace=shared --workspace=frontend

# Copy source
COPY shared/ ./shared/
COPY frontend/ ./frontend/
COPY tsconfig.base.json ./

# Build Next.js
WORKDIR /app/frontend
RUN npm run build

# ---- Runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/

RUN npm ci --workspace=shared --workspace=frontend --omit=dev

COPY shared/ ./shared/
COPY --from=base /app/frontend/.next ./frontend/.next
COPY frontend/public ./frontend/public
COPY tsconfig.base.json ./

WORKDIR /app/frontend

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "run", "start", "--", "--port", "3001"]
