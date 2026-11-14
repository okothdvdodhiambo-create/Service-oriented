FROM node:22-alpine
WORKDIR /workspace
COPY . .
RUN npm install && npm run build --workspace @service-oriente/shared \
    && npm run db:generate --workspace @service-oriente/verification-service \
    && npm run build --workspace @service-oriente/auth-service
WORKDIR /workspace/services/auth-service
EXPOSE 3000
CMD ["node", "dist/server.js"]
