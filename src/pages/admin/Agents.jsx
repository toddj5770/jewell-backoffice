import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { licenseStatus, statusBadge } from '../../lib/commission'

export default function Agents() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('active')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('agents').select('*, plans(name,type)').order('last_name')
    setAgents(data || [])
    setLoading(false)
  }

  const filtered = agents.filter(a => {
    const matchStatus = !filter || a.status === filter
    const q = search.toLowerCase()
    const matchSearch = !q || `${a.first_name} ${a.last_name} ${a.email} ${a.office}`.toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  if (loading) return <div className="loading"><div className="spinner"/>Loading agents…</div>

  return (
    <div>
      <div className="sec-hdr">
        <div><div className="sec-title">Agents</div><div className="sec-sub">{filtered.length} shown</div></div>
        <button className="btn btn-gold" onClick={() => navigate('/agents/new')}>+ Add Agent</button>
      </div>
      <div style={{display:'flex',gap:10,marginBottom:16}}>
        <input className="form-ctrl" placeholder="Search name, email, office…" value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:280}}/>
        <select className="form-ctrl" value={filter} onChange={e=>setFilter(e.target.value)} style={{maxWidth:160}}>
          <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option>
        </select>
      </div>
      <div className="card">
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Name</th><th>Office</th><th>Plan</th><th>License Exp</th><th>E&O Exp</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map(a => {
                const ls = licenseStatus(a.license_expiration)
                return (
                  <tr key={a.id} style={{cursor:'pointer'}} onClick={() => navigate(`/agents/${a.id}`)}>
                    <td><span className="tbl-link">{a.first_name} {a.last_name}</span><div style={{fontSize:11,color:'var(--txt3)'}}>{a.email}</div></td>
                    <td>{a.office || '—'}</td>
                    <td style={{fontSize:11}}>{a.plans?.name || '—'}</td>
                    <td><span className={`badge ${ls==='ok'?'badge-green':ls==='warning'?'badge-amber':'badge-red'}`}>{a.license_expiration || '—'}</span></td>
                    <td style={{fontSize:11,color:'var(--txt3)'}}>{a.eando_expiration || '—'}</td>
                    <td>{statusBadge(a.status)}</td>
                  </tr>
                )
              })}
              {filtered.length===0&&<tr><td colSpan={6} style={{textAlign:'center',color:'var(--txt3)',padding:30}}>No agents found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
