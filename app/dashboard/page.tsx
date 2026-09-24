import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function roleLabel(role:string){return role.split('_').map(x=>x[0].toUpperCase()+x.slice(1)).join(' ')}

export default async function Page(){
  const supabase=createClient()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user) redirect('/login')
  const {data:profile}=await supabase.from('profiles').select('first_name,last_name,role').eq('id',user.id).single()
  return <>
    <div className="page-heading"><div><h1>Dashboard</h1><p className="muted">Estimating, bidding, field production and cost intelligence in one system.</p></div><div className="role-badge">{profile?.role?roleLabel(profile.role):'User'}</div></div>
    <div className="cards"><div className="card"><b>Active Estimates</b><h2>0</h2></div><div className="card"><b>Open Projects</b><h2>0</h2></div><div className="card"><b>Upcoming Bids</b><h2>0</h2></div><div className="card"><b>Cost Alerts</b><h2>0</h2></div></div>
  </>
}
