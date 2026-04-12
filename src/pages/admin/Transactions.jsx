import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fmt$, statusBadge } from '../../lib/commission'

export default function Transactions() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [txns, setTxns] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('transactions')
      .select('*, transaction_agents(agent_id, split_value, split_type, agents(first_name, last_name))')
      .order('created_at', { ascending: false })
    setTxns(data || [])
    setLoading(false)
  }

  const filtered = txns.filter(t => {
    const matchStatus = !statusFilter || t.status === statusFilter
    const q = search.toLowerCase()
    const matchSearch = !q ||
      t.street_address?.toLowerCase().includes(q) ||
      t.city?.toLowerCase().includes(q) ||
      t.mls_number?.toLowerCase().includes(q) ||
      (t.transaction_agents || []).some(ta =>
        `${ta.agents?.first_name} ${ta.agents?.last_name}`.toLowerCase().includes(q)
      )
    return matchStatus && matchSearch
  })

  if (loading) return <div className="loading"><div className="spinner"/>Loading transactions…</div>

  return (
    <div>
      <div className="sec-hdr">
        <div>
          <div className="sec-title">Transactions</div>
          <div className="sec-sub">{filtered.length} of {txns.length} shown</div>
        </div>
        <button className="btn btn-gold" onClick={() => navigate('/transactions/new')}>+ New Transaction</button>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:16}}>
        <input className="form-ctrl" placeholder="Search address, city, MLS#, agent…"
          value={search} onChange={e => setSearch(e.target.value)} style={{maxWidth:320}}/>
        <select className="form-ctrl" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{maxWidth:160}}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {(search || statusFilter) && <button className="btn btn-ghost" onClick={() => { setSearch(''); setStatusFilter('') }}>Clear</button>}
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>Property</th><th>Type</th><th>Agent(s)</th><th>Sale Price</th><th>GCI</th><th>Close Date</th><th>Status</th></tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const gci = (t.sale_price||0) * ((t.selling_commission_pct||0)/100)
                const agents = (t.transaction_agents||[]).map(ta => `${ta.agents?.first_name||''} ${ta.agents?.last_name||''}`.trim()).filter(Boolean).join(', ')
                return (
                  <tr key={t.id} style={{cursor:'pointer'}} onClick={() => navigate(`/transactions/${t.id}`)}>
                    <td><span className="tbl-link">{t.street_address}</span><div style={{fontSize:11,color:'var(--txt3)'}}>{t.city}, {t.state}</div></td>
                    <td><span className="badge badge-navy" style={{textTransform:'capitalize'}}>{t.type}</span></td>
                    <td style={{fontSize:12}}>{agents||'—'}</td>
                    <td>{t.sale_price ? fmt$(t.sale_price) : '—'}</td>
                    <td style={{fontWeight:600}}>{gci ? fmt$(gci) : '—'}</td>
                    <td style={{color:'var(--txt2)'}}>{t.close_date||t.estimated_close_date||'—'}</td>
                    <td>{statusBadge(t.status)}</td>
                  </tr>
                )
              })}
              {filtered.length===0 && <tr><td colSpan={7} style={{textAlign:'center',color:'var(--txt3)',padding:30}}>{txns.length===0 ? 'No transactions yet.' : 'No matches.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
