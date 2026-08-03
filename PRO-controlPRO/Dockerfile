FROM nginx:1.27-alpine

COPY deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html offline.html manifest.webmanifest sw.js version.json health.json robots.txt /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
COPY textX /usr/share/nginx/html/textX
COPY src /usr/share/nginx/html/src

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health.json >/dev/null 2>&1 || exit 1
