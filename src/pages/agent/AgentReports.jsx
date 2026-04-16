import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt$ } from '../../lib/commission'
import { useAuth } from '../../hooks/useAuth'

// ── Agent-facing reports (scoped to this agent only) ─────────
const AGENT_REPORTS = [
  { id: 'my_production',       name: 'My Production YTD',        icon: '📊', desc: 'Your closed deals, volume, and commission earned' },
  { id: 'my_cap',              name: 'My Cap Progress',          icon: '🎯', desc: 'Your cap status and progress toward your cap' },
  { id: 'my_transactions',     name: 'My Transactions',          icon: '🏠', desc: 'All your transactions with filtering by status' },
  { id: 'my_monthly_trend',    name: 'My Monthly Trend',         icon: '📈', desc: 'Month-by-month breakdown of your closed deals' },
  { id: 'my_pipeline',         name: 'My Pipeline',              icon: '⏳', desc: 'Your open deals with projected commission' },
  { id: 'my_projected_income', name: 'My Projected Income',      icon: '📅', desc: 'Your open deals grouped by estimated close month' },
]

const DATE_PRESETS = [
  { value: 'ytd',          label: 'Year to Date' },
  { value: 'this_month',   label: 'This Month' },
  { value: 'last_month',   label: 'Last Month' },
  { value: 'next_month',   label: 'Next Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'next_quarter', label: 'Next Quarter' },
  { value: 'this_fy',      label: 'This Fiscal Year' },
  { value: 'last_fy',      label: 'Last Fiscal Year' },
  { value: 'last_30',      label: 'Last 30 Days' },
  { value: 'last_90',      label: 'Last 90 Days' },
  { value: 'last_12m',     label: 'Last 12 Months' },
  { value: 'custom',       label: 'Custom Range' },
]

function getDatePreset(preset) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const pad = n => String(n).padStart(2, '0')
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
  switch (preset) {
    case 'this_month':   { const from = new Date(y, m, 1); const to = new Date(y, m+1, 0); return { dateFrom: ymd(from), dateTo: ymd(to) } }
    case 'last_month':   { const from = new Date(y, m-1, 1); const to = new Date(y, m, 0); return { dateFrom: ymd(from), dateTo: ymd(to) } }
    case 'next_month':   { const from = new Date(y, m+1, 1); const to = new Date(y, m+2, 0); return { dateFrom: ymd(from), dateTo: ymd(to) } }
    case 'this_quarter': { const q = Math.floor(m/3); const from = new Date(y, q*3, 1); const to = new Date(y, q*3+3, 0); return { dateFrom: ymd(from), dateTo: ymd(to) } }
    case 'last_quarter': { const q = Math.floor(m/3) - 1; const qy = q < 0 ? y-1 : y; const qq = q < 0 ? 3 : q; const from = new Date(qy, qq*3, 1); const to = new Date(qy, qq*3+3, 0); return { dateFrom: ymd(from), dateTo: ymd(to) } }
    case 'next_quarter': { const q = Math.floor(m/3) + 1; const qy = q > 3 ? y+1 : y; const qq = q > 3 ? 0 : q; const from = new Date(qy, qq*3, 1); const to = new Date(qy, qq*3+3, 0); return { dateFrom: ymd(from), dateTo: ymd(to) } }
    case 'this_fy':      return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` }
    case 'last_fy':      return { dateFrom: `${y-1}-01-01`, dateTo: `${y-1}-12-31` }
    case 'ytd':          return { dateFrom: `${y}-01-01`, dateTo: ymd(now) }
    case 'last_30':      { const from = new Date(now); from.setDate(from.getDate()-30); return { dateFrom: ymd(from), dateTo: ymd(now) } }
    case 'last_90':      { const from = new Date(now); from.setDate(from.getDate()-90); return { dateFrom: ymd(from), dateTo: ymd(now) } }
    case 'last_12m':     { const from = new Date(now); from.setMonth(from.getMonth()-12); return { dateFrom: ymd(from), dateTo: ymd(now) } }
    default: return null
  }
}

export default function AgentReports() {
  const { profile } = useAuth()
  const [view, setView] = useState('list')
  const [activeReport, setActiveReport] = useState(null)
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [allData, setAllData] = useState(null)

  const [filters, setFilters] = useState({
    dateFrom: new Date().getFullYear() + '-01-01',
    dateTo: new Date().toISOString().slice(0, 10),
    preset: 'ytd',
    status: 'all',    // for my_transactions report only
  })

  useEffect(() => { if (profile?.agent_id) loadData() }, [profile])

  async function loadData() {
    // Pull transactions the agent is on + their agent record (for plan/cap)
    const [txnRes, agtRes] = await Promise.all([
      supabase.from('transactions')
        .select('*, transaction_agents(*, plans(*))')
        .in('id',
          // Subquery via a first call below — Supabase doesn't support nested selects, so we do a two-step
        ),
      supabase.from('agents').select('*, plans(*)').eq('id', profile.agent_id).single(),
    ])

    // Simpler approach: just fetch transactions where this agent is in transaction_agents
    const { data: myTas } = await supabase
      .from('transaction_agents')
      .select('transaction_id')
      .eq('agent_id', profile.agent_id)
    const txIds = (myTas || []).map(r => r.transaction_id)
    let txns = []
    if (txIds.length > 0) {
      const { data } = await supabase
        .from('transactions')
        .select('*, transaction_agents(*, plans(*))')
        .in('id', txIds)
      txns = data || []
    }

    setAllData({
      transactions: txns.map(t => enrichTransaction(t, profile.agent_id)),
      agent: agtRes.data || null,
    })
  }

  function enrichTransaction(t, myAgentId) {
    const gross = (t.sale_price || 0) * ((t.selling_commission_pct || 0) / 100)
    const tas = t.transaction_agents || []
    const myTa = tas.find(ta => ta.agent_id === myAgentId)
    if (!myTa) return { ...t, mine: null }
    const myIdx = tas.indexOf(myTa)
    const isPrimary = myIdx === 0
    const plan = myTa.plans
    const myGross = myTa.split_type === 'dollar'
      ? Number(myTa.split_value || 0)
      : gross * ((myTa.split_value || 100) / 100)
    const agentPct = plan?.type === 'cap' ? (plan.cap_levels?.[0]?.pct || 90) : (plan?.agent_pct || 80)
    const feeItem = plan?.fees?.find(f => f.name === 'Admin Fee')
    const feeAmt = isPrimary ? (feeItem?.amt || 0) : 0
    const payer = t.admin_fee_payer || feeItem?.payer || 'client'
    let myNet = myGross * (agentPct / 100)
    if (payer === 'agent') myNet -= feeAmt
    const myVolumeCredit = (t.sale_price || 0) * ((myTa.volume_pct || 100) / 100)
    const myBrokerPaid = myGross * ((100 - agentPct) / 100) - (payer === 'broker' ? feeAmt : 0)
    // subtract any expense withholdings
    const withheld = (t.deductions_detail || []).reduce((s, d) => s + (Number(d.amount) || 0), 0)
    return {
      ...t,
      mine: {
        gross: myGross,
        net: Math.max(0, myNet - withheld),
        agentPct,
        isPrimary,
        role: isPrimary ? 'Primary' : 'Co-Agent',
        volumeCredit: myVolumeCredit,
        brokerPaid: Math.max(0, myBrokerPaid),
        withheld,
      },
    }
  }

  function applyPreset(preset) {
    if (preset === 'custom') {
      setFilters(f => ({ ...f, preset }))
      return
    }
    const range = getDatePreset(preset)
    if (range) setFilters(f => ({ ...f, ...range, preset }))
  }

  function runReport(id, overrideFilters) {
    if (!allData) return
    const f = overrideFilters || filters
    setLoading(true)
    setActiveReport(AGENT_REPORTS.find(r => r.id === id))
    setView('run')

    const { transactions, agent } = allData
    const mine = transactions.filter(t => t.mine)
    const inClosedRange = t => t.close_date && t.close_date >= f.dateFrom && t.close_date <= f.dateTo
    const inEstRange = t => t.estimated_close_date && t.estimated_close_date >= f.dateFrom && t.estimated_close_date <= f.dateTo
    const closedInRange = mine.filter(t => t.status === 'closed' && inClosedRange(t))
    const openInRange = mine.filter(t => (t.status === 'active' || t.status === 'pending') && inEstRange(t))
    const moNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

    let columns = [], rows = []

    switch (id) {
      case 'my_production': {
        columns = ['Metric', 'Value']
        const volume = closedInRange.reduce((s, t) => s + (t.sale_price || 0), 0)
        const gross = closedInRange.reduce((s, t) => s + t.mine.gross, 0)
        const net = closedInRange.reduce((s, t) => s + t.mine.net, 0)
        const avgPrice = closedInRange.length ? volume / closedInRange.length : 0
        rows = [
          ['Closed Deals', closedInRange.length],
          ['Total Volume', fmt$(volume)],
          ['Gross Commission (Your Split)', fmt$(gross)],
          ['Net Commission Earned', fmt$(net)],
          ['Average Sale Price', fmt$(avgPrice)],
          ['Commission Plan', agent?.plans?.name || '—'],
        ]
        break
      }

      case 'my_cap': {
        columns = ['Metric', 'Value']
        const plan = agent?.plans
        if (!plan || plan.type !== 'cap') {
          columns = ['Notice']
          rows = [['You are not on a cap-based commission plan. Your plan is: ' + (plan?.name || 'Not assigned')]]
          break
        }
        // Calculate broker paid YTD from actual closed deals (this calendar year)
        const thisYear = new Date().getFullYear()
        const ytdClosed = mine.filter(t => t.status === 'closed' && t.close_date && new Date(t.close_date).getFullYear() === thisYear)
        const brokerPaid = ytdClosed.reduce((s, t) => s + (t.mine.brokerPaid || 0), 0)
        const cap = plan.cap_amount || 0
        const remaining = Math.max(0, cap - brokerPaid)
        const pct = cap ? Math.min(100, Math.round(brokerPaid / cap * 100)) : 0
        rows = [
          ['Commission Plan', plan.name],
          ['Cap Amount', fmt$(cap)],
          ['Paid to Broker YTD', fmt$(Math.min(brokerPaid, cap))],
          ['Remaining to Cap', fmt$(remaining)],
          ['Progress', pct + '%'],
          ['Status', brokerPaid >= cap ? '🎯 Capped — you keep 100% on new deals' : pct >= 75 ? '🔥 Near cap' : 'In progress'],
          ['Closed Deals This Year', ytdClosed.length],
        ]
        break
      }

      case 'my_transactions': {
        columns = ['Address', 'City', 'Role', 'Type', 'Status', 'Sale Price', 'Your Net', 'Close Date', 'Lead Source']
        let list = mine.filter(t => {
          // Status filter
          if (f.status !== 'all' && t.status !== f.status) return false
          // Date filter: closed deals by close_date, open deals by est. close
          if (t.status === 'closed') return inClosedRange(t)
          if (t.status === 'active' || t.status === 'pending') return inEstRange(t)
          return inClosedRange(t) || inEstRange(t)
        })
        list.sort((a, b) => (b.close_date || b.estimated_close_date || '').localeCompare(a.close_date || a.estimated_close_date || ''))
        list.forEach(t => {
          rows.push([
            t.street_address, t.city, t.mine.role,
            t.type, t.status,
            fmt$(t.sale_price), fmt$(t.mine.net),
            t.close_date || t.estimated_close_date || '—',
            t.lead_source || '—',
          ])
        })
        // Totals row
        if (list.length > 0) {
          rows.push([
            'TOTALS', list.length + ' deals', '', '', '',
            fmt$(list.reduce((s, t) => s + (t.sale_price || 0), 0)),
            fmt$(list.reduce((s, t) => s + t.mine.net, 0)),
            '', '',
          ])
        }
        break
      }

      case 'my_monthly_trend': {
        columns = ['Month', 'Closed Deals', 'Volume', 'Gross (Your Split)', 'Your Net']
        const map = {}
        closedInRange.forEach(t => {
          const mo = t.close_date.slice(0, 7)
          if (!map[mo]) map[mo] = { deals: 0, volume: 0, gross: 0, net: 0 }
          map[mo].deals++
          map[mo].volume += (t.sale_price || 0)
          map[mo].gross += t.mine.gross
          map[mo].net += t.mine.net
        })
        rows = Object.entries(map).sort().map(([mo, r]) => {
          const [y, m] = mo.split('-')
          return [moNames[parseInt(m) - 1] + ' ' + y, r.deals, fmt$(r.volume), fmt$(r.gross), fmt$(r.net)]
        })
        if (rows.length > 0) {
          const totals = Object.values(map).reduce((a, r) => ({
            deals: a.deals + r.deals, volume: a.volume + r.volume, gross: a.gross + r.gross, net: a.net + r.net,
          }), { deals: 0, volume: 0, gross: 0, net: 0 })
          rows.push(['TOTAL', totals.deals, fmt$(totals.volume), fmt$(totals.gross), fmt$(totals.net)])
        }
        break
      }

      case 'my_pipeline': {
        columns = ['Est. Close', 'Address', 'City', 'Role', 'Status', 'Sale Price', 'Projected Gross', 'Projected Net', 'Lead Source']
        openInRange.forEach(t => {
          rows.push([
            t.estimated_close_date || '—', t.street_address, t.city, t.mine.role,
            t.status, fmt$(t.sale_price), fmt$(t.mine.gross), fmt$(t.mine.net),
            t.lead_source || '—',
          ])
        })
        rows.sort((a, b) => { if (a[0] === '—') return 1; if (b[0] === '—') return -1; return a[0].localeCompare(b[0]) })
        if (openInRange.length > 0) {
          rows.push([
            'TOTAL', openInRange.length + ' deals', '', '', '',
            fmt$(openInRange.reduce((s, t) => s + (t.sale_price || 0), 0)),
            fmt$(openInRange.reduce((s, t) => s + t.mine.gross, 0)),
            fmt$(openInRange.reduce((s, t) => s + t.mine.net, 0)),
            '',
          ])
        }
        break
      }

      case 'my_projected_income': {
        columns = ['Month', 'Open Deals', 'Projected Volume', 'Projected Gross', 'Projected Net']
        const map = {}
        openInRange.forEach(t => {
          const mo = t.estimated_close_date.slice(0, 7)
          if (!map[mo]) map[mo] = { deals: 0, volume: 0, gross: 0, net: 0 }
          map[mo].deals++
          map[mo].volume += (t.sale_price || 0)
          map[mo].gross += t.mine.gross
          map[mo].net += t.mine.net
        })
        rows = Object.entries(map).sort().map(([mo, r]) => {
          const [y, m] = mo.split('-')
          return [moNames[parseInt(m) - 1] + ' ' + y, r.deals, fmt$(r.volume), fmt$(r.gross), fmt$(r.net)]
        })
        if (rows.length > 0) {
          const totals = Object.values(map).reduce((a, r) => ({
            deals: a.deals + r.deals, volume: a.volume + r.volume, gross: a.gross + r.gross, net: a.net + r.net,
          }), { deals: 0, volume: 0, gross: 0, net: 0 })
          rows.push(['TOTAL', totals.deals, fmt$(totals.volume), fmt$(totals.gross), fmt$(totals.net)])
        }
        break
      }
    }

    setReportData({ columns, rows, total: rows.length })
    setLoading(false)
  }

  function exportCSV() {
    if (!reportData) return
    const csv = [reportData.columns, ...reportData.rows]
      .map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))
      .join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = (activeReport?.name || 'report') + '.csv'
    a.click()
  }

  function printReport() {
    if (!reportData) return
    const name = activeReport?.name || 'Report'
    const agentName = (profile?.first_name || '') + ' ' + (profile?.last_name || '')
    const tHead = reportData.columns.map(c => `<th style="background:#0f2744;color:#fff;padding:7px 10px;text-align:left;font-size:10px;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;">${c}</th>`).join('')
    const tBody = reportData.rows.map((row, i) => {
      const isTotal = String(row[0] || '').includes('TOTAL')
      return `<tr style="background:${isTotal ? '#fef3c7' : (i % 2 === 0 ? '#fff' : '#f8f7f4')};${isTotal ? 'font-weight:700;' : ''}">${row.map(v => `<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;">${v}</td>`).join('')}</tr>`
    }).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${name}</title><style>body{font-family:Segoe UI,system-ui,sans-serif;padding:24px;color:#1a1a1a;}table{width:100%;border-collapse:collapse;}@media print{.no-print{display:none!important;}}</style></head><body>
      <div style="display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:14px;border-bottom:3px solid #0f2744;">
        <div><div style="font-size:22px;font-weight:800;color:#0f2744;">Jewell Real Estate</div><div style="font-size:15px;font-weight:600;margin-top:3px;">${name}</div><div style="font-size:11px;color:#888;margin-top:2px;">For: ${agentName}</div></div>
        <div style="text-align:right;font-size:12px;color:#888;"><div>Generated: ${new Date().toLocaleDateString()}</div><div>Range: ${filters.dateFrom} → ${filters.dateTo}</div></div>
      </div>
      <table><thead><tr>${tHead}</tr></thead><tbody>${tBody}</tbody></table>
      <div class="no-print" style="text-align:center;margin-top:20px;"><button onclick="window.print()" style="background:#0f2744;color:#fff;border:none;padding:10px 24px;border-radius:6px;font-size:14px;cursor:pointer;">⎙ Print / Save as PDF</button></div>
    </body></html>`
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
  }

  // ── RUN VIEW ────────────────────────────────────────────────
  if (view === 'run') {
    const isPipelineReport = ['my_pipeline', 'my_projected_income'].includes(activeReport?.id)
    const isTransactionsReport = activeReport?.id === 'my_transactions'
    return (
      <div>
        <div className="back-btn" onClick={() => { setView('list'); setReportData(null) }}>← Back to Reports</div>
        <div className="sec-hdr">
          <div>
            <div className="sec-title">{activeReport?.name}</div>
            <div className="sec-sub">{reportData ? reportData.total + ' rows' : 'Loading…'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
              {isPipelineReport ? 'Est. Close:' : 'Close Date:'}
            </span>
            <select className="form-ctrl" value={filters.preset} onChange={e => applyPreset(e.target.value)} style={{ width: 160 }}>
              {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <input className="form-ctrl" type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value, preset: 'custom' }))} style={{ width: 140 }} />
            <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 12 }}>→</span>
            <input className="form-ctrl" type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value, preset: 'custom' }))} style={{ width: 140 }} />
            {isTransactionsReport && (
              <>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>Status:</span>
                <select className="form-ctrl" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} style={{ width: 130 }}>
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="closed">Closed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </>
            )}
            <button className="btn btn-navy btn-sm" onClick={() => runReport(activeReport.id, { ...filters })}>↻ Run</button>
            <button className="btn btn-ghost" onClick={exportCSV}>⬇ CSV</button>
            <button className="btn btn-ghost" onClick={printReport}>⎙ Print</button>
          </div>
        </div>

        {loading && <div className="loading"><div className="spinner"/>Running…</div>}
        {!loading && reportData && (
          <div className="card">
            <div className="tbl-wrap" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>{reportData.columns.map((c, i) => <th key={i}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {reportData.rows.length === 0 && (
                    <tr><td colSpan={reportData.columns.length} style={{ textAlign: 'center', color: 'var(--txt3)', padding: 30 }}>No data for the selected date range.</td></tr>
                  )}
                  {reportData.rows.map((row, ri) => {
                    const isTotal = String(row[0] || '').includes('TOTAL')
                    return (
                      <tr key={ri} style={isTotal ? { background: 'var(--gold-pale)', fontWeight: 700 } : {}}>
                        {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── LIST VIEW ───────────────────────────────────────────────
  return (
    <div>
      <div className="sec-hdr">
        <div>
          <div className="sec-title">My Reports</div>
          <div className="sec-sub">Production, pipeline, and cap progress for your own deals</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {AGENT_REPORTS.map(r => (
          <div key={r.id} className="card" style={{ cursor: 'pointer' }}
            onClick={() => runReport(r.id)}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.12)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = ''}>
            <div className="card-body" style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>{r.icon}</div>
              <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 13, marginBottom: 4 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{r.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
