/* =====================================================================
   La Tanière PinpinRex : couche « appli installée »
   Connexion (Google ou e-mail), foyer partagé avec code d'invitation,
   base de données Firestore (hors-ligne inclus), photos, notifications,
   téléchargements et lecture IA optionnelle.
   L'application elle-même (index.html) ne change pas : elle parle à
   cette couche via window.claude.use(...) comme dans la version Claude.
   ===================================================================== */
(() => {
  'use strict';
  const CFG = self.TANIERE_CONFIG || {};
  const configured = !!(CFG.firebase && CFG.firebase.apiKey && !/REMPLACER/.test(CFG.firebase.apiKey));
  let fs = null, auth = null, messaging = null, hid = null, uid = null, swReg = null, household = null, installEvt = null;
  let resolveReady; const ready = new Promise(r => { resolveReady = r; });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };

  /* ---------------- service worker (hors-ligne + notifications) ---------------- */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(r => { swReg = r; }).catch(() => {});
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; const b = document.getElementById('hInstall'); if (b) b.style.display = ''; });

  /* ---------------- erreurs Firestore → codes de l'appli ---------------- */
  const mapErr = e => {
    const c = e && e.code || '';
    const code = /permission-denied|unauthenticated/.test(c) ? 'invalid_argument' : /resource-exhausted/.test(c) ? 'resource_exhausted' : /not-found|invalid-argument|failed-precondition/.test(c) ? 'invalid_argument' : 'unavailable';
    return {code, message: e && e.message || String(e)};
  };
  const clean = d => JSON.parse(JSON.stringify(d ?? {}));   // Firestore refuse « undefined »
  // Hors-ligne : l'écriture est appliquée localement tout de suite et partira dès le retour du réseau.
  const settle = p => { p.catch(() => {}); return Promise.race([p.catch(e => { throw mapErr(e); }), sleep(navigator.onLine ? 4000 : 300)]); };

  /* ---------------- adaptateur base de données ---------------- */
  const base = () => `households/${hid}`;
  const wrapSnap = s => ({id: s.id, exists: s.exists, data: () => s.data(), metadata: {fromCache: s.metadata.fromCache, hasPendingWrites: s.metadata.hasPendingWrites}});
  const wrapQS = s => { const docs = s.docs.map(wrapSnap); return {docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {fromCache: s.metadata.fromCache, hasPendingWrites: s.metadata.hasPendingWrites}}; };
  function wrapDoc(ref, path) {
    return {
      id: ref.id, path,
      get: async () => { try { return wrapSnap(await ref.get()); } catch (e) { throw mapErr(e); } },
      set: d => settle(ref.set(clean(d))),
      update: d => settle(ref.update(clean(d))),
      delete: () => settle(ref.delete()),
      onSnapshot: (next, err) => ref.onSnapshot(s => next(wrapSnap(s)), e => err && err(mapErr(e))),
      collection: p => wrapCol(ref.collection(p), path + '/' + p),
      acquire: async () => ({acquired: true}),
    };
  }
  function wrapQuery(q) {
    return {
      where: (f, o, v) => wrapQuery(q.where(f, o, v)),
      orderBy: (f, d) => wrapQuery(q.orderBy(f, d || 'asc')),
      limit: n => wrapQuery(q.limit(n)),
      get: async () => { try { return wrapQS(await q.get()); } catch (e) { throw mapErr(e); } },
      onSnapshot: (next, err) => q.onSnapshot(s => next(wrapQS(s)), e => err && err(mapErr(e))),
    };
  }
  function wrapCol(c, path) {
    return Object.assign(wrapQuery(c), {
      path,
      doc: id => { const r = id ? c.doc(id) : c.doc(); return wrapDoc(r, path + '/' + r.id); },
      add: async d => { const r = c.doc(); await settle(r.set(clean(d))); return wrapDoc(r, path + '/' + r.id); },
    });
  }
  const dbApi = {
    doc: p => wrapDoc(fs.doc(`${base()}/${p}`), p),
    collection: p => wrapCol(fs.collection(`${base()}/${p}`), p),
  };

  /* ---------------- photos (stockées compressées dans Firestore) ---------------- */
  const phCache = new Map(), phLoading = new Map();
  const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  async function shrink(blob, max, q) {
    try {
      const bmp = await createImageBitmap(blob); const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return await new Promise(r => c.toBlob(r, 'image/jpeg', q)) || blob;
    } catch { return blob; }
  }
  function phLoad(id) {
    if (phCache.has(id)) return Promise.resolve(phCache.get(id));
    if (phLoading.has(id)) return phLoading.get(id);
    const p = ready.then(() => fs.doc(`${base()}/photos/${id}`).get()).then(async s => {
      if (!s.exists) return null;
      const b = await (await fetch(s.data().d)).blob(); const u = URL.createObjectURL(b);
      phCache.set(id, u); if (window.__phLoaded) window.__phLoaded(id, u); return u;
    }).catch(() => null).finally(() => phLoading.delete(id));
    phLoading.set(id, p); return p;
  }
  const assetsApi = {
    upload: async blob => {
      let b = blob, d = await blobToDataURL(b);
      for (const [mx, q] of [[1400, .78], [1100, .7], [900, .62]]) { if (d.length < 900000) break; b = await shrink(blob, mx, q); d = await blobToDataURL(b); }
      if (d.length > 1000000) throw new Error('photo trop lourde');
      const id = 'ph_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      await settle(fs.doc(`${base()}/photos/${id}`).set({d, t: b.type || 'image/jpeg', size: b.size, at: Date.now(), by: uid}));
      const u = URL.createObjectURL(b); phCache.set(id, u);
      return {id, url: u, sizeBytes: b.size, contentType: b.type};
    },
    delete: id => settle(fs.doc(`${base()}/photos/${id}`).delete()),
    list: async () => ({assets: [], usage: {}}),
  };

  /* ---------------- téléchargements ---------------- */
  const downloadsApi = {
    save: async ({filename, data}) => {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const u = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 60000);
      return {status: 'saved'};
    },
  };

  /* ---------------- IA (optionnelle, via ton petit serveur) ---------------- */
  async function callAI(prompt, images) {
    const tok = await auth.currentUser.getIdToken();
    const imgs = await Promise.all((images || []).slice(0, 3).map(async b => { const d = await blobToDataURL(b); return {media_type: d.slice(5, d.indexOf(';')), data: d.slice(d.indexOf(',') + 1)}; }));
    const r = await fetch(CFG.aiEndpoint, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + tok}, body: JSON.stringify({prompt, images: imgs})});
    if (r.status === 429) throw {code: 'rate_limited', message: 'trop de demandes'};
    if (!r.ok) throw {code: 'unavailable', message: 'IA indisponible (' + r.status + ')'};
    return (await r.json()).text || '';
  }
  const asText = input => typeof input === 'string' ? input : (input || []).map(m => m.content).join('\n\n');
  const sampleApi = Object.assign(async (input, o = {}) => ({text: await callAI(asText(input), o.images), truncated: false}), {
    json: async (input, o = {}) => { const t = await callAI(asText(input), o.images); const m = t.match(/\{[\s\S]*\}/); if (!m) throw {code: 'unavailable', message: 'réponse illisible'}; return JSON.parse(m[0]); },
    limits: async () => ({images: true}),
  });

  const caps = {
    db: () => dbApi,
    user: () => ({id: async () => uid, me: async () => ({id: uid}), can: async () => true, isOwner: () => true, canEdit: () => true, profiles: async () => ({})}),
    assets: () => assetsApi,
    downloads: () => downloadsApi,
    sample: () => CFG.aiEndpoint ? sampleApi : null,
  };
  window.claude = {use: name => ready.then(() => caps[name] ? caps[name]() : null)};
  window.__taniereHost = {
    photo: {
      url: id => { const u = phCache.get(id); if (!u) phLoad(id); return u || ''; },
      blob: async id => { const u = await phLoad(id); return u ? (await fetch(u)).blob() : null; },
      exists: async id => { await ready; try { return (await fs.doc(`${base()}/photos/${id}`).get()).exists; } catch { return false; } },
    },
    renderSettings,
  };

  /* ---------------- écran d'accueil / connexion / foyer ---------------- */
  const gate = document.createElement('div'); gate.id = 'hostGate';
  gate.style.cssText = 'position:fixed;inset:0;z-index:200;background:var(--bg,#f3efe6);display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto';
  function show(html) { gate.innerHTML = `<div style="width:100%;max-width:400px;text-align:center">${html}</div>`; if (!gate.isConnected) document.body.appendChild(gate); }
  const logo = `<img src="./icon-192.png" alt="" style="width:96px;height:96px;border-radius:22px;box-shadow:0 6px 24px rgba(0,0,0,.15)"><h1 style="font-size:28px;margin:14px 0 4px">La Tanière</h1><div class="muted" style="margin-bottom:22px">🐧 PinpinRex 🦖 · budget & maison à deux</div>`;
  const errFr = e => { const c = e && e.code || ''; return {
    'auth/invalid-credential': 'E-mail ou mot de passe incorrect.', 'auth/wrong-password': 'Mot de passe incorrect.', 'auth/user-not-found': 'Aucun compte avec cet e-mail.',
    'auth/email-already-in-use': 'Un compte existe déjà avec cet e-mail : connecte-toi.', 'auth/weak-password': 'Mot de passe trop court (6 caractères minimum).', 'auth/invalid-email': 'Adresse e-mail invalide.',
    'auth/popup-closed-by-user': 'Connexion annulée.', 'auth/unauthorized-domain': "Ce site n'est pas autorisé dans Firebase (voir guide, étape 2.4).", 'auth/network-request-failed': 'Pas de connexion internet.',
    'permission-denied': 'Accès refusé (vérifie les règles Firestore).'}[c] || (e && e.message) || 'Erreur'; };

  function showConfigMissing() {
    show(`${logo}<div class="card" style="text-align:left"><b>Configuration à terminer</b><p class="small">Le fichier <b>config.js</b> contient encore les valeurs d'exemple. Suis l'étape 1 du guide <i>LISEZ-MOI-INSTALLATION.md</i>, puis remets config.js en ligne.</p></div>`);
  }
  function showLogin(msg) {
    show(`${logo}
      <button class="btn primary" id="gGoogle" style="width:100%;padding:14px;font-size:16px">Continuer avec Google</button>
      <div class="muted small" style="margin:16px 0">ou avec un e-mail</div>
      <form id="gForm" class="card" style="text-align:left;margin:0">
        <input id="gMail" type="email" placeholder="E-mail" autocomplete="email" required>
        <input id="gPass" type="password" placeholder="Mot de passe" autocomplete="current-password" required style="margin-top:8px">
        <div class="row" style="margin-top:10px;gap:8px"><button class="btn primary grow" type="submit">Se connecter</button><button class="btn grow" type="button" id="gSignup">Créer un compte</button></div>
        <button class="btn ghost sm" type="button" id="gReset" style="margin-top:6px">Mot de passe oublié ?</button>
      </form>
      <div id="gMsg" class="small" style="margin-top:12px;color:var(--warn)">${esc(msg || '')}</div>`);
    const m = t => { document.getElementById('gMsg').textContent = t; };
    document.getElementById('gGoogle').onclick = async () => {
      const prov = new firebase.auth.GoogleAuthProvider();
      try { await auth.signInWithPopup(prov); }
      catch (e) { if (/popup-blocked|operation-not-supported/.test(e.code || '')) { try { await auth.signInWithRedirect(prov); } catch (e2) { m(errFr(e2)); } } else m(errFr(e)); }
    };
    document.getElementById('gForm').onsubmit = async e => { e.preventDefault(); try { await auth.signInWithEmailAndPassword(gMail.value.trim(), gPass.value); } catch (er) { m(errFr(er)); } };
    document.getElementById('gSignup').onclick = async () => { try { await auth.createUserWithEmailAndPassword(gMail.value.trim(), gPass.value); } catch (er) { m(errFr(er)); } };
    document.getElementById('gReset').onclick = async () => { if (!gMail.value) return m('Entre ton e-mail puis réessaie.'); try { await auth.sendPasswordResetEmail(gMail.value.trim()); m('E-mail de réinitialisation envoyé ✓'); } catch (er) { m(errFr(er)); } };
  }
  const genCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let c = ''; const r = crypto.getRandomValues(new Uint8Array(6)); for (const x of r) c += A[x % A.length]; return c; };
  function showHousehold(msg) {
    const pre = (new URLSearchParams(location.search).get('join') || '').toUpperCase();
    show(`${logo}
      <div class="card" style="text-align:left"><b>Rejoindre la Tanière de ta moitié</b><div class="small muted" style="margin:4px 0 10px">Entre le code affiché dans ses Réglages.</div>
        <form id="gJoin" class="row" style="gap:8px"><input id="gCode" placeholder="CODE" value="${esc(pre)}" maxlength="8" style="text-transform:uppercase;letter-spacing:3px;font-weight:700"><button class="btn primary" type="submit">Rejoindre</button></form></div>
      <div class="muted small" style="margin:14px 0">ou</div>
      <button class="btn" id="gCreate" style="width:100%;padding:13px">🏡 Créer notre Tanière</button>
      <div id="gMsg" class="small" style="margin-top:12px;color:var(--warn)">${esc(msg || '')}</div>
      <button class="btn ghost sm" id="gOut" style="margin-top:18px">Se déconnecter (${esc(auth.currentUser.email || '')})</button>`);
    const m = t => { document.getElementById('gMsg').textContent = t; };
    document.getElementById('gOut').onclick = () => auth.signOut();
    document.getElementById('gCreate').onclick = async () => {
      try {
        const h = fs.collection('households').doc(); const code = genCode();
        await h.set({name: 'La Tanière', members: [uid], inviteCode: code, createdAt: Date.now(), createdBy: uid});
        await fs.doc('invites/' + code).set({hid: h.id, at: Date.now()});
        await fs.doc('users/' + uid).set({hid: h.id, email: auth.currentUser.email || ''}, {merge: true});
        start(h.id);
      } catch (e) { m(errFr(e)); }
    };
    document.getElementById('gJoin').onsubmit = async e => {
      e.preventDefault(); const code = gCode.value.trim().toUpperCase(); if (!code) return;
      try {
        const inv = await fs.doc('invites/' + code).get(); if (!inv.exists) return m('Code inconnu. Vérifie-le avec ta moitié.');
        const h = inv.data().hid;
        await fs.doc('households/' + h).update({members: firebase.firestore.FieldValue.arrayUnion(uid), lastJoinCode: code});
        await fs.doc('users/' + uid).set({hid: h, email: auth.currentUser.email || ''}, {merge: true});
        if (location.search) history.replaceState(null, '', location.pathname + location.hash);
        start(h);
      } catch (er) { m(errFr(er)); }
    };
  }
  let unsubHH = null;
  function start(h) {
    hid = h;
    if (unsubHH) unsubHH();
    unsubHH = fs.doc('households/' + h).onSnapshot(s => { household = s.exists ? s.data() : null; const el = document.getElementById('hostSettings'); if (el && el.childElementCount) renderSettings(el); }, () => {});
    gate.remove(); resolveReady();
    refreshToken().catch(() => {});
  }

  /* ---------------- notifications ---------------- */
  async function getMessaging() { if (!messaging && firebase.messaging && firebase.messaging.isSupported && firebase.messaging.isSupported()) { messaging = firebase.messaging(); messaging.onMessage(p => { const n = p.notification || p.data || {}; swReg && swReg.showNotification(n.title || 'La Tanière', {body: n.body || '', icon: './icon-192.png'}); }); } return messaging; }
  async function refreshToken() {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !CFG.vapidKey || /REMPLACER/.test(CFG.vapidKey)) return null;
    const msg = await getMessaging(); if (!msg) return null;
    swReg = swReg || await navigator.serviceWorker.ready;
    const token = await msg.getToken({vapidKey: CFG.vapidKey, serviceWorkerRegistration: swReg});
    if (token) await fs.doc(`${base()}/tokens/${token}`).set({uid, who: lsGet('nc_me', 'p1'), ua: navigator.userAgent.slice(0, 140), at: Date.now()});
    return token;
  }

  /* ---------------- section Réglages de l'appli ---------------- */
  const NOTIF = [['factures', '📄 Factures à payer (3 jours avant l\'échéance)'], ['prelev', '💸 Part des prélèvements à verser'], ['garanties', '🛡️ Garanties qui expirent (30 et 7 jours avant)'],
    ['budgets', '🎯 Budget dépassé'], ['banque', '🏦 Opérations bancaires à traiter (le lundi)'], ['resume', '📊 Résumé de la semaine (le dimanche)']];
  let settingsCache = null;
  async function renderSettings(el) {
    if (!hid) return;
    try { settingsCache = (await fs.doc(`${base()}/settings/main`).get()).data() || {}; } catch { settingsCache = settingsCache || {}; }
    const notif = settingsCache.notif || {}; const code = household && household.inviteCode || '…';
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const link = location.origin + location.pathname + '?join=' + code;
    el.innerHTML = `<div class="sec-title"><h2>📱 Appli & compte</h2></div>
      <div class="card"><div class="small muted">Connecté(e) : <b>${esc(auth.currentUser && auth.currentUser.email || '')}</b> · ${(household && household.members || []).length} membre(s) dans la Tanière</div>
        <div class="row" style="margin-top:10px;gap:6px;flex-wrap:wrap"><button class="btn sm primary" id="hInstall" style="${installEvt ? '' : 'display:none'}">⬇️ Installer l'appli</button><button class="btn sm" id="hLogout">Se déconnecter</button></div>
        <label class="f">Inviter ta moitié</label>
        <div class="settle ok">Code de votre Tanière : <b class="tx" style="font-size:17px;letter-spacing:3px">${esc(code)}</b><div class="small" style="margin-top:4px">Elle ouvre l'appli, se connecte avec son propre compte, puis entre ce code (ou ouvre le lien d'invitation).</div></div>
        <div class="row" style="margin-top:8px;gap:6px"><button class="btn sm" id="hCopy">📋 Copier le lien d'invitation</button><button class="btn sm" id="hNewCode">🔄 Nouveau code</button></div></div>
      <div class="sec-title"><h2>🔔 Notifications</h2></div>
      <div class="card"><div class="small">${perm === 'granted' ? '✅ Activées sur cet appareil.' : perm === 'denied' ? '⛔ Bloquées : autorise-les dans les paramètres du navigateur / de l\'appli.' : perm === 'unsupported' ? 'Non prises en charge par ce navigateur (installe l\'appli depuis Chrome).' : 'Pas encore activées sur cet appareil.'}</div>
        <div class="row" style="margin-top:8px;gap:6px">${perm !== 'granted' && perm !== 'unsupported' ? '<button class="btn sm primary" id="hNotif">🔔 Activer sur cet appareil</button>' : ''}${perm === 'granted' ? '<button class="btn sm" id="hTest">Tester</button>' : ''}</div>
        <div style="margin-top:10px">${NOTIF.map(([k, l]) => `<label class="row" style="gap:8px;margin:6px 0"><input type="checkbox" data-notif="${k}" ${notif[k] === false ? '' : 'checked'} style="width:auto"> <span class="small">${l}</span></label>`).join('')}</div>
        <div class="small muted">Les rappels partent chaque matin vers 8 h (service de rappels, voir guide étape 2.6). Chacun reçoit ce qui le concerne.</div></div>
      <div class="card small muted">✨ Lecture des tickets et factures par l'IA : ${CFG.aiEndpoint ? '<b style="color:var(--accent)">activée</b>' : 'non configurée (optionnel, guide étape 5)'}.</div>`;
    const on = (id, f) => { const b = document.getElementById(id); if (b) b.onclick = f; };
    on('hInstall', async () => { if (!installEvt) return; installEvt.prompt(); installEvt = null; });
    on('hLogout', async () => { if (confirm('Se déconnecter de la Tanière sur cet appareil ?')) { await auth.signOut(); location.reload(); } });
    on('hCopy', async () => { try { await navigator.clipboard.writeText(`Rejoins notre Tanière 🐧🦖 : ${link}  (code ${code})`); toastH('Lien copié ✓'); } catch { toastH(link); } });
    on('hNewCode', async () => {
      if (!confirm('Créer un nouveau code ? L\'ancien ne fonctionnera plus.')) return;
      const nc = genCode(), old = household && household.inviteCode;
      await fs.doc('households/' + hid).update({inviteCode: nc}); await fs.doc('invites/' + nc).set({hid, at: Date.now()});
      if (old) fs.doc('invites/' + old).delete().catch(() => {});
    });
    on('hNotif', async () => {
      try { const p = await Notification.requestPermission(); if (p === 'granted') { const t = await refreshToken(); toastH(t ? 'Notifications activées ✓' : 'Activées, mais la clé « vapidKey » manque dans config.js'); } }
      catch (e) { toastH('Activation impossible : ' + (e && e.message || e)); }
      renderSettings(el);
    });
    on('hTest', async () => { swReg = swReg || await navigator.serviceWorker.ready; swReg.showNotification('La Tanière 🐧🦖', {body: 'Les notifications fonctionnent sur cet appareil 🎉', icon: './icon-192.png'}); refreshToken().catch(() => {}); });
    el.querySelectorAll('[data-notif]').forEach(cb => cb.onchange = async () => {
      const n = {...(settingsCache.notif || {})}; el.querySelectorAll('[data-notif]').forEach(x => { n[x.dataset.notif] = x.checked; });
      settingsCache.notif = n; await settle(fs.doc(`${base()}/settings/main`).set({notif: n}, {merge: true})).catch(() => {}); toastH('Préférences enregistrées ✓');
    });
  }
  function toastH(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2800); }

  /* ---------------- démarrage ---------------- */
  function boot() {
    if (!configured || typeof firebase === 'undefined') { showConfigMissing(); return; }
    firebase.initializeApp(CFG.firebase);
    auth = firebase.auth(); fs = firebase.firestore();
    fs.enablePersistence({synchronizeTabs: true}).catch(() => {});
    show(`${logo}<div class="muted"><span class="spin"></span> Ouverture de la Tanière…</div>`);
    auth.getRedirectResult().catch(e => showLogin(errFr(e)));
    auth.onAuthStateChanged(async u => {
      if (!u) { uid = null; if (hid) location.reload(); else showLogin(); return; }
      uid = u.uid;
      try {
        const ud = await fs.doc('users/' + uid).get();
        const h = ud.exists && ud.data().hid;
        if (h) start(h); else showHousehold();
      } catch (e) { show(`${logo}<div class="card">Impossible d'ouvrir la Tanière : ${esc(errFr(e))}</div><button class="btn" onclick="location.reload()">Réessayer</button>`); }
    });
    // le choix « Qui es-tu ? » de l'appli met à jour le jeton de notification
    window.addEventListener('storage', e => { if (e.key === 'nc_me') refreshToken().catch(() => {}); });
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { origSet.apply(this, arguments); if (k === 'nc_me' && hid) refreshToken().catch(() => {}); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
