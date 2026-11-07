FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY openapi.json card.json ./
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "src/server.js"]
