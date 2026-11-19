// Notifications d'une nouvelle commande : WhatsApp (API officielle Meta) + Telegram en secours.
// Chaque canal est actif seulement si ses variables d'environnement sont renseignées.
// Une erreur de notification ne bloque jamais la commande du client.

const money = (n) => `${new Intl.NumberFormat('fr-FR').format(n)} FCFA`;

function summary(o) {
  return o.lines.map((l) => `${l.qty}x ${l.nom}`).join(', ');
}

async function whatsapp(o) {
  const { WA_TOKEN, WA_PHONE_ID, WA_TO, WA_TEMPLATE = 'nouvelle_commande', WA_LANG = 'fr', WA_VERSION = 'v21.0' } = process.env;
  if (!WA_TOKEN || !WA_PHONE_ID || !WA_TO) return 'inactif';
  // Les paramètres d'un modèle WhatsApp ne peuvent pas contenir de retour à la ligne.
  const clean = (s) => String(s).replace(/\s+/g, ' ').trim();
  const res = await fetch(`https://graph.facebook.com/${WA_VERSION}/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: WA_TO,
      type: 'template',
      template: {
        name: WA_TEMPLATE,
        language: { code: WA_LANG },
        components: [{
          type: 'body',
          parameters: [String(o.id), clean(summary(o)), money(o.total)].map((text) => ({ type: 'text', text })),
        }],
      },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status} ${await res.text()}`);
  return 'envoyé';
}

async function telegram(o) {
  const { TG_TOKEN, TG_CHAT_ID } = process.env;
  if (!TG_TOKEN || !TG_CHAT_ID) return 'inactif';
  const text = [
    `Nouvelle commande n°${o.id}`,
    summary(o),
    `Total : ${money(o.total)}`,
    `${o.mode === 'livraison' ? 'Livraison : ' + o.adresse : 'Retrait sur place'}`,
    `${o.nom} - ${o.tel}`,
    o.note ? `Note : ${o.note}` : '',
  ].filter(Boolean).join('\n');
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT_ID, text }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status} ${await res.text()}`);
  return 'envoyé';
}

async function notifyNewOrder(order) {
  const jobs = { whatsapp: whatsapp(order), telegram: telegram(order) };
  const results = await Promise.allSettled(Object.values(jobs));
  Object.keys(jobs).forEach((canal, i) => {
    const r = results[i];
    if (r.status === 'rejected') console.error(`[notify] ${canal} : échec -`, r.reason.message);
    else if (r.value === 'envoyé') console.log(`[notify] ${canal} : commande n°${order.id} notifiée`);
  });
  if (results.every((r) => r.status === 'fulfilled' && r.value === 'inactif')) {
    console.log(`[notify] aucun canal configuré. Commande n°${order.id} : ${summary(order)} (${money(order.total)})`);
  }
}

module.exports = { notifyNewOrder };
