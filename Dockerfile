# Build stage
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

# Dependency layer — only invalidated when package{,-lock}.json actually
# change. Everything above this point is cheap; everything below takes
# 10-15s to rebuild so we cache aggressively here.
COPY package.json package-lock.json ./
RUN npm ci

# BUILD_ID is a unique identifier for this build (commit SHA, deployment UUID,
# or timestamp). Passed by docker-compose from the environment so that every
# deploy produces a different layer hash — prevents Coolify / BuildKit from
# silently reusing cached layers when source changes are subtle or when the
# compose rebuild is triggered without "no cache".
#
# Placed AFTER `npm ci` on purpose: a changing BUILD_ID invalidates every
# subsequent layer, and we want the expensive `npm ci` step cached across
# deploys where only the commit changed.
ARG BUILD_ID=dev
ENV VITE_BUILD_ID=$BUILD_ID
LABEL build_id=$BUILD_ID
RUN echo "Building app with BUILD_ID=$BUILD_ID"

COPY . .
RUN echo "$BUILD_ID" > /app/public/BUILD_ID.txt && npm run build

# Runtime stage
FROM nginx:1.27-alpine
ARG BUILD_ID=dev
LABEL build_id=$BUILD_ID
COPY --from=build /app/dist /usr/share/nginx/html
COPY supabase/selfhost/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
