# ============================================================
# ATEROLAS Ship Monitoring Dashboard - Dockerfile
# ============================================================

# Stage 1: Production stage with Nginx
FROM nginx:alpine

# Maintainer info
LABEL maintainer="Feby Syarief <febysyarief.ocean@gmailcom>"
LABEL description="ATEIROLAS Ship Monitoring Dashboard"
LABEL version="1.0.0"

# Install curl for healthcheck
RUN apk add --no-cache curl

# Remove default nginx config and files
RUN rm -rf /usr/share/nginx/html/*
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy application files
# Note: Context for build should be project root
COPY frontend/index.html /usr/share/nginx/html/
COPY frontend/styles.css /usr/share/nginx/html/
COPY frontend/app.js /usr/share/nginx/html/

# Copy assets
COPY frontend/assets /usr/share/nginx/html/assets

# Set ownership and permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
  chmod -R 755 /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Healthcheck to monitor container
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
