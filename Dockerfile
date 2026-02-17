# ============================================================
# ATEIROLAS Ship Monitoring Dashboard - Dockerfile
# ============================================================
# Multi-stage build untuk optimasi size

# Stage 1: Build stage (tidak diperlukan karena static files)
# Langsung ke production stage

# Stage 2: Production stage dengan Nginx
FROM nginx:alpine

# Maintainer info
LABEL maintainer="Feby Syarief <febysyarief.ocean@gmailcom>"
LABEL description="ATEIROLAS Ship Monitoring Dashboard"
LABEL version="1.0.0"

# Install curl untuk healthcheck
RUN apk add --no-cache curl

# Hapus default nginx config dan files
RUN rm -rf /usr/share/nginx/html/*
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy aplikasi ke nginx html directory
COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/

# Set ownership dan permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Healthcheck untuk monitoring container
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
