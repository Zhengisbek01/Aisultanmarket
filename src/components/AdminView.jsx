import { useState } from 'react'
import BarcodeScanner from './BarcodeScanner.jsx'
import {
  useProducts, upsertProduct, deleteProduct,
  usePurchases, addPurchase,
  useDebts, addDebt, toggleDebtPaid, deleteDebt,
  useSales, computeReport, refundSale, formatKZT,
} from '../store.js'

const TABS = ['Отчёт', 'История', 'Товары', 'Приход', 'Долги']

export default function AdminView() {
  const [tab, setTab] = useState('Отчёт')
  const { data: products, error: productsError } = useProducts()
  const { data: sales } = useSales()
  const { data: purchases } = usePurchases()
  const { data: debts } = useDebts()

  return (
    <div className="view">
      {productsError && <div className="error-text">{productsError}</div>}
      <div className="tabs">
        {TABS.map(t => (
          <button key={t} className={`tab ${tab === t ? 'tab-active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Отчёт' && <ReportTab products={products} sales={sales} purchases={purchases} debts={debts} />}
      {tab === 'История' && <HistoryTab products={products} sales={sales} />}
      {tab === 'Товары' && <ProductsTab products={products} />}
      {tab === 'Приход' && <PurchasesTab products={products} purchases={purchases} />}
      {tab === 'Долги' && <DebtsTab debts={debts} />}
    </div>
  )
}

// ---------------- Отчёт ----------------
function ReportTab({ products, sales, purchases, debts }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const r = computeReport(products, sales, purchases, debts, from, to)

  return (
    <div>
      <div className="filter-row">
        <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} />
      </div>
      <div className="stat-grid">
        <Stat label="Доход (продажи)" value={formatKZT(r.income)} tone="good" />
        <Stat label="Приход (закупки)" value={formatKZT(r.purchaseTotal)} />
        <Stat label="Себестоимость проданного" value={formatKZT(r.costOfGoodsSold)} />
        <Stat label="Чистая прибыль" value={formatKZT(r.netProfit)} tone={r.netProfit >= 0 ? 'good' : 'bad'} />
        <Stat label="💵 Наличные" value={formatKZT(r.cashIncome)} />
        <Stat label="💳 Безналичные" value={formatKZT(r.cardIncome)} />
        <Stat label="📝 Продано в долг" value={formatKZT(r.debtIncome)} tone="bad" />
        <Stat label="Нам должны" value={formatKZT(r.debtsOwedToUs)} tone="good" />
        <Stat label="Мы должны" value={formatKZT(r.debtsWeOwe)} tone="bad" />
      </div>
      <p className="hint">Продаж за период: {r.salesCount}{r.refundedCount > 0 && ` · возвратов: ${r.refundedCount}`}</p>
      <h3>Последние продажи</h3>
      <div className="list">
        {[...r.sales].reverse().slice(0, 15).map(s => (
          <div className="list-row" key={s.id}>
            <span>
              {s.name} × {s.qty}
              {s.paymentType === 'cash' && ' · 💵'}
              {s.paymentType === 'card' && ' · 💳'}
              {s.paymentType === 'debt' && ` · 📝 ${s.debtor}`}
            </span>
            <b>{formatKZT(s.total)}</b>
          </div>
        ))}
        {r.sales.length === 0 && <p className="hint">Нет продаж за выбранный период</p>}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div className={`stat-card ${tone === 'good' ? 'stat-good' : tone === 'bad' ? 'stat-bad' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

// ---------------- История продаж ----------------
function HistoryTab({ products, sales }) {
  const [search, setSearch] = useState('')
  const [refundingId, setRefundingId] = useState(null)

  const filtered = [...sales]
    .filter(s => !search.trim() || s.name.toLowerCase().includes(search.toLowerCase()) || (s.sellerName || '').toLowerCase().includes(search.toLowerCase()))
    .reverse()

  async function handleRefund(sale) {
    if (!confirm(`Отменить продажу «${sale.name}» × ${sale.qty} на сумму ${formatKZT(sale.total)}? Товар вернётся на склад, связанный долг будет удалён.`)) return
    setRefundingId(sale.id)
    await refundSale(sale, products)
    setRefundingId(null)
  }

  return (
    <div>
      <input
        className="input"
        placeholder="Поиск по названию товара или продавцу"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <p className="hint">Всего продаж: {filtered.length}</p>
      <div className="list">
        {filtered.map(s => (
          <div className="list-row-full" key={s.id}>
            <div>
              <b className={s.refunded ? 'paid' : ''}>{s.name} × {s.qty} — {formatKZT(s.total)}</b>
              <div className="hint">
                {new Date(s.date).toLocaleString('ru-RU')} · {s.sellerName || '—'}
                {s.paymentType === 'cash' && ' · 💵'}
                {s.paymentType === 'card' && ' · 💳'}
                {s.paymentType === 'debt' && ` · 📝 ${s.debtor}`}
                {s.refunded && ' · ↩️ возвращено'}
              </div>
            </div>
            {!s.refunded && (
              <button className="btn btn-danger btn-sm" disabled={refundingId === s.id} onClick={() => handleRefund(s)}>
                {refundingId === s.id ? '...' : '↩️ Возврат'}
              </button>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="hint">Продаж не найдено</p>}
      </div>
    </div>
  )
}

// ---------------- Товары ----------------
function ProductsTab({ products }) {
  const [scanning, setScanning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ barcode: '', name: '', price: '', cost: '', weight: '', qty: '' })

  function handleScan(code, err) {
    setScanning(false)
    if (err) return
    setForm(f => ({ ...f, barcode: code }))
  }

  async function saveProduct(e) {
    e.preventDefault()
    if (!form.barcode || !form.name || !form.price) return
    setSaving(true)
    await upsertProduct({
      barcode: form.barcode,
      name: form.name,
      price: Number(form.price),
      cost: Number(form.cost) || 0,
      weight: form.weight,
      qty: Number(form.qty) || 0,
    })
    setSaving(false)
    setForm({ barcode: '', name: '', price: '', cost: '', weight: '', qty: '' })
  }

  function editProduct(p) {
    setForm({
      barcode: p.barcode, name: p.name, price: p.price,
      cost: p.cost || '', weight: p.weight || '', qty: p.qty || '',
    })
  }

  async function remove(barcode) {
    await deleteProduct(barcode)
  }

  return (
    <div>
      <form className="card-form" onSubmit={saveProduct}>
        <div className="manual-row">
          <input className="input" placeholder="Штрих-код" value={form.barcode}
            onChange={e => setForm({ ...form, barcode: e.target.value })} />
          <button type="button" className="btn btn-secondary" onClick={() => setScanning(true)}>📷</button>
        </div>
        <input className="input" placeholder="Название товара" value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })} />
        <div className="manual-row">
          <input className="input" placeholder="Цена продажи, ₸" type="number" value={form.price}
            onChange={e => setForm({ ...form, price: e.target.value })} />
          <input className="input" placeholder="Закупочная цена, ₸" type="number" value={form.cost}
            onChange={e => setForm({ ...form, cost: e.target.value })} />
        </div>
        <div className="manual-row">
          <input className="input" placeholder="Вес/объём (напр. 500 г)" value={form.weight}
            onChange={e => setForm({ ...form, weight: e.target.value })} />
          <input className="input" placeholder="Остаток, шт" type="number" value={form.qty}
            onChange={e => setForm({ ...form, qty: e.target.value })} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Сохранение...' : 'Сохранить товар'}
        </button>
      </form>

      <h3>Список товаров ({products.length})</h3>
      <div className="list">
        {products.map(p => (
          <div className="list-row-full" key={p.barcode}>
            <div>
              <b>{p.name}</b>
              <div className="hint">{p.barcode} · {formatKZT(p.price)} · остаток {p.qty ?? 0}</div>
            </div>
            <div className="row-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => editProduct(p)}>✏️</button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(p.barcode)}>🗑</button>
            </div>
          </div>
        ))}
        {products.length === 0 && <p className="hint">Товаров пока нет — добавьте первый выше</p>}
      </div>

      {scanning && <BarcodeScanner onScan={handleScan} onClose={() => setScanning(false)} />}
    </div>
  )
}

// ---------------- Приход ----------------
function PurchasesTab({ products, purchases }) {
  const [form, setForm] = useState({ barcode: '', qty: '', cost: '', supplier: '' })
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    const prod = products.find(p => p.barcode === form.barcode)
    if (!prod || !form.qty) return
    setSaving(true)
    await addPurchase(products, {
      barcode: form.barcode,
      name: prod.name,
      qty: Number(form.qty),
      cost: Number(form.cost) || prod.cost || 0,
      supplier: form.supplier,
    })
    setSaving(false)
    setForm({ barcode: '', qty: '', cost: '', supplier: '' })
  }

  return (
    <div>
      <form className="card-form" onSubmit={submit}>
        <select className="input" value={form.barcode} onChange={e => setForm({ ...form, barcode: e.target.value })}>
          <option value="">Выберите товар</option>
          {products.map(p => <option key={p.barcode} value={p.barcode}>{p.name}</option>)}
        </select>
        <div className="manual-row">
          <input className="input" placeholder="Количество" type="number" value={form.qty}
            onChange={e => setForm({ ...form, qty: e.target.value })} />
          <input className="input" placeholder="Закупочная цена за ед." type="number" value={form.cost}
            onChange={e => setForm({ ...form, cost: e.target.value })} />
        </div>
        <input className="input" placeholder="Поставщик (необязательно)" value={form.supplier}
          onChange={e => setForm({ ...form, supplier: e.target.value })} />
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Сохранение...' : 'Оприходовать'}
        </button>
      </form>

      <h3>История прихода</h3>
      <div className="list">
        {[...purchases].reverse().map(p => (
          <div className="list-row" key={p.id}>
            <span>{p.name} × {p.qty} {p.supplier && `(${p.supplier})`}</span>
            <b>{formatKZT((p.cost || 0) * p.qty)}</b>
          </div>
        ))}
        {purchases.length === 0 && <p className="hint">Прихода пока не было</p>}
      </div>
    </div>
  )
}

// ---------------- Долги ----------------
function DebtsTab({ debts }) {
  const [form, setForm] = useState({ who: '', amount: '', type: 'owed_to_us', comment: '' })
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!form.who || !form.amount) return
    setSaving(true)
    await addDebt({ who: form.who, amount: Number(form.amount), type: form.type, comment: form.comment })
    setSaving(false)
    setForm({ who: '', amount: '', type: 'owed_to_us', comment: '' })
  }

  async function togglePaid(id, paid) {
    await toggleDebtPaid(id, paid)
  }
  async function remove(id) {
    await deleteDebt(id)
  }

  return (
    <div>
      <form className="card-form" onSubmit={submit}>
        <input className="input" placeholder="Кто (имя / компания)" value={form.who}
          onChange={e => setForm({ ...form, who: e.target.value })} />
        <div className="manual-row">
          <input className="input" placeholder="Сумма, ₸" type="number" value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })} />
          <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="owed_to_us">Нам должны</option>
            <option value="we_owe">Мы должны</option>
          </select>
        </div>
        <input className="input" placeholder="Комментарий" value={form.comment}
          onChange={e => setForm({ ...form, comment: e.target.value })} />
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Сохранение...' : 'Добавить долг'}
        </button>
      </form>

      <div className="list">
        {debts.map(d => (
          <div className="list-row-full" key={d.id}>
            <div>
              <b className={d.paid ? 'paid' : ''}>{d.who} — {formatKZT(d.amount)}</b>
              <div className="hint">
                {d.type === 'owed_to_us' ? 'Нам должны' : 'Мы должны'}
                {d.comment && ` · ${d.comment}`}
                {d.paid && ' · погашено'}
              </div>
            </div>
            <div className="row-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => togglePaid(d.id, d.paid)}>
                {d.paid ? '↺' : '✓'}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => remove(d.id)}>🗑</button>
            </div>
          </div>
        ))}
        {debts.length === 0 && <p className="hint">Долгов не зафиксировано</p>}
      </div>
    </div>
  )
}
