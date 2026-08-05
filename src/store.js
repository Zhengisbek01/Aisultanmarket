// Простое хранилище на localStorage. Один магазин = один браузер/устройство.
// Роли: admin (руководитель) — видит отчёты; seller (продавец) — только сканирует и продаёт.

const KEYS = {
  products: 'shop_products',
  sales: 'shop_sales',
  purchases: 'shop_purchases',
  debts: 'shop_debts',
  users: 'shop_users',
  session: 'shop_session',
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ---------- Пользователи ----------
export function getUsers() {
  let users = read(KEYS.users, null)
  if (!users) {
    users = [
      { login: 'admin', password: '1234', role: 'admin', name: 'Руководитель' },
      { login: 'seller', password: '1111', role: 'seller', name: 'Продавец' },
    ]
    write(KEYS.users, users)
  }
  return users
}
export function saveUsers(users) {
  write(KEYS.users, users)
}
export function login(loginVal, password) {
  const users = getUsers()
  const user = users.find(u => u.login === loginVal && u.password === password)
  if (user) write(KEYS.session, user)
  return user || null
}
export function logout() {
  localStorage.removeItem(KEYS.session)
}
export function getSession() {
  return read(KEYS.session, null)
}

// ---------- Товары ----------
export function getProducts() {
  return read(KEYS.products, [])
}
export function saveProducts(products) {
  write(KEYS.products, products)
}
export function findProductByBarcode(barcode) {
  return getProducts().find(p => p.barcode === barcode) || null
}
export function upsertProduct(product) {
  const products = getProducts()
  const idx = products.findIndex(p => p.barcode === product.barcode)
  if (idx >= 0) {
    products[idx] = { ...products[idx], ...product }
  } else {
    products.push({ id: uid(), qty: 0, cost: 0, ...product })
  }
  saveProducts(products)
  return products
}
export function deleteProduct(barcode) {
  saveProducts(getProducts().filter(p => p.barcode !== barcode))
}

// ---------- Продажи (доход) ----------
export function getSales() {
  return read(KEYS.sales, [])
}
export function addSale(sale) {
  const sales = getSales()
  const record = { id: uid(), date: new Date().toISOString(), ...sale }
  sales.push(record)
  write(KEYS.sales, sales)
  // списываем со склада
  const products = getProducts()
  const idx = products.findIndex(p => p.barcode === sale.barcode)
  if (idx >= 0) {
    products[idx].qty = Math.max(0, (products[idx].qty || 0) - (sale.qty || 1))
    saveProducts(products)
  }
  return record
}

// ---------- Приход (закупки) ----------
export function getPurchases() {
  return read(KEYS.purchases, [])
}
export function addPurchase(purchase) {
  const purchases = getPurchases()
  const record = { id: uid(), date: new Date().toISOString(), ...purchase }
  purchases.push(record)
  write(KEYS.purchases, purchases)
  // приходуем на склад
  const products = getProducts()
  const idx = products.findIndex(p => p.barcode === purchase.barcode)
  if (idx >= 0) {
    products[idx].qty = (products[idx].qty || 0) + (purchase.qty || 0)
    if (purchase.cost) products[idx].cost = purchase.cost
    saveProducts(products)
  }
  return record
}

// ---------- Долги ----------
export function getDebts() {
  return read(KEYS.debts, [])
}
export function addDebt(debt) {
  const debts = getDebts()
  const record = { id: uid(), date: new Date().toISOString(), paid: false, ...debt }
  debts.push(record)
  write(KEYS.debts, debts)
  return record
}
export function toggleDebtPaid(id) {
  const debts = getDebts()
  const idx = debts.findIndex(d => d.id === id)
  if (idx >= 0) debts[idx].paid = !debts[idx].paid
  write(KEYS.debts, debts)
  return debts
}
export function deleteDebt(id) {
  write(KEYS.debts, getDebts().filter(d => d.id !== id))
}

// ---------- Отчётность ----------
export function getReport(fromDate, toDate) {
  const inRange = (iso) => {
    const t = new Date(iso).getTime()
    if (fromDate && t < new Date(fromDate).getTime()) return false
    if (toDate && t > new Date(toDate).getTime() + 86400000) return false
    return true
  }
  const sales = getSales().filter(s => inRange(s.date))
  const purchases = getPurchases().filter(p => inRange(p.date))
  const products = getProducts()

  const income = sales.reduce((sum, s) => sum + (s.total || 0), 0)
  const purchaseTotal = purchases.reduce((sum, p) => sum + ((p.cost || 0) * (p.qty || 0)), 0)

  // себестоимость проданного товара (для чистой прибыли)
  const costOfGoodsSold = sales.reduce((sum, s) => {
    const prod = products.find(p => p.barcode === s.barcode)
    const cost = prod ? (prod.cost || 0) : 0
    return sum + cost * (s.qty || 1)
  }, 0)

  const netProfit = income - costOfGoodsSold

  const debts = getDebts()
  const debtsWeOwe = debts.filter(d => d.type === 'we_owe' && !d.paid).reduce((s, d) => s + d.amount, 0)
  const debtsOwedToUs = debts.filter(d => d.type === 'owed_to_us' && !d.paid).reduce((s, d) => s + d.amount, 0)

  return {
    income,
    purchaseTotal,
    costOfGoodsSold,
    netProfit,
    debtsWeOwe,
    debtsOwedToUs,
    salesCount: sales.length,
    sales,
    purchases,
  }
}

export function formatKZT(n) {
  return (n || 0).toLocaleString('ru-RU') + ' ₸'
}
