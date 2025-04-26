# Use Node official image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Expose port
ENV PORT 8080
EXPOSE 8080

# Run the app
CMD ["node", "server.js"]
