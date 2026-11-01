# My ShopCaisse 4.2.5.1 — préversion intégrée

## Important
Cette livraison est une préversion de travail. Elle conserve les données locales de la boutique et ajoute une première application effective des permissions sur l'appareil courant. Elle n'active PAS encore la gestion cloud multi-téléphones.

## Modifications de l'interface
- Ajout du choix du rôle attribué au téléphone courant (Vendeur, Gérant ou rôle personnalisé).
- Le changement de rôle exige le code Patron.
- Les permissions `sell`, `stock`, `debt`, `void` et `expenses` sont vérifiées dans les actions correspondantes.
- Les rôles personnalisés héritent initialement des permissions du rôle Vendeur; le Patron peut ensuite les ajuster.
- Le code Patron continue de donner un accès temporaire complet pendant cinq minutes.
- La sélection du rôle est locale à ce téléphone et sauvegardée dans les données locales.

## Backend cloud fourni
Les routes `api/config`, `api/health`, `api/cloud-register`, `api/team`, `api/invite`, `api/sync` et `api/ai-chat` ainsi que les bibliothèques serveur sont présentes. Elles ne sont pas encore raccordées à l'interface utilisateur pour les appels authentifiés. Le système d'authentification Supabase Auth, la liaison QR et la synchronisation automatique ne sont donc pas annoncés comme opérationnels.

## Variables Vercel
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (secret serveur uniquement)
- `APP_ORIGIN`
- `OPENAI_API_KEY` (nécessaire pour l'IA distante)

Ne jamais placer une clé `sb_secret_` dans `public/index.html`, dans le navigateur ou dans GitHub.

## Tests réalisés dans cet environnement
- Vérification syntaxique `node --check` du JavaScript embarqué dans `public/index.html`.
- Vérification syntaxique `node --check` des fichiers JavaScript des routes API et bibliothèques serveur.
- Contrôle d'archive ZIP après création.

## Tests restant à réaliser avant production
- Test manuel des permissions avec un code Patron réel et un appareil de test.
- Tests Auth Supabase avec deux comptes distincts.
- Tests d'invitation et révocation d'employé.
- Tests de synchronisation multi-appareils, conflits, suppressions et fonctionnement hors ligne.
- Tests réels de l'assistante IA avec clé API et quota actif.

## Déploiement prudent
Ne pas remplacer la production. Importer cette archive dans un projet Vercel de préproduction séparé, configurer les variables d'environnement, puis vérifier `/api/health`. Ne basculer le domaine de production qu'après les tests de bout en bout.
