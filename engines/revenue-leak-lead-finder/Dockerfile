FROM node:22-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . ./
CMD ["npm", "start", "--silent"]
