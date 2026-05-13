const db = require('../config/db');

// helper: parse JSON fields safely
const parseProduct = (p) => ({
  ...p,
  images: typeof p.images === 'string' ? JSON.parse(p.images || '[]') : (p.images || []),
  sizes:  typeof p.sizes  === 'string' ? JSON.parse(p.sizes  || '[]') : (p.sizes  || []),
  colors: typeof p.colors === 'string' ? JSON.parse(p.colors || '[]') : (p.colors || []),
});

// ─── Get all products (with filtering, search, sort, pagination) ───
exports.getAllProducts = async (req, res, next) => {
  try {
    const {
      category, search, sort = 'created_at', order = 'desc',
      page = 1, limit = 12, featured, trending, bestseller,
    } = req.query;

    let where = ['p.is_active = 1'];
    const params = [];

    if (category) {
      where.push('c.slug = ?');
      params.push(category);
    }
    if (search) {
      where.push('(p.name LIKE ? OR p.description LIKE ? OR p.brand LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }
    if (featured === 'true')   { where.push('p.is_featured = 1'); }
    if (trending === 'true')   { where.push('p.is_trending = 1'); }
    if (bestseller === 'true') { where.push('p.is_bestseller = 1'); }

    const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const allowedSorts  = ['price', 'created_at', 'name', 'rating'];
    const allowedOrders = ['asc', 'desc'];
    const safeSort  = allowedSorts.includes(sort)  ? sort  : 'created_at';
    const safeOrder = allowedOrders.includes(order.toLowerCase()) ? order.toLowerCase() : 'desc';

    const offset    = (parseInt(page) - 1) * parseInt(limit);
    const limitVal  = parseInt(limit);

    const sql = `
      SELECT p.*, c.name AS category_name, c.slug AS category_slug
      FROM products p
      JOIN categories c ON p.category_id = c.id
      ${whereStr}
      ORDER BY p.${safeSort} ${safeOrder}
      LIMIT ? OFFSET ?
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM products p
      JOIN categories c ON p.category_id = c.id
      ${whereStr}
    `;

    const [products] = await db.query(sql, [...params, limitVal, offset]);
    const [countRows] = await db.query(countSql, params);

    res.json({
      success: true,
      products: products.map(parseProduct),
      pagination: {
        total: countRows[0].total,
        page: parseInt(page),
        limit: limitVal,
        pages: Math.ceil(countRows[0].total / limitVal),
      },
    });
  } catch (err) { next(err); }
};

// ─── Get single product ────────────────────────────────────
exports.getProduct = async (req, res, next) => {
  try {
    const { slugOrId } = req.params;
    const isId = /^\d+$/.test(slugOrId);
    const [rows] = await db.query(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p JOIN categories c ON p.category_id = c.id
       WHERE ${isId ? 'p.id' : 'p.slug'} = ? AND p.is_active = 1`,
      [slugOrId]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found.' });
    res.json({ success: true, product: parseProduct(rows[0]) });
  } catch (err) { next(err); }
};

// ─── Create product (admin) ────────────────────────────────
exports.createProduct = async (req, res, next) => {
  try {
    let { category_id, name, description, price, discount_price, stock,
          brand, sku, sizes, colors, is_featured, is_trending, is_bestseller } = req.body;

    // Build images array from uploaded files
    const uploadedImages = req.files
      ? req.files.map(f => `/uploads/${f.filename}`)
      : [];
    // Also accept images passed as JSON string
    let images = uploadedImages;
    if (req.body.images) {
      try { images = [...images, ...JSON.parse(req.body.images)]; } catch {}
    }

    // slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                 + '-' + Date.now();

    const [result] = await db.query(
      `INSERT INTO products
        (category_id, name, slug, description, price, discount_price, stock, brand, sku,
         images, sizes, colors, is_featured, is_trending, is_bestseller)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category_id, name, slug, description || null,
        parseFloat(price), discount_price ? parseFloat(discount_price) : null,
        parseInt(stock) || 0, brand || null, sku || null,
        JSON.stringify(images),
        JSON.stringify(sizes  ? (typeof sizes  === 'string' ? JSON.parse(sizes)  : sizes)  : []),
        JSON.stringify(colors ? (typeof colors === 'string' ? JSON.parse(colors) : colors) : []),
        is_featured  ? 1 : 0,
        is_trending  ? 1 : 0,
        is_bestseller ? 1 : 0,
      ]
    );

    res.status(201).json({ success: true, message: 'Product created.', productId: result.insertId });
  } catch (err) { next(err); }
};

// ─── Update product (admin) ────────────────────────────────
exports.updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    let { category_id, name, description, price, discount_price, stock,
          brand, sku, sizes, colors, is_featured, is_trending, is_bestseller, existing_images } = req.body;

    const uploadedImages = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
    let images = uploadedImages;
    if (existing_images) {
      try { images = [...JSON.parse(existing_images), ...images]; } catch {}
    }

    await db.query(
      `UPDATE products SET
        category_id=?, name=?, description=?, price=?, discount_price=?, stock=?,
        brand=?, sku=?, images=?, sizes=?, colors=?, is_featured=?, is_trending=?, is_bestseller=?
       WHERE id=?`,
      [
        category_id, name, description || null,
        parseFloat(price), discount_price ? parseFloat(discount_price) : null,
        parseInt(stock) || 0, brand || null, sku || null,
        JSON.stringify(images),
        JSON.stringify(sizes  ? (typeof sizes  === 'string' ? JSON.parse(sizes)  : sizes)  : []),
        JSON.stringify(colors ? (typeof colors === 'string' ? JSON.parse(colors) : colors) : []),
        is_featured  ? 1 : 0, is_trending ? 1 : 0, is_bestseller ? 1 : 0,
        id,
      ]
    );

    res.json({ success: true, message: 'Product updated.' });
  } catch (err) { next(err); }
};

// ─── Delete product (admin) ────────────────────────────────
exports.deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) { next(err); }
};
