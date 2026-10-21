# One container runs the web app and Joe's worker, sharing one SQLite file on a persistent volume.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/threadsbyjoe.db
COPY --from=build /app /app
RUN mkdir -p /data
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "scripts/start.mjs"]
