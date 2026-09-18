# Dev-mode container: runs the Vite dev server with HMR, source bind-mounted
# in from docker-compose.yml rather than baked into the image. There's no
# deployment target yet (see README's "not yet scaffolded" history), so a
# production multi-stage build (static assets served by nginx) is deferred
# until one exists.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]
