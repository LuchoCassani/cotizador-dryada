# ── Etapa 1: build ────────────────────────────────────────────
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Herramientas para compilar better-sqlite3 (node-gyp) y extraer PrusaSlicer
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ curl ca-certificates squashfs-tools \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc && cp -r src/data dist/data && npm prune --omit=dev

# Descargar y extraer PrusaSlicer — unsquashfs con offset fijo (validado en C-5)
RUN curl -sL -o /tmp/PrusaSlicer.AppImage \
      "https://github.com/prusa3d/PrusaSlicer/releases/download/version_2.8.1/PrusaSlicer-2.8.1%2Blinux-x64-newer-distros-GTK3-202409181416.AppImage" \
    && unsquashfs -q -o 193728 -d /tmp/squashfs-root /tmp/PrusaSlicer.AppImage \
    && mv /tmp/squashfs-root/usr /opt/prusaslicer \
    && rm -rf /tmp/PrusaSlicer.AppImage /tmp/squashfs-root

# ── Etapa 2: runtime ──────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# Dependencias de sistema requeridas por PrusaSlicer en runtime.
# libwebkit2gtk-4.1-0 es requerida — el binario la enlaza dinámicamente, no viene bundled.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libglib2.0-0 libgl1 libgtk-3-0 libgdk-pixbuf2.0-0 \
      libatk1.0-0 libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
      libharfbuzz0b libfontconfig1 libfreetype6 libx11-6 \
      libwebkit2gtk-4.1-0 \
    && rm -rf /var/lib/apt/lists/*

# node_modules copiado del build stage — incluye el binario nativo de better-sqlite3
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /opt/prusaslicer /opt/prusaslicer

RUN ln -s /opt/prusaslicer/bin/prusa-slicer /usr/local/bin/prusa-slicer

ENV LD_LIBRARY_PATH=/opt/prusaslicer/lib

RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "dist/server.js"]
