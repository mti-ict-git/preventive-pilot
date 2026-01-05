FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./

COPY backend/package.json backend/package-lock.json ./backend/
RUN npm ci --prefix ./backend

COPY backend ./backend
RUN npm run --prefix ./backend build


FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json ./backend/
RUN npm ci --omit=dev --prefix ./backend

WORKDIR /app/backend

COPY --from=build /app/backend/dist ./dist

ENV NODE_ENV=production

EXPOSE 5056

CMD ["node", "dist/index.js"]
