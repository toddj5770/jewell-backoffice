import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt$, statusBadge } from '../../lib/commission'

// ── Built-in report definitions ──────────────────────────────
const BUILTIN_REPORTS = [
  { id: 'gci_by_agent',       name: 'GCI by Agent',              icon: '👤', desc: 'Gross commission income per agent for a period' },
  { id: 'cap_progress',       name: 'Cap Progress',              icon: '🎯', desc: 'Cap status for all agents on cap plans' },
  { id: 'transaction_summary',name: 'Transaction Summary',       icon: '🏠', desc: 'All transactions with status, price, and GCI' },
  { id: 'lead_source',        name: 'Lead Source Attribution',   icon: '📊', desc: 'GCI and deal count by lead source' },
  { id: 'agent_production',   name: 'Agent Production Ranking',  icon: '🏆', desc: 'Agents ranked by volume and GCI' },
  { id: 'monthly_trend',      name: 'Monthly Trend',             icon: '📈', desc: 'GCI and deal count by month' },
  { id: 'disbursement_summary',name: 'Disbursement Summary',     icon: '💰', desc: 'Paid vs pending disbursements' },
  { id: 'pending_income',      name: 'Pending Income by Agent',   icon: '⏳', desc: 'Projected agent & office income from open deals' },
  { id: 'office_pipeline',     name: 'Office Pipeline',           icon: '🔄', desc: 'All open deals sorted by expected close date with full commission breakdown' },
  { id: 'projected_by_month',  name: 'Projected Income by Month', icon: '📅', desc: 'Anticipated GCI and agent/broker net grouped by estimated close month' },
]

const COLUMN_OPTIONS = {
  transactions: [
    { key: 'street_address', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'type', label: 'Type' },
    { key: 'status', label: 'Status' },
    { key: 'sale_price', label: 'Sale Price', fmt: 'currency' },
    { key: 'selling_commission_pct', label: 'Comm %' },
    { key: 'gci', label: 'GCI', fmt: 'currency', computed: true },
    { key: 'lead_source', label: 'Lead Source' },
    { key: 'close_date', label: 'Close Date' },
    { key: 'estimated_close_date', label: 'Est. Close' },
    { key: 'contract_acceptance_date', label: 'Contract Date' },
    { key: 'mls_number', label: 'MLS #' },
    { key: 'mortgage_company', label: 'Mortgage Co.' },
    { key: 'agent_name', label: 'Agent', computed: true },
  ],
  agents: [
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'office', label: 'Office' },
    { key: 'status', label: 'Status' },
    { key: 'license_expiration', label: 'License Exp' },
    { key: 'start_date', label: 'Start Date' },
    { key: 'plan_name', label: 'Plan', computed: true },
  ],
}

