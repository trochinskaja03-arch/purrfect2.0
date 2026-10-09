/* Транспорт для серверних функцій.

   Чому цей файл існує. Раніше функції були написані у «веб-стилі»:
   приймали Request і повертали Response. На одному проєкті Vercel це
   працювало, а на новому акаунті ті самі файли зависали — запит висів
   понад 70 секунд без жодної відповіді. Причина в тому, що Node-
   середовище Vercel чекає на res.end(), якого у веб-стилі ніколи не
   буває, і просто тримає з'єднання до таймауту.

   Класичний стиль (req, res) працює на будь-якому акаунті й за будь-
   яких налаштувань проєкту. Сайт ще переїжджатиме до клієнтки, тож
   залежати від налаштувань конкретного акаунта не можна.

   Назва з підкресленням навмисна: Vercel не робить маршрутів із таких
   файлів, тож /api/_http недоступний ззовні. Так само зроблено
   з _catalog.mjs.
*/

export const sendJson = (res, body, status = 200) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

export const sendText = (res, text, status = 200) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(text);
};

/* Тіло запиту «як є».

   Vercel зазвичай розбирає його сам: для application/json це вже
   готовий об'єкт, для form-urlencoded — теж об'єкт. Але покладатися
   на це не можна, бо поведінка залежить від заголовків запиту, тож
   коли req.body порожній — читаємо потік самі. Розбирати результат
   лишається викликачу: JSON і форма LiqPay потребують різного. */
export async function readBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== '') return req.body;

  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw;
}

/* Зручна обгортка для endpoint-ів, які приймають JSON. */
export async function readJson(req) {
  const body = await readBody(req);
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body;

  const raw = Buffer.isBuffer(body) ? body.toString('utf8') : String(body ?? '');
  if (!raw.trim()) throw new Error('порожнє тіло запиту');
  return JSON.parse(raw);
}
