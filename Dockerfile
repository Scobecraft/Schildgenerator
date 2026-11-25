# Schildgenerator – Webseite für Preisschilder (expert Asbach)
# Basis-Image enthält Node.js und Chromium inkl. aller Systembibliotheken.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY public ./public

# Hochgeladene Logos bleiben im Volume erhalten
VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "server/server.js"]
