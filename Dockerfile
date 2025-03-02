# Use the official Node.js image as the base image
FROM node:16

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the ports the app runs on
EXPOSE $WEB_PORT
EXPOSE $DICOM_WEB_PORT

# Command to run the application
CMD ["node", "proxy.js"]