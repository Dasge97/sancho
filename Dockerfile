FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run typecheck && npm test && npm run build
FROM node:22-alpine
# git: el servicio cerebro clona los repositorios que revisa el agente.
# php84 y gitleaks: análisis estático del worker. `php -l` solo compila; ninguno ejecuta el proyecto.
ARG TARGETARCH
ARG GITLEAKS_VERSION=8.28.0
RUN apk add --no-cache git php84 \
 && ln -sf /usr/bin/php84 /usr/local/bin/php \
 && case "${TARGETARCH:-amd64}" in \
      amd64) arch=x64; sum=a65b5253807a68ac0cafa4414031fd740aeb55f54fb7e55f386acb52e6a840eb ;; \
      arm64) arch=arm64; sum=eff65261156100e5d94a6b3dec313d532fddfe19ae1590bf7a2b4f2699128356 ;; \
      *) echo "Arquitectura no soportada: ${TARGETARCH}" && exit 1 ;; \
    esac \
 && wget -qO /tmp/gitleaks.tgz "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${arch}.tar.gz" \
 && echo "${sum}  /tmp/gitleaks.tgz" | sha256sum -c - \
 && tar -xzf /tmp/gitleaks.tgz -C /usr/local/bin gitleaks \
 && rm /tmp/gitleaks.tgz
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
