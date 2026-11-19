// La Tanière PinpinRex : petit serveur IA (optionnel) pour lire les tickets et factures en photo.
// Déploiement : Cloudflare Workers (gratuit), voir LISEZ-MOI-INSTALLATION.md, étape 5.
// Variables à définir dans Cloudflare (Settings → Variables) :
//   ANTHROPIC_API_KEY  (secret)   : ta clé API Anthropic
//   FIREBASE_PROJECT_ID           : l'identifiant de ton projet Firebase
//   ALLOWED_ORIGIN                : l'adresse de l'appli, ex. https://pseudo.github.io
//   ALLOWED_UIDS      (optionnel) : identifiants Firebase autorisés, séparés par des virgules
//   MODEL             (optionnel) : modèle Claude (par défaut claude-sonnet-5-5)

let jwksCache = null, jwksAt = 0;
const b64uToBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const b64uJson = s => JSON.parse(new TextDecoder().decode(b64uToBytes(s)));

async function verifyFirebaseToken(token, projectId) {
  const [h, p, sig] = (token || '').split('.'); if (!sig) return null;
  const header = b64uJson(h), payload = b64uJson(p);
  if (header.alg !== 'RS256') return null;
  if (!jwksCache || Date.now() - jwksAt > 3600e3) {
    jwksCache = await (await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')).json(); jwksAt = Date.now();
  }
  const jwk = (jwksCache.keys || []).find(k => k.kid === header.kid); if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uToBytes(sig), new TextEncoder().encode(h + '.' + p));
  const now = Math.floor(Date.now() / 1000);
  if (!ok || payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}` || payload.exp < now || !payload.sub) return null;
  return payload;
}

export default {
  async fetch(req, env) {
    const cors = {'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS'};
    const json = (o, s = 200) => new Response(JSON.stringify(o), {status: s, headers: {...cors, 'Content-Type': 'application/json'}});
    if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    if (req.method !== 'POST') return json({error: 'POST uniquement'}, 405);
    const user = await verifyFirebaseToken((req.headers.get('Authorization') || '').replace(/^Bearer\s+/, ''), env.FIREBASE_PROJECT_ID).catch(() => null);
    if (!user) return json({error: 'non connecté'}, 401);
    if (env.ALLOWED_UIDS && !env.ALLOWED_UIDS.split(',').map(s => s.trim()).includes(user.sub)) return json({error: 'non autorisé'}, 403);
    let body; try { body = await req.json(); } catch { return json({error: 'requête invalide'}, 400); }
    const prompt = String(body.prompt || '').slice(0, 10000);
    const images = (Array.isArray(body.images) ? body.images : []).slice(0, 3).filter(i => /^image\/(jpeg|png|webp|gif)$/.test(i.media_type) && typeof i.data === 'string' && i.data.length < 5e6);
    const content = [...images.map(i => ({type: 'image', source: {type: 'base64', media_type: i.media_type, data: i.data}})), {type: 'text', text: prompt}];
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
      body: JSON.stringify({model: env.MODEL || 'claude-sonnet-5-5', max_tokens: 4000, messages: [{role: 'user', content}]}),
    });
    if (!r.ok) return json({error: 'ia', status: r.status}, r.status === 429 ? 429 : 502);
    const j = await r.json();
    return json({text: (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('')});
  },
};
