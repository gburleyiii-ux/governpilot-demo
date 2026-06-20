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
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY agent ./agent
COPY server ./server
COPY evals ./evals
COPY data/.gitignore ./data/.gitignore
EXPOSE 4175
CMD ["npm", "run", "start"]
