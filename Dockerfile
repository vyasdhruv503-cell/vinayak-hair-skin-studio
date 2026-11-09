FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 SALON_DATA_DIR=/data
WORKDIR /app
COPY --chown=node:node package.json server.mjs services.mjs salon-info.mjs notifications.mjs booking.mjs owner.mjs profile.mjs index.html owner.html profile.html gallery.html gallery.mjs home-gallery.mjs home-content.mjs owner-offer.mjs owner-gallery.mjs rating.mjs google-rating.mjs google-auth.mjs google-login.mjs site-info.html logo.jpg manifest.webmanifest sw.js app.mjs app.css install.html offline.html app-icon-180.png app-icon-192.png app-icon-512.png ./
COPY --chown=node:node scripts/ ./scripts/
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
