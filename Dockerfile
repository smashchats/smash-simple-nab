FROM node:22.12 AS npm

WORKDIR /app

ENV CI=true
ENV NODE_ENV=production

COPY package*.json .
RUN npm ci --omit=dev

# ================================

FROM npm AS prod-deps

RUN npm cache clean --force

# ================================

FROM npm AS build

ENV NODE_ENV=development
RUN npm ci

COPY . .

RUN npm run build

# ================================

FROM softhsmv2 AS final

WORKDIR /app

RUN mkdir -p /app/config && chown -R node:node /app/config

COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=prod-deps --chown=node:node /app/package.json /app/package.json
COPY --from=build --chown=node:node /app/dist /app/dist

USER node
CMD ["node", "/app/dist/src/index.js"]

# TODO: split into devcontainer and prod
# TODO: mount radicle for easy collaboration
# TODO: document README
