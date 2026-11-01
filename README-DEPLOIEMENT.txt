MY SHOPCAISSE 4.2.5.1 — PRÉPRODUCTION

IMPORTANT : ceci est une préversion de test, pas une version commerciale finale.
Elle conserve les données locales et apporte une première gestion locale des rôles.
La gestion cloud multi-appareils, l'authentification des employés et la synchronisation automatique ne sont pas encore intégrées à l'interface.

STRUCTURE VERCEL :
- index.html : application web
- api/ : fonctions serveur
- lib/ : bibliothèques serveur
- supabase/ : schéma et migration SQL
- package.json et vercel.json : configuration

VARIABLES VERCEL À CONFIGURER (uniquement dans les paramètres du projet) :
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY (secret serveur uniquement)
APP_ORIGIN (URL du projet de préproduction)
OPENAI_API_KEY (nécessaire uniquement pour tester l'IA distante)

Ne jamais mettre une clé secrète dans index.html ou dans le navigateur.
Ne pas importer le SQL une seconde fois : le schéma a déjà été exécuté dans le projet Supabase du propriétaire.

DÉPLOIEMENT : créer un NOUVEAU projet Vercel nommé my-shopcaisse-preview-4251, séparé du projet de production.
Ne pas connecter de domaine de production.
Après déploiement, vérifier /api/health. Si le test échoue, ne pas basculer la production.

LIMITES CONNUES :
- Les permissions intégrées dans l'interface sont locales à l'appareil courant.
- L'authentification Supabase Auth des employés et le parcours d'invitation ne sont pas encore raccordés à l'interface.
- La synchronisation automatique des ventes, clients, stocks et clôtures n'est pas encore opérationnelle.
- L'IA distante exige une clé OPENAI_API_KEY et un test réel.
