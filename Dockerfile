
FROM node:18-alpine

WORKDIR /app

# Copy the whole project
COPY . .

# Install dependencies
RUN npm ci

# Install global tools
RUN npm install -g tsx tsconfig-paths @types/node dotenv

# Build the frontend (in case it wasn't built correctly before)
RUN VITE_MODE=production npm run build:production:fast

# Clean up development dependencies to reduce size
RUN npm prune --production

# Make sure necessary folders exist
RUN mkdir -p dist

# Expose the server port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production
ENV VITE_MODE=production

# Start server using our tsx-based runner
CMD ["node", "start-server.js", "production"]
