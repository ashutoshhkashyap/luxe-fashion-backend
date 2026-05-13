// =============================================================
// categoryController.js
// =============================================================
const db = require('../config/db');

exports.getAllCategories = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM categories ORDER BY name ASC');
    res.json({ success: true, categories: rows });
  } catch (err) { next(err); }
};

exports.createCategory = async (req, res, next) => {
  try {
    const { name, description, image_url } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const [r] = await db.query(
      'INSERT INTO categories (name, slug, description, image_url) VALUES (?, ?, ?, ?)',
      [name, slug, description || null, image_url || null]
    );
    res.status(201).json({ success: true, id: r.insertId, message: 'Category created.' });
  } catch (err) { next(err); }
};

exports.updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, image_url } = req.body;
    await db.query(
      'UPDATE categories SET name=?, description=?, image_url=? WHERE id=?',
      [name, description || null, image_url || null, id]
    );
    res.json({ success: true, message: 'Category updated.' });
  } catch (err) { next(err); }
};

exports.deleteCategory = async (req, res, next) => {
  try {
    await db.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Category deleted.' });
  } catch (err) { next(err); }
};

// =============================================================
// cartController.js
// =============================================================
exports.getCart = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Ensure cart exists
    const [cartRows] = await db.query('SELECT id FROM cart WHERE user_id = ?', [userId]);
    let cartId;
    if (cartRows.length === 0) {
      const [r] = await db.query('INSERT INTO cart (user_id) VALUES (?)', [userId]);
      cartId = r.insertId;
    } else {
      cartId = cartRows[0].id;
    }

    const [items] = await db.query(
      `SELECT ci.id, ci.quantity, ci.size, ci.color,
              p.id AS product_id, p.name, p.price, p.discount_price, p.stock,
              p.images, p.brand, p.slug
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       WHERE ci.cart_id = ?`,
      [cartId]
    );

    const parsed = items.map(i => ({
      ...i,
      images: typeof i.images === 'string' ? JSON.parse(i.images || '[]') : (i.images || []),
    }));

    const subtotal = parsed.reduce((sum, i) => {
      const price = i.discount_price || i.price;
      return sum + price * i.quantity;
    }, 0);

    res.json({ success: true, items: parsed, subtotal: parseFloat(subtotal.toFixed(2)), cartId });
  } catch (err) { next(err); }
};

exports.addToCart = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { product_id, quantity = 1, size, color } = req.body;

    // Check product exists and has stock
    const [prod] = await db.query(
      'SELECT id, stock FROM products WHERE id = ? AND is_active = 1',
      [product_id]
    );
    if (prod.length === 0) return res.status(404).json({ success: false, message: 'Product not found.' });
    if (prod[0].stock < 1) return res.status(400).json({ success: false, message: 'Product is out of stock.' });

    // Get or create cart
    const [cartRows] = await db.query('SELECT id FROM cart WHERE user_id = ?', [userId]);
    let cartId;
    if (cartRows.length === 0) {
      const [r] = await db.query('INSERT INTO cart (user_id) VALUES (?)', [userId]);
      cartId = r.insertId;
    } else {
      cartId = cartRows[0].id;
    }

    // Check if item already exists
    const sizeVal  = size  || '';
    const colorVal = color || '';
    const [existing] = await db.query(
      'SELECT id, quantity FROM cart_items WHERE cart_id=? AND product_id=? AND size=? AND color=?',
      [cartId, product_id, sizeVal, colorVal]
    );

    if (existing.length > 0) {
      const newQty = Math.min(existing[0].quantity + parseInt(quantity), prod[0].stock);
      await db.query('UPDATE cart_items SET quantity=? WHERE id=?', [newQty, existing[0].id]);
    } else {
      await db.query(
        'INSERT INTO cart_items (cart_id, product_id, quantity, size, color) VALUES (?, ?, ?, ?, ?)',
        [cartId, product_id, parseInt(quantity), sizeVal, colorVal]
      );
    }

    res.json({ success: true, message: 'Item added to cart.' });
  } catch (err) { next(err); }
};

exports.updateCartItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    if (quantity < 1) {
      await db.query('DELETE FROM cart_items WHERE id=?', [itemId]);
      return res.json({ success: true, message: 'Item removed.' });
    }
    await db.query('UPDATE cart_items SET quantity=? WHERE id=?', [parseInt(quantity), itemId]);
    res.json({ success: true, message: 'Cart updated.' });
  } catch (err) { next(err); }
};