export default function Reports() {
  const [view, setView] = useState('list') // list | run | builder | edit
  const [activeReport, setActiveReport] = useState(null)
  const [savedReports, setSavedReports] = useState([])
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [allData, setAllData] = useState(null)

  // Filters
  const [filters, setFilters] = useState({
    dateFrom: new Date().getFullYear() + '-01-01',
    dateTo: new Date().toISOString().slice(0, 10),
    agentId: '',
    status: '',
    leadSource: '',
    office: '',
  })

  // Custom report builder state
  const [builder, setBuilder] = useState({
    name: '',
    source: 'transactions',
    columns: ['street_address', 'close_date', 'sale_price', 'gci', 'agent_name', 'status'],
    filters: { dateFrom: '', dateTo: '', status: '', agentId: '' },
    groupBy: '',
    sortBy: 'close_date',
    sortDir: 'desc',
  })

  useEffect(() => {
    loadSavedReports()
    loadAllData()
  }, [])

  async function loadSavedReports() {
    // Store custom reports in settings table as JSON
    const { data } = await supabase.from('settings').select('id, custom_reports').single()
    if (data?.custom_reports) setSavedReports(data.custom_reports)
  }

  async function loadAllData() {
    const [txnRes, agentRes, planRes] = await Promise.all([
      supabase.from('transactions').select('*, transaction_agents(*, agents(first_name, last_name), plans(*))'),
      supabase.from('agents').select('*, plans(name, type, cap_amount)'),
      supabase.from('plans').select('*'),
    ])
    setAllData({
      transactions: txnRes.data || [],
      agents: agentRes.data || [],
      plans: planRes.data || [],
    })
  }

  async function saveCustomReport(report) {
    const { data } = await supabase.from('settings').select('id, custom_reports').single()
    const existing = data?.custom_reports || []
    const updated = report.id
      ? existing.map(r => r.id === report.id ? report : r)
      : [...existing, { ...report, id: 'cr_' + Date.now() }]
    await supabase.from('settings').update({ custom_reports: updated }).eq('id', data.id)
    setSavedReports(updated)
  }

  async function deleteCustomReport(id) {
    if (!window.confirm('Delete this report?')) return
    const { data } = await supabase.from('settings').select('id, custom_reports').single()
    const updated = (data?.custom_reports || []).filter(r => r.id !== id)
    await supabase.from('settings').update({ custom_reports: updated }).eq('id', data.id)
    setSavedReports(updated)
  }

  function runBuiltinReport(reportId) {
    setActiveReport({ id: reportId, builtin: true })
    setView('run')
    generateBuiltinReport(reportId)
  }

  function runCustomReport(report) {
    setActiveReport(report)
    setView('run')
    generateCustomReport(report)
  }

  function generateBuiltinReport(reportId) {
    if (!allData) return
    setLoading(true)
    const { transactions, agents } = allData

    const thisYear = new Date().getFullYear()
    const filtered = transactions.filter(t => {
      const date = t.close_date || t.estimated_close_date
      if (!date) return false
      const d = new Date(date)
      return d >= new Date(filters.dateFrom) && d <= new Date(filters.dateTo)
    })

    let data = []
    let columns = []

    switch (reportId) {
      case 'gci_by_agent': {
        columns = ['Agent', 'Office', 'Deals', 'Total Volume', 'Total GCI', 'Avg GCI/Deal']
        const map = {}
        filtered.filter(t => t.status === 'closed').forEach(t => {
          ;(t.transaction_agents || []).forEach(ta => {
            const a = ta.agents
            if (!a) return
            const key = ta.agent_id
            const gci = (t.sale_price || 0) * ((t.selling_commission_pct || 0) / 100) * (ta.split_value / 100)
            if (!map[key]) map[key] = { name: a.first_name + ' ' + a.last_name, office: agents.find(ag=>ag.id===ta.agent_id)?.office||'—', deals: 0, volume: 0, gci: 0 }
            map[key].deals++
            map[key].volume += (t.sale_price || 0) * ((ta.volume_pct || 100) / 100)
            map[key].gci += gci
          })
        })
        data = Object.values(map).sort((a, b) => b.gci - a.gci).map(r => [
          r.name, r.office, r.deals, fmt$(r.volume), fmt$(r.gci), fmt$(r.deals ? r.gci / r.deals : 0)
        ])
        break
      }
      case 'cap_progress': {
        columns = ['Agent', 'Plan', 'Cap Amount', 'Broker Paid YTD', 'Remaining', 'Progress', 'Status']
        const capAgents = agents.filter(a => a.plans?.type === 'cap' && a.status === 'active')
        capAgents.forEach(a => {
          const cap = a.plans.cap_amount || 0
          const paid = transactions
            .filter(t => t.status === 'closed' && t.close_date && new Date(t.close_date).getFullYear() === thisYear)
            .flatMap(t => t.transaction_agents || [])
            .filter(ta => ta.agent_id === a.id)
            .reduce((s, ta) => s + (ta.locked_broker_net || 0), 0)
          const pct = cap ? Math.min(100, Math.round(paid / cap * 100)) : 0
          data.push([
            a.first_name + ' ' + a.last_name,
            a.plans.name,
            fmt$(cap),
            fmt$(Math.min(paid, cap)),
            fmt$(Math.max(0, cap - paid)),
            pct + '%',
            paid >= cap ? '🎯 Capped' : pct >= 75 ? '🔥 Near cap' : 'In progress'
          ])
        })
        break
      }
      case 'transaction_summary': {
        columns = ['Address', 'City', 'Type', 'Status', 'Sale Price', 'GCI', 'Agent(s)', 'Close Date', 'Lead Source']
        filtered.forEach(t => {
          const gci = (t.sale_price || 0) * ((t.selling_commission_pct || 0) / 100)
          const agentNames = (t.transaction_agents || []).map(ta => ta.agents ? ta.agents.first_name + ' ' + ta.agents.last_name : '').filter(Boolean).join(', ')
          data.push([t.street_address, t.city, t.type, t.status, fmt$(t.sale_price), fmt$(gci), agentNames, t.close_date || '—', t.lead_source || '—'])
        })
        break
      }
      case 'lead_source': {
        columns = ['Lead Source', 'Deals', 'Total GCI', 'Avg GCI', '% of Total']
        const map = {}
        filtered.filter(t => t.status === 'closed').forEach(t => {
          const src = t.lead_source || 'Unknown'
          const gci = (t.sale_price || 0) * ((t.selling_commission_pct || 0) / 100)
          if (!map[src]) map[src] = { deals: 0, gci: 0 }
          map[src].deals++
          map[src].gci += gci
        })
        const totalGci = Object.values(map).reduce((s, r) => s + r.gci, 0)
        data = Object.entries(map).sort((a, b) => b[1].gci - a[1].gci).map(([src, r]) => [
          src, r.deals, fmt$(r.gci), fmt$(r.deals ? r.gci / r.deals : 0), totalGci ? Math.round(r.gci / totalGci * 100) + '%' : '0%'
        ])
        break
      }
      case 'agent_production': {
        columns = ['Rank', 'Agent', 'Office', 'Closed Deals', 'Total Volume', 'Total GCI', 'Avg Sale Price']
        const map = {}
        filtered.filter(t => t.status === 'closed').forEach(t => {
          ;(t.transaction_agents || []).forEach(ta => {
            const a = ta.agents; if (!a) return
            const key = ta.agent_id
            if (!map[key]) map[key] = { name: a.first_name + ' ' + a.last_name, office: agents.find(ag=>ag.id===ta.agent_id)?.office||'—', deals: 0, volume: 0, gci: 0 }
            map[key].deals++
            map[key].volume += (t.sale_price || 0)
            map[key].gci += (t.sale_price || 0) * ((t.selling_commission_pct || 0) / 100) * (ta.split_value / 100)
          })
        })
        data = Object.values(map).sort((a, b) => b.gci - a.gci).map((r, i) => [
          '#' + (i + 1), r.name, r.office, r.deals, fmt$(r.volume), fmt$(r.gci), fmt$(r.deals ? r.volume / r.deals : 0)
        ])
        break
      }
      case 'monthly_trend': {
        columns = ['Month', 'Closed Deals', 'Total Volume', 'Total GCI', 'Avg Sale Price']
        const map = {}
        transactions.filter(t => t.status === 'closed' && t.close_date && new Date(t.close_date).getFullYear() === thisYear).forEach(t => {
          const mo = t.close_date.slice(0, 7)
          if (!map[mo]) map[mo] = { deals: 0, volume: 0, gci: 0 }
          map[mo].deals++
          map[mo].volume += (t.sale_price || 0)
          map[mo].gci += (t.sale_price || 0) * ((t.selling_commission_pct || 0) / 100)
        })
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        data = Object.entries(map).sort().map(([mo, r]) => {
          const [y, m] = mo.split('-')
          return [months[parseInt(m) - 1] + ' ' + y, r.deals, fmt$(r.volume), fmt$(r.gci), fmt$(r.deals ? r.volume / r.deals : 0)]
        })
        break
      }
      case 'disbursement_summary': {
        columns = ['Address', 'Agent', 'Agent Net', 'Close Date', 'Payment Status']
        const { data: disbData } = { data: [] } // will load separately
        filtered.filter(t => t.status === 'closed').forEach(t => {
          ;(t.transaction_agents || []).forEach(ta => {
            const a = ta.agents; if (!a) return
            const agentNet = ta.locked_agent_net || 0
            data.push([t.street_address + ', ' + t.city, a.first_name + ' ' + a.last_name, fmt$(agentNet), t.close_date || '—', '—'])
          })
        })
        break
      }

      case 'pending_income': {
        columns = ['Agent', 'Office', 'Address', 'Status', 'Sale Price', 'Est. Close', 'Proj. Gross', 'Agent Net', 'Broker Net', 'Plan']
        const openTxns = transactions.filter(t => t.status === 'active' || t.status === 'pending')
        openTxns.forEach(t => {
          const gross = (t.sale_price || 0) * ((t.selling_commission_pct || 0) / 100)
          ;(t.transaction_agents || []).forEach(ta => {
            const a = ta.agents; if (!a) return
            const agentObj = agents.find(ag => ag.id === ta.agent_id)
            const plan = ta.plans || agentObj?.plans
            const agentSplit = ta.split_type === 'dollar' ? ta.split_value : gross * ((ta.split_value || 100) / 100)
            const agentPct = plan?.type === 'cap' ? (plan.cap_levels?.[0]?.pct || 90) : (plan?.agent_pct || 80)
            const agentNet = agentSplit * (agentPct / 100)
            const brokerNet = agentSplit - agentNet
            data.push([
              a.first_name + ' ' + a.last_name,
              agentObj?.office || '—',
              t.street_address + ', ' + t.city,
              t.status.charAt(0).toUpperCase() + t.status.slice(1),
              fmt$(t.sale_price),
              t.estimated_close_date || '—',
              fmt$(agentSplit),
              fmt$(agentNet),
              fmt$(brokerNet),
              plan?.name || '—'
            ])
          })
        })
        data.sort((a, b) => {
          if (a[5] === '—') return 1
          if (b[5] === '—') return -1
          return a[5].localeCompare(b[5])
        })
        break
      }

      case 'office_pipeline': {
        columns = ['Est. Close', 'Address', 'City', 'Status', 'Sale Price', 'Gross Comm', 'Agent(s)', 'Total Agent Net', 'Office Net', 'Lead Source']
        const openTxns2 = transactions.filter(t => t.status === 'active' || t.status === 'pending')
        openTxns2.forEach(t => {
          const gross = (t.sale_price || 0) * ((t.selling_commission_pct || 0) / 100)
          let totalAgentNet = 0, totalBrokerNet = 0
          const agentNames = []
          ;(t.transaction_agents || []).forEach(ta => {
            const a = ta.agents; if (!a) return
            agentNames.push(a.first_name + ' ' + a.last_name)
            const agentObj = agents.find(ag => ag.id === ta.agent_id)
            const plan = ta.plans || agentObj?.plans
            const agentSplit = ta.split_type === 'dollar' ? ta.split_value : gross * ((ta.split_value || 100) / 100)
            const agentPct = plan?.type === 'cap' ? (plan.cap_levels?.[0]?.pct || 90) : (plan?.agent_pct || 80)
            totalAgentNet += agentSplit * (agentPct / 100)
            totalBrokerNet += agentSplit * ((100 - agentPct) / 100)
          })
          data.push([
            t.estimated_close_date || '—',
            t.street_address,
            t.city,
            t.status.charAt(0).toUpperCase() + t.status.slice(1),
            fmt$(t.sale_price),
            fmt$(gross),
            agentNames.join(', ') || '—',
            fmt$(totalAgentNet),
            fmt$(totalBrokerNet),
            t.lead_source || '—'
          ])
        })
        data.sort((a, b) => {
          if (a[0] === '—') return 1
          if (b[0] === '—') return -1
          return a[0].localeCompare(b[0])
        })
        // Add totals row
        const totGross = openTxns2.reduce((s,t) => s + (t.sale_price||0)*((t.selling_commission_pct||0)/100), 0)
        data.push(['', 'TOTALS (' + openTxns2.length + ' deals)', '', '', fmt$(openTxns2.reduce((s,t)=>s+(t.sale_price||0),0)), fmt$(totGross), '', '', '', ''])
        break
      }

      case 'projected_by_month': {
        columns = ['Month', 'Open Deals', 'Proj. Gross GCI', 'Proj. Agent Net', 'Proj. Office Net', 'Avg Deal Size']
        const openTxns3 = transactions.filter(t => (t.status === 'active' || t.status === 'pending') && t.estimated_close_date)
        const monthMap = {}
        openTxns3.forEach(t => {
          const mo = t.estimated_close_date.slice(0, 7)
          const gross = (t.sale_price || 0) * ((t.selling_commission_pct || 0) / 100)
          let agentNet = 0, brokerNet = 0
          ;(t.transaction_agents || []).forEach(ta => {
            const agentObj = agents.find(ag => ag.id === ta.agent_id)
            const plan = ta.plans || agentObj?.plans
            const agentSplit = ta.split_type === 'dollar' ? ta.split_value : gross * ((ta.split_value || 100) / 100)
            const agentPct = plan?.type === 'cap' ? (plan.cap_levels?.[0]?.pct || 90) : (plan?.agent_pct || 80)
            agentNet += agentSplit * (agentPct / 100)
            brokerNet += agentSplit * ((100 - agentPct) / 100)
          })
          if (!monthMap[mo]) monthMap[mo] = { deals: 0, volume: 0, gross: 0, agentNet: 0, brokerNet: 0 }
          monthMap[mo].deals++
          monthMap[mo].volume += (t.sale_price || 0)
          monthMap[mo].gross += gross
          monthMap[mo].agentNet += agentNet
          monthMap[mo].brokerNet += brokerNet
        })
        const moNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        data = Object.entries(monthMap).sort().map(([mo, r]) => {
          const [y, m] = mo.split('-')
          return [moNames[parseInt(m)-1] + ' ' + y, r.deals, fmt$(r.gross), fmt$(r.agentNet), fmt$(r.brokerNet), fmt$(r.deals ? r.volume/r.deals : 0)]
        })
        // Totals
        const allMonths = Object.values(monthMap)
        data.push(['TOTAL', openTxns3.length, fmt$(allMonths.reduce((s,r)=>s+r.gross,0)), fmt$(allMonths.reduce((s,r)=>s+r.agentNet,0)), fmt$(allMonths.reduce((s,r)=>s+r.brokerNet,0)), ''])
        break
      }
    }

    setReportData({ columns, rows: data })
    setLoading(false)
  }

  function generateCustomReport(report) {
    if (!allData) return
    setLoading(true)
    const { transactions, agents } = allData
    const cols = COLUMN_OPTIONS[report.source] || []

    let rows = report.source === 'transactions' ? transactions : agents

    // Apply filters
    if (report.filters?.dateFrom) rows = rows.filter(r => (r.close_date || r.estimated_close_date || '') >= report.filters.dateFrom)
    if (report.filters?.dateTo) rows = rows.filter(r => (r.close_date || r.estimated_close_date || '') <= report.filters.dateTo)
    if (report.filters?.status) rows = rows.filter(r => r.status === report.filters.status)
    if (report.filters?.agentId && report.source === 'transactions') {
      rows = rows.filter(r => (r.transaction_agents || []).some(ta => ta.agent_id === report.filters.agentId))
    }

    // Compute derived fields
    rows = rows.map(r => ({
      ...r,
      gci: (r.sale_price || 0) * ((r.selling_commission_pct || 0) / 100),
      agent_name: (r.transaction_agents || []).map(ta => ta.agents ? ta.agents.first_name + ' ' + ta.agents.last_name : '').filter(Boolean).join(', '),
      plan_name: r.plans?.name || agents.find(a=>a.id===r.id)?.plans?.name || '—',
    }))

    // Sort
    if (report.sortBy) {
      rows = [...rows].sort((a, b) => {
        const av = a[report.sortBy] || '', bv = b[report.sortBy] || ''
        const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
        return report.sortDir === 'desc' ? -cmp : cmp
      })
    }

    const selectedCols = report.columns.map(key => cols.find(c => c.key === key)).filter(Boolean)
    const data = rows.map(r => selectedCols.map(c => {
      const val = r[c.key]
      if (c.fmt === 'currency') return fmt$(val)
      return val ?? '—'
    }))

    setReportData({ columns: selectedCols.map(c => c.label), rows: data })
    setLoading(false)
  }

  function exportCSV() {
    if (!reportData) return
    const rows = [reportData.columns, ...reportData.rows]
    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (activeReport?.name || 'report') + '.csv'
    a.click()
  }

  function printReport() {
    if (!reportData) return
    const reportName = activeReport?.builtin
      ? BUILTIN_REPORTS.find(r => r.id === activeReport.id)?.name
      : activeReport?.name
    const tableHtml = `
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr>${reportData.columns.map(c => `<th style="background:#0f2744;color:#fff;padding:8px 10px;text-align:left;font-size:10px;letter-spacing:.04em;text-transform:uppercase;">${c}</th>`).join('')}</tr></thead>
        <tbody>${reportData.rows.map((row, i) => `<tr style="background:${i%2===0?'#fff':'#f8f8f8'}">${row.map(v => `<td style="padding:7px 10px;border-bottom:1px solid #eee;">${v}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${reportName}</title>
      <style>body{font-family:Segoe UI,system-ui,sans-serif;padding:32px;color:#1a1a1a;}@media print{.no-print{display:none!important;}}</style>
      </head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:3px solid #0f2744;">
        <div><div style="font-size:22px;font-weight:800;color:#0f2744;">Jewell Real Estate</div><div style="font-size:14px;font-weight:600;margin-top:4px;">${reportName}</div></div>
        <div style="text-align:right;font-size:12px;color:#888;"><div>Generated: ${new Date().toLocaleDateString()}</div><div>${reportData.rows.length} records</div></div>
      </div>
      ${tableHtml}
      <div class="no-print" style="text-align:center;margin-top:24px;"><button onclick="window.print()" style="background:#0f2744;color:#fff;border:none;padding:10px 24px;border-radius:6px;font-size:14px;cursor:pointer;">⎙ Print / Save as PDF</button></div>
      </body></html>`
    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
  }

  // ── RENDER ─────────────────────────────────────────────────
  if (view === 'run' && activeReport) {
    const reportName = activeReport.builtin
      ? BUILTIN_REPORTS.find(r => r.id === activeReport.id)?.name
      : activeReport.name

    return (
      <div>
        <div className="back-btn" onClick={() => { setView('list'); setReportData(null) }}>← Back to Reports</div>
        <div className="sec-hdr">
          <div>
            <div className="sec-title">{reportName}</div>
            <div className="sec-sub">{reportData ? reportData.rows.length + ' records' : 'Loading…'}</div>
          </div>
          <div style={{display:'flex',gap:8}}>
            {activeReport.builtin && (
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <input className="form-ctrl" type="date" value={filters.dateFrom} onChange={e=>setFilters(f=>({...f,dateFrom:e.target.value}))} style={{width:140}}/>
                <span style={{color:'var(--txt3)'}}>to</span>
                <input className="form-ctrl" type="date" value={filters.dateTo} onChange={e=>setFilters(f=>({...f,dateTo:e.target.value}))} style={{width:140}}/>
                <button className="btn btn-navy btn-sm" onClick={()=>generateBuiltinReport(activeReport.id)}>Run</button>
              </div>
            )}
            <button className="btn btn-ghost" onClick={exportCSV}>⬇ CSV</button>
            <button className="btn btn-ghost" onClick={printReport}>⎙ Print</button>
          </div>
        </div>

        {loading && <div className="loading"><div className="spinner"/>Running report…</div>}
        {!loading && reportData && (
          <div className="card">
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>{reportData.columns.map((c,i) => <th key={i}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {reportData.rows.length === 0 && (
                    <tr><td colSpan={reportData.columns.length} style={{textAlign:'center',color:'var(--txt3)',padding:30}}>No data for this date range.</td></tr>
                  )}
                  {reportData.rows.map((row, ri) => (
                    <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (view === 'builder' || view === 'edit') {
    const sourceCols = COLUMN_OPTIONS[builder.source] || []
    return (
      <div>
        <div className="back-btn" onClick={() => setView('list')}>← Back to Reports</div>
        <div className="sec-hdr">
          <div><div className="sec-title">{view === 'edit' ? 'Edit Report' : 'New Custom Report'}</div></div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-ghost" onClick={() => setView('list')}>Cancel</button>
            <button className="btn btn-ghost" onClick={() => { runCustomReport(builder); }}>▶ Preview</button>
            <button className="btn btn-gold" onClick={async () => { await saveCustomReport(builder); setView('list') }}>Save Report</button>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}>
          <div className="card">
            <div className="card-hdr"><span className="card-title">Report Settings</span></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Report Name <span className="req">*</span></label>
                <input className="form-ctrl" value={builder.name} placeholder="e.g. My Agent GCI Q1" onChange={e=>setBuilder(b=>({...b,name:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label className="form-label">Data Source</label>
                <select className="form-ctrl" value={builder.source} onChange={e=>setBuilder(b=>({...b,source:e.target.value,columns:[]}))}>
                  <option value="transactions">Transactions</option>
                  <option value="agents">Agents</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Sort By</label>
                <div style={{display:'flex',gap:8}}>
                  <select className="form-ctrl" value={builder.sortBy} onChange={e=>setBuilder(b=>({...b,sortBy:e.target.value}))}>
                    {sourceCols.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  <select className="form-ctrl" style={{width:120}} value={builder.sortDir} onChange={e=>setBuilder(b=>({...b,sortDir:e.target.value}))}>
                    <option value="asc">A→Z / Low→High</option>
                    <option value="desc">Z→A / High→Low</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-hdr"><span className="card-title">Filters</span></div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-group"><label className="form-label">Date From</label><input className="form-ctrl" type="date" value={builder.filters.dateFrom} onChange={e=>setBuilder(b=>({...b,filters:{...b.filters,dateFrom:e.target.value}}))}/></div>
                <div className="form-group"><label className="form-label">Date To</label><input className="form-ctrl" type="date" value={builder.filters.dateTo} onChange={e=>setBuilder(b=>({...b,filters:{...b.filters,dateTo:e.target.value}}))}/></div>
              </div>
              {builder.source === 'transactions' && (
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-ctrl" value={builder.filters.status} onChange={e=>setBuilder(b=>({...b,filters:{...b.filters,status:e.target.value}}))}>
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="closed">Closed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card" style={{marginTop:18}}>
          <div className="card-hdr"><span className="card-title">Columns</span><span style={{fontSize:11,color:'var(--txt3)'}}>Select and order the columns to display</span></div>
          <div className="card-body">
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {sourceCols.map(col => (
                <label key={col.key} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:builder.columns.includes(col.key)?'var(--teal-lt)':'var(--surf)',borderRadius:'var(--r)',border:`1px solid ${builder.columns.includes(col.key)?'var(--teal)':'var(--bdr)'}`,cursor:'pointer',fontSize:12}}>
                  <input type="checkbox" checked={builder.columns.includes(col.key)}
                    onChange={e=>{
                      if(e.target.checked) setBuilder(b=>({...b,columns:[...b.columns,col.key]}))
                      else setBuilder(b=>({...b,columns:b.columns.filter(c=>c!==col.key)}))
                    }}/>
                  {col.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── REPORT LIST ─────────────────────────────────────────────
  return (
    <div>
      <div className="sec-hdr">
        <div><div className="sec-title">Reports</div><div className="sec-sub">Built-in and custom reports</div></div>
        <button className="btn btn-gold" onClick={()=>{setBuilder({name:'',source:'transactions',columns:['street_address','close_date','sale_price','gci','agent_name','status'],filters:{dateFrom:'',dateTo:'',status:'',agentId:''},sortBy:'close_date',sortDir:'desc'});setView('builder')}}>+ New Custom Report</button>
      </div>

      {/* Built-in reports */}
      <div style={{marginBottom:8,fontSize:11,fontWeight:700,color:'var(--txt3)',letterSpacing:'.06em',textTransform:'uppercase'}}>Built-In Reports</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:28}}>
        {BUILTIN_REPORTS.map(r => (
          <div key={r.id} className="card" style={{cursor:'pointer',transition:'box-shadow .12s'}}
            onClick={()=>runBuiltinReport(r.id)}
            onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.12)'}
            onMouseLeave={e=>e.currentTarget.style.boxShadow=''}>
            <div className="card-body" style={{padding:'16px 18px'}}>
              <div style={{fontSize:24,marginBottom:8}}>{r.icon}</div>
              <div style={{fontWeight:700,color:'var(--navy)',marginBottom:4}}>{r.name}</div>
              <div style={{fontSize:11,color:'var(--txt3)'}}>{r.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Saved custom reports */}
      <div style={{marginBottom:8,fontSize:11,fontWeight:700,color:'var(--txt3)',letterSpacing:'.06em',textTransform:'uppercase'}}>My Custom Reports</div>
      {savedReports.length === 0 && (
        <div style={{padding:'24px',background:'var(--white)',borderRadius:'var(--rl)',border:'1px dashed var(--bdr)',textAlign:'center',color:'var(--txt3)',fontSize:13}}>
          No custom reports yet. Click <strong>+ New Custom Report</strong> to build one.
        </div>
      )}
      {savedReports.length > 0 && (
        <div className="card">
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Report Name</th><th>Source</th><th>Columns</th><th></th></tr></thead>
              <tbody>
                {savedReports.map(r => (
                  <tr key={r.id}>
                    <td style={{fontWeight:600}}>{r.name}</td>
                    <td style={{textTransform:'capitalize'}}>{r.source}</td>
                    <td style={{fontSize:11,color:'var(--txt3)'}}>{r.columns.length} columns</td>
                    <td>
                      <div style={{display:'flex',gap:6}}>
                        <button className="btn btn-teal btn-sm" onClick={()=>runCustomReport(r)}>▶ Run</button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>{setBuilder(r);setView('edit')}}>✏ Edit</button>
                        <button className="btn btn-ghost btn-sm" style={{color:'var(--red)'}} onClick={()=>deleteCustomReport(r.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
