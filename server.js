const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');  // <-- NEW: for file uploads

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ---------- Orders Data (your existing code) ----------
const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

// Ensure data directory and orders file exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ORDERS_FILE)) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2));
}

const readOrders = () => JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
const writeOrders = (orders) => fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));

// ---------- Products Data (NEW for admin) ----------
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const UPLOADS_DIR = path.join(__dirname, 'public/uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Initialize products.json if not exists
if (!fs.existsSync(PRODUCTS_FILE)) {
  const defaultProducts = [
    { id: 1, name: "Punydo Wild Coffee", nameAm: "ፑንዶ የዱር ቡና", price: 28.50, description: "Single-origin wild coffee", descAm: "ከፑንዶ ደን ጥሬ ቡና", image: "/uploads/coffee.jpg" },
    { id: 2, name: "Gera Estate Honey", nameAm: "ጌራ እርሻ ማር", price: 34.90, description: "Raw organic honey", descAm: "ኦርጋኒክ ማር", image: "/uploads/honey.jpg" }
  ];
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(defaultProducts, null, 2));
}

const readProducts = () => JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
const writeProducts = (data) => fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2));

// ---------- Multer Setup for Image Uploads ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ---------- Your Existing Routes (unchanged) ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/orders', (req, res) => {
  try {
    const orders = readOrders();
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const { cart, total, itemsCount, customerInfo } = req.body;
    if (!cart || !Array.isArray(cart) || total === undefined) {
      return res.status(400).json({ success: false, error: 'Invalid order data' });
    }
    const orders = readOrders();
    const newOrder = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      items: cart.map(item => ({
        productId: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        lineTotal: item.price * item.quantity
      })),
      total: total,
      itemsCount: itemsCount || cart.reduce((sum, i) => sum + i.quantity, 0),
      customerInfo: customerInfo || null
    };
    orders.push(newOrder);
    writeOrders(orders);
    res.status(201).json({ success: true, orderId: newOrder.id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- NEW: Admin Product Management API (no auth, as requested) ----------
// Get all products (for admin panel)
app.get('/api/admin/products', (req, res) => {
  res.json({ success: true, products: readProducts() });
});

// Add new product with image upload
app.post('/api/admin/products', upload.single('image'), (req, res) => {
  try {
    const { name, nameAm, price, description, descAm } = req.body;
    const products = readProducts();
    const newId = products.length ? Math.max(...products.map(p => p.id)) + 1 : 1;
    let imagePath = '/uploads/default.jpg';
    if (req.file) imagePath = '/uploads/' + req.file.filename;
    const newProduct = {
      id: newId,
      name,
      nameAm: nameAm || name,
      price: parseFloat(price),
      description,
      descAm: descAm || description,
      image: imagePath
    };
    products.push(newProduct);
    writeProducts(products);
    res.json({ success: true, product: newProduct });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update product (price and/or image)
app.put('/api/admin/products/:id', upload.single('image'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { price } = req.body;
    const products = readProducts();
    const index = products.findIndex(p => p.id === id);
    if (index === -1) return res.status(404).json({ success: false, error: 'Product not found' });
    if (price !== undefined) products[index].price = parseFloat(price);
    if (req.file) products[index].image = '/uploads/' + req.file.filename;
    writeProducts(products);
    res.json({ success: true, product: products[index] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete product
app.delete('/api/admin/products/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    let products = readProducts();
    const newProducts = products.filter(p => p.id !== id);
    if (newProducts.length === products.length) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }
    writeProducts(newProducts);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Serve Admin HTML Page ----------
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ---------- Public API for Customer Store (get products) ----------
app.get('/api/products', (req, res) => {
  const products = readProducts();
  res.json({ success: true, products });
});

// ---------- Start Server ----------
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📦 Admin panel: http://localhost:${PORT}/admin`);
  console.log(`🛒 Customer store: http://localhost:${PORT}`);
});