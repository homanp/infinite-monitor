FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Pre-initialize the widget workspace so first widget build is fast
COPY widget-template/ data/widget-workspace/
RUN cd data/widget-workspace && npm install
RUN cd data/widget-workspace && npx shadcn@latest add --yes \
    button card badge input table tabs scroll-area skeleton separator \
    progress alert avatar checkbox dialog dropdown-menu label popover \
    radio-group select sheet slider switch textarea toggle tooltip \
    accordion collapsible command context-menu hover-card menubar \
    navigation-menu pagination resizable sonner

# ── Runtime ──
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Next.js standalone server
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Widget template (needed by ensureWorkspace at runtime)
COPY --from=builder /app/widget-template ./widget-template

# Pre-built workspace staged for volume seeding
COPY --from=builder /app/data/widget-workspace ./widget-workspace-seed

# Entrypoint seeds the volume on first boot, then starts the server
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

RUN mkdir -p data/widget-workspace data/widget-builds data/widgets-dist

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