exports.removeFromCart = async (req, res, next) => {
  try {
    await db.query('DELETE FROM cart_items WHERE id=?', [req.params.itemId]);
    res.json({ success: true, message: 'Item removed from cart.' });
  } catch (err) { next(err); }
};

exports.clearCart = async (req, res, next) => {
  try {
    const [cartRows] = await db.query('SELECT id FROM cart WHERE user_id=?', [req.user.id]);
    if (cartRows.length > 0) {
      await db.query('DELETE FROM cart_items WHERE cart_id=?', [cartRows[0].id]);
    }
    res.json({ success: true, message: 'Cart cleared.' });
  } catch (err) { next(err); }
};

// =============================================================
// orderController.js
// =============================================================
const generateOrderNumber = require('../utils/orderNumber');

exports.placeOrder = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const userId = req.user.id;
    const { shipping_name, shipping_phone, shipping_address, shipping_city,
            shipping_state, shipping_pincode, payment_method = 'cod', notes } = req.body;

    // Validate required fields
    if (!shipping_name || !shipping_phone || !shipping_address || !shipping_city
        || !shipping_state || !shipping_pincode) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ success: false, message: 'All shipping fields are required.' });
    }

    // Get cart items
    const [cartRows] = await conn.query('SELECT id FROM cart WHERE user_id=?', [userId]);
    if (cartRows.length === 0) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ success: false, message: 'Cart is empty.' });
    }
    const cartId = cartRows[0].id;

    const [items] = await conn.query(
      `SELECT ci.quantity, ci.size, ci.color,
              p.id AS product_id, p.name, p.price, p.discount_price, p.stock, p.images, p.brand
       FROM cart_items ci JOIN products p ON ci.product_id = p.id
       WHERE ci.cart_id=?`,
      [cartId]
    );

    if (items.length === 0) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ success: false, message: 'Cart is empty.' });
    }

    // Check stock & compute totals
    let total = 0;
    for (const item of items) {
      if (item.stock < item.quantity) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ success: false, message: `Insufficient stock for "${item.name}".` });
      }
      const price = item.discount_price || item.price;
      total += price * item.quantity;
    }

    const shipping = total >= 999 ? 0 : 99;
    const final    = total + shipping;
    const orderNum = await generateOrderNumber();

    // Insert order
    const [orderResult] = await conn.query(
      `INSERT INTO orders
        (order_number, user_id, total_amount, shipping_amount, final_amount, payment_method,
         shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_pincode, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [orderNum, userId, total.toFixed(2), shipping, final.toFixed(2), payment_method,
       shipping_name, shipping_phone, shipping_address, shipping_city, shipping_state, shipping_pincode, notes || null]
    );
    const orderId = orderResult.insertId;

    // Insert order items & reduce stock
    for (const item of items) {
      const price  = item.discount_price || item.price;
      const images = typeof item.images === 'string' ? JSON.parse(item.images || '[]') : (item.images || []);
      await conn.query(
        `INSERT INTO order_items
          (order_id, product_id, product_name, product_image, brand, size, color, quantity, unit_price, total_price)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [orderId, item.product_id, item.name, images[0] || null, item.brand || null,
         item.size || null, item.color || null, item.quantity,
         parseFloat(price), parseFloat((price * item.quantity).toFixed(2))]
      );
      await conn.query(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.product_id]
      );
    }

    // Clear cart
    await conn.query('DELETE FROM cart_items WHERE cart_id=?', [cartId]);
    await conn.commit();
    conn.release();

    res.status(201).json({
      success: true,
      message: 'Order placed successfully.',
      order: { order_number: orderNum, order_id: orderId, final_amount: final.toFixed(2) },
    });
  } catch (err) {
    await conn.rollback();
    conn.release();
    next(err);
  }
};

