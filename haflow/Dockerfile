ARG BUILD_ARCH=amd64
ARG BUILD_VERSION=0.1.0

FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

FROM ghcr.io/home-assistant/base:latest
WORKDIR /app

ARG BUILD_ARCH=amd64
ARG BUILD_VERSION=0.1.0

LABEL \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.type="app" \
    io.hass.arch="${BUILD_ARCH}"

ENV HAFLOW_DATA_DIR=/data \
    NODE_ENV=production \
    PORT=4177

RUN apk add --no-cache nodejs

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server
COPY --from=builder /app/dist ./dist
COPY run.sh /run.sh

RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
