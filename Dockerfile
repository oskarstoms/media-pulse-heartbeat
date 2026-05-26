# --- build stage ---
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# --- runtime ---
FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/vite.config.ts ./
COPY --from=build /app/tsconfig.json ./
EXPOSE 3000
CMD ["sh", "-c", "bun run preview --host 0.0.0.0 --port ${PORT:-3000}"]
