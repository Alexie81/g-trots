import type { ShopOrder } from '@/services/shopApi';

const WEBSITE_BASE_URL = 'https://g-trots.ro';
const ENABLED_STATUSES = new Set<ShopOrder['status']>(['new', 'confirmed', 'processing', 'shipped', 'completed']);

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

function normalizeNameToken(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ro-RO')
    .replace(/[^a-z]/g, '');
}

export function customerCourtesy(customerName: string) {
  const tokens = String(customerName || '').split(/[\s,;/-]+/).map(normalizeNameToken).filter(Boolean);
  const firstRecognized = tokens.find((token) => FEMALE_GIVEN_NAMES.has(token) || MALE_GIVEN_NAMES.has(token));
  if (firstRecognized) return FEMALE_GIVEN_NAMES.has(firstRecognized) ? 'doamnă' : 'domnule';
  const likelyGivenName = tokens[0] || '';
  return likelyGivenName.endsWith('a') && !['luca', 'toma'].includes(likelyGivenName) ? 'doamnă' : 'domnule';
}

export function displayCustomerName(value: string | null | undefined) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name) return 'client';
  return name.toLocaleLowerCase('ro-RO').replace(/(^|[\s'-])([a-zăâîșț])/gu, (_match, separator, letter) => `${separator}${letter.toLocaleUpperCase('ro-RO')}`);
}

function formatAmount(value: number | null | undefined, currency: string | null | undefined) {
  const amount = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
  return `${amount} ${String(currency || 'RON').trim().toUpperCase() || 'RON'}`;
}

function paymentLabel(paymentMethod: ShopOrder['payment_method']) {
  return paymentMethod === 'card' ? 'Card' : 'Ramburs la curier';
}

export function orderTrackingUrl(order: ShopOrder) {
  const supplied = String(order.tracking_url || '').trim();
  if (/^https?:\/\//i.test(supplied)) return supplied;
  if (supplied.startsWith('/')) return `${WEBSITE_BASE_URL}${supplied}`;
  const token = String(order.tracking_token || '').trim();
  return token
    ? `${WEBSITE_BASE_URL}/urmarire-comanda?token=${encodeURIComponent(token)}`
    : `${WEBSITE_BASE_URL}/urmarire-comanda`;
}

function productLines(order: ShopOrder) {
  if (!order.items?.length) return '- Produsele din comandă';
  return order.items.map((item) => {
    const name = String(item.product_name || 'Produs G-Trots').trim();
    const quantity = Math.max(1, Number(item.quantity || 1));
    return `- ${name}${quantity > 1 ? ` × ${new Intl.NumberFormat('ro-RO').format(quantity)} buc.` : ''}`;
  }).join('\n');
}

export function orderReviewLinks(order: ShopOrder) {
  const token = String(order.tracking_token || '').trim();
  const seen = new Set<string>();
  return (order.items || []).reduce<{ name: string; url: string }[]>((links, item) => {
    const identifier = String(item.product_slug || item.product_id || '').trim();
    if (!identifier || seen.has(identifier)) return links;
    seen.add(identifier);
    const reviewToken = token ? `&review_token=${encodeURIComponent(token)}` : '';
    links.push({
      name: String(item.product_name || 'Produs G-Trots').trim(),
      url: `${WEBSITE_BASE_URL}/magazin/produs/${encodeURIComponent(identifier)}?recenzie=noua${reviewToken}#recenzii`,
    });
    return links;
  }, []);
}

function greeting(order: ShopOrder) {
  const name = displayCustomerName(order.customer_name || order.customer_contact_name || order.customer_display_name);
  return `Bună ziua, ${customerCourtesy(name)} ${name}! 👋`;
}

function trackingBlock(order: ShopOrder) {
  return `📦 Puteți urmări oricând statusul comenzii dumneavoastră accesând următorul link:\n${orderTrackingUrl(order)}`;
}

export function isOrderWhatsAppStatusEnabled(status: ShopOrder['status']) {
  return ENABLED_STATUSES.has(status);
}

export function buildOrderStatusWhatsAppMessage(order: ShopOrder) {
  if (!isOrderWhatsAppStatusEnabled(order.status)) return '';

  const signature = '*G-Trots România*';
  const salutation = greeting(order);
  const products = productLines(order);
  const shipping = formatAmount(order.shipping_cost, order.currency);
  const total = formatAmount(order.total, order.currency);
  const payment = paymentLabel(order.payment_method);

  if (order.status === 'new') {
    return [
      signature, '', salutation, '',
      'Vă contactăm pentru confirmarea comenzii dvs. 🛴', '',
      '📦 Produsele pe care le-ați comandat sunt următoarele:', products,
      `🚚 Transport: ${shipping}`,
      `💰 Total de plată: ${total}`,
      `💵 Plata: ${payment}`, '',
      'Vă rugăm să confirmați comanda pentru a putea fi expediată către dumneavoastră. ✅',
      'În cazul în care nu confirmați în scris, nu putem să vă onorăm comanda. ✅', '',
      'Vă mulțumim!', trackingBlock(order), '', signature,
    ].join('\n');
  }

  if (order.status === 'confirmed') {
    return [
      signature, '', salutation, '',
      '✅ Comanda dumneavoastră a fost confirmată cu succes!', '',
      '📦 Produsele comandate:', products, '',
      `🚚 Transport: ${shipping}`,
      `💰 Total: ${total}`,
      `💵 Plata: ${payment}`,
      '🛴 Comanda urmează să fie pregătită pentru expediere.', '',
      'Vă mulțumim pentru încredere! 💙', trackingBlock(order), '', signature,
    ].join('\n');
  }

  if (order.status === 'processing') {
    return [
      signature, '', salutation, '',
      '📦 Comanda dumneavoastră a intrat în etapa de *pregătire pentru expediere*! 🛴',
      '✅ Echipa noastră pregătește și verifică produsele comandate pentru a fi predate curierului.', '',
      'Vă mulțumim pentru încredere! 💙', trackingBlock(order), '', signature,
    ].join('\n');
  }

  if (order.status === 'shipped') {
    return [
      signature, '', salutation, '',
      '🚚 Comanda dumneavoastră a fost *predată curierului* și se află în drum spre destinație! 🛴',
      '📦 În perioada următoare, veți fi contactat(ă) de firma de curierat pentru livrarea coletului.', '',
      '📞 *Vă rugăm să aveți telefonul la îndemână pentru a putea fi contactat(ă) de curier.*', '',
      'Vă mulțumim că ați ales G-Trots România! 💙', trackingBlock(order), '', signature,
    ].join('\n');
  }

  const links = orderReviewLinks(order);
  const reviewBlock = links.length
    ? links.map((link) => links.length === 1 ? link.url : `- ${link.name}\n${link.url}`).join('\n\n')
    : `${WEBSITE_BASE_URL}/magazin`;
  return [
    signature, '', salutation, '',
    '✅ Comanda dumneavoastră a fost *livrată cu succes*! 📦🛴', '',
    '💙 Sperăm că produsele comandate sunt pe măsura așteptărilor dumneavoastră!',
    '⭐ Dacă sunteți mulțumit(ă), ne-ar face mare plăcere să ne lăsați o recenzie.',
    reviewBlock, '',
    '📞 Pentru orice întrebare sau nelămurire, echipa noastră vă stă la dispoziție.', '',
    'Vă mulțumim că ați ales G-Trots România și vă mai așteptăm cu drag! 💙', '', signature,
  ].join('\n');
}

