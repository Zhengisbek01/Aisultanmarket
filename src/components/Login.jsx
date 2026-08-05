import { useState } from 'react'
import { login } from '../store.js'

export default function Login({ onLogin }) {
  const [loginVal, setLoginVal] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const user = login(loginVal.trim(), password)
    if (user) {
      setError('')
      onLogin(user)
    } else {
      setError('Неверный логин или пароль')
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="logo">📦</div>
        <h1>AisultanMarket</h1>
        <p className="subtitle">Войдите под своей ролью</p>
        <form onSubmit={handleSubmit}>
          <input
            className="input"
            placeholder="Логин"
            value={loginVal}
            onChange={e => setLoginVal(e.target.value)}
            autoFocus
          />
          <input
            className="input"
            placeholder="Пароль"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          {error && <div className="error-text">{error}</div>}
          <button className="btn btn-primary" type="submit">Войти</button>
        </form>
        <p className="hint">По умолчанию: admin / 1234 (руководитель), seller / 1111 (продавец)</p>
      </div>
    </div>
  )
}
