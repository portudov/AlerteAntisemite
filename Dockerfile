# Image de production pour la plateforme de signalements
FROM node:22-alpine

WORKDIR /app

# Dependances (Express uniquement ; SQLite est integre a Node)
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Code de l'application
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/app.db

# Les donnees (base SQLite) vivent ici : montez un volume sur ce dossier
# pour conserver les signalements entre les redemarrages.
VOLUME /app/data
EXPOSE 3000

CMD ["npm", "start"]
