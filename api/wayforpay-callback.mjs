/* Серверний callback від WayForPay (serviceUrl).

   Сюди приходить результат оплати. Підпис перевіряємо обовʼязково —
   інакше будь-хто зміг би надіслати нам «оплачено».

   Відповідати треба підписаним JSON, а не просто «OK»: поки WayForPay
   не отримає коректну відповідь, він повторює запит чотири доби.
*/

import { readBody, sendJson, sendText } from './_http.mjs';
import { verifyCallback, callbackAnswer, STATUS_UA } from './_wayforpay.mjs';

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
    console.error('[wayforpay] Telegram:', err);
  }
}

/* WayForPay надсилає JSON, але доходить він по-різному: буває тілом
   запиту, а буває — єдиним ключем форми, якщо заголовок виявився
   form-urlencoded. Розбираємо обидва випадки. */
function parsePayload(body) {
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
    if (body.merchantSignature) return body;

    const keys = Object.keys(body);
    if (keys.length === 1) {
      try { return JSON.parse(keys[0]); } catch { /* не JSON — підемо далі */ }
      try { return JSON.parse(String(body[keys[0]])); } catch { /* теж ні */ }
    }
    return body;
  }

  const raw = Buffer.isBuffer(body) ? body.toString('utf8') : String(body ?? '');
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendText(res, 'Method not allowed', 405);

  const secret = process.env.WAYFORPAY_SECRET_KEY;
  if (!secret) {
    console.error('[wayforpay] WAYFORPAY_SECRET_KEY не налаштовано');
    return sendText(res, 'not configured', 200);
  }

  let data;
  try {
    data = parsePayload(await readBody(req));
  } catch (err) {
    console.error('[wayforpay] не вдалося прочитати тіло:', err);
    return sendText(res, 'bad request', 200);
  }

  if (!verifyCallback(data, secret)) {
    /* Навмисно НЕ відповідаємо «accept»: інакше ми підтверджували б
       те, чого не перевірили. Якщо це справді WayForPay, а підпис не
       зійшовся через наш недогляд, він повторюватиме запит — і ми
       побачимо це в логах, а не пропустимо мовчки. */
    console.warn('[wayforpay] підпис не збігається — запит відхилено', {
      orderReference: data?.orderReference,
      transactionStatus: data?.transactionStatus
    });
    return sendText(res, 'signature mismatch', 200);
  }

  const { orderReference, transactionStatus, amount, currency, reason, authCode } = data;
  console.log('[wayforpay]', orderReference, transactionStatus, amount, currency);

  const label = STATUS_UA[transactionStatus] || `Статус: ${transactionStatus}`;
  await notifyTelegram([
    `💳 <b>${label}</b>`,
    '',
    `Замовлення: <b>${orderReference}</b>`,
    `Сума: ${amount} ${currency}`,
    authCode ? `Код авторизації: <code>${authCode}</code>` : null,
    reason && transactionStatus !== 'Approved' ? `Причина: ${reason}` : null
  ].filter(Boolean).join('\n'));

  return sendJson(res, callbackAnswer(orderReference, secret), 200);
}
