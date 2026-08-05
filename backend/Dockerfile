FROM node:22-alpine AS deps
WORKDIR /app

COPY communication-service/package*.json ./communication-service/
RUN npm ci --omit=dev --prefix ./communication-service

COPY backend/package*.json ./backend/
# El postinstall del backend instala la carpeta hermana. En Docker ya se instala
# de forma explicita para que el artefacto sea determinista y no dependa del cwd.
RUN npm ci --omit=dev --ignore-scripts --prefix ./backend

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY --from=deps /app/communication-service/node_modules ./communication-service/node_modules
COPY backend ./backend
COPY communication-service ./communication-service

WORKDIR /app/backend
EXPOSE 5000
CMD ["node", "src/server.js"]
