# Build stage
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

# git is needed to read the current commit SHA at build time so the
# built bundle can advertise its version (sidebar shows "build <sha>").
RUN apk add --no-cache git

# Dependency layer — only invalidated when package{,-lock}.json actually
# change. Everything above this point is cheap; everything below takes
# 10-15s to rebuild so we cache aggressively here.
COPY package.json package-lock.json ./
RUN npm ci

# Source (including .git) goes after npm ci so the expensive install
# layer is still cached across commits where only application code
# changes. We intentionally include .git so we can read the HEAD commit
# without depending on orchestrator-specific env vars (Coolify's
# SOURCE_COMMIT / COOLIFY_GIT_COMMIT_SHA forwarding through compose
# shell expansion turned out to be unreliable — this is a hard
# guarantee that works in any environment that `git clone`s the repo).
COPY . .

# Derive BUILD_ID from git HEAD. An explicit ARG still wins (for local
# builds where you want to override), but the common case is deploys
# where the orchestrator checked out a specific commit and we just
# read its SHA directly.
ARG BUILD_ID=
RUN if [ -z "$BUILD_ID" ]; then \
      if git rev-parse --short HEAD > /tmp/sha 2>/dev/null; then \
        export BUILD_ID="$(cat /tmp/sha)"; \
      else \
        export BUILD_ID="dev"; \
      fi; \
    fi && \
    echo "Building with BUILD_ID=$BUILD_ID" && \
    echo "$BUILD_ID" > /app/public/BUILD_ID.txt && \
    echo "$BUILD_ID" > /tmp/build_id && \
    VITE_BUILD_ID="$BUILD_ID" npm run build

# Runtime stage
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/public/BUILD_ID.txt /usr/share/nginx/html/BUILD_ID.txt
COPY supabase/selfhost/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
