/* Приймає замовлення з сайту.

   Що робить:
   1. перевіряє дані й ПЕРЕРАХОВУЄ суму на сервері (клієнту не довіряємо);
   2. надсилає замовлення в Telegram;
   3. для оплати карткою — готує підписаний пакет для LiqPay.

   Змінні середовища:
     TELEGRAM_BOT_TOKEN   — обовʼязково для сповіщень
     TELEGRAM_CHAT_ID     — обовʼязково для сповіщень
     LIQPAY_PUBLIC_KEY    — обовʼязково для оплати карткою
     LIQPAY_PRIVATE_KEY   — обовʼязково для оплати карткою
     LIQPAY_SANDBOX       — "1" для тестового режиму (гроші не списуються)
     SITE_URL             — напр. https://purrfect.com.ua (для result_url/server_url)
*/

import crypto from 'node:crypto';
import { priceOrder } from './_catalog.mjs';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

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

/* ---------- LiqPay ---------- */
function liqpayPacket({ orderId, amount, description, siteUrl }) {
  const publicKey = process.env.LIQPAY_PUBLIC_KEY;
  const privateKey = process.env.LIQPAY_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error('LiqPay не налаштовано');

  const params = {
    version: 3,
    public_key: publicKey,
    action: 'pay',
    amount: Number(amount.toFixed(2)),
    currency: 'UAH',
    description,
    order_id: orderId,
    language: 'uk',
    // Порядок важливий: перша в списку вкладка відкривається одразу.
    // Ручне введення картки має бути першим — Apple Pay і Google Pay
    // доступні не всім (потрібні Face ID / Touch ID і відповідний пристрій),
    // тож вони лишаються запасним, а не основним способом.
    paytypes: 'card,privat24,apay,gpay',
    // LiqPay повертає сюди і після успіху, і після відмови —
    // справжній статус приходить окремо на server_url нижче.
    // Блок оформлення живе в стрічці лендингу, тож повертаємо покупця туди:
    // там і форма, і місце під повідомлення про статус оплати.
    result_url: `${siteUrl}/?payment=done#zamovlennya`,
    server_url: `${siteUrl}/.netlify/functions/liqpay-callback`
  };
  if (process.env.LIQPAY_SANDBOX === '1') params.sandbox = '1';

  const data = Buffer.from(JSON.stringify(params)).toString('base64');
  const signature = crypto
    .createHash('sha1')
    .update(privateKey + data + privateKey, 'binary')
    .digest('base64');

  return { data, signature, checkoutUrl: 'https://www.liqpay.ua/api/3/checkout' };
}

/* ---------- Обробник ---------- */
export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await req.json();
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
  // єдиний спосіб оплати — картка через LiqPay
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
    '💳 Картка (LiqPay) — <i>очікує оплати</i>',
    comment ? `\n💬 ${tgEscape(comment)}` : null
  ].filter(Boolean).join('\n');

  await notifyTelegram(message);

  /* --- оплата карткою: єдиний спосіб --- */
  if (!siteUrl) {
    console.error('[order] SITE_URL не задано — LiqPay не зможе повернути покупця');
    return json({ ok: false, error: 'Оплата тимчасово недоступна' }, 503);
  }
  try {
    const liqpay = liqpayPacket({
      orderId,
      amount: priced.total,
      description: `Purrfect — замовлення ${orderId}, ${priced.qty} фл.`,
      siteUrl
    });
    return json({ ok: true, orderId, liqpay });
  } catch (err) {
    console.error('[order] LiqPay:', err);
    return json({ ok: false, error: 'Оплата тимчасово недоступна' }, 503);
  }
};
