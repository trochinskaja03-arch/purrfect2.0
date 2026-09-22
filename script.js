/* ============================================================
   Purrfect — продавальний лендинг
   Кошик, каталог ароматів, заявка для бізнесу, оформлення
   замовлення (Нова Пошта / Укрпошта) та оплата через LiqPay.

   Один файл обслуговує всі сторінки сайту. Кожен блок перед
   роботою перевіряє, чи є його розмітка на поточній сторінці,
   тож на юридичних сторінках працюють лише шапка й кошик.
   ============================================================ */

(() => {
  'use strict';

  /* ==========================================================
     КАТАЛОГ
     Щоб змінити асортимент, ціну чи описи — правте лише цей
     блок. Фото карток лежать в image/.

     ВАЖЛИВО: ціну й знижку продубльовано на сервері, у файлі
     netlify/functions/_catalog.mjs. Сервер перераховує суму
     самостійно й ігнорує те, що прислав браузер, тож правити
     треба обидва файли разом — інакше покупець побачить одну
     суму, а до оплати піде інша.
     ========================================================== */
  const PRICE = 499;
  const VOLUME = '300 мл';

  /* `tagline` — три слова через крапку, з них же збираються теги-пігулки
     в картці аромату. `notes` — основний опис, `highlight` — фраза, яку
     в картці виносимо окремо золотим. Разом вони складають повний текст
     аромату з брифу, просто розбитий на дві частини. */
  const PRODUCTS = [
    {
      id: 'noir-essence',
      name: 'Noir Essence',
      tagline: 'Пряний · деревний · парфумований',
      notes: 'Пряні та деревні ноти створюють глибокий, благородний аромат із легким акцентом у чоловічий бік.',
      highlight: 'Однаково красиво розкривається на жіночій та чоловічій шкірі.',
      img: 'image/noir-essence.jpg',
      accent: '#A9784B'
    },
    {
      id: 'green-harmony',
      name: 'Green Harmony',
      tagline: 'Свіжий · зелений · спокійний',
      notes: 'Свіжий зелений чай, прохолода, чистота та відчуття внутрішнього спокою.',
      highlight: 'Легкий аромат, який нагадує подих природи.',
      img: 'image/green-harmony.jpg',
      accent: '#6FA07A'
    },
    {
      id: 'grapefruit-splash',
      name: 'Grapefruit Splash',
      tagline: 'Соковитий · цитрусовий · з легкою гірчинкою',
      notes: 'Соковитий грейпфрут, яскрава цитрусова свіжість і легка благородна гірчинка.',
      highlight: 'Аромат, що освіжає та заряджає енергією.',
      img: 'image/grapefruit-splash.jpg',
      accent: '#E2714B'
    },
    {
      id: 'lemon-biscuit',
      name: 'Lemon Biscuit',
      tagline: 'Лимонний · десертний · затишний',
      notes: 'Ніжне лимонне печиво, легка солодкість і свіжа цитрусова нотка.',
      highlight: 'Відчуття затишку, ніби вдома щойно дістали теплу випічку з духовки.',
      img: 'image/lemon-biscuit.jpg',
      accent: '#E3C044'
    },
    {
      id: 'fluffy-pancakes',
      name: 'Fluffy Pancakes',
      tagline: 'Солодкий · теплий · ніжний',
      notes: 'Теплий солодкий аромат панкейків із карамельною ноткою — наче повільний ранок вихідного дня, наповнений затишком і ніжністю.',
      highlight: 'Найсолодший аромат у колекції.',
      img: 'image/fluffy-pancakes.jpg',
      accent: '#D9A96A'
    }
  ];

  /* Короткі факти під ціною — однакові для всіх ароматів */
  const FACTS = [
    'Готова повітряна піна — одне натискання на дві долоні',
    'Флакон 300 мл — приблизно 440 натискань',
    'Екстракти алое вера, зеленого чаю та ромашки',
    'Чисті руки без відчуття сухості та стягнутості',
    'Матово-чорний флакон, який красиво виглядає у просторі'
  ];

  /* Знижка за набір. П'ять флаконів — це повний набір ароматів,
     саме на ньому вмикаються −10%: 2495 ₴ → 2245 ₴. */
  const TIERS = [
    { min: 5, rate: 0.10 }
  ];

  /* Ціна набору рахується з тих самих констант, а не вписана руками —
     інакше після зміни ціни банер і картка показували б старі цифри. */
  const BUNDLE_SUB = PRODUCTS.length * PRICE;
  const BUNDLE_PRICE = BUNDLE_SUB -
    Math.round(BUNDLE_SUB * (TIERS.find((t) => PRODUCTS.length >= t.min)?.rate || 0));

  const API = '/.netlify/functions';

  /* Куди веде кнопка «Оформити замовлення». Якщо форма є на цій самій
     сторінці (лендинг, сторінка оформлення) — прокручуємо до неї,
     інакше переходимо на окрему сторінку. */
  const CHECKOUT = document.querySelector('#zamovlennya') ? '#zamovlennya' : 'zamovlennya.html';
  const CHECKOUT_INLINE = CHECKOUT.startsWith('#');

  /* ==========================================================
     Дрібні помічники
     ========================================================== */
  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const money = (n) => `${Math.round(n).toLocaleString('uk-UA')} ₴`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollOpts = { behavior: reduced ? 'auto' : 'smooth' };

  const plural = (n, one, few, many) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  };
  const bottles = (n) => `${n} ${plural(n, 'флакон', 'флакони', 'флаконів')}`;

  /* Плейсхолдер, якщо фото ще не покладено в image/ */
  const fallback = (accent) =>
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">
         <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0" stop-color="#F1EDE6"/><stop offset="1" stop-color="#DCD6CC"/>
         </linearGradient></defs>
         <rect width="400" height="500" fill="url(#g)"/>
         <rect x="140" y="150" width="120" height="230" rx="14" fill="#1a1a1a"/>
         <rect x="176" y="108" width="48" height="46" rx="10" fill="#1a1a1a"/>
         <rect x="158" y="230" width="84" height="110" rx="6" fill="${accent}" opacity=".35"/>
       </svg>`);

  const onImgError = (img, accent) => {
    img.addEventListener('error', () => { img.src = fallback(accent); }, { once: true });
  };

  /* Спільний замок прокрутки: шухляда, модалка й мобільне меню
     можуть відкриватися одне поверх одного, тож рахуємо їх.

     Самого `overflow: hidden` на body замало: у Safari на iPhone він
     сторінку не тримає — фон їде далі під відкритим вікном, а після
     закриття людина опиняється зовсім не там, де була. Тому на час
     модалки тіло фіксуємо на місці й потім повертаємо на збережену
     позицію. */
  let locks = 0;
  let lockedAt = 0;
  const lockScroll = (on) => {
    const was = locks;
    locks = Math.max(0, locks + (on ? 1 : -1));
    const body = document.body;

    if (was === 0 && locks === 1) {
      lockedAt = window.scrollY || window.pageYOffset || 0;
      body.style.position = 'fixed';
      body.style.top = `-${lockedAt}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
      body.style.overflow = 'hidden';
    } else if (was > 0 && locks === 0) {
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      body.style.overflow = '';
      /* Повернення миттєве: через `html { scroll-behavior: smooth }`
         сторінка інакше повільно «летіла» б назад до місця, де людина
         була до відкриття вікна. */
      const root = document.documentElement;
      const prev = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, lockedAt);
      root.style.scrollBehavior = prev;
    }
  };

  /* ==========================================================
     Стала висота вікна
     ==========================================================
     Головна причина «стрибків» на iPhone та iPad: Safari ховає й
     показує свою панель під час прокрутки, і висота вікна щоразу
     змінюється. Усе, що зав'язане на висоту екрана — перший екран,
     фонове фото — перебудовується просто під пальцем: сторінка
     підстрибує, а фото першого екрана помітно збільшується.
     Android робить те саме, просто менш помітно.

     Тому висоту ми фіксуємо один раз і оновлюємо лише тоді, коли
     екран справді змінився: поворот пристрою або зміна ширини.
     Невелику зміну самої висоти ігноруємо — це панель браузера.
     Так iOS поводиться рівно як Android. */
  const initViewportLock = () => {
    const root = document.documentElement;
    /* На пристрої без миші висота вікна змінюється лише з двох причин,
       і жодна не означає, що екран став іншим: браузер сховав свою
       панель або відкрилася екранна клавіатура. Тому там реагуємо
       виключно на зміну ширини — тобто на поворот екрана чи поділ
       екрана на iPad. На десктопі вікно міняють мишею навмисно, там
       стежимо за висотою як завжди. */
    const coarse = window.matchMedia('(hover: none)').matches;
    let lastW = -1;

    const apply = () => {
      const w = window.innerWidth;
      if (coarse && w === lastW) return;
      lastW = w;
      root.style.setProperty('--app-vh', `${window.innerHeight}px`);
    };

    apply();
    window.addEventListener('resize', apply, { passive: true });
    // поворот екрана: розміри доїжджають не миттєво
    window.addEventListener('orientationchange', () => {
      lastW = -1;
      setTimeout(apply, 260);
    }, { passive: true });
  };

  /* ==========================================================
     Поява блоків
     ========================================================== */
  const initReveal = () => {
    const items = $$('[data-reveal]');
    if (!items.length) return;

    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }

    // Перший екран — показуємо одразу каскадом
    const heroItems = $$('.hero [data-reveal]');
    heroItems.forEach((el, i) => el.style.setProperty('--reveal-delay', `${90 + i * 90}ms`));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      heroItems.forEach((el) => el.classList.add('is-in'));
    }));

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const sibs = Array.from(el.parentElement?.children || []).filter((n) => n.hasAttribute('data-reveal'));
        const idx = Math.max(0, sibs.indexOf(el));
        el.style.setProperty('--reveal-delay', `${Math.min(idx, 6) * 80}ms`);
        el.classList.add('is-in');
        obs.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    items.filter((el) => !el.closest('.hero')).forEach((el) => io.observe(el));
  };

  /* ==========================================================
     Шапка й мобільне меню
     ========================================================== */
  const initHeader = () => {
    const bar = $('.topbar');
    if (!bar) return;

    /* Обробник прив'язаний до прокрутки, тож не робимо в ньому нічого
       поза кадром: подій scroll браузер шле більше, ніж малює кадрів,
       і на телефоні зайві виклики відчутні. */
    let ticking = false;
    const apply = () => {
      ticking = false;
      bar.classList.toggle('is-stuck', window.scrollY > 40);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });

    const burger = $('.burger');
    const menu = $('#mobile-nav');
    if (!burger || !menu) return;

    const setOpen = (open) => {
      if ((burger.getAttribute('aria-expanded') === 'true') === open) return;
      burger.setAttribute('aria-expanded', String(open));
      menu.hidden = !open;
      lockScroll(open);
      if (open) menu.querySelector('a')?.focus(); else burger.focus();
    };

    burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) setOpen(false);
    });
    window.matchMedia('(min-width: 1101px)').addEventListener('change', (e) => {
      if (e.matches && !menu.hidden) setOpen(false);
    });
  };

  /* ==========================================================
     КОШИК
     ========================================================== */
  const STORE = 'purrfect.cart.v1';
  let cart = {};

  const loadCart = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || '{}');
      Object.entries(raw).forEach(([id, qty]) => {
        if (byId(id) && Number.isFinite(+qty) && +qty > 0) cart[id] = Math.min(99, Math.floor(+qty));
      });
    } catch { /* перший візит або приватний режим */ }
  };
  const saveCart = () => {
    try { localStorage.setItem(STORE, JSON.stringify(cart)); } catch { /* нехай */ }
  };

  const cartCount = () => Object.values(cart).reduce((a, b) => a + b, 0);

  const totals = () => {
    const qty = cartCount();
    const sub = qty * PRICE;
    const tier = TIERS.find((t) => qty >= t.min);
    const rate = tier ? tier.rate : 0;
    const discount = Math.round(sub * rate);
    return { qty, sub, rate, discount, grand: sub - discount };
  };

  /* Липка панель: показуємо, лише коли в кошику щось є І перший екран
     уже прокручено — у hero є власна кнопка, перекривати її не треба. */
  let heroVisible = true;

  const updateSticky = () => {
    const sticky = $('[data-sticky]');
    if (!sticky) return;

    const t = totals();
    sticky.hidden = t.qty === 0 || heroVisible;
    document.body.classList.toggle('has-sticky', !sticky.hidden);
    if (sticky.hidden) return;

    $('[data-sticky-total]').textContent = money(t.grand);
    $('[data-sticky-note]').textContent = bottles(t.qty);
  };

  const watchHero = () => {
    const hero = $('.hero');
    if (!hero || !('IntersectionObserver' in window)) { heroVisible = false; updateSticky(); return; }

    new IntersectionObserver((entries) => {
      heroVisible = entries[0].isIntersecting;
      updateSticky();
    }, { threshold: 0.25 }).observe(hero);
  };

  const bump = () => {
    const badge = $('.cart');
    if (!badge) return;
    badge.classList.remove('is-bump');
    void badge.offsetWidth;
    badge.classList.add('is-bump');
  };

  const addToCart = (id, n = 1) => {
    if (!byId(id)) return;
    cart[id] = Math.min(99, (cart[id] || 0) + n);
    saveCart();
    renderCart();
    bump();
  };

  const modalOpen = () => {
    const m = $('#product-modal');
    return !!m && !m.hidden;
  };

  /* Набір: по одному флакону кожного аромату. Знижка −10% вмикається
     сама, щойно в кошику набирається п'ять флаконів.

     Шухляду відкриваємо, лише якщо не розкрита картка аромату: два
     шари поверх одного відчуваються як збій, а не як підтвердження. */
  const addBundle = () => {
    PRODUCTS.forEach((p) => { cart[p.id] = Math.min(99, (cart[p.id] || 0) + 1); });
    saveCart();
    renderCart();
    bump();
    if (!modalOpen()) openDrawer();
  };

  const setQty = (id, n) => {
    if (n <= 0) delete cart[id]; else cart[id] = Math.min(99, n);
    saveCart();
    renderCart();
  };

  /* ---------- Рендер позицій (спільний для шухляди й форми) ---------- */
  const lineHTML = (id, qty) => {
    const p = byId(id);
    return `
      <div class="oline" data-line="${p.id}">
        <img src="${p.img}" alt="" loading="lazy" data-accent="${p.accent}">
        <div>
          <p class="oline__name">${esc(p.name)}</p>
          <p class="oline__ua">${VOLUME} · мило-піна</p>
        </div>
        <div class="qty">
          <button type="button" data-dec="${p.id}" aria-label="Зменшити кількість ${esc(p.name)}">−</button>
          <span>${qty}</span>
          <button type="button" data-inc="${p.id}" aria-label="Збільшити кількість ${esc(p.name)}">+</button>
        </div>
        <p class="oline__sum">${money(qty * PRICE)}</p>
      </div>`;
  };

  const linesHTML = () => Object.entries(cart).map(([id, q]) => lineHTML(id, q)).join('');

  const emptyHTML = `
    <div class="empty">
      <p>Кошик порожній. Оберіть аромат із колекції — кожен флакон ${PRICE} ₴.</p>
      <a class="btn" href="index.html#aromaty" data-cart-close>
        <span>Обрати аромат</span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
          <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.6"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    </div>`;

  const totalHTML = () => {
    const t = totals();
    if (!t.qty) return '';
    return `
      <div class="total__row"><span>${bottles(t.qty)} × ${VOLUME}</span><span>${money(t.sub)}</span></div>
      ${t.discount ? `<div class="total__row total__row--save"><span>Знижка за набір −${Math.round(t.rate * 100)}%</span><span>−${money(t.discount)}</span></div>` : ''}
      <div class="total__row"><span>Доставка</span><span>За тарифами перевізника</span></div>
      <div class="total__row total__row--grand"><span>До сплати</span><b>${money(t.grand)}</b></div>`;
  };

  const renderCart = () => {
    const t = totals();

    // лічильник у шапці
    $$('[data-cart-count]').forEach((el) => { el.textContent = t.qty; });

    // шухляда
    const body = $('[data-cart-body]');
    const foot = $('[data-cart-foot]');
    if (body) body.innerHTML = t.qty ? linesHTML() : emptyHTML;
    if (foot) {
      foot.innerHTML = t.qty
        ? `<div class="total">${totalHTML()}</div>
           <a class="btn btn--full" href="${CHECKOUT}"${CHECKOUT_INLINE ? ' data-cart-close' : ''}>
             <span>Оформити замовлення</span>
             <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
               <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
             </svg>
           </a>`
        : '';
    }

    // блок у формі замовлення
    const oc = $('[data-order-cart]');
    if (oc) oc.innerHTML = t.qty ? linesHTML() : emptyHTML;

    const ot = $('[data-order-total]');
    if (ot) ot.innerHTML = totalHTML();

    updateSticky();

    const submit = $('[data-submit]');
    if (submit) submit.disabled = t.qty === 0;

    /* Картки: поки товару немає — кнопка «Додати до кошика», щойно
       з'явився — лічильник на її місці. Кнопки ± ловить той самий
       обробник, що й у шухляді, тож окрема логіка не потрібна. */
    $$('[data-products] .product').forEach((card) => {
      const id = card.dataset.id;
      const qty = cart[id] || 0;
      card.classList.toggle('is-picked', qty > 0);

      const slot = $('[data-action]', card);
      if (!slot) return;

      const p = byId(id);
      slot.innerHTML = qty
        ? `<div class="qty qty--card">
             <button type="button" data-dec="${id}" aria-label="Зменшити кількість ${esc(p.name)}">−</button>
             <span>${qty}</span>
             <button type="button" data-inc="${id}" aria-label="Збільшити кількість ${esc(p.name)}">+</button>
           </div>`
        : `<button class="add" type="button" data-add="${id}">Додати до кошика</button>`;
    });

    // те саме для кнопки всередині детальної картки аромату
    const modalSlot = $('[data-modal-action]');
    if (modalSlot) {
      const id = modalSlot.dataset.modalAction;
      const qty = cart[id] || 0;
      const p = byId(id);
      modalSlot.innerHTML = qty
        ? `<div class="qty qty--card">
             <button type="button" data-dec="${id}" aria-label="Зменшити кількість ${esc(p.name)}">−</button>
             <span>${qty}</span>
             <button type="button" data-inc="${id}" aria-label="Збільшити кількість ${esc(p.name)}">+</button>
           </div>`
        : `<button class="add" type="button" data-add="${id}">У кошик</button>`;
    }

    // фолбек для фото в позиціях
    $$('.oline img[data-accent]').forEach((img) => onImgError(img, img.dataset.accent));
  };

  /* ---------- Шухляда ---------- */
  let drawerLastFocus = null;

  const openDrawer = () => {
    const drawer = $('#koshyk');
    if (!drawer || !drawer.hidden) return;
    drawerLastFocus = document.activeElement;
    drawer.hidden = false;
    lockScroll(true);
    $('.drawer__close', drawer)?.focus();
  };

  const closeDrawer = () => {
    const drawer = $('#koshyk');
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true;
    lockScroll(false);
    drawerLastFocus?.focus();
  };

  const initDrawer = () => {
    const drawer = $('#koshyk');
    if (drawer) {
      $$('[data-cart-open]').forEach((b) => b.addEventListener('click', openDrawer));
      drawer.addEventListener('click', (e) => {
        if (e.target.closest('[data-cart-close]')) closeDrawer();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !drawer.hidden) closeDrawer();
      });
    }

    // ± у будь-якому місці сторінки
    document.addEventListener('click', (e) => {
      const inc = e.target.closest('[data-inc]');
      const dec = e.target.closest('[data-dec]');
      if (inc) setQty(inc.dataset.inc, (cart[inc.dataset.inc] || 0) + 1);
      if (dec) setQty(dec.dataset.dec, (cart[dec.dataset.dec] || 0) - 1);

      const add = e.target.closest('[data-add]');
      if (add) addToCart(add.dataset.add);

      const bundleBtn = e.target.closest('[data-bundle-add]');
      if (bundleBtn) addBundle();
    });
  };

  /* ==========================================================
     КАТАЛОГ АРОМАТІВ
     ========================================================== */
  const renderProducts = () => {
    const list = $('[data-products]');
    if (!list) return;

    /* Фото — кнопка: натискання відкриває детальну картку аромату.
       Опис на плитці не показуємо, щоб ряд із п'яти позицій читався
       як вітрина, а не як стіна тексту. */
    list.innerHTML = PRODUCTS.map((p) => `
      <li class="product" data-id="${p.id}" data-reveal style="--accent:${p.accent}">
        <button class="product__media" type="button" data-more="${p.id}"
                aria-label="Відкрити картку аромату ${esc(p.name)}">
          <img src="${p.img}" alt="Флакон мила-піни Purrfect ${esc(p.name)}, ${VOLUME}" loading="lazy"
               width="400" height="500" data-accent="${p.accent}">
        </button>
        <div class="product__body">
          <h3 class="product__name">
            <button class="product__name-btn" type="button" data-more="${p.id}">${esc(p.name)}</button>
          </h3>
          <p class="product__tagline">${esc(p.tagline)}</p>
          <p class="product__meta">${VOLUME} <span>·</span> ${PRICE} ₴</p>
          <div class="product__buy">
            <!-- сюди renderCart підставляє або кнопку, або лічильник -->
            <div class="product__action" data-action="${p.id}"></div>
          </div>
        </div>
      </li>`).join('');

    $$('img[data-accent]', list).forEach((img) => onImgError(img, img.dataset.accent));
  };

  /* ==========================================================
     КАРТКА АРОМАТУ — модальне вікно «Детальніше»
     ========================================================== */
  /* Адреса виду #aromat/green-harmony: картку можна надіслати
     посиланням, а кнопка «назад» у браузері закриває її. */
  const HASH = '#aromat/';

  const initModal = () => {
    const modal = $('#product-modal');
    if (!modal) return;

    const bodyEl = $('[data-modal-body]', modal);
    let lastFocus = null;
    let currentId = '';

    const render = (p) => {
      const tags = p.tagline.split('·')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => `<li>${esc(s.toLowerCase())}</li>`)
        .join('');

      bodyEl.innerHTML = `
        <div class="pm">
          <figure class="pm__media">
            <img src="${p.img}" alt="Флакон мила-піни Purrfect ${esc(p.name)}, ${VOLUME}"
                 width="400" height="500" data-accent="${p.accent}">
            <figcaption>${VOLUME} <span>·</span> близько 440 натискань</figcaption>
          </figure>

          <div class="pm__copy">
            <p class="pm__eyebrow">Аромат колекції</p>
            <h2 class="pm__title" id="pm-title">${esc(p.name)}</h2>
            <p class="pm__sub">Мило-піна для рук</p>

            <p class="pm__notes">${esc(p.notes)}</p>
            <blockquote class="pm__highlight">${esc(p.highlight)}</blockquote>

            <ul class="pm__tags">${tags}</ul>

            <div class="pm__panel">
              <div class="pm__price-row">
                <p class="pm__price">${PRICE} ₴<small>за флакон ${VOLUME}</small></p>
                <p class="pm__bundle">
                  <b>5 ароматів</b> — <s>${money(PRICE * PRODUCTS.length)}</s> ${money(BUNDLE_PRICE)}
                  <span>вигода ${money(PRICE * PRODUCTS.length - BUNDLE_PRICE)}</span>
                </p>
              </div>

              <div class="pm__actions">
                <a class="btn" href="${CHECKOUT}" data-buy-now="${p.id}"${CHECKOUT_INLINE ? ' data-modal-close' : ''}>
                  <span>Оформити замовлення</span>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
                    <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </a>
                <!-- сюди renderCart підставляє або кнопку, або лічильник -->
                <div class="pm__action" data-modal-action="${p.id}"></div>
              </div>

              <p class="pm__pay">Оплата карткою онлайн <span>·</span> 3-D&nbsp;Secure</p>
            </div>

            <ul class="pm__facts">
              ${FACTS.map((f) => `<li>${esc(f)}</li>`).join('')}
            </ul>

            <p class="pm__bundle-note">
              Знижка −10% вмикається в кошику сама, щойно в замовленні набирається
              п'ять флаконів. <button class="link-more" type="button" data-bundle-add>Додати набір</button>
            </p>
          </div>
        </div>`;

      $$('img[data-accent]', bodyEl).forEach((img) => onImgError(img, img.dataset.accent));
      renderCart();
    };

    const open = (id, { push = true } = {}) => {
      const p = byId(id);
      if (!p) return;

      render(p);
      currentId = id;

      lastFocus = document.activeElement;
      modal.hidden = false;
      lockScroll(true);
      $('.modal__panel', modal).scrollTop = 0;
      $('.modal__close', modal)?.focus();

      if (push && location.hash !== HASH + id) history.pushState(null, '', HASH + id);
    };

    const close = ({ back = true } = {}) => {
      if (modal.hidden) return;
      modal.hidden = true;
      currentId = '';
      lockScroll(false);
      lastFocus?.focus();
      if (back && location.hash.startsWith(HASH)) {
        history.replaceState(null, '', location.pathname + location.search);
      }
    };

    document.addEventListener('click', (e) => {
      const more = e.target.closest('[data-more]');
      if (more) { e.preventDefault(); open(more.dataset.more); }
    });

    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-modal-close]')) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) close();
    });

    /* «Оформити замовлення» з картки: якщо аромату ще немає в кошику —
       кладемо один флакон, і аж тоді переходимо на оформлення. */
    document.addEventListener('click', (e) => {
      const buy = e.target.closest('[data-buy-now]');
      if (!buy) return;
      const id = buy.dataset.buyNow;
      if (!cart[id]) addToCart(id);   // saveCart() усередині — встигає до переходу
    });

    const fromHash = () => {
      if (!location.hash.startsWith(HASH)) return '';
      return location.hash.slice(HASH.length);
    };

    window.addEventListener('popstate', () => {
      const id = fromHash();
      if (id && byId(id)) {
        if (id !== currentId) open(id, { push: false });
      } else {
        close({ back: false });
      }
    });

    // прямий перехід за посиланням на конкретний аромат
    const initial = fromHash();
    if (initial && byId(initial)) open(initial, { push: false });
  };

  /* ==========================================================
     ЯКОРІ НА ЦІЙ САМІЙ СТОРІНЦІ

     Прокручуємо самі, а не покладаємось на браузер. Якщо адреса вже
     містить потрібний хеш (покупець уже натискав «Оформити замовлення»,
     потім гортав далі), браузер вважає перехід зайвим і не рухається
     з місця — кнопка мовчки перестає працювати.
     ========================================================== */
  const initAnchors = () => {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;

      const id = link.getAttribute('href').slice(1);
      if (!id) return;

      const target = document.getElementById(id);
      if (!target) return;

      e.preventDefault();
      // відступ під фіксовану шапку тримає scroll-padding-top у CSS
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      if (location.hash !== `#${id}`) history.pushState(null, '', `#${id}`);
    });
  };

  /* ==========================================================
     ФОНОВЕ ВІДЕО В FAQ
     Крутиться, поки секція на екрані, і стає на паузу, щойно вона
     пішла — марно гріти процесор на кадри, яких ніхто не бачить.
     ========================================================== */
  /* З 8.6 с у ролику спливає фінальний напис із назвою аромату — обриваємо
     задовго до нього. Сповільнення робить рух спокійнішим, а заразом і
     точнішою обрізку: за той самий такт таймера кадр проходить менше. */
  const FAQ_VIDEO_END = 7.6;
  const FAQ_VIDEO_RATE = 0.55;

  const initFaqVideo = () => {
    const video = $('[data-faq-video]');
    const section = $('#faq');
    if (!video || !section) return;

    video.playbackRate = FAQ_VIDEO_RATE;
    video.addEventListener('timeupdate', () => {
      if (video.currentTime >= FAQ_VIDEO_END) video.currentTime = 0;
    });

    const start = () => {
      video.playbackRate = FAQ_VIDEO_RATE;   // після паузи браузер скидає темп
      return video.play().catch(() => { /* автоплей заблокований */ });
    };

    if (!('IntersectionObserver' in window)) { start(); return; }

    new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) start(); else video.pause();
    }, { threshold: 0.05 }).observe(section);

    // вкладку згорнули — браузер ставить відео на паузу, повертаємо його
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && video.getBoundingClientRect().bottom > 0) start();
    });
  };

  /* ==========================================================
     ФОНОВЕ ВІДЕО НА СТОРІНЦІ «ДЛЯ БІЗНЕСУ»
     Той самий принцип, що й у FAQ: грає, поки картка на екрані,
     і на паузі, щойно пішла з очей. Спеціальної обрізки тут не
     потрібно — відео просто зациклюється (атрибут loop).
     ========================================================== */
  const initB2bVideo = () => {
    const video = $('[data-b2b-video]');
    if (!video) return;

    const start = () => video.play().catch(() => { /* автоплей заблокований */ });
    const card = video.closest('.b2b__copy') || video;

    if (!('IntersectionObserver' in window)) { start(); return; }

    new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) start(); else video.pause();
    }, { threshold: 0.05 }).observe(card);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && video.getBoundingClientRect().bottom > 0) start();
    });
  };

  /* ==========================================================
     ВІДГУКИ: стрічка зі стрілками
     Сам скрол робить браузер — кнопки лише зручність для миші.
     ========================================================== */
  const initRail = () => {
    const rail = $('[data-rail]');
    const prev = $('[data-rail-prev]');
    const next = $('[data-rail-next]');
    if (!rail || !prev || !next) return;

    const step = () => {
      const card = $('.review', rail);
      if (!card) return rail.clientWidth * 0.8;
      const gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
      return card.getBoundingClientRect().width + gap;
    };

    const go = (dir) => rail.scrollBy({ left: dir * step(), behavior: reduced ? 'auto' : 'smooth' });

    // кнопка гасне, коли стрічка вперлася в край
    const sync = () => {
      const max = rail.scrollWidth - rail.clientWidth - 2;
      prev.disabled = rail.scrollLeft <= 2;
      next.disabled = rail.scrollLeft >= max;
    };

    prev.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));
    rail.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  };

  /* ==========================================================
     ЗАЯВКА ДЛЯ БІЗНЕСУ
     ========================================================== */
  const initB2B = () => {
    const form = $('[data-b2b-form]');
    if (!form) return;

    const status = $('[data-b2b-status]', form);
    const submit = $('[data-b2b-submit]', form);
    const label = $('[data-b2b-label]', form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = '';
      status.className = 'order__status';
      clearErrors(form);

      const v = (n) => $(`[name="${n}"]`, form)?.value.trim() || '';
      const el = (n) => $(`[name="${n}"]`, form);
      const errs = [];

      if (v('name').length < 2) errs.push(fail(el('name'), 'Вкажіть, як до вас звертатися'));
      // Контакт: або телефон, або Telegram — приймаємо будь-що осмислене
      if (v('contact').length < 5) errs.push(fail(el('contact'), 'Телефон або Telegram для зв\'язку'));
      if (!v('business')) errs.push(fail(el('business'), 'Оберіть тип бізнесу'));

      if (errs.length) {
        status.textContent = 'Перевірте підсвічені поля.';
        status.classList.add('is-err');
        errs[0]?.focus();
        return;
      }

      submit.classList.add('is-busy');
      label.textContent = 'Надсилаємо…';

      try {
        const res = await fetch(`${API}/b2b`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: v('name'),
            contact: v('contact'),
            business: v('business'),
            volume: v('volume'),
            comment: v('comment')
          })
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) throw new Error(json.error || `Сервер відповів ${res.status}`);

        form.reset();
        status.textContent = 'Дякуємо за заявку! Ми зв\'яжемося з вами, щоб уточнити деталі та запропонувати відповідні умови.';
        status.classList.add('is-ok');
      } catch (err) {
        status.textContent = 'Не вдалося надіслати заявку. Напишіть нам у Telegram або зателефонуйте — відповімо швидше.';
        status.classList.add('is-err');
        console.error('[b2b]', err);
      } finally {
        submit.classList.remove('is-busy');
        label.textContent = 'Отримати комерційну пропозицію';
      }
    });
  };

  /* ==========================================================
     ДОСТАВКА: перемикання блоків
     ========================================================== */
  const initShipping = () => {
    const form = $('[data-order-form]');
    if (!form) return;

    const apply = () => {
      const ship = $('input[name="shipping"]:checked', form)?.value || '';
      // Форма з novalidate, тож приховані поля не блокують відправку —
      // потрібні саме для обраного способу перевіряє validate().
      $$('[data-ship]', form).forEach((el) => {
        el.hidden = !el.dataset.ship.split(' ').includes(ship);
      });
    };

    form.addEventListener('change', (e) => {
      if (e.target.name === 'shipping') {
        apply();
        clearErrors(form);
      }
    });
    apply();
  };

  /* ==========================================================
     НОВА ПОШТА: автодоповнення міст і відділень
     ========================================================== */
  /* Нова Пошта роздає два різні ідентифікатори того самого пункту:
     `DeliveryCity` — для списку відділень, `Ref` — для довідника вулиць.
     Переплутати їх не можна: з `DeliveryCity` пошук вулиць мовчки
     повертає порожній список, без жодної помилки. Тому тримаємо обидва. */
  const npState = { cityRef: '', settlementRef: '', cityName: '', warehouse: '' };

  /* Запасний список населених пунктів на випадок, якщо довідник
     перевізника недоступний (немає мережі, блокування). */
  let localCities = null;

  const loadLocalCities = async () => {
    if (localCities) return localCities;
    try {
      const res = await fetch('data/settlements.json');
      localCities = res.ok ? await res.json() : [];
    } catch {
      localCities = [];
    }
    return localCities;
  };

  /* Пошук без урахування регістру та апострофів: «камянець» знайде
     «Кам'янець-Подільський». */
  const norm = (s) => String(s).toLowerCase().replace(/['’ʼ`]/g, '').trim();

  const searchLocalCities = async (q) => {
    const list = await loadLocalCities();
    const needle = norm(q);
    if (needle.length < 2) return [];
    const starts = [];
    const inside = [];
    list.forEach((it) => {
      const hay = norm(it.name);
      if (hay.startsWith(needle)) starts.push(it);
      else if (hay.includes(needle)) inside.push(it);
    });
    return starts.concat(inside).slice(0, 40);
  };

  /* Довідник адрес Нової Пошти відкритий: пошук населених пунктів і
     список відділень працюють без ключа API. Тож звертаємось напряму —
     покупець бачить справжні відділення й поштомати, а не те, що сам
     набрав. Ключ потрібен лише для створення накладних, і його тут немає. */
  const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

  const npCall = async (calledMethod, methodProperties) => {
    const res = await fetch(NP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: '', modelName: 'Address', calledMethod, methodProperties })
    });
    if (!res.ok) throw new Error(`np ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error((json.errors || []).join('; ') || 'np error');
    return json.data || [];
  };

  const npFetch = async (payload) => {
    if (payload.type === 'settlements') {
      /* Ліміт 50, бо однойменних сіл в Україні буває багато: самих
         Іванівок — понад пів сотні. Поруч показуємо область, район і
         кількість пунктів видачі, щоб покупець не сплутав своє село. */
      const data = await npCall('searchSettlements', { CityName: payload.q, Limit: '50' });
      return (data[0]?.Addresses || [])
        .map((a) => {
          const type = a.SettlementTypeCode ? `${a.SettlementTypeCode} ` : '';
          const place = [a.Area && `${a.Area} обл.`, a.Region && `${a.Region} р-н`]
            .filter(Boolean).join(', ');
          const points = Number(a.Warehouses) || 0;
          return {
            ref: a.DeliveryCity || a.Ref,
            sref: a.Ref || '',               // для довідника вулиць
            name: type + (a.MainDescription || a.Present),
            area: [place, points ? `${points} пунктів` : ''].filter(Boolean).join(' · ')
          };
        })
        .filter((i) => i.ref && i.name);
    }

    if (payload.type === 'settlement-info') {
      /* Поштовий індекс населеного пункту. Нова Пошта веде його у своєму
         довіднику (`Index1`–`Index2` — діапазон індексів Укрпошти), і цей
         метод теж відкритий. Власний довідник Укрпошти тут не допоміг би:
         він вимагає токен і не віддає відповідь у браузер. */
      const data = await npCall('getSettlements', { Ref: payload.ref, Limit: '1', Page: '1' });
      const s = data[0];
      if (!s) return [];
      return [{ index1: s.Index1 || '', index2: s.Index2 || '', name: s.Description || '' }];
    }

    if (payload.type === 'streets') {
      /* Довідник вулиць відкритий так само, як і довідник міст, і покриває
         всю Україну — від обласних центрів до сіл. Номерів будинків у ньому
         немає: Нова Пошта їх не веде, тож будинок лишається вільним полем. */
      const data = await npCall('searchSettlementStreets', {
        StreetName: payload.q,
        SettlementRef: payload.ref,
        Limit: '50'
      });
      return (data[0]?.Addresses || [])
        .map((s) => ({
          name: s.Present
            || [s.StreetsTypeDescription, s.SettlementStreetDescription].filter(Boolean).join(' ')
        }))
        .filter((s) => s.name);
    }

    if (payload.type === 'warehouses') {
      /* Шукаємо на боці Нової Пошти: у великих містах пунктів тисячі
         (у Києві понад 6000), і завантажити їх усі в браузер неможливо.
         FindByString шукає і за номером, і за вулицею. */
      const props = { CityRef: payload.ref, Limit: '100', Page: '1' };
      if (payload.q) props.FindByString = payload.q;

      const data = await npCall('getWarehouses', props);
      const exact = String(payload.q || '').replace(/\D/g, '');

      return data
        .map((w) => ({ name: w.Description, number: Number(w.Number) || 0 }))
        .filter((w) => w.name)
        .sort((a, b) => {
          // точний збіг номера — нагору, решта за зростанням
          if (exact) {
            const ae = String(a.number) === exact ? 0 : 1;
            const be = String(b.number) === exact ? 0 : 1;
            if (ae !== be) return ae - be;
          }
          return a.number - b.number;
        });
    }

    return [];
  };

  const debounce = (fn, ms) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };

  const initNP = () => {
    const cityInput = $('input[name="npCity"]');
    const whInput   = $('[data-wh-search]');          // видиме поле
    const whValue   = $('input[name="npWarehouse"]'); // приховане значення
    const whHint    = $('[data-wh-hint]');
    if (!cityInput || !whInput || !whValue) return;

    /* Без доступу до довідника список реальних відділень недосяжний —
       вигадувати адреси не можна. Але формат можна: покупець вводить
       номер, а варіанти «Відділення №N» і «Поштомат №N» підставляються. */
    const numberOptions = (q) => {
      const n = String(q).replace(/\D/g, '').slice(0, 4);
      if (!n) return [];
      return [
        { name: `Відділення №${n}` },
        { name: `Поштомат №${n}` }
      ];
    };

    const cityList = $('[data-np-city-list]');
    const whList   = $('[data-np-wh-list]');
    let degraded = false;   // API недоступний → працюємо як звичайні текстові поля

    const showList = (ul, input, items, render, onPick) => {
      if (!items.length) {
        ul.innerHTML = '<li class="combo__empty">Нічого не знайдено — впишіть вручну</li>';
      } else {
        ul.innerHTML = items.map((it, i) =>
          `<li role="option" data-i="${i}" tabindex="-1">${render(it)}</li>`).join('');
      }
      ul.hidden = false;
      input.setAttribute('aria-expanded', 'true');

      /* Натискання на підказку не має забирати фокус із поля. Інакше
         спрацьовує blur, список ховається — і клік, який ще не встиг
         завершитися, летить у порожнечу. */
      ul.onmousedown = (e) => e.preventDefault();

      ul.onclick = (e) => {
        const li = e.target.closest('li[data-i]');
        if (!li) return;
        onPick(items[+li.dataset.i]);
        hideList(ul, input);
        input.focus();
      };
    };

    const hideList = (ul, input) => {
      ul.hidden = true;
      input.setAttribute('aria-expanded', 'false');
    };

    const whPlaceholder = () => (degraded
      ? 'Введіть номер — наприклад 12'
      : 'Номер або вулиця — оберіть зі списку');

    const whHintText = () => (degraded
      ? 'Довідник Нової Пошти недоступний — вкажіть номер, ми підтвердимо його при дзвінку.'
      : 'Відділення та поштомати підтягуються з Нової Пошти.');

    const enableWarehouse = (on) => {
      if (whInput.disabled === !on) {
        // стан не змінився — оновлюємо лише тексти
        whInput.placeholder = on ? whPlaceholder() : 'Спочатку вкажіть місто';
        if (whHint) whHint.textContent = on ? whHintText() : '';
        return;
      }
      whInput.disabled = !on;
      whInput.placeholder = on ? whPlaceholder() : 'Спочатку вкажіть місто';
      if (!on) {
        whInput.value = '';
        whValue.value = '';
        npState.warehouse = '';
        whInput.closest('.field')?.classList.remove('is-picked');
      }
      if (whHint) whHint.textContent = on ? whHintText() : '';
    };

    const degrade = () => {
      if (degraded) return;
      degraded = true;
      if (!whInput.disabled) {
        whInput.placeholder = whPlaceholder();
        if (whHint) whHint.textContent = whHintText();
      }
    };

    /* --- Вулиця (кур'єрська доставка) ---
       Підказки беруться з того самого відкритого довідника Нової Пошти й
       працюють по всій Україні. Поле лишається звичайним текстовим: у
       довіднику є не кожна вулиця кожного села, тож впертися в «оберіть
       зі списку» не можна — людина мусить мати змогу дописати вручну. */
    const streetInput = $('input[name="npStreet"]');
    const streetList  = $('[data-np-street-list]');
    const streetHint  = $('[data-street-hint]');

    const streetPlaceholder = () => (npState.settlementRef
      ? 'Почніть вводити назву — оберіть зі списку'
      : 'Вулиця, провулок, проспект');

    const streetHintText = () => (npState.settlementRef
      ? 'Вулиці підтягуються з довідника Нової Пошти. Якщо своєї не бачите — впишіть вручну.'
      : 'Оберіть населений пункт зі списку, щоб з’явилися підказки вулиць.');

    const resetStreet = () => {
      if (!streetInput) return;
      streetInput.value = '';
      streetInput.closest('.field')?.classList.remove('is-picked');
      if (streetList) hideList(streetList, streetInput);
    };

    /* Поле відкривається разом із полем відділення — щойно в місті
       з'явився осмислений текст. Без обраного пункту підказок не буде,
       але вписати адресу вручну можна. */
    const syncStreetAccess = () => {
      if (!streetInput) return;
      const on = cityInput.value.trim().length >= 2;
      streetInput.disabled = !on;
      streetInput.placeholder = on ? streetPlaceholder() : 'Спочатку оберіть місто';
      if (streetHint) streetHint.textContent = on ? streetHintText() : '';
      if (!on) resetStreet();
    };

    if (streetInput && streetList) {
      const searchStreet = debounce(async (q) => {
        if (q.length < 2 || !npState.settlementRef) {
          hideList(streetList, streetInput);
          return;
        }
        let items = [];
        try {
          items = await npFetch({ type: 'streets', q, ref: npState.settlementRef });
        } catch {
          hideList(streetList, streetInput);
          return;
        }
        showList(streetList, streetInput, items, (it) => esc(it.name), (it) => {
          streetInput.value = it.name;
          streetInput.closest('.field')?.classList.add('is-picked');
          /* Одразу ведемо до номера будинку — його в довіднику немає.
             Через setTimeout, бо showList після вибору повертає фокус
             у поле пошуку й інакше забрав би його назад. */
          setTimeout(() => $('input[name="npHouse"]')?.focus(), 0);
        });
      }, 240);

      streetInput.addEventListener('input', () => {
        streetInput.closest('.field')?.classList.remove('is-picked');
        searchStreet(streetInput.value.trim());
      });
      streetInput.addEventListener('focus', () => {
        if (streetInput.value.trim().length >= 2) searchStreet(streetInput.value.trim());
      });
      streetInput.addEventListener('blur', () => setTimeout(() => hideList(streetList, streetInput), 260));
    }

    /* --- Міста --- */
    const pickCity = (it) => {
      cityInput.value = it.name;
      npState.cityRef = it.ref || '';
      npState.cityName = it.name;
      npState.settlementRef = it.sref || '';
      cityInput.closest('.field')?.classList.add('is-picked');
      enableWarehouse(true);
      whInput.value = '';
      npState.warehouse = '';
      if (!it.ref) degrade();   // без ref список відділень не завантажити
      resetStreet();
      syncStreetAccess();
    };

    const searchCity = debounce(async (q) => {
      if (q.length < 2) { hideList(cityList, cityInput); return; }

      // Спершу база перевізника, якщо вона доступна
      if (!degraded) {
        try {
          const items = await npFetch({ type: 'settlements', q });
          if (items.length) {
            showList(cityList, cityInput, items,
              (it) => `${esc(it.name)}<small>${esc(it.area)}</small>`, pickCity);
            return;
          }
        } catch {
          degrade();
        }
      }

      const local = await searchLocalCities(q);
      showList(cityList, cityInput, local,
        (it) => `${esc(it.name)}<small>${esc(it.area)}</small>`, pickCity);
    }, 240);

    /* Поле відділення відкривається, щойно в місті з'явився осмислений
       текст — незалежно від того, обрали його зі списку чи підставив
       браузер. Інакше поле лишалося замкненим і без пояснення. */
    const syncWarehouseAccess = () => {
      enableWarehouse(cityInput.value.trim().length >= 2);
    };

    cityInput.addEventListener('input', () => {
      npState.cityRef = '';
      npState.settlementRef = '';
      npState.cityName = cityInput.value.trim();
      cityInput.closest('.field')?.classList.remove('is-picked');
      syncWarehouseAccess();
      syncStreetAccess();
      searchCity(cityInput.value.trim());
    });
    cityInput.addEventListener('change', () => { syncWarehouseAccess(); syncStreetAccess(); });
    cityInput.addEventListener('focus', () => {
      if (cityInput.value.trim().length >= 2) searchCity(cityInput.value.trim());
    });
    cityInput.addEventListener('blur', () => setTimeout(() => {
      hideList(cityList, cityInput);
      syncWarehouseAccess();
      syncStreetAccess();
    }, 260));

    /* --- Укрпошта: місто, індекс і вулиця ---
       Довідник самої Укрпошти без токена недоступний (і не віддає
       відповідь у браузер), тож усі три підказки беремо з відкритого
       довідника Нової Пошти: він веде і населені пункти, і їхні поштові
       індекси, і вулиці. */
    const upInput = $('input[name="upCity"]');
    const upList = $('[data-up-city-list]');
    const upIndex = $('input[name="upIndex"]');
    const upIndexList = $('[data-up-index-list]');
    const upIndexHint = $('[data-up-index-hint]');
    const upStreet = $('input[name="upAddress"]');
    const upStreetList = $('[data-up-street-list]');
    const upStreetHint = $('[data-up-street-hint]');

    if (upInput && upList) {
      let upRef = '';                 // ref обраного пункту в довіднику
      let upIndexes = { one: '', from: '', to: '' };

      const INDEX_DEFAULT_HINT = 'П\'ять цифр. Можна знайти на ukrposhta.ua.';

      /* Звірка індексу з обраним пунктом. Попередження, а не помилка:
         діапазон із довідника — орієнтир, а не закон, і блокувати через
         нього замовлення не можна. Але мовчки пропустити індекс чужого
         міста теж не можна — це посилка, яка поїде не туди. */
      const indexFitsSettlement = () => {
        if (!upIndex) return true;
        const val = upIndex.value.trim();
        if (val.length !== 5) return true;
        if (upIndexes.one) return val === upIndexes.one;
        if (upIndexes.from && upIndexes.to) {
          const n = Number(val);
          return n >= Number(upIndexes.from) && n <= Number(upIndexes.to);
        }
        return true;
      };

      const setIndexHint = () => {
        if (!upIndexHint) return;
        const field = upIndex?.closest('.field');

        if (!indexFitsSettlement()) {
          const range = upIndexes.one || `${upIndexes.from}–${upIndexes.to}`;
          upIndexHint.textContent =
            `Схоже, цей індекс не з «${upInput.value.trim()}» — там ${range}. Перевірте, будь ласка.`;
          field?.classList.add('is-warn');
          return;
        }
        field?.classList.remove('is-warn');

        if (upIndexes.one) {
          upIndexHint.textContent = `Індекс цього пункту — ${upIndexes.one}. Підставили автоматично.`;
        } else if (upIndexes.from && upIndexes.to) {
          upIndexHint.textContent =
            `Індекси цього міста: ${upIndexes.from}–${upIndexes.to}. Вкажіть індекс свого відділення.`;
        } else {
          upIndexHint.textContent = INDEX_DEFAULT_HINT;
        }
      };

      const setStreetHint = () => {
        if (!upStreetHint) return;
        upStreetHint.textContent = upRef
          ? 'Вулиці підтягуються з довідника. Якщо своєї не бачите — впишіть вручну.'
          : '';
      };

      const resetUpDetails = () => {
        upRef = '';
        upIndexes = { one: '', from: '', to: '' };
        setIndexHint();
        setStreetHint();
        if (upStreetList && upStreet) hideList(upStreetList, upStreet);
        if (upIndexList && upIndex) hideList(upIndexList, upIndex);
      };

      /* Після вибору пункту питаємо його індекс. У селах і містечках
         Index1 === Index2 — індекс один на весь пункт, і його можна
         сміливо підставити. У великих містах це діапазон: там підставляти
         навмання не можна, тож показуємо межі й лишаємо поле людині. */
      const loadIndex = async (ref) => {
        if (!ref) return;
        let info;
        try {
          info = (await npFetch({ type: 'settlement-info', ref }))[0];
        } catch {
          return;
        }
        if (!info || upRef !== ref) return;   // місто встигли змінити

        if (info.index1 && info.index1 === info.index2) {
          upIndexes = { one: info.index1, from: '', to: '' };
          if (upIndex && !upIndex.value.trim()) {
            upIndex.value = info.index1;
            upIndex.closest('.field')?.classList.add('is-picked');
          }
        } else {
          upIndexes = { one: '', from: info.index1 || '', to: info.index2 || '' };
        }
        setIndexHint();
      };

      const pickUpCity = (it) => {
        upInput.value = it.name;
        upInput.closest('.field')?.classList.add('is-picked');
        upRef = it.sref || '';
        upIndexes = { one: '', from: '', to: '' };
        if (upIndex) {
          upIndex.value = '';
          upIndex.closest('.field')?.classList.remove('is-picked');
        }
        if (upStreet) {
          upStreet.value = '';
          upStreet.closest('.field')?.classList.remove('is-picked');
        }
        setIndexHint();
        setStreetHint();
        loadIndex(upRef);
      };

      const searchUp = debounce(async (q) => {
        if (q.length < 2) { hideList(upList, upInput); return; }

        let items = [];
        try {
          items = await npFetch({ type: 'settlements', q });
        } catch {
          items = await searchLocalCities(q);
        }
        if (!items.length) items = await searchLocalCities(q);

        showList(upList, upInput, items,
          (it) => `${esc(it.name)}<small>${esc(it.area)}</small>`, pickUpCity);
      }, 240);

      upInput.addEventListener('input', () => {
        upInput.closest('.field')?.classList.remove('is-picked');
        resetUpDetails();
        searchUp(upInput.value.trim());
      });
      upInput.addEventListener('focus', () => {
        if (upInput.value.trim().length >= 2) searchUp(upInput.value.trim());
      });
      upInput.addEventListener('blur', () => setTimeout(() => hideList(upList, upInput), 260));

      /* --- Індекс --- */
      if (upIndex && upIndexList) {
        const showIndexHelp = () => {
          /* Підставляти можна лише те, у чому ми впевнені. Коли в пункті
             один індекс — це саме він. Коли їх діапазон (велике місто),
             будь-який здогад означав би посилку не в те відділення, тож
             там показуємо самі межі як довідку, яку не можна клікнути. */
          if (upIndexes.one) {
            showList(upIndexList, upIndex, [{ name: upIndexes.one }],
              (it) => `${esc(it.name)}<small>індекс цього пункту</small>`,
              (it) => {
                upIndex.value = it.name;
                upIndex.closest('.field')?.classList.add('is-picked');
              });
            return;
          }

          if (upIndexes.from && upIndexes.to) {
            upIndexList.innerHTML =
              `<li class="combo__empty">Індекси цього міста: ${esc(upIndexes.from)}–${esc(upIndexes.to)}.`
              + ' Вкажіть індекс свого відділення — його видно на ukrposhta.ua.</li>';
            upIndexList.onclick = null;
            upIndexList.hidden = false;
            upIndex.setAttribute('aria-expanded', 'true');
            return;
          }

          hideList(upIndexList, upIndex);
        };

        upIndex.addEventListener('focus', showIndexHelp);
        upIndex.addEventListener('input', () => {
          // у полі лише цифри
          const digits = upIndex.value.replace(/\D/g, '').slice(0, 5);
          if (digits !== upIndex.value) upIndex.value = digits;
          upIndex.closest('.field')?.classList.toggle('is-picked', digits.length === 5);
          setIndexHint();
          if (!digits) showIndexHelp(); else hideList(upIndexList, upIndex);
        });
        upIndex.addEventListener('blur', () => setTimeout(() => hideList(upIndexList, upIndex), 260));
      }

      /* --- Вулиця / адреса відділення --- */
      if (upStreet && upStreetList) {
        const searchUpStreet = debounce(async (q) => {
          if (q.length < 2 || !upRef) { hideList(upStreetList, upStreet); return; }
          let items = [];
          try {
            items = await npFetch({ type: 'streets', q, ref: upRef });
          } catch {
            hideList(upStreetList, upStreet);
            return;
          }
          showList(upStreetList, upStreet, items, (it) => esc(it.name), (it) => {
            upStreet.value = it.name;
            upStreet.closest('.field')?.classList.add('is-picked');
          });
        }, 240);

        upStreet.addEventListener('input', () => {
          upStreet.closest('.field')?.classList.remove('is-picked');
          searchUpStreet(upStreet.value.trim());
        });
        upStreet.addEventListener('focus', () => {
          if (upStreet.value.trim().length >= 2) searchUpStreet(upStreet.value.trim());
        });
        upStreet.addEventListener('blur', () => setTimeout(() => hideList(upStreetList, upStreet), 260));
      }
    }

    /* --- Відділення --- */
    const loadWarehouses = (q) =>
      npState.cityRef
        ? npFetch({ type: 'warehouses', ref: npState.cityRef, q })
        : Promise.resolve([]);

    const pickWarehouse = (it) => {
      whInput.value = it.name;
      whValue.value = it.name;
      npState.warehouse = it.name;
      whInput.closest('.field')?.classList.add('is-picked');
    };

    const searchWh = debounce(async () => {
      if (whInput.disabled) return;
      const q = whInput.value.trim();

      if (!degraded && npState.cityRef) {
        try {
          const items = await loadWarehouses(q);
          if (items.length) {
            showList(whList, whInput, items, (it) => esc(it.name), pickWarehouse);
          } else if (q) {
            showList(whList, whInput, [], () => '', () => {});
          } else {
            hideList(whList, whInput);
          }
          return;
        } catch {
          degrade();
        }
      }

      const items = numberOptions(q);
      if (!items.length) { hideList(whList, whInput); return; }
      showList(whList, whInput, items, (it) => esc(it.name), pickWarehouse);
    }, 180);

    whInput.addEventListener('focus', searchWh);
    whInput.addEventListener('input', () => {
      // значення зараховується лише після вибору зі списку
      whValue.value = '';
      npState.warehouse = '';
      whInput.closest('.field')?.classList.remove('is-picked');
      searchWh();
    });
    whInput.addEventListener('blur', () => setTimeout(() => hideList(whList, whInput), 260));

    // Перевіряємо доступність довідника НП заздалегідь.
    npCall('searchSettlements', { CityName: 'Київ', Limit: '1' }).catch(degrade);

    // Місто могло лишитися від автозаповнення браузера — тоді поля
    // відділення й вулиці мають бути відкритими одразу, без повторного вибору.
    syncWarehouseAccess();
    syncStreetAccess();
  };

  /* ==========================================================
     ВАЛІДАЦІЯ
     ========================================================== */
  const clearErrors = (form) => {
    $$('.field.is-invalid', form).forEach((f) => f.classList.remove('is-invalid'));
    $$('[data-err]', form).forEach((e) => { e.textContent = ''; });
    const agree = $('[data-err-agree]', form);
    if (agree) agree.textContent = '';
  };

  const fail = (input, msg) => {
    if (!input) return null;
    const field = input.closest('.field');
    field?.classList.add('is-invalid');
    const slot = field ? $('[data-err]', field) : null;
    if (slot) slot.textContent = msg;
    return input;
  };

  const normPhone = (raw) => {
    const d = String(raw).replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('380')) return `+${d}`;
    if (d.length === 10 && d.startsWith('0'))   return `+38${d}`;
    if (d.length === 9)                          return `+380${d}`;
    return null;
  };

  const validate = (form) => {
    clearErrors(form);
    const errs = [];
    const v = (n) => $(`[name="${n}"]`, form)?.value.trim() || '';
    const el = (n) => $(`[name="${n}"]`, form);

    if (v('name').length < 3) errs.push(fail(el('name'), 'Вкажіть прізвище та ім\'я'));

    const phone = normPhone(v('phone'));
    if (!phone) errs.push(fail(el('phone'), 'Формат: +380 XX XXX XX XX'));

    const ship = $('input[name="shipping"]:checked', form)?.value;

    if (ship === 'np-warehouse' || ship === 'np-courier') {
      if (v('npCity').length < 2) errs.push(fail(el('npCity'), 'Оберіть населений пункт'));
      if (ship === 'np-warehouse' && v('npWarehouse').length < 2) {
        // npWarehouse прихований — підсвічуємо видиме поле пошуку
        errs.push(fail($('[data-wh-search]', form), 'Оберіть відділення або поштомат зі списку'));
      }
      if (ship === 'np-courier') {
        if (v('npStreet').length < 3) errs.push(fail(el('npStreet'), 'Вкажіть вулицю'));
        if (!v('npHouse')) errs.push(fail(el('npHouse'), 'Вкажіть номер будинку'));
      }
    }

    if (ship === 'ukrposhta') {
      if (v('upCity').length < 2) errs.push(fail(el('upCity'), 'Вкажіть місто або село'));
      if (!/^\d{5}$/.test(v('upIndex'))) errs.push(fail(el('upIndex'), 'Індекс — рівно 5 цифр'));
    }

    const agree = el('agree');
    if (agree && !agree.checked) {
      $('[data-err-agree]', form).textContent = 'Без згоди з офертою ми не можемо прийняти замовлення';
      errs.push(agree);
    }

    return { ok: errs.length === 0, first: errs[0], phone };
  };

  /* ==========================================================
     ВІДПРАВКА ЗАМОВЛЕННЯ
     ========================================================== */
  const buildPayload = (form, phone) => {
    const v = (n) => $(`[name="${n}"]`, form)?.value.trim() || '';
    const ship = $('input[name="shipping"]:checked', form).value;
    const t = totals();

    const delivery = { method: ship };
    if (ship === 'np-warehouse') {
      delivery.label = 'Нова Пошта — відділення';
      delivery.city = v('npCity');
      delivery.warehouse = v('npWarehouse');
      delivery.cityRef = npState.cityRef;
    } else if (ship === 'np-courier') {
      delivery.label = 'Нова Пошта — кур\'єр';
      delivery.city = v('npCity');
      delivery.street = v('npStreet');
      delivery.house = v('npHouse');
      // Зібраний рядок — для сумісності з обробником, який очікує `address`
      delivery.address = [v('npStreet'), v('npHouse') && `буд. ${v('npHouse')}`]
        .filter(Boolean).join(', ');
      delivery.flat = v('npFlat');
      delivery.cityRef = npState.cityRef;
      delivery.settlementRef = npState.settlementRef;
    } else if (ship === 'ukrposhta') {
      delivery.label = 'Укрпошта — відділення';
      delivery.city = v('upCity');
      delivery.index = v('upIndex');
      delivery.address = v('upAddress');
    }

    return {
      customer: { name: v('name'), phone },
      delivery,
      payment: 'liqpay',
      comment: v('comment'),
      items: Object.entries(cart).map(([id, qty]) => {
        const p = byId(id);
        return { id, name: p.name, qty, price: PRICE, sum: qty * PRICE };
      }),
      amounts: { subtotal: t.sub, discountRate: t.rate, discount: t.discount, total: t.grand }
    };
  };

  /* ==========================================================
     Оплата карткою — вікно LiqPay просто в блоці замовлення
     ==========================================================
     Покупець вводить номер картки вручну, не виходячи зі сторінки:
     Apple Pay і Google Pay потребують Face ID / Touch ID і підхожого
     пристрою, тож не можуть бути єдиним шляхом.

     Поля картки — це iframe LiqPay усередині нашої сторінки. Номер,
     термін і CVV набираються в ньому й ідуть напряму до LiqPay: на наш
     сайт і на наш сервер вони не потрапляють. Своїх полів для картки ми
     не робимо принципово — приймати реквізити на власному домені можна
     лише з сертифікацією PCI DSS.

     Якщо скрипт віджета не завантажився (блокувальник, погана мережа,
     жорсткий корпоративний проксі) — вмикається запасний шлях: звичайний
     перехід на сторінку оплати LiqPay. */
  const LIQPAY_JS = 'https://static.liqpay.ua/libjs/checkout.js';
  const LIQPAY_JS_TIMEOUT = 8000;
  let liqpayJs = null;

  const loadLiqpay = () => {
    if (window.LiqPayCheckout) return Promise.resolve(window.LiqPayCheckout);
    if (!liqpayJs) {
      liqpayJs = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = LIQPAY_JS;
        s.async = true;
        const fail = () => reject(new Error('Скрипт LiqPay недоступний'));
        const timer = setTimeout(fail, LIQPAY_JS_TIMEOUT);
        s.onload = () => {
          clearTimeout(timer);
          if (window.LiqPayCheckout) resolve(window.LiqPayCheckout); else fail();
        };
        s.onerror = () => { clearTimeout(timer); fail(); };
        document.head.appendChild(s);
      }).catch((err) => {
        liqpayJs = null;   // щоб наступна спроба почалася з чистого аркуша
        throw err;
      });
    }
    return liqpayJs;
  };

  /* Статуси LiqPay, після яких замовлення вважається оформленим.
     Остаточне підтвердження однаково приходить нам на server_url —
     тут ми лише показуємо покупцеві, що сталося. */
  const PAID_OK = ['success', 'sandbox', 'wait_accept', 'wait_secure', 'subscribed'];
  const PAID_FAIL = ['failure', 'error', 'reversed'];

  const openLiqpayEmbed = async (packet, onResult) => {
    const panel = $('[data-pay-embed]');
    const box = $('[data-liqpay-embed]');
    if (!panel || !box) throw new Error('Немає місця під вікно оплати');

    const widget = await loadLiqpay();

    box.innerHTML = '';
    panel.hidden = false;

    widget.init({
      data: packet.data,
      signature: packet.signature,
      embedTo: '#liqpay-embed',
      language: 'uk',
      mode: 'embed'
    }).on('liqpay.callback', (res) => {
      const st = res && res.status;
      if (PAID_OK.includes(st)) onResult('ok', res);
      else if (PAID_FAIL.includes(st)) onResult('err', res);
    });

    panel.scrollIntoView({ ...scrollOpts, block: 'center' });
  };

  const closeLiqpayEmbed = () => {
    const panel = $('[data-pay-embed]');
    const box = $('[data-liqpay-embed]');
    if (panel) panel.hidden = true;
    if (box) box.innerHTML = '';
  };

  /* Непомітна форма → редірект на захищену сторінку LiqPay */
  const goLiqpay = ({ data, signature, checkoutUrl }) => {
    const f = document.createElement('form');
    f.method = 'POST';
    f.action = checkoutUrl || 'https://www.liqpay.ua/api/3/checkout';
    f.acceptCharset = 'utf-8';
    f.style.display = 'none';
    [['data', data], ['signature', signature]].forEach(([n, val]) => {
      const i = document.createElement('input');
      i.type = 'hidden'; i.name = n; i.value = val;
      f.appendChild(i);
    });
    document.body.appendChild(f);
    f.submit();
  };

  const initOrderForm = () => {
    const form = $('[data-order-form]');
    if (!form) return;

    const status = $('[data-order-status]');
    const submit = $('[data-submit]');
    const label = $('[data-submit-label]');

    // оплата лише карткою, тож напис на кнопці незмінний
    const setLabel = () => { label.textContent = 'Перейти до оплати'; };
    setLabel();

    /* Поки відкрите вікно оплати, кнопку ховаємо: інакше покупець може
       натиснути її вдруге й створити ще одне замовлення на ту саму суму. */
    const payDone = (kind, res) => {
      if (kind === 'ok') {
        cart = {};
        saveCart();
        renderCart();
        closeLiqpayEmbed();
        submit.hidden = false;
        form.reset();
        setLabel();
        status.textContent = 'Дякуємо! Оплату прийнято. Щойно банк підтвердить її, ми надішлемо номер ТТН у SMS.';
        status.className = 'order__status is-ok';
      } else {
        status.textContent = 'Оплата не пройшла. Кошик збережено — спробуйте іншу картку або зателефонуйте нам.';
        status.className = 'order__status is-err';
        console.warn('[pay]', res);
      }
      status.scrollIntoView({ ...scrollOpts, block: 'center' });
    };

    const back = $('[data-pay-embed-back]');
    if (back) back.addEventListener('click', () => {
      closeLiqpayEmbed();
      submit.hidden = false;
      status.textContent = 'Оплату не завершено. Замовлення збережено — натисніть «Перейти до оплати», коли будете готові.';
      status.className = 'order__status';
      submit.scrollIntoView({ ...scrollOpts, block: 'center' });
    });

    // Телефон: м'яке форматування після введення
    const phoneInput = $('input[name="phone"]', form);
    phoneInput.addEventListener('blur', () => {
      const n = normPhone(phoneInput.value);
      if (n) phoneInput.value = n.replace(/^(\+38)(\d{3})(\d{3})(\d{2})(\d{2})$/, '$1 ($2) $3-$4-$5');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = '';
      status.className = 'order__status';

      if (!cartCount()) {
        status.textContent = 'Спершу додайте хоча б один флакон.';
        status.classList.add('is-err');
        return;
      }

      const check = validate(form);
      if (!check.ok) {
        status.textContent = 'Перевірте підсвічені поля.';
        status.classList.add('is-err');
        check.first?.focus();
        check.first?.scrollIntoView({ ...scrollOpts, block: 'center' });
        return;
      }

      submit.classList.add('is-busy');
      label.textContent = 'Надсилаємо…';

      try {
        const res = await fetch(`${API}/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPayload(form, check.phone))
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) throw new Error(json.error || `Сервер відповів ${res.status}`);

        if (json.liqpay) {
          try {
            await openLiqpayEmbed(json.liqpay, payDone);
            submit.hidden = true;
            status.textContent = `Замовлення №${json.orderId} створено. Введіть дані картки у вікні нижче.`;
            status.classList.add('is-ok');
          } catch (err) {
            // Віджет не піднявся — не лишаємо покупця без оплати,
            // а веземо його на сторінку LiqPay, як було раніше.
            console.warn('[pay] вікно оплати недоступне, переходимо на сторінку LiqPay', err);
            status.textContent = 'Переходимо на захищену сторінку LiqPay…';
            status.classList.add('is-ok');
            goLiqpay(json.liqpay);
          }
          return;
        }

        cart = {};
        saveCart();
        renderCart();
        form.reset();
        setLabel();
        status.textContent = `Замовлення №${json.orderId} прийнято. Ми зателефонуємо для підтвердження протягом години.`;
        status.classList.add('is-ok');
        status.scrollIntoView({ ...scrollOpts, block: 'center' });
      } catch (err) {
        status.textContent = 'Не вдалося надіслати замовлення. Спробуйте ще раз або зателефонуйте нам — ми оформимо вручну.';
        status.classList.add('is-err');
        console.error('[order]', err);
      } finally {
        submit.classList.remove('is-busy');
        setLabel();
      }
    });
  };

  /* ==========================================================
     Повернення з LiqPay
     ========================================================== */
  const initReturn = () => {
    const p = new URLSearchParams(location.search);
    const paid = p.get('payment');
    if (!paid) return;

    const status = $('[data-order-status]');
    if (!status) return;

    // LiqPay повертає сюди незалежно від результату, тому не стверджуємо,
    // що гроші пройшли — підтвердження приходить нам на server_url.
    if (paid === 'done') {
      cart = {};
      saveCart();
      renderCart();
      status.textContent = 'Дякуємо! Замовлення прийнято. Щойно банк підтвердить оплату, ми надішлемо номер ТТН у SMS. Якщо оплата не пройшла — просто зателефонуйте нам.';
      status.className = 'order__status is-ok';
    } else {
      status.textContent = 'Оплату не завершено. Кошик збережено — спробуйте ще раз або зателефонуйте нам.';
      status.className = 'order__status is-err';
    }
    status.scrollIntoView({ ...scrollOpts, block: 'center' });
    history.replaceState({}, '', location.pathname);
  };

  /* ==========================================================
     Старт
     ========================================================== */
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  // найперше: висота вікна потрібна ще до того, як щось відмалюється
  initViewportLock();

  renderProducts();
  loadCart();
  renderCart();
  initDrawer();
  initModal();
  initAnchors();
  initFaqVideo();
  initB2bVideo();
  initRail();
  initB2B();
  initShipping();
  initNP();
  initOrderForm();
  initHeader();
  watchHero();
  initReveal();
  initReturn();
})();
