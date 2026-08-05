import { useState } from 'react'
import BarcodeScanner from './BarcodeScanner.jsx'
import { findProductByBarcode, addSale, upsertProduct, formatKZT } from '../store.js'

export default function SellerView({ user }) {
  const [scanning, setScanning] = useState(false)
  const [scanForBarcodeField, setScanForBarcodeField] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [product, setProduct] = useState(null)
  const [qty, setQty] = useState(1)
  const [notFound, setNotFound] = useState('')
  const [lastSale, setLastSale] = useState(null)
  const [cameraError, setCameraError] = useState('')
  const [lastTriedCode, setLastTriedCode] = useState('')
  const [addingCode, setAddingCode] = useState(null) // null = закрыто, '' = ручной ввод кода, 'XXXX' = код известен
  const [newForm, setNewForm] = useState({ barcode: '', name: '', price: '', cost: '', weight: '', qty: '' })
  const [paymentType, setPaymentType] = useState('cash') // cash | card | debt
  const [debtor, setDebtor] = useState('')

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
    setLastSale(null)
    setAddingCode(null)
    setLastTriedCode(code)
    setPaymentType('cash')
    setDebtor('')
    const p = findProductByBarcode(code)
    if (p) {
      setProduct(p)
      setQty(1)
      setNotFound('')
    } else {
      setProduct(null)
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
    setProduct(null)
    setNotFound('')
    setAddingCode(code)
    setNewForm({ barcode: code, name: '', price: '', cost: '', weight: '', qty: '' })
  }

  function saveNewProduct(e) {
    e.preventDefault()
    if (!newForm.barcode || !newForm.name || !newForm.price) return
    const item = {
      barcode: newForm.barcode,
      name: newForm.name,
      price: Number(newForm.price),
      cost: Number(newForm.cost) || 0,
      weight: newForm.weight,
      qty: Number(newForm.qty) || 0,
    }
    upsertProduct(item)
    setAddingCode(null)
    setProduct(item)
    setQty(1)
  }

  function completeSale() {
    if (!product || qty <= 0) return
    if (paymentType === 'debt' && !debtor.trim()) return
    const total = product.price * qty
    const record = addSale({
      barcode: product.barcode,
      name: product.name,
      price: product.price,
      qty,
      total,
      sellerName: user.name,
      paymentType,
      debtor: paymentType === 'debt' ? debtor.trim() : '',
    })
    setLastSale(record)
    setProduct(null)
    setQty(1)
    setPaymentType('cash')
    setDebtor('')
  }

  return (
    <div className="view">
      <h2>Продажа</h2>

      {cameraError && <div className="error-text">{cameraError}</div>}

      <div className="scan-actions">
        <button className="btn btn-primary btn-big" onClick={() => setScanning(true)}>
          📷 Сканировать штрих-код
        </button>
      </div>

      <button className="btn btn-secondary" style={{ width: '100%', marginBottom: 12 }} onClick={() => startAdd('')}>
        ➕ Внести новый товар вручную
      </button>

      <form onSubmit={handleManualSubmit} className="manual-row">
        <input
          className="input"
          placeholder="Или введите штрих-код вручную"
          value={manualCode}
          onChange={e => setManualCode(e.target.value)}
        />
        <button className="btn btn-secondary" type="submit">Найти</button>
      </form>

      {notFound && (
        <div>
          <div className="error-text">{notFound}</div>
          <button className="btn btn-secondary" onClick={() => startAdd(lastTriedCode)}>➕ Внести этот товар</button>
        </div>
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
          <button className="btn btn-primary" type="submit">Сохранить и продать</button>
        </form>
      )}

      {product && (
        <div className="product-card">
          <h3>{product.name}</h3>
          <div className="product-row"><span>Цена</span><b>{formatKZT(product.price)}</b></div>
          {product.weight && <div className="product-row"><span>Вес/объём</span><b>{product.weight}</b></div>}
          <div className="product-row"><span>На складе</span><b>{product.qty ?? 0} шт</b></div>
          <div className="qty-row">
            <label>Количество:</label>
            <button className="btn btn-round" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
            <input
              className="input qty-input"
              type="number"
              min="1"
              value={qty}
              onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}
            />
            <button className="btn btn-round" onClick={() => setQty(q => q + 1)}>+</button>
          </div>
          <div className="product-row total-row"><span>Итого</span><b>{formatKZT(product.price * qty)}</b></div>

          <div className="pay-row">
            <label>Оплата:</label>
            <div className="pay-options">
              <button
                type="button"
                className={`pay-btn ${paymentType === 'cash' ? 'pay-btn-active' : ''}`}
                onClick={() => setPaymentType('cash')}
              >💵 Наличные</button>
              <button
                type="button"
                className={`pay-btn ${paymentType === 'card' ? 'pay-btn-active' : ''}`}
                onClick={() => setPaymentType('card')}
              >💳 Безнал</button>
              <button
                type="button"
                className={`pay-btn ${paymentType === 'debt' ? 'pay-btn-active' : ''}`}
                onClick={() => setPaymentType('debt')}
              >📝 В долг</button>
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
            onClick={completeSale}
            disabled={paymentType === 'debt' && !debtor.trim()}
          >
            Оформить продажу
          </button>
        </div>
      )}

      {lastSale && (
        <div className="success-banner">
          ✅ Продано: {lastSale.name} × {lastSale.qty} = {formatKZT(lastSale.total)}
          {lastSale.paymentType === 'cash' && ' · 💵 наличные'}
          {lastSale.paymentType === 'card' && ' · 💳 безнал'}
          {lastSale.paymentType === 'debt' && ` · 📝 в долг (${lastSale.debtor})`}
        </div>
      )}

      {scanning && <BarcodeScanner onScan={handleFound} onClose={() => { setScanning(false); setScanForBarcodeField(false) }} />}
    </div>
  )
}