exports.getMyOrders = async (req, res, next) => {
  try {
    const [orders] = await db.query(
      `SELECT o.*, 
              COUNT(oi.id) AS item_count
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.user_id = ?
       GROUP BY o.id
       ORDER BY o.ordered_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, orders });
  } catch (err) { next(err); }
};

exports.getOrderDetail = async (req, res, next) => {
  try {
    const { orderNumber } = req.params;
    const [orderRows] = await db.query(
      'SELECT * FROM orders WHERE order_number=? AND user_id=?',
      [orderNumber, req.user.id]
    );
    if (orderRows.length === 0) return res.status(404).json({ success: false, message: 'Order not found.' });

    const [items] = await db.query(
      'SELECT * FROM order_items WHERE order_id=?',
      [orderRows[0].id]
    );

    res.json({ success: true, order: orderRows[0], items });
  } catch (err) { next(err); }
};

// =============================================================
// adminController.js
// =============================================================
exports.getAllUsers = async (req, res, next) => {
  try {
    const [users] = await db.query(
      'SELECT id, name, email, phone, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ success: true, users });
  } catch (err) { next(err); }
};

exports.getAllOrders = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '';
    const params = [];
    if (status) { where = 'WHERE o.status = ?'; params.push(status); }

    const [orders] = await db.query(
      `SELECT o.*, u.name AS user_name, u.email AS user_email,
              COUNT(oi.id) AS item_count
       FROM orders o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       ${where}
       GROUP BY o.id
       ORDER BY o.ordered_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM orders o ${where}`,
      params
    );

    res.json({ success: true, orders, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) { next(err); }
};

exports.getAdminOrderDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [orderRows] = await db.query(
      `SELECT o.*, u.name AS user_name, u.email AS user_email
       FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id=?`,
      [id]
    );
    if (orderRows.length === 0) return res.status(404).json({ success: false, message: 'Order not found.' });
    const [items] = await db.query('SELECT * FROM order_items WHERE order_id=?', [id]);
    res.json({ success: true, order: orderRows[0], items });
  } catch (err) { next(err); }
};

exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['ordered', 'packed', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }
    await db.query('UPDATE orders SET status=? WHERE id=?', [status, id]);
    res.json({ success: true, message: `Order status updated to "${status}".` });
  } catch (err) { next(err); }
};

exports.getDashboardStats = async (req, res, next) => {
  try {
    const [[{ totalUsers }]]    = await db.query('SELECT COUNT(*) AS totalUsers FROM users');
    const [[{ totalOrders }]]   = await db.query('SELECT COUNT(*) AS totalOrders FROM orders');
    const [[{ totalProducts }]] = await db.query('SELECT COUNT(*) AS totalProducts FROM products WHERE is_active=1');
    const [[{ totalRevenue }]]  = await db.query(
      "SELECT COALESCE(SUM(final_amount),0) AS totalRevenue FROM orders WHERE status != 'cancelled'"
    );
    const [recentOrders] = await db.query(
      `SELECT o.order_number, o.status, o.final_amount, o.ordered_at, u.name AS user_name
       FROM orders o JOIN users u ON o.user_id=u.id
       ORDER BY o.ordered_at DESC LIMIT 5`
    );
    const [statusBreakdown] = await db.query(
      'SELECT status, COUNT(*) AS count FROM orders GROUP BY status'
    );

    res.json({
      success: true,
      stats: {
        totalUsers, totalOrders, totalProducts,
        totalRevenue: parseFloat(totalRevenue).toFixed(2),
      },
      recentOrders,
      statusBreakdown,
    });
  } catch (err) { next(err); }
};

// Wishlist
exports.getWishlist = async (req, res, next) => {
  try {
    const [items] = await db.query(
      `SELECT w.id, p.id AS product_id, p.name, p.price, p.discount_price, p.images, p.slug, p.brand, p.rating
       FROM wishlist w JOIN products p ON w.product_id = p.id
       WHERE w.user_id=? AND p.is_active=1`,
      [req.user.id]
    );
    const parsed = items.map(i => ({
      ...i,
      images: typeof i.images === 'string' ? JSON.parse(i.images || '[]') : (i.images || []),
    }));
    res.json({ success: true, items: parsed });
  } catch (err) { next(err); }
};

exports.toggleWishlist = async (req, res, next) => {
  try {
    const { product_id } = req.body;
    const [existing] = await db.query(
      'SELECT id FROM wishlist WHERE user_id=? AND product_id=?',
      [req.user.id, product_id]
    );
    if (existing.length > 0) {
      await db.query('DELETE FROM wishlist WHERE user_id=? AND product_id=?', [req.user.id, product_id]);
      return res.json({ success: true, action: 'removed', message: 'Removed from wishlist.' });
    }
    await db.query('INSERT INTO wishlist (user_id, product_id) VALUES (?,?)', [req.user.id, product_id]);
    res.json({ success: true, action: 'added', message: 'Added to wishlist.' });
  } catch (err) { next(err); }
};
