# syntax=docker/dockerfile:1

# ---- 1. Build de producción (verifica tipos y genera estáticos) ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- 2. nginx sin privilegios: sirve los estáticos y hace proxy de /api ----
FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
