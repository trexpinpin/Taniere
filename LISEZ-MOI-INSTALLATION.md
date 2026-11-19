# 🐧🦖 La Tanière PinpinRex : installer votre appli

À la fin de ce guide, vous aurez une vraie appli sur vos deux téléphones Android et sur le PC :
- avec son icône et ses notifications ;
- qui fonctionne même sans réseau ;
- **gratuite** (pas de carte bancaire nécessaire) ;
- qui n'a plus besoin de Claude.

⏱️ Compte environ **45 minutes** la première fois, de préférence **sur un PC**.

| Service | À quoi il sert | Coût |
|---|---|---|
| **Firebase** (Google) | Connexion, base de données partagée, notifications | Gratuit (plan « Spark ») |
| **GitHub** | Héberge l'appli et envoie les rappels chaque matin | Gratuit |
| *(Optionnel)* **Cloudflare** + **Anthropic** | Lecture automatique des tickets en photo | Cloudflare gratuit · Anthropic payant à l'usage |

> **Contenu du dossier.** `index.html`, `host.js`, `config.js`, `sw.js`, `manifest.webmanifest` et les icônes, c'est l'appli. `firestore.rules`, ce sont les règles de sécurité. `.github/` et `rappels/`, ce sont les rappels du matin. `ia-cloudflare/`, c'est la lecture des tickets (optionnelle).

---

## Étape 1 : Firebase (base de données et connexion) · ~15 min

1. Va sur **https://console.firebase.google.com** avec ton compte Google **personnel**, puis clique sur **« Créer un projet »**.
   - Nom : `taniere-pinpinrex` (ou ce que tu veux).
   - Google Analytics : **désactivé** (inutile).
