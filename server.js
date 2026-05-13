require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');

const authRoutes = require('./routes/auth');
const productRoutes = require('./controllers/productController');
const {
  categoriesRouter, cartRouter, ordersRouter, adminRouter, wishlistRouter,
} = require('./routes/routes');
const prodRouter = require('./routes/routes'); // products handled separately below
const errorHandler = require('./middleware/error');

// Import product router directly
const { Router } = require('express');
const prodCtrl   = require('./controllers/productController');
const adminMw    = require('./middleware/admin');
const upload     = require('./middleware/upload');
const productsRouter = Router();
productsRouter.get('/',            prodCtrl.getAllProducts);
productsRouter.get('/:slugOrId',   prodCtrl.getProduct);
productsRouter.post('/',           adminMw, upload.array('images', 5), prodCtrl.createProduct);
productsRouter.put('/:id',         adminMw, upload.array('images', 5), prodCtrl.updateProduct);
productsRouter.delete('/:id',      adminMw, prodCtrl.deleteProduct);

const app = express();

// ─── Middleware ────────────────────────────────────────────
app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Routes ───────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/products',   productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/cart',       cartRouter);
app.use('/api/orders',     ordersRouter);
app.use('/api/admin',      adminRouter);
app.use('/api/wishlist',   wishlistRouter);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found.' }));

// Error handler (must be last)
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀  Luxe Fashion API running on http://localhost:${PORT}`);
  console.log(`🌍  Environment: ${process.env.NODE_ENV || 'development'}`);
});
