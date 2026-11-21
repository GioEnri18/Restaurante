# Fase 4.7: Dockerfile multi-stage ligero para backend Node.js (JavaScript puro + Express + Sequelize)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Crear usuario no-root para endurecimiento en contenedor
RUN addgroup -S posgroup && adduser -S posuser -G posgroup \
    && mkdir -p /app/media/platillos && chown posuser:posgroup /app/media/platillos

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

USER posuser
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health/ready || exit 1

CMD ["node", "src/server.js"]
