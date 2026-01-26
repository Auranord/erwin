# Build stage
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

# Runtime stage
FROM node:22-bookworm-slim
WORKDIR /app

ENV PIPX_HOME=/opt/pipx
ENV PIPX_BIN_DIR=/usr/local/bin

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip pipx ffmpeg \
  && pipx install yt-dlp \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app

EXPOSE 3000
CMD ["npm", "start"]
