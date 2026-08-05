import { useState, useEffect } from 'react'
import Login from './components/Login.jsx'
import SellerView from './components/SellerView.jsx'
import AdminView from './components/AdminView.jsx'
import { getSession, logout } from './store.js'

export default function App() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    setUser(getSession())
  }, [])

  if (!user) return <Login onLogin={setUser} />

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="app-title">AisultanMarket</div>
          <div className="app-subtitle">{user.name} · {user.role === 'admin' ? 'Руководитель' : 'Продавец'}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => { logout(); setUser(null) }}>Выйти</button>
      </header>
      <main className="app-main">
        {user.role === 'admin' ? <AdminView /> : <SellerView user={user} />}
      </main>
    </div>
  )
}
