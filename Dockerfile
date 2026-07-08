# syntax=docker/dockerfile:1

# ---- Build stage: compile the static SPA ----
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies from the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Build the production bundle (tsc typecheck + vite build -> dist/).
COPY . .
RUN npm run build

# ---- Serve stage: static files via nginx ----
FROM nginx:1.27-alpine AS serve

# Site config: SPA fallback, application/wasm MIME, asset caching, COOP/COEP.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy only the built static assets.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
