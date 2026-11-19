# Site de commande en ligne : restaurant de burgers

Phase 1 : commande en ligne (retrait et livraison), notification WhatsApp avec Telegram en secours, espace admin.
Site en français et en anglais. Paiement à la réception de la commande.

## Ce qui est inclus

- **Site client** (`/`) : menu par catégories, panier, commande en 2 minutes, bascule FR / EN.
- **Espace restaurant** (`/admin.html`) : commandes en direct avec alerte sonore, changement de statut (reçue, en préparation, prête, terminée, annulée), prix et disponibilité des plats.
- **Serveur** (Node.js, Express) : les prix sont toujours relus en base, jamais pris dans le navigateur.
- **Base de données** : PostgreSQL.

## Tester en local (le plus simple)

Prérequis : Node.js 18 ou plus, PostgreSQL.

1. Créez une base vide : `createdb restaurant`
2. `npm install`
3. Copiez `.env.example` vers `.env` et gardez seulement la ligne `DATABASE_URL=...` (adaptée à votre base).
4. `npm start`

Au premier démarrage, le serveur crée les tables, ajoute le menu d'exemple et crée un compte admin de test : l'email et le mot de passe s'affichent dans le terminal. Ouvrez http://localhost:4000 (site) et http://localhost:4000/admin.html (espace restaurant).

## Tester sur Render (le plus simple)

1. New + > Postgres (Free), puis New + > Web Service (Free) relié à votre dépôt GitHub, Build `npm install`, Start `npm start`.
2. Une seule variable : `DATABASE_URL` = l'Internal Database URL de la base.
3. Une fois déployé, ouvrez l'onglet **Logs** : le compte admin de test et son mot de passe y sont affichés au premier démarrage.

Pour la vraie mise en service, définissez `ADMIN_EMAIL` et `ADMIN_PASSWORD`, `SESSION_SECRET`, `NODE_ENV=production` et les informations du restaurant (voir le guide de déploiement).

## Personnaliser

- **Nom, adresse, horaires, téléphone, frais de livraison** : variables `RESTAURANT_*` et `DELIVERY_FEE` du fichier `.env`.
- **Menu** : `scripts/setup.js` contient un menu d'exemple (noms, descriptions, prix provisoires). Modifiez-le avant `npm run setup`, ou changez les prix et la disponibilité depuis l'espace admin.
- **Photos des plats** : copiez les images dans `public/img/` (par exemple `classic.jpg`), puis dans l'espace admin, onglet « Menu et prix », saisissez `/img/classic.jpg` dans le champ photo du plat. Les plats cochés « À la une » (jusqu'à 4) s'affichent en grand sous l'accueil, dans la section « Les incontournables ». Les autres photos apparaissent à côté du plat dans la carte.
- **Photo principale de l'accueil** : copiez l'image dans `public/img/accueil.jpg` et renseignez `HERO_IMAGE=/img/accueil.jpg` dans `.env`. Sans cette variable, c'est le burger dessiné qui s'affiche.
- **Conseil pour les photos** : format paysage 4:3 pour les plats à la une, portrait 4:5 pour l'accueil, fichiers JPG de moins de 300 Ko (compresser avec squoosh.app).
- **Couleurs et polices** : variables en haut de `public/styles.css`.
- **Textes** : `public/i18n.js` (français et anglais).

## Notification WhatsApp (API officielle Meta)

1. Créer un compte Meta Business et le faire vérifier (prévoir quelques jours).
2. Dans Meta for Developers, créer une application, ajouter le produit WhatsApp et enregistrer le numéro d'envoi.
3. Créer un modèle de message de catégorie **Utilité**, nommé `nouvelle_commande`, en français, avec ce corps :
   `Nouvelle commande n°{{1}} : {{2}}. Total : {{3}}`
   et attendre son approbation.
4. Renseigner dans `.env` : `WA_TOKEN` (jeton permanent), `WA_PHONE_ID`, `WA_TO` (numéro du restaurant, format international sans le +).

Chaque nouvelle commande envoie alors un message au restaurant. Les frais sont facturés par Meta, par message livré, selon la grille tarifaire du pays (à vérifier sur la page officielle des tarifs).

## Notification Telegram de secours (gratuite)

1. Sur Telegram, créer un bot avec @BotFather et copier son jeton dans `TG_TOKEN`.
2. Créer un groupe avec le personnel, y ajouter le bot, puis récupérer l'identifiant du groupe (`TG_CHAT_ID`).

Si aucun canal n'est configuré, la commande est simplement affichée dans les journaux du serveur et reste visible dans l'espace admin.

## Mettre en ligne (exemple : Render ou Railway)

1. Envoyer le projet sur GitHub (le fichier `.env` n'y est pas : il est dans `.gitignore`).
2. Créer une base PostgreSQL chez l'hébergeur et copier son adresse dans `DATABASE_URL`. Mettre `PGSSL=true` si l'hébergeur l'exige.
3. Créer un service web Node : commande de build `npm install`, commande de démarrage `npm start`.
4. Ajouter toutes les variables du `.env` dans les réglages de l'hébergeur, avec `NODE_ENV=production`.
5. Lancer une fois `npm run setup` et `npm run create-admin -- ...` depuis la console de l'hébergeur.

## Accessibilité sur tous les réseaux (Orange, MTN...)

Contexte : sur un projet précédent (jobboa), des utilisateurs du réseau Orange n'arrivaient pas à joindre la base de données depuis leur navigateur. Ici, l'architecture évite ce cas : le navigateur ne parle qu'au site, et c'est le serveur (sur Render) qui parle à la base de données. La base n'est jamais exposée aux visiteurs.

Le seul point à surveiller est l'adresse du site elle-même :
1. Utilisez un nom de domaine à vous (Render : Settings > Custom Domains) plutôt que l'adresse en `onrender.com`.
2. Avant la mise en service, ouvrez le site depuis une connexion Orange puis MTN, passez une commande test et connectez-vous à `/admin.html`.
3. Si un réseau bloque quand même l'accès, il faudra placer un relais devant le site (par exemple Cloudflare). Dans ce cas seulement, mettez `TRUST_PROXY=2` sur Render pour que la limite anti-abus continue de distinguer les clients.

## Sécurité : points déjà traités

Mots de passe hachés (scrypt), session signée en cookie `HttpOnly`, requêtes SQL paramétrées, limitation du nombre de commandes et de connexions par adresse IP, validation de toutes les entrées côté serveur.

## Prochaines phases

- Phase 2 : paiement en ligne (carte et Mobile Money via un agrégateur).
- Phase 3 : réservation de table et pages complémentaires (galerie, à propos).
- Ajout et suppression de plats depuis l'espace admin (aujourd'hui : prix et disponibilité).
