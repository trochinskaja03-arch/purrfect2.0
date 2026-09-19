/* Приймає заявку з розділу «Для бізнесу» і надсилає її в Telegram.

   Змінні середовища — ті самі, що й для замовлень:
     TELEGRAM_BOT_TOKEN
     TELEGRAM_CHAT_ID

   Якщо Telegram не налаштовано, функція поверне помилку: краще показати
   покупцеві прямі контакти, ніж мовчки загубити заявку.
*/

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

const clean = (s, max = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const tgEscape = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) {
    console.error('[b2b] Telegram не налаштовано — заявку нікуди надіслати');
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
    if (!res.ok) console.error('[b2b] Telegram:', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('[b2b] Telegram:', err);
    return false;
  }
}

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Очікується JSON' }, 400);
  }

  const name = clean(body?.name, 120);
  const contact = clean(body?.contact, 120);
  const business = clean(body?.business, 80);
  const volume = clean(body?.volume, 40);
  const comment = clean(body?.comment, 800);

  if (name.length < 2)    return json({ ok: false, error: 'Вкажіть імʼя' }, 400);
  if (contact.length < 5) return json({ ok: false, error: 'Вкажіть телефон або Telegram' }, 400);
  if (!business)          return json({ ok: false, error: 'Оберіть тип бізнесу' }, 400);

  const message = [
    '🤝 <b>Заявка на співпрацю</b>',
    '',
    `👤 ${tgEscape(name)}`,
    `📞 ${tgEscape(contact)}`,
    `🏢 ${tgEscape(business)}`,
    volume ? `📦 Орієнтовно: ${tgEscape(volume)} фл.` : null,
    comment ? `\n💬 ${tgEscape(comment)}` : null
  ].filter(Boolean).join('\n');

  const sent = await notifyTelegram(message);
  if (!sent) return json({ ok: false, error: 'Не вдалося надіслати заявку' }, 503);

  return json({ ok: true });
};
