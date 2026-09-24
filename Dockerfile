# Publica o Hangar como site estático (Coolify, ou qualquer host que rode Docker).
# O app é um HTML único já gerado por `node tools/pack.mjs` e versionado em dist/.
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/Hangar.html /usr/share/nginx/html/index.html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
