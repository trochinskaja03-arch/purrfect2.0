/* WayForPay: підпис платежу та перевірка відповіді.

   Чим це відрізняється від LiqPay, який тут був раніше:

   1. Підпис — HMAC-MD5 від полів, склеєних крапкою з комою, а не SHA-1
      від base64-пакета. Порядок полів жорстко заданий і НЕ збігається
      з порядком у таблиці параметрів їхньої документації: у рядку для
      підпису productCount іде перед productPrice, хоча в таблиці
      навпаки. Переплутаєш — підпис не зійдеться, і платіж не пройде.

   2. На callback недостатньо відповісти «OK». Треба повернути
      підписаний JSON. Якщо цього не зробити, WayForPay вважає доставку
      невдалою й повторює запит ЧОТИРИ ДОБИ — тобто кожне замовлення
      сипатиме сповіщення чотири дні поспіль.

   Документація: https://wiki.wayforpay.com/en/view/852102
*/

import crypto from 'node:crypto';

const sign = (secret, parts) =>
  crypto.createHmac('md5', secret).update(parts.join(';'), 'utf8').digest('hex');

/* Порівняння підписів сталого часу — щоб підбір не давав підказок
   за швидкістю відповіді. */
const sameSignature = (a, b) => {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * Готує пакет для оплати.
 *
 * Товар навмисно один рядок на все замовлення. Причина: у нас є знижка
 * за набір, і якщо передати позиції по повній ціні, сума рядків не
 * зійдеться з сумою до сплати. Деталізація все одно приходить нам
 * у Telegram, а покупець бачить ту саму суму, що й у кошику.
 */
export function wayforpayPacket({ orderId, amount, description, siteUrl, customer }) {
  const merchantAccount = process.env.WAYFORPAY_MERCHANT_ACCOUNT;
  const secret = process.env.WAYFORPAY_SECRET_KEY;
  if (!merchantAccount || !secret) throw new Error('WayForPay не налаштовано');

  /* Домен має збігатися з тим, що вказано в кабінеті WayForPay,
     інакше платіж відхилять ще до введення картки. */
  const domain = new URL(siteUrl).hostname;
  const orderDate = Math.floor(Date.now() / 1000);

  /* Суму форматуємо один раз і далі використовуємо той самий рядок
     і в підписі, і в полі. Інакше 499 проти 499.00 дадуть різні
     підписи при однаковій, здавалося б, сумі. */
  const amountStr = String(amount);

  const merchantSignature = sign(secret, [
    merchantAccount,
    domain,
    orderId,
    String(orderDate),
    amountStr,
    'UAH',
    description,   // productName[0]
    '1',           // productCount[0]
    amountStr      // productPrice[0]
  ]);

  /* Імʼя та прізвище віджет вимагає окремими полями, а в нас одне
     поле «Прізвище та імʼя». Ділимо по першому пробілу; якщо прізвища
     немає — дублюємо, бо порожнє поле віджет не приймає. */
  const parts = String(customer?.name || '').trim().split(/\s+/);
  const clientLastName = parts[0] || 'Покупець';
  const clientFirstName = parts.slice(1).join(' ') || clientLastName;

  return {
    checkoutUrl: 'https://secure.wayforpay.com/pay',
    fields: {
      merchantAccount,
      merchantDomainName: domain,
      merchantTransactionSecureType: 'AUTO',
      merchantAuthType: 'SimpleSignature',
      merchantSignature,
      orderReference: orderId,
      orderDate,
      amount: amountStr,
      currency: 'UAH',
      productName: [description],
      productCount: ['1'],
      productPrice: [amountStr],
      serviceUrl: `${siteUrl}/api/wayforpay-callback`,
      returnUrl: `${siteUrl}/?payment=done#zamovlennya`,
      language: 'UA',
      clientFirstName,
      clientLastName,
      clientPhone: String(customer?.phone || '').replace(/\D/g, '')
    }
  };
}

/**
 * Перевіряє підпис callback-у.
 *
 * Тонкість із сумою: у JSON вона приходить числом, і 499.00 у JS стає
 * 499. Який саме рядок WayForPay використав при підписі — наперед
 * невідомо, тож приймаємо будь-який із двох варіантів написання.
 * Безпеку це не послаблює: підпис однаково має зійтися.
 */
export function verifyCallback(data, secret) {
  const n = Number(data?.amount);
  const variants = [String(data?.amount), Number.isFinite(n) ? n.toFixed(2) : null]
    .filter(Boolean)
    .filter((v, i, all) => all.indexOf(v) === i);

  return variants.some((amountStr) => sameSignature(
    sign(secret, [
      String(data?.merchantAccount ?? ''),
      String(data?.orderReference ?? ''),
      amountStr,
      String(data?.currency ?? ''),
      String(data?.authCode ?? ''),
      String(data?.cardPan ?? ''),
      String(data?.transactionStatus ?? ''),
      String(data?.reasonCode ?? '')
    ]),
    data?.merchantSignature
  ));
}

/** Відповідь, якої WayForPay чекає, щоб припинити повтори. */
export function callbackAnswer(orderReference, secret) {
  const time = Math.floor(Date.now() / 1000);
  const status = 'accept';
  return {
    orderReference,
    status,
    time,
    signature: sign(secret, [orderReference, status, String(time)])
  };
}

/** Статуси транзакції людською мовою — для повідомлення в Telegram. */
export const STATUS_UA = {
  Approved:            '✅ Оплачено',
  Pending:             '⏳ Очікує підтвердження',
  InProcessing:        '⏳ Обробляється',
  WaitingAuthComplete: '⏳ Гроші заблоковано, очікує списання',
  Declined:            '❌ Оплату відхилено',
  Expired:             '❌ Час на оплату вичерпано',
  Refunded:            '↩️ Повернення коштів',
  Voided:              '↩️ Платіж скасовано',
  RefundInProcessing:  '↩️ Повернення в обробці'
};
