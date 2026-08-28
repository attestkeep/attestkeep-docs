# Rendered by a script, served by nginx. No node in the running image and
# nothing fetched at container start.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY scripts ./scripts
COPY src ./src
COPY public ./public
RUN node scripts/render.mjs && node scripts/check.mjs

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/public /srv/docs
EXPOSE 80
