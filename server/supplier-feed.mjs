// Manufacturer-supplied JSON feed adapter. No scraping or unauthorised data collection.
export function normalizeSupplierFeed(input) {
  if (!input || !Array.isArray(input.products)) throw new Error('products array required');
  return {products: input.products.slice(0,1000).flatMap((p) => {
    if (!p || typeof p !== 'object') return [];
    const price = Number(p.price);
    const amount = Number(p.size ?? p.amount);
    const unit = String(p.measure ?? p.unit ?? '').toLowerCase();
    const measure = unit === 'kg' || unit === 'g' ? 'g' : unit === 'l' || unit === 'ml' ? 'mL' : null;
    const size = unit === 'kg' || unit === 'l' ? amount * 1000 : amount;
    if (typeof p.name !== 'string' || !p.name.trim() || !Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size <= 0 || !measure) return [];
    const rawUrl = typeof p.url === 'string' ? p.url.trim() : '';
    let url = '';
    try { if (new URL(rawUrl).protocol === 'https:') url = rawUrl; } catch {}
    const rating = Number(p.rating), reviews = Number(p.reviews);
    const source = typeof p.source === 'string' ? p.source.slice(0,120) : '제조사 제공';
    return [{
      name:p.name.trim().slice(0,200), price, size, measure,
      rating:Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : 0,
      reviews:Number.isInteger(reviews) && reviews >= 0 ? reviews : 0,
      seller:String(p.seller ?? p.manufacturer ?? '제조사 직접 판매').slice(0,120),
      url, source, sourceUpdatedAt:typeof p.updatedAt === 'string' ? p.updatedAt.slice(0,40) : null,
      origin:typeof p.origin === 'string' ? p.origin.slice(0,200) : '',
      ingredients:typeof p.ingredients === 'string' ? p.ingredients.slice(0,1000) : ''
    }];
  })};
}
