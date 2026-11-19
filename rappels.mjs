// La Tanière PinpinRex : rappels quotidiens (lancé chaque matin par GitHub Actions)
// ⚠️ Le dépôt est public : ce script ne doit JAMAIS afficher de montants, noms ou libellés dans les logs.
import admin from 'firebase-admin';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!sa.project_id) { console.error('Secret FIREBASE_SERVICE_ACCOUNT manquant'); process.exit(1); }
admin.initializeApp({credential: admin.credential.cert(sa)});
const db = admin.firestore();
const APP_URL = (process.env.APP_URL || '').trim();
const FORCE = process.env.FORCE === '1' || process.env.FORCE === 'true';

const today = new Intl.DateTimeFormat('fr-CA', {timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const dow = new Date(today + 'T12:00:00Z').getUTCDay(); // 0 = dimanche, 1 = lundi
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const eur = n => n.toLocaleString('fr-BE', {style: 'currency', currency: 'EUR'});
const MS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
const fr = d => d ? `${+d.slice(8, 10)} ${MS[+d.slice(5, 7) - 1]}` : '';
const other = p => p === 'p1' ? 'p2' : 'p1';
const shares = r => { const t = num(r.total), sp = r.split || 'half'; const s1 = sp === 'p1' ? t : sp === 'p2' ? 0 : sp === 'pct' ? t * Math.min(100, Math.max(0, num(r.pctP1))) / 100 : t / 2; return {p1: s1, p2: t - s1}; };
const bcatOf = r => {
  if (r.kind === 'travaux') return 'travaux';
  if (r.kind === 'facture') { const u = r.util; return ['elec', 'gaz', 'eau', 'mazout'].includes(u) ? 'energie' : ['internet', 'gsm', 'abonnement'].includes(u) ? 'telecom' : ['credit', 'assurance', 'taxes'].includes(u) ? 'logement' : 'autre'; }
  return r.cat || 'courses';
};
const BLAB = {courses: 'Courses', maison: 'Maison', energie: 'Énergie & eau', telecom: 'Internet & GSM', logement: 'Logement', sante: 'Santé', transport: 'Transport', loisirs: 'Loisirs', enfants: 'Enfants', vetements: 'Vêtements', cadeaux: 'Cadeaux', travaux: 'Travaux', autre: 'Autre'};

let households = 0, sent = 0, failed = 0;
for (const h of (await db.collection('households').get()).docs) {
  households++;
  const R = h.ref;
  const col = async c => (await R.collection(c).get()).docs.map(d => ({id: d.id, ...d.data()}));
  const sRef = R.collection('settings').doc('main');
  const settings = (await sRef.get()).data() || {};
  const notif = {factures: true, prelev: true, garanties: true, budgets: true, banque: true, resume: true, ...(settings.notif || {})};
  const names = {p1: settings.p1 || 'Pinpin', p2: settings.p2 || 'T-Rex'};
  const [receipts, transfers, recurring, warranties, bankImports, tokens] = await Promise.all(['receipts', 'transfers', 'recurring', 'warranties', 'bankImports', 'tokens'].map(col));
  const msgs = {p1: [], p2: []}; const both = m => { msgs.p1.push(m); msgs.p2.push(m); };
  const m = today.slice(0, 7); let state = settings.notifState || {}; let stateChanged = false;

  // 1. Factures à payer
  if (notif.factures) {
    for (const r of receipts.filter(r => r.kind === 'facture' && !r.paid && r.due && r.due <= addDays(today, 3)).sort((a, b) => a.due.localeCompare(b.due))) {
      both(`📄 ${r.store || 'Facture'} ${eur(num(r.total))} : ${r.due < today ? `en retard (échéance ${fr(r.due)})` : r.due === today ? 'à payer aujourd\'hui' : `à payer le ${fr(r.due)}`}`);
    }
  }
  // 2. Part des prélèvements à verser
  if (notif.prelev) {
    const owe = {p1: {sum: 0, items: [], fresh: false}, p2: {sum: 0, items: [], fresh: false}};
    const dim = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
    for (const rc of recurring.filter(x => (!x.type || x.type === 'facture') && x.active !== false && (x.start || '') <= m && (!x.end || x.end >= m) && !(x.skip || []).includes(m))) {
      const date = m + '-' + String(Math.min(Math.max(1, Math.round(num(rc.day) || 1)), dim)).padStart(2, '0');
      if (date > today) continue;
      const rid = `auto-${rc.id}-${m}`; const r = receipts.find(x => x.id === rid) || {id: rid, total: rc.amount, payer: rc.payer, split: rc.split, pctP1: rc.pctP1};
      if (r.payer !== 'p1' && r.payer !== 'p2') continue;
      const debtor = other(r.payer); const owed = shares(r)[debtor];
      const repaid = transfers.filter(t => t.rid === rid && t.from === debtor).reduce((a, t) => a + num(t.amount), 0);
      if (owed - repaid >= 0.01) { owe[debtor].sum += owed - repaid; owe[debtor].items.push(rc.store || 'prélèvement'); if (date === addDays(today, -1)) owe[debtor].fresh = true; }
    }
    for (const p of ['p1', 'p2']) if (owe[p].sum >= 0.01 && (owe[p].fresh || dow === 1 || FORCE))
      msgs[p].push(`💸 Ta part à verser à ${names[other(p)]} : ${eur(owe[p].sum)} (${owe[p].items.slice(0, 4).join(', ')})`);
  }
  // 3. Garanties
  if (notif.garanties) {
    for (const w of warranties.filter(w => w.status !== 'archive' && w.endDate && [addDays(today, 30), addDays(today, 7)].includes(w.endDate)))
      both(`🛡️ Garantie « ${w.name} » : fin le ${fr(w.endDate)}${w.store ? ` (${w.store})` : ''}`);
  }
  // 4. Budgets dépassés (une seule fois par catégorie et par mois)
  if (notif.budgets && settings.budgets) {
    const spent = {}; receipts.filter(r => (r.date || '').slice(0, 7) === m).forEach(r => { const k = bcatOf(r); spent[k] = (spent[k] || 0) + num(r.total); });
    const done = new Set((state.budgets && state.budgets[m]) || []);
    for (const [k, b] of Object.entries(settings.budgets)) {
      if (num(b) > 0 && (spent[k] || 0) > num(b) && !done.has(k)) { both(`🎯 Budget ${BLAB[k] || k} dépassé : ${eur(spent[k])} / ${eur(num(b))}`); done.add(k); }
    }
    state = {...state, budgets: {[m]: [...done]}}; stateChanged = true;
  }
  // 5. Banque (le lundi)
  if (notif.banque && (dow === 1 || FORCE)) {
    const n = bankImports.reduce((a, b) => a + (b.txs || []).filter(t => t.status === 'new').length, 0);
    if (n) both(`🏦 ${n} opération(s) bancaire(s) à traiter`);
  }
  // 6. Résumé du dimanche
  if (notif.resume && (dow === 0 || FORCE)) {
    const from = addDays(today, -6);
    const week = receipts.filter(r => (r.date || '') >= from && (r.date || '') <= today).reduce((a, r) => a + num(r.total), 0);
    const month = receipts.filter(r => (r.date || '').slice(0, 7) === m && (r.date || '') <= today).reduce((a, r) => a + num(r.total), 0);
    both(`📊 Cette semaine : ${eur(week)} dépensés · ce mois : ${eur(month)}`);
  }
  if (FORCE) both('🔔 Test : les rappels de la Tanière fonctionnent !');

  // Envoi
  for (const p of ['p1', 'p2']) {
    if (!msgs[p].length) continue;
    const toks = tokens.filter(t => t.who === p).map(t => t.id);
    if (!toks.length) continue;
    const title = msgs[p].length === 1 ? 'La Tanière 🐧🦖' : `La Tanière · ${msgs[p].length} rappels`;
    const body = msgs[p].slice(0, 5).join('\n') + (msgs[p].length > 5 ? '\n…' : '');
    const webpush = {notification: {title, body, icon: APP_URL ? APP_URL + 'icon-192.png' : undefined, badge: APP_URL ? APP_URL + 'icon-192.png' : undefined, tag: 'taniere-' + today}};
    if (/^https:\/\//.test(APP_URL)) webpush.fcmOptions = {link: APP_URL};
    const res = await admin.messaging().sendEachForMulticast({tokens: toks, webpush});
    sent += res.successCount; failed += res.failureCount;
    // Nettoyage des appareils désinstallés
    await Promise.all(res.responses.map((x, i) => !x.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(x.error?.code || '') ? R.collection('tokens').doc(toks[i]).delete().catch(() => {}) : null));
  }
  if (stateChanged) await sRef.set({notifState: state}, {merge: true});
}
console.log(`Terminé : ${households} Tanière(s), ${sent} notification(s) envoyée(s), ${failed} échec(s).`);
