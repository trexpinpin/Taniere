/* =====================================================================
   La Tanière PinpinRex : configuration
   ---------------------------------------------------------------------
   Remplace les valeurs ci-dessous par celles de TON projet Firebase
   (voir LISEZ-MOI-INSTALLATION.md, étape 1).
   Ces valeurs ne sont pas secrètes : la sécurité est assurée par les
   règles Firestore (firestore.rules). Ne mets JAMAIS ici le fichier JSON
   du « compte de service ».
   ===================================================================== */
self.TANIERE_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCFDzRdZ-MDNQg74tZT3ztBoG3ert4q6EY",
    authDomain: "taniere-pinpinrex.firebaseapp.com",
    projectId: "taniere-pinpinrex",
    storageBucket: "taniere-pinpinrex.firebasestorage.app",
    messagingSenderId: "803436643352",
    appId: "1:803436643352:web:6d4ff4df08cb8bea302f6d"
  },
  // Paramètres du projet → Cloud Messaging → Certificats Web Push → « Paire de clés »
  vapidKey: "BASdXQ9w6vd-_C2z48DAq9qfiXvpmbs7oiCc5YwiFviTIkVZ1PrvPvo7eywwvvMxZ2XSmU7T8qiJ1z5PM7H1rA8",
  // Optionnel (étape 5) : adresse du petit serveur IA pour lire les tickets en photo.
  // Laisse vide pour désactiver la lecture automatique.
  aiEndpoint: ""
};
