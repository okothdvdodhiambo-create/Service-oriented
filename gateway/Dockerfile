FROM node:22-alpine
WORKDIR /workspace
COPY . .
RUN npm install && npm run build --workspace @service-oriente/shared \
    && npm run build --workspace @service-oriente/gateway
WORKDIR /workspace/gateway
EXPOSE 8080
CMD ["node", "dist/server.js"]
