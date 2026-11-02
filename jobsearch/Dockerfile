# The JobMatch apply/render server (server/index.ts): Chrome + Node, for a
# container host (Render, Koyeb, Cloud Run, Fly, Railway). Built and published
# by .github/workflows/apply-server-image.yml as ghcr.io/maorho/jobmatch-apply.
#
# Lives in jobsearch/ (not server/) because Cloud Build and most hosts take the
# Dockerfile's directory as the build context:  cd jobsearch && docker build .

# ---- 1. compile the TypeScript (full dev toolchain, thrown away) ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# The app's lockfile pins typescript; skip every postinstall (puppeteer would download Chrome here for nothing).
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY server ./server
# worker.ts imports the Next app and is not part of this image; compile the three server files only.
RUN npx tsc server/index.ts server/formAgent.ts server/phone.ts \
      --outDir dist --module commonjs --target es2020 --moduleResolution node \
      --esModuleInterop --skipLibCheck --resolveJsonModule

# ---- 2. run on the official Puppeteer image: matching Chrome preinstalled, non-root user ----
FROM ghcr.io/puppeteer/puppeteer:24.43.1
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PORT=4000
WORKDIR /home/pptruser/app
COPY --chown=pptruser:pptruser server/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build --chown=pptruser:pptruser /app/dist ./dist
EXPOSE 4000
# Render/Koyeb/Cloud Run inject PORT; the server listens on it (default 4000).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
