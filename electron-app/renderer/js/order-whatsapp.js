(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GTrotsOrderWhatsApp = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WEBSITE_BASE_URL = 'https://g-trots.ro';
  const ENABLED_STATUSES = new Set(['new', 'confirmed', 'processing', 'shipped', 'completed']);
  const FEMALE_GIVEN_NAMES = new Set(`
    adela adriana alina amalia ana anca andreea antonia alexandra beatrice bianca camelia carla carmen
    catalina cezara claudia codruta corina crina cristina dana delia denisa diana dorina ecaterina elena
    elisabeta emilia evelina felicia florentina florina gabriela georgiana gianina ilinca ioana irina
    isabela iulia julia larisa lavinia loredana luminita luiza madalina mara mariana maria mihaela mirela
    monica narcisa natalia nicoleta nicoletta oana olivia paula petronela raluca ramona rebecca roxana
    sabina sanda silvia simona sonia sorina stefania tatiana teodora valentina veronica victoria violeta
  `.trim().split(/\s+/));
  const MALE_GIVEN_NAMES = new Set(`
    adrian alin alexie andrei anton bogdan catalin ciprian claudiu constantin cosmin cristian dan daniel
    david dorel dragos emilian eugen florin gabriel george horatiu ion ioan iulian liviu lucian marius
    mihai mircea nicolae octavian ovidiu paul razvan robert sebastian sorin stefan tiberiu tudor valentin
    vasile victor vlad
  `.trim().split(/\s+/));

  function normalizeNameToken(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('ro-RO')
      .replace(/[^a-z]/g, '');
  }

  function customerCourtesy(customerName) {
    const tokens = String(customerName || '').split(/[\s,;/-]+/).map(normalizeNameToken).filter(Boolean);
    const firstRecognized = tokens.find(token => FEMALE_GIVEN_NAMES.has(token) || MALE_GIVEN_NAMES.has(token));
    if (firstRecognized) return FEMALE_GIVEN_NAMES.has(firstRecognized) ? 'doamnă' : 'domnule';
    const likelyGivenName = tokens[0] || '';
    return likelyGivenName.endsWith('a') && !['luca', 'toma'].includes(likelyGivenName) ? 'doamnă' : 'domnule';
  }

  function displayCustomerName(value) {
    const name = String(value || '').trim().replace(/\s+/g, ' ');
    if (!name) return 'client';
    return name.toLocaleLowerCase('ro-RO').replace(/(^|[\s'-])([a-zăâîșț])/gu, (_match, separator, letter) => `${separator}${letter.toLocaleUpperCase('ro-RO')}`);
  }

  function formatAmount(value, currency) {
    const amount = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
    return `${amount} ${String(currency || 'RON').trim().toUpperCase() || 'RON'}`;
  }

  function paymentLabel(paymentMethod) {
    return String(paymentMethod || '').toLowerCase() === 'card' ? 'Card' : 'Ramburs la curier';
  }

  function trackingUrl(order) {
    const supplied = String(order?.tracking_url || '').trim();
    if (supplied) {
      try { return new URL(supplied, WEBSITE_BASE_URL).href; }
      catch (_error) {}
    }
    const token = String(order?.tracking_token || '').trim();
    return token ? `${WEBSITE_BASE_URL}/urmarire-comanda?token=${encodeURIComponent(token)}` : `${WEBSITE_BASE_URL}/urmarire-comanda`;
  }

  function productLines(order) {
    const items = Array.isArray(order?.items) ? order.items : [];
    if (!items.length) return '- Produsele din comandă';
    return items.map(item => {
      const name = String(item?.product_name || 'Produs G-Trots').trim();
      const itemQuantity = Math.max(1, Number(item?.quantity || 1));
      return `- ${name}${itemQuantity > 1 ? ` × ${new Intl.NumberFormat('ro-RO').format(itemQuantity)} buc.` : ''}`;
    }).join('\n');
  }

  function reviewLinks(order) {
    const token = String(order?.tracking_token || '').trim();
    const seen = new Set();
    return (Array.isArray(order?.items) ? order.items : []).reduce((links, item) => {
      const identifier = String(item?.product_slug || item?.product_id || '').trim();
      if (!identifier || seen.has(identifier)) return links;
      seen.add(identifier);
      const url = new URL(`/magazin/produs/${encodeURIComponent(identifier)}`, WEBSITE_BASE_URL);
      url.searchParams.set('recenzie', 'noua');
      if (token) url.searchParams.set('review_token', token);
      url.hash = 'recenzii';
      links.push({ name: String(item?.product_name || 'Produs G-Trots').trim(), url: url.href });
      return links;
    }, []);
  }

  function greeting(order) {
    const name = displayCustomerName(order?.customer_name || order?.customer_contact_name || order?.customer_display_name);
    return `Bună ziua, ${customerCourtesy(name)} ${name}! 👋`;
  }

  function signature() {
    return '*G-Trots România*';
  }

  function trackingBlock(order) {
    return `📦 Puteți urmări oricând statusul comenzii dumneavoastră accesând următorul link:\n${trackingUrl(order)}`;
  }

  function buildMessage(order) {
    const status = String(order?.status || '');
    if (!ENABLED_STATUSES.has(status)) return '';
    const products = productLines(order);
    const shipping = formatAmount(order?.shipping_cost, order?.currency);
    const total = formatAmount(order?.total, order?.currency);
    const payment = paymentLabel(order?.payment_method);
    const salutation = greeting(order);

    if (status === 'new') {
      return [
        signature(), '', salutation, '',
        'Vă contactăm pentru confirmarea comenzii dvs. 🛴', '',
        '📦 Produsele pe care le-ați comandat sunt următoarele:', products,
        `🚚 Transport: ${shipping}`,
        `💰 Total de plată: ${total}`,
        `💵 Plata: ${payment}`, '',
        'Vă rugăm să confirmați comanda pentru a putea fi expediată către dumneavoastră. ✅',
        'În cazul în care nu confirmați în scris, nu putem să vă onorăm comanda. ✅', '',
        'Vă mulțumim!', trackingBlock(order), '', signature()
      ].join('\n');
    }

    if (status === 'confirmed') {
      return [
        signature(), '', salutation, '',
        '✅ Comanda dumneavoastră a fost confirmată cu succes!', '',
        '📦 Produsele comandate:', products, '',
        `🚚 Transport: ${shipping}`,
        `💰 Total: ${total}`,
        `💵 Plata: ${payment}`,
        '🛴 Comanda urmează să fie pregătită pentru expediere.', '',
        'Vă mulțumim pentru încredere! 💙', trackingBlock(order), '', signature()
      ].join('\n');
    }

    if (status === 'processing') {
      return [
        signature(), '', salutation, '',
        '📦 Comanda dumneavoastră a intrat în etapa de *pregătire pentru expediere*! 🛴',
        '✅ Echipa noastră pregătește și verifică produsele comandate pentru a fi predate curierului.', '',
        'Vă mulțumim pentru încredere! 💙', trackingBlock(order), '', signature()
      ].join('\n');
    }

    if (status === 'shipped') {
      return [
        signature(), '', salutation, '',
        '🚚 Comanda dumneavoastră a fost *predată curierului* și se află în drum spre destinație! 🛴',
        '📦 În perioada următoare, veți fi contactat(ă) de firma de curierat pentru livrarea coletului.', '',
        '📞 *Vă rugăm să aveți telefonul la îndemână pentru a putea fi contactat(ă) de curier.*', '',
        'Vă mulțumim că ați ales G-Trots România! 💙', trackingBlock(order), '', signature()
      ].join('\n');
    }

    const links = reviewLinks(order);
    const reviewBlock = links.length
      ? links.map(link => links.length === 1 ? link.url : `- ${link.name}\n${link.url}`).join('\n\n')
      : `${WEBSITE_BASE_URL}/magazin`;
    return [
      signature(), '', salutation, '',
      '✅ Comanda dumneavoastră a fost *livrată cu succes*! 📦🛴', '',
      '💙 Sperăm că produsele comandate sunt pe măsura așteptărilor dumneavoastră!',
      '⭐ Dacă sunteți mulțumit(ă), ne-ar face mare plăcere să ne lăsați o recenzie.',
      reviewBlock, '',
      '📞 Pentru orice întrebare sau nelămurire, echipa noastră vă stă la dispoziție.', '',
      'Vă mulțumim că ați ales G-Trots România și vă mai așteptăm cu drag! 💙', '', signature()
    ].join('\n');
  }

  function isEnabledStatus(status) {
    return ENABLED_STATUSES.has(String(status || ''));
  }

  return { buildMessage, customerCourtesy, displayCustomerName, isEnabledStatus, reviewLinks, trackingUrl };
});
