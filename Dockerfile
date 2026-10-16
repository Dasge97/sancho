FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run typecheck && npm test && npm run build
FROM node:22-alpine
# git: el servicio cerebro clona los repositorios que revisa el agente.
RUN apk add --no-cache git
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/src/db/schema.sql ./dist-server/db/schema.sql
COPY prompts ./prompts
EXPOSE 3000
CMD ["node","dist-server/server.js"]
