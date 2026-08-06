// Общая база данных на Firebase Firestore — товары, продажи, приход и долги
// синхронизируются в реальном времени между всеми устройствами (телефон продавца,
// телефон/компьютер руководителя). Логин пользователей остаётся локальным —
// он не требует синхронизации, роли и пароли задаются один раз в коде ниже.

import { useEffect, useState } from 'react'
import { db } from './firebase.js'
import {
  collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc,
  increment, query, orderBy, writeBatch,
} from 'firebase/firestore'

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ---------- Пользователи (локально на устройстве) ----------
const USERS = [
  { login: 'admin', password: '1234', role: 'admin', name: 'Руководитель' },
  { login: 'seller', password: '1111', role: 'seller', name: 'Продавец' },
]
export function login(loginVal, password) {
  const user = USERS.find(u => u.login === loginVal && u.password === password)
  if (user) localStorage.setItem('shop_session', JSON.stringify(user))
  return user || null
}
export function logout() {
  localStorage.removeItem('shop_session')
}
export function getSession() {
  try { return JSON.parse(localStorage.getItem('shop_session')) } catch { return null }
}

// ---------- Живые подписки на коллекции Firestore ----------
function useLiveCollection(name, orderField) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const ref = collection(db, name)
    const q = orderField ? query(ref, orderBy(orderField)) : ref
    const unsub = onSnapshot(
      q,
      snap => {
        setData(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      err => {
        console.error(`Firestore (${name}):`, err)
        setError('Не удалось подключиться к общей базе. Проверьте настройки Firebase в src/firebase.js')
        setLoading(false)
      }
    )
    return unsub
  }, [name, orderField])

  return { data, loading, error }
}

export function useProducts() { return useLiveCollection('products') }
export function useSales() { return useLiveCollection('sales', 'date') }
export function usePurchases() { return useLiveCollection('purchases', 'date') }
export function useDebts() { return useLiveCollection('debts', 'date') }

// ---------- Товары ----------
export function findProduct(products, barcode) {
  return products.find(p => p.barcode === barcode) || null
}
export async function upsertProduct(product) {
  await setDoc(doc(db, 'products', product.barcode), { qty: 0, cost: 0, ...product }, { merge: true })
}
export async function deleteProduct(barcode) {
  await deleteDoc(doc(db, 'products', barcode))
}

// ---------- Продажи ----------
export async function addSale(products, sale) {
  const record = { date: new Date().toISOString(), paymentType: 'cash', debtor: '', refunded: false, ...sale }
  const saleRef = await addDoc(collection(db, 'sales'), record)

  // списываем со склада, только если это реальный товар из каталога (не универсальная продажа)
  const prod = products.find(p => p.barcode === sale.barcode)
  if (prod) {
    await updateDoc(doc(db, 'products', prod.barcode), { qty: increment(-(sale.qty || 1)) })
  }

  // продажа в долг — сразу заводим запись в долгах, и привязываем её к продаже
  let debtId = null
  if (record.paymentType === 'debt' && record.debtor) {
    const debtRef = await addDebt({
      who: record.debtor,
      amount: record.total,
      type: 'owed_to_us',
      comment: `Долг за товар: ${record.name} × ${record.qty}`,
      saleId: saleRef.id,
    })
    debtId = debtRef.id
    await updateDoc(saleRef, { debtId })
  }
  return { id: saleRef.id, ...record, debtId }
}

// Оформление корзины: несколько товаров одним чеком (один способ оплаты, один "заказ").
// Каждая позиция сохраняется отдельной записью в sales (для точного учёта себестоимости
// и остатков), но все они помечены общим orderId, чтобы их можно было отменить все разом.
export async function checkoutCart(products, items, meta) {
  const orderId = uid()
  const dateIso = new Date().toISOString()
  const total = items.reduce((s, it) => s + it.price * it.qty, 0)
  const batch = writeBatch(db)
  const saleRefs = []

  items.forEach(it => {
    const saleRef = doc(collection(db, 'sales'))
    saleRefs.push({ ref: saleRef, item: it })
    batch.set(saleRef, {
      date: dateIso,
      orderId,
      barcode: it.barcode,
      name: it.name,
      price: it.price,
      qty: it.qty,
      total: it.price * it.qty,
      sellerName: meta.sellerName,
      paymentType: meta.paymentType,
      debtor: meta.paymentType === 'debt' ? meta.debtor : '',
      refunded: false,
    })
    if (!it.isUniversal) {
      const prod = products.find(p => p.barcode === it.barcode)
      if (prod) {
        batch.update(doc(db, 'products', it.barcode), { qty: increment(-it.qty) })
      }
    }
  })

  let debtRef = null
  if (meta.paymentType === 'debt' && meta.debtor) {
    debtRef = doc(collection(db, 'debts'))
    batch.set(debtRef, {
      date: dateIso,
      paid: false,
      who: meta.debtor,
      amount: total,
      type: 'owed_to_us',
      comment: `Долг за покупку: ${items.map(it => `${it.name} × ${it.qty}`).join(', ')}`,
      orderId,
    })
  }

  await batch.commit()

  if (debtRef) {
    const linkBatch = writeBatch(db)
    saleRefs.forEach(({ ref }) => linkBatch.update(ref, { debtId: debtRef.id }))
    await linkBatch.commit()
  }

  return {
    orderId,
    total,
    paymentType: meta.paymentType,
    debtor: meta.debtor,
    sales: saleRefs.map(({ ref, item }) => ({
      id: ref.id,
      barcode: item.barcode,
      name: item.name,
      qty: item.qty,
      price: item.price,
      total: item.price * item.qty,
      paymentType: meta.paymentType,
      debtId: debtRef ? debtRef.id : null,
    })),
  }
}

