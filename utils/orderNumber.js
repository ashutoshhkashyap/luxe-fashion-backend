/**
 * Generates a unique order number in format: ORD20260512001
 * ORD + YYYYMMDD + 3-digit sequence
 */

const db = require('../config/db');

const generateOrderNumber = async () => {
  const now  = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day   = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const prefix  = `ORD${dateStr}`;

  // Count today's orders to get the sequence
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt FROM orders WHERE order_number LIKE ?`,
    [`${prefix}%`]
  );
  const seq = String((rows[0].cnt || 0) + 1).padStart(3, '0');
  return `${prefix}${seq}`;
};

module.exports = generateOrderNumber;
