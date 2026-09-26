/* Проксі до API Нової Пошти.
   Ключ живе лише тут, у змінній середовища NOVAPOSHTA_API_KEY,
   і ніколи не потрапляє у браузер.

   POST /api/np
     { "type": "settlements", "q": "Київ" }
     { "type": "warehouses",  "ref": "<cityRef>" }
     { "type": "ping" }                            — перевірка доступності
*/

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

async function callNP(apiKey, modelName, calledMethod, methodProperties) {
  const res = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties })
  });

  if (!res.ok) throw new Error(`Нова Пошта відповіла ${res.status}`);

  const body = await res.json();
  if (!body.success) {
    throw new Error((body.errors || []).join('; ') || 'Невідома помилка Нової Пошти');
  }
  return body.data || [];
}

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  const apiKey = process.env.NOVAPOSHTA_API_KEY;
  if (!apiKey) return json({ ok: false, error: 'NOVAPOSHTA_API_KEY не налаштовано' }, 503);

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: 'Очікується JSON' }, 400);
  }

  const { type } = payload || {};

  try {
    /* --- перевірка доступності (фронт вирішує, чи вмикати ручний режим) --- */
    if (type === 'ping') return json({ ok: true, items: [] });

    /* --- пошук населених пунктів --- */
    if (type === 'settlements') {
      const q = String(payload.q || '').trim();
      if (q.length < 2) return json({ ok: true, items: [] });

      const data = await callNP(apiKey, 'Address', 'searchSettlements', {
        CityName: q,
        Limit: '20'
      });

      const addresses = data[0]?.Addresses || [];
      const items = addresses.map((a) => ({
        // для getWarehouses потрібен саме DeliveryCity
        ref: a.DeliveryCity || a.Ref,
        name: a.MainDescription || a.Present,
        area: [a.Area && `${a.Area} обл.`, a.Region && `${a.Region} р-н`]
          .filter(Boolean).join(', ')
      })).filter((i) => i.ref && i.name);

      return json({ ok: true, items });
    }

    /* --- відділення та поштомати обраного міста --- */
    if (type === 'warehouses') {
      const ref = String(payload.ref || '').trim();
      if (!ref) return json({ ok: true, items: [] });

      const data = await callNP(apiKey, 'Address', 'getWarehouses', {
        CityRef: ref,
        Limit: '500',
        Page: '1'
      });

      const items = data
        .map((w) => ({ name: w.Description, number: w.Number }))
        .filter((w) => w.name)
        .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));

      return json({ ok: true, items });
    }

    return json({ ok: false, error: 'Невідомий тип запиту' }, 400);
  } catch (err) {
    console.error('[np]', err);
    return json({ ok: false, error: err.message }, 502);
  }
};
