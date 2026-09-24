'use client'

import { FormEvent, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const search = useSearchParams()
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [error,setError] = useState('')
  const [loading,setLoading] = useState(false)

  async function login(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    const next = search.get('next')
    router.replace(next && next.startsWith('/') ? next : '/dashboard')
    router.refresh()
  }

  return <main className="login-page">
    <section className="login-card">
      <div className="login-brand">CivilBid</div>
      <h1>Welcome back</h1>
      <p className="muted">Sign in to estimating, bidding and project intelligence.</p>
      <form onSubmit={login}>
        <label>Email</label>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" />
        <label>Password</label>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password" />
        {error && <div className="error">{error}</div>}
        <button className="primary-button" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <p className="login-help">Accounts are created by your CivilBid administrator.</p>
    </section>
  </main>
}
