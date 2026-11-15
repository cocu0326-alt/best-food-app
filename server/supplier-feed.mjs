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
    const rawUrl = typeof p.url === 'string' ? p.url.trim() : '';
    let url = '';
    try { const parsed = new URL(rawUrl); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash) url = parsed.href; } catch {}
    const validNumeric = value => (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '';
    const rating = validNumeric(p.rating) ? Number(p.rating) : NaN;
    const reviews = validNumeric(p.reviews) ? Number(p.reviews) : NaN;
    const source = typeof p.source === 'string' && p.source.trim() ? p.source.trim().slice(0,120) : '공급업체 제공 (원출처 미확인)';
    return [{
      name:p.name.trim().replace(/[\s\u00a0\u200b\ufeff]+/gu, ' ').normalize('NFC').slice(0,200), price, size, measure,
      rating:Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : 0,
      reviews:Number.isSafeInteger(reviews) && reviews >= 0 ? reviews : 0,
      seller:(typeof p.seller === 'string' && p.seller.trim() ? p.seller : typeof p.manufacturer === 'string' && p.manufacturer.trim() ? p.manufacturer : '판매처 미확인').trim().replace(/\s+/gu, ' ').normalize('NFC').slice(0,120),
      url, source, sourceUpdatedAt:typeof p.updatedAt === 'string' && p.updatedAt.trim() ? p.updatedAt.trim().slice(0,40) : null,
      origin:typeof p.origin === 'string' ? p.origin.trim().slice(0,200) : '',
      ingredients:typeof p.ingredients === 'string' ? p.ingredients.trim().slice(0,1000) : ''
    }];
  })};
}
