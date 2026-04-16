import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fmt$, statusBadge } from '../../lib/commission'
import { useAuth } from '../../hooks/useAuth'

export default function AgentTransactions() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (profile?.agent_id) load() }, [profile])

  async function load() {
    const { data } = await supabase
      .from('transaction_agents')
      .select('*, transactions(*), plans(*)')
      .eq('agent_id', profile.agent_id)
      .order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }

  if (loading) return <div className="loading"><div className="spinner"/>Loading…</div>

  return (
    <div>
      <div className="sec-hdr"><div><div className="sec-title">My Transactions</div></div></div>
      <div className="card">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Property</th>
                <th>Type</th>
                <th>My Split</th>
                <th>My Commission</th>
                <th>Close Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(ta => {
                const t = ta.transactions
                if (!t) return null
                const myGross = (t.sale_price || 0) * ((t.selling_commission_pct || 0) / 100) * (ta.split_value / 100)
                return (
                  <tr
                    key={ta.id}
                    onClick={() => navigate(`/my-transactions/${t.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <span className="tbl-link">{t.street_address}</span>
                      <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{t.city}, {t.state}</div>
                    </td>
                    <td><span className="badge badge-navy" style={{ textTransform: 'capitalize' }}>{t.type}</span></td>
                    <td>{ta.split_value}{ta.split_type === 'percent' ? '%' : ' flat'}</td>
                    <td style={{ color: 'var(--teal)', fontWeight: 600 }}>{fmt$(myGross)}</td>
                    <td>{t.close_date || t.estimated_close_date || '—'}</td>
                    <td>{statusBadge(t.status)}</td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--txt3)', padding: 30 }}>No transactions yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
