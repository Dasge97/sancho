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
# Opengrep v1.30.1 y sus reglas de PHP, JavaScript, TypeScript y Python, fijadas a un commit.
# Las reglas llevan licencia LGPL 2.1 con «Commons Clause»: uso interno, no para venderlas.
ARG OPENGREP_VERSION=1.30.1
ARG OPENGREP_RULES_COMMIT=f1d2b562b414783763fd02a6ed2736eaed622efa
RUN case "${TARGETARCH:-amd64}" in \
      amd64) arch=x86; sum=e66f22675fae171ac1244d49b7f6a2e15a2d3613f3df9aad3c7fb2aaa1461c3a ;; \
      arm64) arch=aarch64; sum=1162fa775fd5865032bd8a0484fbdeb41f1c6711d88caf36e9981f98921c087d ;; \
    esac \
 && wget -qO /usr/local/bin/opengrep "https://github.com/opengrep/opengrep/releases/download/v${OPENGREP_VERSION}/opengrep_musllinux_${arch}" \
 && echo "${sum}  /usr/local/bin/opengrep" | sha256sum -c - \
 && chmod 755 /usr/local/bin/opengrep \
 && git clone -q https://github.com/opengrep/opengrep-rules.git /tmp/opengrep-rules \
 && git -C /tmp/opengrep-rules checkout -q "${OPENGREP_RULES_COMMIT}" \
 && mkdir -p /opt/opengrep-rules \
 && for l in php javascript typescript python; do cp -r "/tmp/opengrep-rules/$l" /opt/opengrep-rules/; done \
 && cp /tmp/opengrep-rules/LICENSE /opt/opengrep-rules/LICENSE \
 && rm -r /tmp/opengrep-rules
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/src/db/schema.sql ./dist-server/db/schema.sql
COPY prompts ./prompts
# Casos del banco de pruebas: node dist-server/eval.js
COPY evals/casos ./evals/casos
EXPOSE 3000
CMD ["node","dist-server/server.js"]
