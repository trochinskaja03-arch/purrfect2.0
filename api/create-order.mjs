/* Приймає замовлення з сайту.

   Що робить:
   1. перевіряє дані й ПЕРЕРАХОВУЄ суму на сервері (клієнту не довіряємо);
   2. надсилає замовлення в Telegram;
   3. для оплати карткою — готує підписаний пакет для WayForPay.

   Змінні середовища:
     TELEGRAM_BOT_TOKEN           — обовʼязково для сповіщень
     TELEGRAM_CHAT_ID             — обовʼязково для сповіщень
     WAYFORPAY_MERCHANT_ACCOUNT   — обовʼязково для оплати карткою
     WAYFORPAY_SECRET_KEY         — обовʼязково для оплати карткою
     SITE_URL                     — напр. https://purrfect.com.ua
                                    (з нього беремо домен і адреси повернення)
*/

import crypto from 'node:crypto';
import { priceOrder } from './_catalog.mjs';
import { sendJson, readJson } from './_http.mjs';
import { wayforpayPacket } from './_wayforpay.mjs';

const SHIPPING_LABELS = {
  'np-warehouse': 'Нова Пошта — відділення / поштомат',
  'np-courier':   'Нова Пошта — курʼєр за адресою',
  'ukrposhta':    'Укрпошта — відділення'
};

const clean = (s, max = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const normPhone = (raw) => {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('380')) return `+${d}`;
  if (d.length === 10 && d.startsWith('0'))   return `+38${d}`;
  return null;
};

const makeOrderId = () => {
  const d = new Date();
  const stamp = [d.getFullYear() % 100, d.getMonth() + 1, d.getDate()]
    .map((n) => String(n).padStart(2, '0')).join('');
  const rnd = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `PF-${stamp}-${rnd}`;
};

/* ---------- Telegram ---------- */
const tgEscape = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    console.warn('[order] Telegram не налаштовано — сповіщення пропущено');
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    if (!res.ok) console.error('[order] Telegram:', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('[order] Telegram:', err);
    return false;
  }
}

/* ---------- Обробник ---------- */
export default async function handler(req, res) {
  /* json() лишається з тим самим викликом, що й раніше, — просто тепер
     пише у res замість повертати Response. Так уся логіка нижче
     лишилася незмінною. */
  const json = (body, status = 200) => sendJson(res, body, status);

  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await readJson(req);
  } catch {
    return json({ ok: false, error: 'Очікується JSON' }, 400);
  }

  /* --- контакти --- */
  const name = clean(body?.customer?.name, 120);
  const phone = normPhone(body?.customer?.phone);

  if (name.length < 3) return json({ ok: false, error: 'Вкажіть прізвище та імʼя' }, 400);
  if (!phone)          return json({ ok: false, error: 'Некоректний номер телефону' }, 400);

  /* --- сума: рахуємо самі --- */
  const priced = priceOrder(body?.items);
  if (!priced.qty) return json({ ok: false, error: 'Кошик порожній' }, 400);

  /* --- доставка --- */
  const method = body?.delivery?.method;
  if (!SHIPPING_LABELS[method]) return json({ ok: false, error: 'Оберіть спосіб доставки' }, 400);

  const d = body.delivery;
  const deliveryLines = [SHIPPING_LABELS[method]];
  if (method === 'np-warehouse') {
    if (!clean(d.city) || !clean(d.warehouse)) return json({ ok: false, error: 'Вкажіть місто та відділення' }, 400);
    deliveryLines.push(clean(d.city), clean(d.warehouse));
  } else if (method === 'np-courier') {
    /* Вулиця й будинок приходять окремими полями. `address` лишається як
       запасний варіант — у вкладці, відкритій до оновлення сайту, ще може
       стояти стара об'єднана форма. */
    const street = clean(d.street);
    const house = clean(d.house, 12);
    const line = street && house ? `${street}, буд. ${house}` : clean(d.address);
    if (!clean(d.city) || line.length < 5) {
      return json({ ok: false, error: 'Вкажіть місто, вулицю та будинок' }, 400);
    }
    const flat = clean(d.flat, 10);
    deliveryLines.push(clean(d.city), [line, flat && `кв. ${flat}`].filter(Boolean).join(', '));
  } else if (method === 'ukrposhta') {
    if (!clean(d.city) || !/^\d{5}$/.test(clean(d.index))) {
      return json({ ok: false, error: 'Вкажіть місто та пʼятизначний індекс' }, 400);
    }
    deliveryLines.push(`${clean(d.city)}, індекс ${clean(d.index)}`);
    if (clean(d.address)) deliveryLines.push(clean(d.address));
  }

  /* --- оплата --- */
  // єдиний спосіб оплати — картка через WayForPay
  const orderId = makeOrderId();
  const comment = clean(body?.comment, 500);

  const siteUrl = (process.env.SITE_URL || process.env.URL || '').replace(/\/+$/, '');

  /* --- сповіщення --- */
  const itemLines = priced.items
    .map((i) => `• ${tgEscape(i.name)} × ${i.qty} — ${i.sum} ₴`)
    .join('\n');

  const message = [
    `🧴 <b>Нове замовлення ${orderId}</b>`,
    '',
    itemLines,
    priced.discount ? `Знижка за набір: −${priced.discount} ₴` : null,
    `<b>Сума: ${priced.total} ₴</b>`,
    '',
    `👤 ${tgEscape(name)}`,
    `📞 ${phone}`,
    '',
    `📦 ${deliveryLines.map(tgEscape).join('\n     ')}`,
    '',
    '💳 Картка (WayForPay) — <i>очікує оплати</i>',
    comment ? `\n💬 ${tgEscape(comment)}` : null
  ].filter(Boolean).join('\n');

  await notifyTelegram(message);

  /* --- оплата карткою: єдиний спосіб --- */
  if (!siteUrl) {
    console.error('[order] SITE_URL не задано — WayForPay не зможе повернути покупця');
    return json({ ok: false, error: 'Оплата тимчасово недоступна' }, 503);
  }
  try {
    const wayforpay = wayforpayPacket({
      orderId,
      amount: priced.total,
      description: `Purrfect — замовлення ${orderId}, ${priced.qty} фл.`,
      siteUrl,
      customer: { name, phone }
    });
    return json({ ok: true, orderId, wayforpay });
  } catch (err) {
    console.error('[order] WayForPay:', err);
    return json({ ok: false, error: 'Оплата тимчасово недоступна' }, 503);
  }
}