2. **Connexion des utilisateurs** : menu **Créer → Authentication → Commencer**, onglet **Méthode de connexion**.
   - Active **Google** (choisis ton e-mail comme « e-mail d'assistance ») et enregistre.
   - Active aussi **Adresse e-mail/Mot de passe** et enregistre.
3. **Base de données** : menu **Créer → Firestore Database → Créer une base de données**.
   - Emplacement : **`europe-west1` (Belgique)**.
   - Démarre en **mode production**.
4. **Sécurité** : toujours dans Firestore, onglet **Règles**. Efface tout, colle le contenu du fichier **`firestore.rules`**, puis clique sur **Publier**.
5. **Clés de l'appli** : ⚙️ **Paramètres du projet → Général**, en bas « Vos applications », clique sur l'icône **`</>`** (Web).
   - Surnom : `Tanière`. Ne coche pas « Firebase Hosting ». Clique sur **Enregistrer**.
   - Firebase affiche un bloc `firebaseConfig = { apiKey: ..., authDomain: ..., ... }`. **Recopie ces 6 valeurs dans `config.js`**, à la place des `À_REMPLACER`.
6. **Notifications** : ⚙️ **Paramètres du projet → Cloud Messaging**, rubrique « Configuration Web ».
   - Sous **Certificats Web Push**, clique sur **« Générer une paire de clés »**.
   - Copie la clé et colle-la dans `config.js`, à la ligne `vapidKey`.
7. **Clé du service de rappels** : ⚙️ **Paramètres du projet → Comptes de service → « Générer une nouvelle clé privée »**.
   - Un fichier `.json` se télécharge. 🔒 **Il est secret** : ne le mets jamais dans le dossier de l'appli et ne l'envoie à personne. Tu en auras besoin à l'étape 2.5.

---

## Étape 2 : GitHub (mise en ligne et rappels) · ~15 min

1. Crée un compte sur **https://github.com**. Clique sur **« New repository »**.
   - Nom : `taniere`. Visibilité : **Public**.
   - Le code est visible, mais **vos données ne le sont pas** : elles restent dans Firebase, protégées par les règles. Clique sur **Create repository**.
2. Sur la page du dépôt, clique sur **« uploading an existing file »** (ou **Add file → Upload files**).
   - **Glisse tout le contenu du dossier**, y compris le dossier **`.github`** et le fichier `config.js` complété, mais **jamais** le fichier JSON secret.
   - Clique sur **Commit changes**.
   - 💡 Vérifie ensuite que le dossier `.github/workflows/rappels.yml` apparaît bien. Sinon : **Add file → Create new file**, tape le nom `.github/workflows/rappels.yml` et colle son contenu.
3. **Mettre l'appli en ligne** : **Settings → Pages**.
   - Source : **Deploy from a branch**, branche **main**, dossier **/ (root)**. Clique sur **Save**.
   - Après 1 à 2 minutes, l'adresse s'affiche : **`https://TON-PSEUDO.github.io/taniere/`**.
4. **Autoriser cette adresse dans Firebase** : Firebase → **Authentication → Paramètres → Domaines autorisés → Ajouter un domaine**.
   - Ajoute **`TON-PSEUDO.github.io`**.
5. **Brancher les rappels** : sur GitHub, **Settings → Secrets and variables → Actions**.
   - Onglet **Secrets**, **New repository secret** : nom **`FIREBASE_SERVICE_ACCOUNT`**, valeur = **tout le contenu** du fichier JSON de l'étape 1.7 (ouvre-le avec le Bloc-notes et copie tout).
   - Onglet **Variables**, **New repository variable** : nom **`APP_URL`**, valeur **`https://TON-PSEUDO.github.io/taniere/`** (avec le `/` final).
6. **Activer les rappels** : onglet **Actions**. Si GitHub le demande, active les workflows.
   - Ouvre **« Rappels quotidiens »**, clique sur **Run workflow** (case « test » cochée), puis sur **Run**.
   - Ensuite, il tourne tout seul **chaque matin vers 8 h**.
   - ⚠️ Sur un dépôt public, GitHub met en pause les tâches automatiques après **60 jours sans aucune modification du dépôt**. GitHub prévient par e-mail : il suffit de cliquer sur « Enable workflow », ou de mettre à jour un fichier de temps en temps (par exemple à chaque nouvelle version de l'appli).

---

## Étape 3 : installer sur vos téléphones et le PC · ~5 min

**Pinpin (le premier)**
1. Sur Android, ouvre **Chrome**, va à l'adresse de l'appli, puis menu **⋮ → « Installer l'application »** (ou « Ajouter à l'écran d'accueil »).
2. Ouvre l'appli depuis l'icône **🏠🐧🦖**, puis **Continuer avec Google**.
3. Choisis **« 🏡 Créer notre Tanière »**, puis **« 🐧 Pinpin »**.
4. **Budget → ⚙️ → 🔔 Notifications → Activer sur cet appareil**, puis **Tester**.
5. Dans la même page, **copie le lien d'invitation** et envoie-le à T-Rex.

**T-Rex**
1. Elle ouvre le lien d'invitation dans **Chrome** et installe l'appli de la même façon.
2. Elle se connecte avec **son propre compte** Google, puis clique sur **Rejoindre** (le code est déjà rempli).
3. Elle choisit **« 🦖 T-Rex »** et active les notifications.

**Sur le PC** : ouvre l'adresse dans Chrome ou Edge. L'icône **⊕ Installer** dans la barre d'adresse installe l'appli comme un programme.

---

## Étape 4 : récupérer les données de l'ancienne appli (dans Claude)

1. Dans **l'ancienne appli** (le lien claude.ai) : **Budget → ⚙️ → 📦 Sauvegarde complète**. Garde le fichier `.zip`.
2. Dans **la nouvelle appli** : **Budget → ⚙️ → ♻️ Restaurer une sauvegarde**, puis choisis ce `.zip`.

Tout revient : tickets, photos, factures, prélèvements, budgets, épargne, garanties, liste, produits…

---

## Étape 5 *(optionnelle)* : lecture des tickets et factures par l'IA

Sans cette étape, l'appli marche entièrement : tu encodes simplement les montants à la main (ou via l'import bancaire). Avec elle, le bouton **« ✨ Lire avec l'IA »** apparaît sur les photos.

1. **Clé API** : sur **https://console.anthropic.com**, crée un compte, ajoute un moyen de paiement et un petit crédit, puis **API Keys → Create Key**. Copie la clé.
   - C'est facturé à l'usage, pour chaque ticket lu. Tu peux fixer une **limite de dépense mensuelle** dans la console.
2. **Petit serveur** : sur **https://dash.cloudflare.com**, crée un compte gratuit.
   - Va dans **Workers & Pages → Create → Worker**, nomme-le `taniere-ia`, puis clique sur **Deploy**.
   - Clique sur **Edit code**, remplace tout le code par celui de **`ia-cloudflare/worker.js`**, puis clique à nouveau sur **Deploy**.
3. Toujours dans Cloudflare, ouvre **Settings → Variables and Secrets** et ajoute :
   - `ANTHROPIC_API_KEY` = ta clé (type **Secret**)
   - `FIREBASE_PROJECT_ID` = l'identifiant de ton projet Firebase (le `projectId` de config.js)
   - `ALLOWED_ORIGIN` = `https://TON-PSEUDO.github.io`
4. Copie l'adresse du Worker, du type `https://taniere-ia.xxx.workers.dev`. Colle-la dans **`config.js`** → `aiEndpoint`, puis remets `config.js` sur GitHub (**Add file → Upload files**).

---

## Mises à jour de l'appli

Quand je te prépare une nouvelle version, remplace simplement les fichiers modifiés sur GitHub (**Add file → Upload files**). **Garde ton `config.js`.** L'appli se met à jour toute seule sur les téléphones à la prochaine ouverture : parfois il faut la fermer et la rouvrir une fois.

## Import bancaire : ING et Beobank

- **Beobank** : sur **Beobank Online** (navigateur, sur PC, pas l'appli mobile), va dans **Services → Téléchargement des opérations** et choisis le format **CSV**.
- **ING** : sur **Home'Bank** (navigateur, sur PC), ouvre ton compte, puis l'historique des opérations, et exporte en **CSV**.
- Dans l'appli, ouvre **Budget → 🏦 → Importer un relevé CSV**. Les colonnes sont reconnues automatiquement. Tu choisis à qui est le compte, l'appli rapproche ce qui est déjà encodé, puis tu valides.
- Si un fichier est mal reconnu, envoie-moi les 3 premières lignes **avec les montants et les noms masqués**, et j'adapterai la reconnaissance.

## Sécurité et vie privée

- Seules les personnes **membres de votre Tanière** (connectées et ayant rejoint avec le code) peuvent lire ou modifier vos données.
- Les valeurs de `config.js` ne sont pas secrètes (c'est normal avec Firebase). **Le seul secret est le fichier JSON du compte de service** : il ne vit que dans les « Secrets » GitHub.
- Les journaux du service de rappels n'affichent que des nombres (aucun montant ni nom), car le dépôt est public.
- Pour changer le code d'invitation : **Budget → ⚙️ → 🔄 Nouveau code**.

## En cas de souci

| Problème | Solution |
|---|---|
| « Configuration à terminer » | `config.js` contient encore `À_REMPLACER` (étape 1.5) |
| « Ce site n'est pas autorisé » à la connexion | Ajoute `TON-PSEUDO.github.io` aux domaines autorisés (étape 2.4) |
| « Accès refusé » | Règles Firestore non publiées (étape 1.4) |
| Pas de notification | Active-les dans Réglages, vérifie `vapidKey` (étape 1.6), et lance le workflow en mode test (étape 2.6) |
| Le workflow échoue | Vérifie le secret `FIREBASE_SERVICE_ACCOUNT` (tout le JSON, accolades comprises) |
