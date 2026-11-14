FROM node:22-alpine
WORKDIR /workspace
COPY . .
RUN npm install && npm run build --workspace @service-oriente/shared \
    && npm run db:generate --workspace @service-oriente/document-registry-service \
    && npm run build --workspace @service-oriente/document-registry-service
WORKDIR /workspace/services/document-registry-service
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && exec node dist/src/server.js"]
