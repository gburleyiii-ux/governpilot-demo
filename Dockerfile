FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV SENTINELOPS_API_HOST=0.0.0.0
ENV PORT=4175
# Aegis C1: do NOT bake SENTINELOPS_AUTH_MODE=local-dev. Runtime must inject jwt|oidc
# (plus JWT secret or OIDC JWKS/issuer/audience) or assertAuthPostureOrExit refuses boot.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY agent ./agent
COPY server ./server
COPY evals ./evals
COPY data/.gitignore ./data/.gitignore
EXPOSE 4175
CMD ["npm", "run", "start"]
