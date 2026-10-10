/* Єдине джерело правди про ціни на сервері.
   Клієнту не можна довіряти суму — ми завжди перераховуємо її тут.
   Тримайте цей список синхронним із PRODUCTS у script.js. */

export const PRICE = 499;

export const PRODUCTS = {
  'noir-essence':      'Noir Essence',
  'green-harmony':     'Green Harmony',
  'grapefruit-splash': 'Grapefruit Splash',
  'lemon-biscuit':     'Lemon Biscuit',
  'fluffy-pancakes':   'Fluffy Pancakes'
};

/* Знижка за набір — має збігатися з TIERS у script.js.
   Набір — це п'ять РІЗНИХ ароматів: 5 × 499 = 2495 ₴ → 2245 ₴.
   Вісім флаконів одного аромату набором не є й знижки не дають. */
const TIERS = [
  { min: 5, rate: 0.10 }
];

const SCENTS = Object.keys(PRODUCTS);
const BUNDLE_RATE = TIERS.find((t) => SCENTS.length >= t.min)?.rate || 0;
const BUNDLE_SUB = SCENTS.length * PRICE;

/**
 * Перераховує позиції та суму замовлення з нуля.
 * @param {Array<{id:string, qty:number}>} rawItems — те, що прислав браузер
 * @returns {{items: Array, qty: number, subtotal: number, discount: number, total: number}}
 */
export function priceOrder(rawItems) {
  const items = [];

  for (const raw of Array.isArray(rawItems) ? rawItems : []) {
    const name = PRODUCTS[raw?.id];
    if (!name) continue;

    const qty = Math.min(99, Math.max(1, Math.floor(Number(raw.qty) || 0)));
    if (!qty) continue;

    const existing = items.find((i) => i.id === raw.id);
    if (existing) existing.qty = Math.min(99, existing.qty + qty);
    else items.push({ id: raw.id, name, qty, price: PRICE });
  }

  const qty = items.reduce((a, i) => a + i.qty, 0);
  const subtotal = qty * PRICE;

  /* Скільки повних наборів зібрано. Набір вимагає всіх п'яти ароматів,
     тож їхня кількість дорівнює мінімуму по ароматах: по два кожного,
     крім одного, де лише 1, — це один набір, а не два. Усе понад цей
     мінімум іде за повною ціною. Та сама логіка, що в setCount()
     у script.js, — інакше сайт і сервер рахували б різні суми. */
  const byId = new Map(items.map((i) => [i.id, i.qty]));
  const sets = Math.min(...SCENTS.map((id) => byId.get(id) || 0));
  const discount = sets > 0 ? Math.round(sets * BUNDLE_SUB * BUNDLE_RATE) : 0;

  items.forEach((i) => { i.sum = i.qty * PRICE; });

  return { items, qty, subtotal, discount, total: subtotal - discount };
}
