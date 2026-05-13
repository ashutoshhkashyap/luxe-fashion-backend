// ── routes/products.js ──────────────────────────────────────
const express  = require('express');
const prodCtrl = require('../controllers/productController');
const adminMw  = require('../middleware/admin');
const upload   = require('../middleware/upload');
const router   = express.Router();

router.get('/',              prodCtrl.getAllProducts);
router.get('/:slugOrId',     prodCtrl.getProduct);
router.post('/',             adminMw, upload.array('images', 5), prodCtrl.createProduct);
router.put('/:id',           adminMw, upload.array('images', 5), prodCtrl.updateProduct);
router.delete('/:id',        adminMw, prodCtrl.deleteProduct);

module.exports = router;


// ── routes/categories.js ────────────────────────────────────
const express2   = require('express');
const catCtrl    = require('../controllers/controllers');
const adminMw2   = require('../middleware/admin');
const router2    = express2.Router();

router2.get('/',        catCtrl.getAllCategories);
router2.post('/',       adminMw2, catCtrl.createCategory);
router2.put('/:id',     adminMw2, catCtrl.updateCategory);
router2.delete('/:id',  adminMw2, catCtrl.deleteCategory);

module.exports.categoriesRouter = router2;


// ── routes/cart.js ──────────────────────────────────────────
const express3 = require('express');
const cartCtrl = require('../controllers/controllers');
const authMw   = require('../middleware/auth');
const router3  = express3.Router();

router3.get('/',             authMw, cartCtrl.getCart);
router3.post('/add',         authMw, cartCtrl.addToCart);
router3.put('/item/:itemId', authMw, cartCtrl.updateCartItem);
router3.delete('/item/:itemId', authMw, cartCtrl.removeFromCart);
router3.delete('/clear',     authMw, cartCtrl.clearCart);

module.exports.cartRouter = router3;


// ── routes/orders.js ────────────────────────────────────────
const express4  = require('express');
const orderCtrl = require('../controllers/controllers');
const authMw4   = require('../middleware/auth');
const router4   = express4.Router();

router4.post('/',                    authMw4, orderCtrl.placeOrder);
router4.get('/my',                   authMw4, orderCtrl.getMyOrders);
router4.get('/:orderNumber',         authMw4, orderCtrl.getOrderDetail);

module.exports.ordersRouter = router4;


// ── routes/admin.js ─────────────────────────────────────────
const express5    = require('express');
const adminCtrl   = require('../controllers/controllers');
const adminMw5    = require('../middleware/admin');
const router5     = express5.Router();

router5.get('/stats',              adminMw5, adminCtrl.getDashboardStats);
router5.get('/users',              adminMw5, adminCtrl.getAllUsers);
router5.get('/orders',             adminMw5, adminCtrl.getAllOrders);
router5.get('/orders/:id',         adminMw5, adminCtrl.getAdminOrderDetail);
router5.put('/orders/:id/status',  adminMw5, adminCtrl.updateOrderStatus);

module.exports.adminRouter = router5;


// ── routes/wishlist.js ──────────────────────────────────────
const express6  = require('express');
const wlCtrl    = require('../controllers/controllers');
const authMw6   = require('../middleware/auth');
const router6   = express6.Router();

router6.get('/',       authMw6, wlCtrl.getWishlist);
router6.post('/toggle', authMw6, wlCtrl.toggleWishlist);

module.exports.wishlistRouter = router6;
