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

# Widget build infrastructure
COPY --from=builder /app/widget-template ./widget-template
COPY --from=builder /app/data/widget-workspace ./data/widget-workspace

# Writable directories for runtime builds and SQLite
RUN mkdir -p data/widget-builds data/widgets-dist

EXPOSE 3000

CMD ["node", "server.js"]
