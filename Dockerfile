# Stage 1: build frontend
FROM node:20-alpine AS frontend
WORKDIR /app
COPY package.json ./
RUN npm install
COPY index.html vite.config.mjs tailwind.config.js postcss.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

# Stage 2: production
FROM node:20-alpine
WORKDIR /app

# Install system deps for file preview generation
RUN apk add --no-cache \
    ffmpeg \
    perl-image-exiftool \
    vips \
    vips-dev \
    vips-heif \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

COPY package.json ./
RUN npm install --omit=dev

COPY server ./server
COPY --from=frontend /app/dist ./dist

EXPOSE 3000

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000

CMD ["node", "server/index.js"]
