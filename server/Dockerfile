# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./

# Local development: all dependencies, source bind-mounted by docker-compose.
FROM base AS dev
ENV NODE_ENV=development
RUN npm ci
COPY . .
EXPOSE 5001
CMD ["npm", "run", "dev"]

# Production: runtime dependencies only, running as the unprivileged node user.
FROM base AS prod
ENV NODE_ENV=production
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
USER node
EXPOSE 5001
CMD ["node", "src/index.js"]
