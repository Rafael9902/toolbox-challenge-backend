# NodeJS 14 has no macOS arm64 build, but its Linux image does: running the API
# in Docker is the way to reach the required runtime on Apple Silicon without
# Rosetta.
FROM node:14-alpine

WORKDIR /app

# Dependencies are copied and installed on their own so the layer is reused
# while only the source changes.
COPY package.json package-lock.json ./
# --ignore-scripts skips the husky `prepare` hook, which has no git repository
# to install into and no purpose inside an image.
RUN npm ci --only=production --ignore-scripts

COPY src ./src

EXPOSE 3000

# node directly, not `npm start`: npm would sit between the signals and the
# process, and the container could not be stopped cleanly.
CMD ["node", "src/server.js"]
