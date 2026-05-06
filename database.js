const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'database.sqlite'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    tax_id TEXT, -- CIF/NIF
    address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    client_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    due_date TEXT,
    status TEXT DEFAULT 'PENDING', -- PENDING, PAID, CANCELLED
    vat_rate REAL DEFAULT 21.0,
    irpf_rate REAL DEFAULT 15.0,
    subtotal REAL DEFAULT 0,
    vat_amount REAL DEFAULT 0,
    irpf_amount REAL DEFAULT 0,
    total REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients (id)
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price REAL NOT NULL,
    total REAL DEFAULT 0,
    FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
  );
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((col) => col.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('invoices', 'subtotal', 'REAL DEFAULT 0');
ensureColumn('invoices', 'vat_amount', 'REAL DEFAULT 0');
ensureColumn('invoices', 'irpf_amount', 'REAL DEFAULT 0');
ensureColumn('invoices', 'total', 'REAL DEFAULT 0');
ensureColumn('invoice_items', 'total', 'REAL DEFAULT 0');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
  CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);
  CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_name_unique ON clients(name);
`);

module.exports = db;
