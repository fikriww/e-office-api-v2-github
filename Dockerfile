FROM oven/bun:1.3.2 AS base
WORKDIR /usr/src/app

# install dependencies
FROM base AS install
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
RUN bun install

# build stage
FROM base AS builder
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY --from=install /usr/src/app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
COPY prisma ./prisma
ENV NODE_ENV=production

# runtime stage
FROM base AS release
RUN apt-get update && apt-get install -y python3 && rm -rf /var/lib/apt/lists/*
COPY --from=install /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json /usr/src/app/bun.lock /usr/src/app/tsconfig.json ./
COPY --from=builder /usr/src/app/src ./src
COPY --from=builder /usr/src/app/prisma ./prisma

ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT [ "bun", "start" ]