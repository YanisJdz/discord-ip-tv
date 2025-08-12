FROM node:24-slim

# ---- System deps ----
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl xz-utils \
 && rm -rf /var/lib/apt/lists/*

# ---- FFmpeg BtbN (version ARM64 GPL) ----
RUN set -eux; \
  curl -L "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz" -o /tmp/ffmpeg.tar.xz; \
  mkdir -p /opt/ffmpeg && tar -xf /tmp/ffmpeg.tar.xz -C /opt/ffmpeg --strip-components=1; \
  cp /opt/ffmpeg/bin/ffmpeg /usr/local/bin/; \
  cp /opt/ffmpeg/bin/ffprobe /usr/local/bin/; \
  chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe; \
  ffmpeg -version

# ---- App ----
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production

CMD ["npm", "start"]