// Отмена / возврат продажи: возвращает товар на склад (если это не универсальный товар
// без штрих-кода), удаляет связанный долг (если продажа была "в долг") и помечает
// продажу как возвращённую — она остаётся в истории, но не учитывается в доходе и прибыли.
export async function refundSale(sale, products) {
  await updateDoc(doc(db, 'sales', sale.id), { refunded: true, refundedAt: new Date().toISOString() })
  const prod = products.find(p => p.barcode === sale.barcode)
  if (prod) {
    await updateDoc(doc(db, 'products', prod.barcode), { qty: increment(sale.qty || 1) })
  }
  if (sale.debtId) {
    await deleteDoc(doc(db, 'debts', sale.debtId)).catch(() => {})
  }
}

// ---------- Приход ----------
export async function addPurchase(products, purchase) {
  const record = { date: new Date().toISOString(), ...purchase }
  await addDoc(collection(db, 'purchases'), record)
  const prod = products.find(p => p.barcode === purchase.barcode)
  if (prod) {
    const updates = { qty: increment(purchase.qty || 0) }
    if (purchase.cost) updates.cost = purchase.cost
    await updateDoc(doc(db, 'products', prod.barcode), updates)
  }
}

// ---------- Долги ----------
export async function addDebt(debt) {
  return await addDoc(collection(db, 'debts'), { date: new Date().toISOString(), paid: false, ...debt })
}
export async function toggleDebtPaid(id, currentPaid) {
  await updateDoc(doc(db, 'debts', id), { paid: !currentPaid })
}
export async function deleteDebt(id) {
  await deleteDoc(doc(db, 'debts', id))
}

// ---------- Отчётность (считаем на клиенте из живых данных) ----------
export function computeReport(products, sales, purchases, debts, fromDate, toDate) {
  const inRange = (iso) => {
    const t = new Date(iso).getTime()
    if (fromDate && t < new Date(fromDate).getTime()) return false
    if (toDate && t > new Date(toDate).getTime() + 86400000) return false
    return true
  }
  const salesInRange = sales.filter(s => inRange(s.date))
  const salesF = salesInRange.filter(s => !s.refunded) // без учёта возвратов
  const purchasesF = purchases.filter(p => inRange(p.date))

  const income = salesF.reduce((sum, s) => sum + (s.total || 0), 0)
  const cashIncome = salesF.filter(s => (s.paymentType || 'cash') === 'cash').reduce((s2, s) => s2 + (s.total || 0), 0)
  const cardIncome = salesF.filter(s => s.paymentType === 'card').reduce((s2, s) => s2 + (s.total || 0), 0)
  const debtIncome = salesF.filter(s => s.paymentType === 'debt').reduce((s2, s) => s2 + (s.total || 0), 0)
  const purchaseTotal = purchasesF.reduce((sum, p) => sum + ((p.cost || 0) * (p.qty || 0)), 0)

  const costOfGoodsSold = salesF.reduce((sum, s) => {
    const prod = products.find(p => p.barcode === s.barcode)
    const cost = prod ? (prod.cost || 0) : 0
    return sum + cost * (s.qty || 1)
  }, 0)
  const netProfit = income - costOfGoodsSold

  const debtsWeOwe = debts.filter(d => d.type === 'we_owe' && !d.paid).reduce((s, d) => s + d.amount, 0)
  const debtsOwedToUs = debts.filter(d => d.type === 'owed_to_us' && !d.paid).reduce((s, d) => s + d.amount, 0)
  const refundedCount = salesInRange.filter(s => s.refunded).length

  return {
    income, cashIncome, cardIncome, debtIncome,
    purchaseTotal, costOfGoodsSold, netProfit,
    debtsWeOwe, debtsOwedToUs,
    salesCount: salesF.length,
    refundedCount,
    sales: salesF, purchases: purchasesF,
  }
}

export function formatKZT(n) {
  return (n || 0).toLocaleString('ru-RU') + ' ₸'
}
