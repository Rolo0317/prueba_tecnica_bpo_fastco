# syntax=docker/dockerfile:1

# ---- 1. Dependencias completas (para compilar) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- 2. Compilación TypeScript → JavaScript ----
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- 3. Imagen final: solo dependencias de producción y código compilado ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Sin privilegios de root dentro del contenedor.
USER node
EXPOSE 3000

CMD ["node", "dist/server.js"]
