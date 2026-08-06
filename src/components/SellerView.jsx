import { useState, useRef, useEffect } from 'react'
import BarcodeScanner from './BarcodeScanner.jsx'
import { useProducts, useSales, findProduct, checkoutCart, upsertProduct, refundSale, formatKZT } from '../store.js'

function lineKey() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export default function SellerView({ user }) {
  const { data: products, loading, error } = useProducts()
  const [view, setView] = useState('sale') // 'sale' | 'history'

  const [scanning, setScanning] = useState(false)
  const [scanForBarcodeField, setScanForBarcodeField] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [cart, setCart] = useState([]) // [{key, barcode, name, price, qty, isUniversal, weight}]
  const [notFound, setNotFound] = useState('')
  const [lastOrder, setLastOrder] = useState(null)
  const [cameraError, setCameraError] = useState('')
  const [lastTriedCode, setLastTriedCode] = useState('')
  const [addingCode, setAddingCode] = useState(null) // null = закрыто, '' = ручной ввод кода, 'XXXX' = код известен
  const [newForm, setNewForm] = useState({ barcode: '', name: '', price: '', cost: '', weight: '', qty: '' })
  const [paymentType, setPaymentType] = useState('cash') // cash | card | debt
  const [debtor, setDebtor] = useState('')
  const [universalMode, setUniversalMode] = useState(false)
  const [universalForm, setUniversalForm] = useState({ name: '', price: '' })
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const usbInputRef = useRef(null)

  // USB/Bluetooth сканер работает как клавиатура: печатает код и жмёт Enter.
  useEffect(() => {
    if (view === 'sale' && !scanning && addingCode === null && !universalMode && usbInputRef.current) {
      usbInputRef.current.focus()
    }
  }, [scanning, addingCode, universalMode, view, cart.length])

  function addToCart(item) {
    setLastOrder(null)
    setCart(prev => {
      if (!item.isUniversal) {
        const idx = prev.findIndex(l => l.barcode === item.barcode)
        if (idx >= 0) {
          const copy = [...prev]
          copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 }
          return copy
        }
      }
      return [...prev, { key: lineKey(), qty: 1, ...item }]
    })
  }

  function updateLineQty(key, qty) {
    setCart(prev => prev.map(l => l.key === key ? { ...l, qty: Math.max(1, qty) } : l))
  }
  function removeLine(key) {
    setCart(prev => prev.filter(l => l.key !== key))
  }

  function handleFound(code, err) {
    setScanning(false)
    if (scanForBarcodeField) {
      setScanForBarcodeField(false)
      if (code) setNewForm(f => ({ ...f, barcode: code }))
      return
    }
    if (err) {
      setCameraError(err)
      return
    }
    lookup(code)
  }

  function lookup(code) {
    setCameraError('')
    setAddingCode(null)
    setLastTriedCode(code)
    const p = findProduct(products, code)
    if (p) {
      addToCart({ barcode: p.barcode, name: p.name, price: p.price, weight: p.weight, isUniversal: false })
      setNotFound('')
    } else {
      setNotFound(`Товар со штрих-кодом "${code}" не найден`)
    }
  }

  function handleManualSubmit(e) {
    e.preventDefault()
    if (manualCode.trim()) {
      lookup(manualCode.trim())
      setManualCode('')
    }
  }

  function startAdd(code) {
    setNotFound('')
    setUniversalMode(false)
    setAddingCode(code)
    setNewForm({ barcode: code, name: '', price: '', cost: '', weight: '', qty: '' })
  }

  async function saveNewProduct(e) {
    e.preventDefault()
    if (!newForm.barcode || !newForm.name || !newForm.price) return
    setSaving(true)
    const item = {
      barcode: newForm.barcode,
      name: newForm.name,
      price: Number(newForm.price),
      cost: Number(newForm.cost) || 0,
      weight: newForm.weight,
      qty: Number(newForm.qty) || 0,
    }
    await upsertProduct(item)
    setSaving(false)
    setAddingCode(null)
    addToCart({ barcode: item.barcode, name: item.name, price: item.price, weight: item.weight, isUniversal: false })
  }

  function startUniversal() {
    setNotFound('')
    setAddingCode(null)
    setUniversalMode(true)
    setUniversalForm({ name: '', price: '' })
  }

  function submitUniversal(e) {
    e.preventDefault()
    if (!universalForm.price) return
    addToCart({
      barcode: 'без-штрихкода',
      name: universalForm.name.trim() || 'Товар без штрих-кода',
      price: Number(universalForm.price),
      isUniversal: true,
    })
    setUniversalMode(false)
  }

  const cartTotal = cart.reduce((s, l) => s + l.price * l.qty, 0)

  async function checkout() {
    if (cart.length === 0) return
    if (paymentType === 'debt' && !debtor.trim()) return
    setSaving(true)
    const order = await checkoutCart(products, cart, {
      sellerName: user.name,
      paymentType,
      debtor: paymentType === 'debt' ? debtor.trim() : '',
    })
    setSaving(false)
    setLastOrder(order)
    setCart([])
    setPaymentType('cash')
    setDebtor('')
  }

  async function cancelLastOrder() {
    if (!lastOrder) return
    if (!confirm(`Отменить всю продажу на сумму ${formatKZT(lastOrder.total)}?`)) return
    setCancelling(true)
    for (const s of lastOrder.sales) {
      await refundSale(s, products)
    }
    setCancelling(false)
    setLastOrder(null)
  }

  return (
    <div className="view">
      <div className="tabs">
        <button className={`tab ${view === 'sale' ? 'tab-active' : ''}`} onClick={() => setView('sale')}>Продажа</button>
        <button className={`tab ${view === 'history' ? 'tab-active' : ''}`} onClick={() => setView('history')}>📋 История продаж</button>
      </div>

      {view === 'history' && <SellerHistory products={products} />}

      {view === 'sale' && (
        <>
          <h2>Продажа</h2>

          {error && <div className="error-text">{error}</div>}
          {loading && <p className="hint">Подключение к общей базе...</p>}
          {cameraError && <div className="error-text">{cameraError}</div>}

          <div className="scan-actions">
            <button className="btn btn-primary btn-big" onClick={() => setScanning(true)}>
              📷 Сканировать штрих-код
            </button>
          </div>

          <div className="manual-row" style={{ marginBottom: 12 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => startAdd('')}>
              ➕ Внести новый товар
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={startUniversal}>
              🏷 Товар без штрих-кода
            </button>
          </div>

          <form onSubmit={handleManualSubmit} className="manual-row">
            <input
              ref={usbInputRef}
              className="input"
              placeholder="Штрих-код (USB-сканер печатает сюда автоматически)"
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
            />
            <button className="btn btn-secondary" type="submit">Найти</button>
          </form>
          <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
            Сканируйте товары один за другим — они добавятся в список ниже. Когда всё собрано — выберите оплату и оформите продажу разом.
          </p>

          {notFound && (
            <div>
              <div className="error-text">{notFound}</div>
              <button className="btn btn-secondary" onClick={() => startAdd(lastTriedCode)}>➕ Внести этот товар</button>
            </div>
          )}

          {universalMode && (
            <form className="card-form" onSubmit={submitUniversal}>
              <p className="hint" style={{ marginTop: 0 }}>
                Для товара без штрих-кода (вес, развес, штучный товар без упаковки) — укажите цену прямо сейчас.
              </p>
              <input
                className="input"
                placeholder="Название (необязательно)"
                value={universalForm.name}
                onChange={e => setUniversalForm({ ...universalForm, name: e.target.value })}
                autoFocus
              />
              <input
                className="input"
                placeholder="Цена, ₸"
                type="number"
                value={universalForm.price}
                onChange={e => setUniversalForm({ ...universalForm, price: e.target.value })}
              />
              <button className="btn btn-primary" type="submit">Добавить в корзину</button>
            </form>
          )}

          {addingCode !== null && (
            <form className="card-form" onSubmit={saveNewProduct}>
              {addingCode ? (
                <div className="hint">Штрих-код: {addingCode}</div>
              ) : (
                <div className="manual-row">
                  <input
                    className="input"
                    placeholder="Штрих-код"
                    value={newForm.barcode}
                    onChange={e => setNewForm({ ...newForm, barcode: e.target.value })}
                  />
                  <button type="button" className="btn btn-secondary" onClick={() => { setScanForBarcodeField(true); setScanning(true) }}>📷</button>
                </div>
              )}
              <input
                className="input"
                placeholder="Название товара"
                value={newForm.name}
                onChange={e => setNewForm({ ...newForm, name: e.target.value })}
                autoFocus
              />
              <div className="manual-row">
                <input className="input" placeholder="Цена продажи, ₸" type="number" value={newForm.price}
                  onChange={e => setNewForm({ ...newForm, price: e.target.value })} />
                <input className="input" placeholder="Закупочная цена, ₸" type="number" value={newForm.cost}
                  onChange={e => setNewForm({ ...newForm, cost: e.target.value })} />
              </div>
              <div className="manual-row">
                <input className="input" placeholder="Вес/объём" value={newForm.weight}
                  onChange={e => setNewForm({ ...newForm, weight: e.target.value })} />
                <input className="input" placeholder="Остаток, шт" type="number" value={newForm.qty}
                  onChange={e => setNewForm({ ...newForm, qty: e.target.value })} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить и добавить в корзину'}
              </button>
            </form>
          )}

          {cart.length > 0 && (
            <div className="cart-card">
              <div style={{ overflowX: 'auto' }}>
                <table className="cart-table">
                  <thead>
                    <tr>
                      <th>Товар</th>
                      <th>Цена</th>
                      <th>Кол-во</th>
                      <th>Сумма</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map(l => (
                      <tr key={l.key}>
                        <td>{l.name}{l.weight ? <span className="hint"> · {l.weight}</span> : null}</td>
                        <td>{formatKZT(l.price)}</td>
                        <td>
                          <div className="cart-qty">
                            <button type="button" onClick={() => updateLineQty(l.key, l.qty - 1)}>−</button>
                            <span>{l.qty}</span>
                            <button type="button" onClick={() => updateLineQty(l.key, l.qty + 1)}>+</button>
                          </div>
                        </td>
                        <td>{formatKZT(l.price * l.qty)}</td>
                        <td><button type="button" className="cart-remove" onClick={() => removeLine(l.key)}>🗑</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="cart-total-row"><span>Итого</span><b>{formatKZT(cartTotal)}</b></div>

              <div className="pay-row">
                <label>Оплата:</label>
                <div className="pay-options">
                  <button type="button" className={`pay-btn ${paymentType === 'cash' ? 'pay-btn-active' : ''}`} onClick={() => setPaymentType('cash')}>💵 Наличные</button>
                  <button type="button" className={`pay-btn ${paymentType === 'card' ? 'pay-btn-active' : ''}`} onClick={() => setPaymentType('card')}>💳 Безнал</button>
                  <button type="button" className={`pay-btn ${paymentType === 'debt' ? 'pay-btn-active' : ''}`} onClick={() => setPaymentType('debt')}>📝 В долг</button>
                </div>
              </div>

              {paymentType === 'debt' && (
                <input
                  className="input"
                  placeholder="Кто берёт в долг (имя)"
                  value={debtor}
                  onChange={e => setDebtor(e.target.value)}
                />
              )}

              <button
                className="btn btn-success btn-big"
                onClick={checkout}
                disabled={saving || (paymentType === 'debt' && !debtor.trim())}
              >
                {saving ? 'Оформление...' : `Оформить продажу (${cart.length})`}
              </button>
            </div>
          )}

          {lastOrder && (
            <div className="success-banner">
              ✅ Продано: {lastOrder.sales.length} {lastOrder.sales.length === 1 ? 'товар' : 'товара(ов)'} на сумму {formatKZT(lastOrder.total)}
              {lastOrder.paymentType === 'cash' && ' · 💵 наличные'}
              {lastOrder.paymentType === 'card' && ' · 💳 безнал'}
              {lastOrder.paymentType === 'debt' && ` · 📝 в долг (${lastOrder.debtor})`}
              <div style={{ marginTop: 10 }}>
                <button className="btn btn-danger btn-sm" disabled={cancelling} onClick={cancelLastOrder}>
                  {cancelling ? 'Отмена...' : '↩️ Отменить эту продажу'}
                </button>
              </div>
            </div>
          )}

          {scanning && <BarcodeScanner onScan={handleFound} onClose={() => { setScanning(false); setScanForBarcodeField(false) }} />}
        </>
      )}
    </div>
  )
}

// ---------------- История продаж (для продавца) ----------------
function SellerHistory({ products }) {
  const { data: sales, loading, error } = useSales()
  const [search, setSearch] = useState('')
  const [refundingId, setRefundingId] = useState(null)

  const filtered = [...sales]
    .filter(s => !search.trim() || s.name.toLowerCase().includes(search.toLowerCase()))
    .reverse()
    .slice(0, 100)

  async function handleRefund(sale) {
    if (!confirm(`Отменить продажу «${sale.name}» × ${sale.qty} на сумму ${formatKZT(sale.total)}?`)) return
    setRefundingId(sale.id)
    await refundSale(sale, products)
    setRefundingId(null)
  }

  return (
    <div>
      <h2>История продаж</h2>
      {error && <div className="error-text">{error}</div>}
      {loading && <p className="hint">Загрузка...</p>}
      <input
        className="input"
        placeholder="Поиск по названию товара"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
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
                {refundingId === s.id ? '...' : '↩️'}
              </button>
            )}
          </div>
        ))}
        {filtered.length === 0 && !loading && <p className="hint">Продаж пока не было</p>}
      </div>
    </div>
  )
}
