FROM node:22-alpine
WORKDIR /workspace
COPY . .
RUN npm install && npm run build --workspace @service-oriente/shared \
    && npm run db:generate --workspace @service-oriente/verification-service \
    && npm run build --workspace @service-oriente/verification-service
WORKDIR /workspace/services/verification-service
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && exec node dist/src/server.js"]
