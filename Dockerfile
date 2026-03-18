FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Pre-initialize the widget workspace so first widget build is fast
COPY widget-template/ widget-workspace/
RUN cd widget-workspace && npm install
RUN cd widget-workspace && npx shadcn@latest add --yes \
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
ENV WIDGET_WORKSPACE_PATH=/app/widget-workspace

# Next.js standalone server
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Widget template (needed by ensureWorkspace fallback)
COPY --from=builder /app/widget-template ./widget-template

# Pre-built workspace lives outside /app/data so the volume doesn't shadow it
COPY --from=builder /app/widget-workspace ./widget-workspace

RUN mkdir -p data/widget-builds data/widgets-dist

EXPOSE 3000

CMD ["node", "server.js"]
