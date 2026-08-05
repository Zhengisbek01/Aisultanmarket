import { useState } from 'react'
import BarcodeScanner from './BarcodeScanner.jsx'
import {
  getProducts, upsertProduct, deleteProduct,
  addPurchase, getPurchases,
  getDebts, addDebt, toggleDebtPaid, deleteDebt,
  getReport, formatKZT,
} from '../store.js'

const TABS = ['Отчёт', 'Товары', 'Приход', 'Долги']

export default function AdminView() {
  const [tab, setTab] = useState('Отчёт')
  return (
    <div className="view">
      <div className="tabs">
        {TABS.map(t => (
          <button key={t} className={`tab ${tab === t ? 'tab-active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Отчёт' && <ReportTab />}
      {tab === 'Товары' && <ProductsTab />}
      {tab === 'Приход' && <PurchasesTab />}
      {tab === 'Долги' && <DebtsTab />}
    </div>
  )
}

// ---------------- Отчёт ----------------
function ReportTab() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const r = getReport(from, to)

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
        <Stat label="Нам должны" value={formatKZT(r.debtsOwedToUs)} tone="good" />
        <Stat label="Мы должны" value={formatKZT(r.debtsWeOwe)} tone="bad" />
      </div>
      <p className="hint">Продаж за период: {r.salesCount}</p>
      <h3>Последние продажи</h3>
      <div className="list">
        {[...r.sales].reverse().slice(0, 15).map(s => (
          <div className="list-row" key={s.id}>
            <span>{s.name} × {s.qty}</span>
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

// ---------------- Товары ----------------
function ProductsTab() {
  const [products, setProducts] = useState(getProducts())
  const [scanning, setScanning] = useState(false)
  const [form, setForm] = useState({ barcode: '', name: '', price: '', cost: '', weight: '', qty: '' })

  function refresh() { setProducts(getProducts()) }

  function handleScan(code, err) {
    setScanning(false)
    if (err) return
    setForm(f => ({ ...f, barcode: code }))
  }

  function saveProduct(e) {
    e.preventDefault()
    if (!form.barcode || !form.name || !form.price) return
    upsertProduct({
      barcode: form.barcode,
      name: form.name,
      price: Number(form.price),
      cost: Number(form.cost) || 0,
      weight: form.weight,
      qty: Number(form.qty) || 0,
    })
    setForm({ barcode: '', name: '', price: '', cost: '', weight: '', qty: '' })
    refresh()
  }

  function editProduct(p) {
    setForm({
      barcode: p.barcode, name: p.name, price: p.price,
      cost: p.cost || '', weight: p.weight || '', qty: p.qty || '',
    })
  }

  function remove(barcode) {
    deleteProduct(barcode)
    refresh()
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
        <button className="btn btn-primary" type="submit">Сохранить товар</button>
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
function PurchasesTab() {
  const [purchases, setPurchases] = useState(getPurchases())
  const [products] = useState(getProducts())
  const [form, setForm] = useState({ barcode: '', qty: '', cost: '', supplier: '' })

  function submit(e) {
    e.preventDefault()
    const prod = products.find(p => p.barcode === form.barcode)
    if (!prod || !form.qty) return
    addPurchase({
      barcode: form.barcode,
      name: prod.name,
      qty: Number(form.qty),
      cost: Number(form.cost) || prod.cost || 0,
      supplier: form.supplier,
    })
    setForm({ barcode: '', qty: '', cost: '', supplier: '' })
    setPurchases(getPurchases())
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
        <button className="btn btn-primary" type="submit">Оприходовать</button>
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
function DebtsTab() {
  const [debts, setDebts] = useState(getDebts())
  const [form, setForm] = useState({ who: '', amount: '', type: 'owed_to_us', comment: '' })

  function submit(e) {
    e.preventDefault()
    if (!form.who || !form.amount) return
    addDebt({ who: form.who, amount: Number(form.amount), type: form.type, comment: form.comment })
    setForm({ who: '', amount: '', type: 'owed_to_us', comment: '' })
    setDebts(getDebts())
  }

  function togglePaid(id) {
    setDebts(toggleDebtPaid(id))
  }
  function remove(id) {
    deleteDebt(id)
    setDebts(getDebts())
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
        <button className="btn btn-primary" type="submit">Добавить долг</button>
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
              <button className="btn btn-secondary btn-sm" onClick={() => togglePaid(d.id)}>
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
