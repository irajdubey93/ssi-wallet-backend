FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile || yarn install

# Copy prisma schema
COPY prisma ./prisma/

# Generate Prisma client
RUN yarn prisma:generate

# Copy source code
COPY src ./src/

# Create data directory
RUN mkdir -p data

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:3000/health || exit 1

# Run migrations and start server
CMD ["sh", "-c", "yarn prisma:migrate && node src/index.js"]
