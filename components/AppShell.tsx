'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Profile = {
  first_name: string | null
  last_name: string | null
  role: string
  company_id: string | null
}

type Company = {
  name: string
}

const allLinks = [
  ['Dashboard','/dashboard',['owner','admin','estimator','project_manager','foreman','read_only']],
  ['Projects','/projects',['owner','admin','estimator','project_manager','foreman','read_only']],
  ['Estimates','/estimates',['owner','admin','estimator','project_manager']],
  ['Cost Library','/cost-library',['owner','admin','estimator','project_manager','foreman']],
  ['Items','/items',['owner','admin','estimator','project_manager']],
  ['Bid Results','/bid-results',['owner','admin','estimator','project_manager']],
  ['Field Reports','/field-reports',['owner','admin','estimator','project_manager','foreman']],
  ['Analytics','/analytics',['owner','admin','estimator']],
  ['Settings','/settings',['owner','admin']],
] as const

function labelRole(role?: string) {
  if (!role) return ''

  return role
    .split('_')
    .map(x => x[0].toUpperCase() + x.slice(1))
    .join(' ')
}

export default function AppShell({
  children
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (pathname === '/login') return

    const supabase = createClient()

    ;(async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser()

      if (!user) return

      setEmail(user.email || '')

      const { data: profileData } = await supabase
        .from('profiles')
        .select('first_name,last_name,role,company_id')
        .eq('id', user.id)
        .single()

      if (!profileData) return

      setProfile(profileData)

      if (profileData.company_id) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('name')
          .eq('id', profileData.company_id)
          .single()

        if (companyData) {
          setCompany(companyData)
        }
      }
    })()
  }, [pathname])

  if (pathname === '/login') {
    return <>{children}</>
  }

  async function signOut() {
    const supabase = createClient()

    await supabase.auth.signOut()

    router.replace('/login')
    router.refresh()
  }

  const role = profile?.role

  const links = allLinks.filter(
    ([, , roles]) =>
      !role || (roles as readonly string[]).includes(role)
  )

  const displayName = profile
    ? [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(' ')
    : ''

  return (
    <div className="shell">
      <aside className="sidebar">

        <div className="brand">
          CivilBid
        </div>

        <div className="brand-sub">
          Civil Construction Intelligence
        </div>

        {company && (
          <div
            style={{
              marginTop: '24px',
              marginBottom: '18px',
              paddingTop: '18px',
              borderTop: '1px solid rgba(255,255,255,0.12)'
            }}
          >
            <div
              style={{
                fontSize: '10px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                opacity: 0.55,
                marginBottom: '6px'
              }}
            >
              Workspace
            </div>

            <div
              style={{
                fontSize: '14px',
                fontWeight: 600,
                lineHeight: 1.35
              }}
            >
              {company.name}
            </div>
          </div>
        )}

        <nav className="nav">
          {links.map(([name, href]) => (
            <Link
              className={pathname === href ? 'active' : ''}
              key={href}
              href={href}
            >
              {name}
            </Link>
          ))}
        </nav>

        <div className="account">

          <div className="account-name">
            {displayName || 'CivilBid User'}
          </div>

          <div className="account-role">
            {labelRole(role) || email}
          </div>

          <button
            className="logout"
            onClick={signOut}
          >
            Sign out
          </button>

        </div>

      </aside>

      <main className="main">
        {children}
      </main>
    </div>
  )
}
