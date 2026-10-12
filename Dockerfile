# syntax=docker/dockerfile:1
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

COPY data.csv ./
COPY Core/ ./Core/

USER node

# Interactive CLI: run with `docker run -it --env-file .env <image>`
ENTRYPOINT ["node", "Core/src/main.ts"]