// Manufacturer-supplied JSON feed adapter. No scraping or unauthorised data collection.
export function normalizeSupplierFeed(input) {
  if (!input || !Array.isArray(input.products)) throw new Error('products array required');
  return {products: input.products.slice(0,1000).flatMap((p) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return [];
    const rawPrice = p.price;
    const rawAmount = (p.size === null || p.size === undefined || typeof p.size === 'string' && !p.size.trim()) ? p.amount : p.size;
    if ((typeof rawPrice !== 'number' && typeof rawPrice !== 'string') || (typeof rawAmount !== 'number' && typeof rawAmount !== 'string') || String(rawPrice).trim() === '' || String(rawAmount).trim() === '') return [];
    const price = Number(rawPrice);
    const amount = Number(rawAmount);
    const rawUnit = typeof p.measure === 'string' && p.measure.trim() ? p.measure : p.unit;
    const unit = typeof rawUnit === 'string' ? rawUnit.trim().toLowerCase() : '';
    const measure = unit === 'kg' || unit === 'g' ? 'g' : unit === 'l' || unit === 'ml' ? 'mL' : null;
    const size = unit === 'kg' || unit === 'l' ? amount * 1000 : amount;
    if (typeof p.name !== 'string' || !p.name.trim() || !Number.isSafeInteger(price) || price <= 0 || !Number.isFinite(size) || size <= 0 || size > 1e9 || !measure) return [];
    const normalizedName = p.name.replace(/[\s\u00a0\u200b\ufeff]+/gu, ' ').trim().normalize('NFC').slice(0,200);
    if (!normalizedName) return [];
    const rawUrl = typeof p.url === 'string' ? p.url.trim() : '';
    let url = '';
    try { const parsed = new URL(rawUrl); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash) url = parsed.href; } catch {}
    const validNumeric = value => (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '';
    // Missing or invalid optional review metadata must not hide genuine price listings.
    // Null means unavailable, never an invented zero-star review.
    const rawRating = validNumeric(p.rating) ? Number(p.rating) : NaN;
    const rawReviews = validNumeric(p.reviews) ? Number(p.reviews) : NaN;
    const rating = Number.isFinite(rawRating) && rawRating >= 0 && rawRating <= 5 ? rawRating : null;
    const reviews = Number.isSafeInteger(rawReviews) && rawReviews >= 0 ? rawReviews : null;
    const normalizedSeller = (typeof p.seller === 'string' && p.seller.replace(/[\s\u00a0\u200b\ufeff]+/gu, ' ').trim() ? p.seller : typeof p.manufacturer === 'string' && p.manufacturer.replace(/[\s\u00a0\u200b\ufeff]+/gu, ' ').trim() ? p.manufacturer : '판매처 미확인').replace(/[\s\u00a0\u200b\ufeff]+/gu, ' ').trim().normalize('NFC').slice(0,120);
    const cleanSource = typeof p.source === 'string' ? p.source.replace(/[\s\u00a0\u200b\ufeff]+/gu, ' ').trim().normalize('NFC') : '';
    const source = cleanSource ? cleanSource.slice(0,120) : '공급업체 제공 (원출처 미확인)';
    const rawUpdatedAt = typeof p.updatedAt === 'string' ? p.updatedAt.replace(/[\s\u00a0\u200b\ufeff]+/gu, ' ').trim() : '';
    const datePart = rawUpdatedAt.slice(0,10);
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
    const calendar = new Date(0);
    if (dateMatch) calendar.setUTCFullYear(Number(dateMatch[1]), Number(dateMatch[2])-1, Number(dateMatch[3]));
    const validCalendarDate = Boolean(dateMatch && calendar.getUTCFullYear() === Number(dateMatch[1]) && calendar.getUTCMonth() + 1 === Number(dateMatch[2]) && calendar.getUTCDate() === Number(dateMatch[3]));
    const timeMatch = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(rawUpdatedAt);
    const validTime = timeMatch && Number(timeMatch[1]) <= 23 && Number(timeMatch[2]) <= 59 && Number(timeMatch[3]) <= 59 &&
      (!timeMatch[5] || (Number(timeMatch[5]) <= 14 && Number(timeMatch[6]) <= 59 && (Number(timeMatch[5]) !== 14 || Number(timeMatch[6]) === 0))) &&
      !Number.isNaN(Date.parse(rawUpdatedAt));
    const sourceUpdatedAt = validCalendarDate && (rawUpdatedAt.length === 10 || validTime) ? rawUpdatedAt.slice(0,40) : null;
    return [{
      name:normalizedName, price, size, measure,
      rating,
      reviews,
      seller:normalizedSeller,
      url, source, sourceUpdatedAt,
      origin:typeof p.origin === 'string' ? p.origin.replace(/[\s\u00a0\u200b\ufeff]+/gu, ' ').trim().normalize('NFC').slice(0,200) : '',
      ingredients:typeof p.ingredients === 'string' ? p.ingredients.replace(/[\s\u00a0\u200b\ufeff]+/gu, ' ').trim().normalize('NFC').slice(0,1000) : ''
    }];
  })};
}
