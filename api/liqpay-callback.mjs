/* Серверний callback від LiqPay (server_url).

   LiqPay шле сюди POST у форматі application/x-www-form-urlencoded
   з полями data і signature. Підпис ОБОВʼЯЗКОВО перевіряємо —
   інакше будь-хто зміг би підробити «оплачено».

   Відповідати треба 200, інакше LiqPay повторюватиме запит.
*/

import crypto from 'node:crypto';

const STATUS_UA = {
  success:      '✅ Оплачено',
  sandbox:      '🧪 Оплачено (тестовий режим)',
  wait_accept:  '⏳ Гроші списано, очікує зарахування',
  processing:   '⏳ Обробляється',
  prepared:     '⏳ Очікує оплати',
  wait_secure:  '⏳ Перевірка платежу',
  failure:      '❌ Помилка оплати',
  error:        '❌ Помилка оплати',
  reversed:     '↩️ Повернення коштів'
};

async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
  } catch (err) {
    console.error('[liqpay-callback] Telegram:', err);
  }
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const privateKey = process.env.LIQPAY_PRIVATE_KEY;
  if (!privateKey) {
    console.error('[liqpay-callback] LIQPAY_PRIVATE_KEY не налаштовано');
    return new Response('OK', { status: 200 });
  }

  let data = '';
  let signature = '';

  try {
    const raw = await req.text();
    const params = new URLSearchParams(raw);
    data = params.get('data') || '';
    signature = params.get('signature') || '';
  } catch (err) {
    console.error('[liqpay-callback] не вдалося прочитати тіло:', err);
    return new Response('OK', { status: 200 });
  }

  if (!data || !signature) {
    console.warn('[liqpay-callback] порожній data або signature');
    return new Response('OK', { status: 200 });
  }

  /* --- перевірка підпису --- */
  const expected = crypto
    .createHash('sha1')
    .update(privateKey + data + privateKey, 'binary')
    .digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    console.warn('[liqpay-callback] підпис не збігається — запит відхилено');
    return new Response('OK', { status: 200 });
  }

  /* --- підпис валідний, читаємо платіж --- */
  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
  } catch (err) {
    console.error('[liqpay-callback] не вдалося розібрати data:', err);
    return new Response('OK', { status: 200 });
  }

  const { order_id: orderId, status, amount, currency, payment_id: paymentId, err_description: errDesc } = payload;

  console.log('[liqpay-callback]', orderId, status, amount, currency);

  const label = STATUS_UA[status] || `Статус: ${status}`;
  await notifyTelegram([
    `💳 <b>${label}</b>`,
    '',
    `Замовлення: <b>${orderId}</b>`,
    `Сума: ${amount} ${currency}`,
    paymentId ? `LiqPay ID: <code>${paymentId}</code>` : null,
    errDesc ? `Причина: ${errDesc}` : null
  ].filter(Boolean).join('\n'));

  return new Response('OK', { status: 200 });
};
