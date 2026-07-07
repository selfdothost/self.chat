# syntax=docker/dockerfile:1
# self.chat — SvelteKit client, built static and served by nginx.
#
# This image is frontend-only. It does NOT bundle or proxy the API: the
# deploy's ingress path-routes a single VIP, with `/` -> this container and
# `/api`,`/ws`,`/ollama`,`/openai`,... -> the self.ai API pod. The SPA calls
# the API with same-origin relative URLs (see src/lib/constants.ts,
# WEBUI_BASE_URL=''), so no API host is baked in here.

######## build ########
FROM node:22-alpine3.20 AS build
WORKDIR /app

ARG APP_BUILD_HASH=dev-build
ENV APP_BUILD_HASH=${APP_BUILD_HASH}

# The vite build (pyodide + onnxruntime + the full app) needs a large V8 heap;
# node's ~2GB default OOMs. Build on a runner with the RAM to back this.
ENV NODE_OPTIONS=--max-old-space-size=6144

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

######## serve ########
FROM nginx:1.27-alpine AS serve

# SPA-aware config: static assets + fallback to index.html for client routes.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK CMD wget -q -O /dev/null http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
