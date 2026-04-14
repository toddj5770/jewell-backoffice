import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt$ } from '../../lib/commission'

// ── All available fields per source ─────────────────────────
const FIELDS = {
  transactions: [
    { key: 'street_address',          label: 'Address',           type: 'text' },
    { key: 'city',                    label: 'City',              type: 'text' },
    { key: 'state',                   label: 'State',             type: 'text' },
    { key: 'zip',                     label: 'ZIP',               type: 'text' },
    { key: 'type',                    label: 'Type',              type: 'select', options: ['selling','listing','dual','rental','referral'] },
    { key: 'status',                  label: 'Status',            type: 'select', options: ['active','pending','closed','cancelled'] },
    { key: 'sale_price',              label: 'Sale Price',        type: 'number', fmt: 'currency' },
    { key: 'selling_commission_pct',  label: 'Commission %',      type: 'number' },
    { key: 'gross_commission',        label: 'Gross Commission',  type: 'number', fmt: 'currency', computed: true },
    { key: 'agent_net',               label: 'Agent Net',         type: 'number', fmt: 'currency', computed: true },
    { key: 'office_split',            label: 'Office Split',      type: 'number', fmt: 'currency', computed: true },
    { key: 'admin_fee_collected',     label: 'Admin Fee',         type: 'number', fmt: 'currency', computed: true },
    { key: 'total_office_income',     label: 'Total Office Income', type: 'number', fmt: 'currency', computed: true },
    { key: 'lead_source',             label: 'Lead Source',       type: 'text' },
    { key: 'close_date',              label: 'Close Date',        type: 'date' },
    { key: 'estimated_close_date',    label: 'Est. Close Date',   type: 'date' },
    { key: 'contract_acceptance_date',label: 'Contract Date',     type: 'date' },
    { key: 'mls_number',              label: 'MLS #',             type: 'text' },
    { key: 'mortgage_company',        label: 'Mortgage Co.',      type: 'text' },
    { key: 'agent_names',             label: 'Agent(s)',          type: 'text', computed: true },
    { key: 'primary_agent',           label: 'Primary Agent',     type: 'text', computed: true },
    { key: 'agent_split_pct',         label: 'Agent Split %',     type: 'number', computed: true },
    { key: 'volume_credit',           label: 'Volume Credit',     type: 'number', fmt: 'currency', computed: true },
    { key: 'admin_fee_payer',         label: 'Admin Fee Payer',   type: 'text' },
    { key: 'property_type',           label: 'Property Type',     type: 'text' },
    { key: 'co_broke_company',        label: 'Co-Broke Company',  type: 'text' },
  ],
  agents: [
    { key: 'first_name',          label: 'First Name',      type: 'text' },
    { key: 'last_name',           label: 'Last Name',       type: 'text' },
    { key: 'email',               label: 'Email',           type: 'text' },
    { key: 'phone_mobile',        label: 'Phone',           type: 'text' },
    { key: 'office',              label: 'Office',          type: 'text' },
    { key: 'status',              label: 'Status',          type: 'select', options: ['active','inactive','archived'] },
    { key: 'start_date',          label: 'Start Date',      type: 'date' },
    { key: 'license_number',      label: 'License #',       type: 'text' },
    { key: 'license_type',        label: 'License Type',    type: 'text' },
    { key: 'license_expiration',  label: 'License Exp',     type: 'date' },
    { key: 'eando_expiration',    label: 'E&O Exp',         type: 'date' },
    { key: 'plan_name',           label: 'Commission Plan', type: 'text', computed: true },
    { key: 'cap_amount',          label: 'Cap Amount',      type: 'number', fmt: 'currency', computed: true },
    { key: 'ytd_gci',             label: 'YTD GCI',         type: 'number', fmt: 'currency', computed: true },
    { key: 'ytd_deals',           label: 'YTD Deals',       type: 'number', computed: true },
    { key: 'broker_paid_ytd',     label: 'Broker Paid YTD', type: 'number', fmt: 'currency', computed: true },
    { key: 'cap_remaining',       label: 'Cap Remaining',   type: 'number', fmt: 'currency', computed: true },
    { key: 'w9_on_file',          label: 'W-9 On File',     type: 'text' },
    { key: 'mls_id',              label: 'MLS ID',          type: 'text' },
  ],
}

const FILTER_OPS = {
  text:   ['contains','equals','starts with','not empty','is empty'],
  number: ['equals','greater than','less than','between'],
  date:   ['equals','after','before','between','this year','this month'],
  select: ['equals','not equals'],
}

const GROUP_OPTIONS = {
  transactions: [
    { key: 'none',          label: 'No Grouping' },
    { key: 'agent',         label: 'By Agent' },
    { key: 'month',         label: 'By Month (Close Date)' },
    { key: 'est_month',     label: 'By Month (Est. Close)' },
    { key: 'status',        label: 'By Status' },
    { key: 'lead_source',   label: 'By Lead Source' },
    { key: 'office',        label: 'By Office' },
    { key: 'type',          label: 'By Transaction Type' },
    { key: 'property_type', label: 'By Property Type' },
  ],
  agents: [
    { key: 'none',   label: 'No Grouping' },
    { key: 'office', label: 'By Office' },
    { key: 'status', label: 'By Status' },
    { key: 'plan',   label: 'By Commission Plan' },
  ],
}

const BUILTIN_REPORTS = [
  { id: 'gci_by_agent',        name: 'GCI by Agent',               icon: '👤', desc: 'Gross commission income per agent' },
  { id: 'cap_progress',        name: 'Cap Progress',               icon: '🎯', desc: 'Cap status for all agents on cap plans' },
  { id: 'transaction_summary', name: 'Transaction Summary',        icon: '🏠', desc: 'All transactions with full commission detail' },
  { id: 'lead_source',         name: 'Lead Source Attribution',    icon: '📊', desc: 'GCI and deal count by lead source' },
  { id: 'agent_production',    name: 'Agent Production Ranking',   icon: '🏆', desc: 'Agents ranked by volume and GCI' },
  { id: 'monthly_trend',       name: 'Monthly Trend',              icon: '📈', desc: 'GCI and deal count by month (closed)' },
  { id: 'disbursement_summary',name: 'Disbursement Summary',       icon: '💰', desc: 'Agent and office income from closed deals' },
  { id: 'pending_income',      name: 'Pending Income by Agent',    icon: '⏳', desc: 'Projected income from open deals by agent' },
  { id: 'office_pipeline',     name: 'Office Pipeline',            icon: '🔄', desc: 'All open deals with full commission breakdown' },
  { id: 'projected_by_month',  name: 'Projected Income by Month',  icon: '📅', desc: 'Anticipated income grouped by estimated close month' },
  { id: 'trust_ledger',        name: 'Trust / Escrow Ledger',      icon: '🏦', desc: 'All escrow money held, released, and forfeited by transaction' },
  { id: 'agent_pipeline',      name: 'Agent Pipeline & Income',    icon: '👤📊', desc: 'Full pipeline and income report for a specific agent — open deals, closed income, cap progress' },
]

function getDatePreset(preset) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const pad = n => String(n).padStart(2,'0')
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
  switch(preset) {
    case 'this_month': {
      const from = new Date(y, m, 1)
      const to = new Date(y, m+1, 0)
      return { dateFrom: ymd(from), dateTo: ymd(to) }
    }
    case 'last_month': {
      const from = new Date(y, m-1, 1)
      const to = new Date(y, m, 0)
      return { dateFrom: ymd(from), dateTo: ymd(to) }
    }
    case 'next_month': {
      const from = new Date(y, m+1, 1)
      const to = new Date(y, m+2, 0)
      return { dateFrom: ymd(from), dateTo: ymd(to) }
    }
    case 'this_quarter': {
      const q = Math.floor(m/3)
      const from = new Date(y, q*3, 1)
      const to = new Date(y, q*3+3, 0)
      return { dateFrom: ymd(from), dateTo: ymd(to) }
    }
    case 'last_quarter': {
      const q = Math.floor(m/3) - 1
      const qy = q < 0 ? y-1 : y
      const qq = q < 0 ? 3 : q
      const from = new Date(qy, qq*3, 1)
      const to = new Date(qy, qq*3+3, 0)
      return { dateFrom: ymd(from), dateTo: ymd(to) }
    }
    case 'next_quarter': {
      const q = Math.floor(m/3) + 1
      const qy = q > 3 ? y+1 : y
      const qq = q > 3 ? 0 : q
      const from = new Date(qy, qq*3, 1)
      const to = new Date(qy, qq*3+3, 0)
      return { dateFrom: ymd(from), dateTo: ymd(to) }
    }
    case 'this_fy': {
      // Fiscal year Jan-Dec
      return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` }
    }
    case 'last_fy': {
      return { dateFrom: `${y-1}-01-01`, dateTo: `${y-1}-12-31` }
    }
    case 'ytd': {
      return { dateFrom: `${y}-01-01`, dateTo: ymd(now) }
    }
    case 'last_30': {
      const from = new Date(now); from.setDate(from.getDate()-30)
      return { dateFrom: ymd(from), dateTo: ymd(now) }
    }
    case 'last_90': {
      const from = new Date(now); from.setDate(from.getDate()-90)
      return { dateFrom: ymd(from), dateTo: ymd(now) }
    }
    case 'last_12m': {
      const from = new Date(now); from.setMonth(from.getMonth()-12)
      return { dateFrom: ymd(from), dateTo: ymd(now) }
    }
    default: return null
  }
}

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

function emptyReport() {
  return {
    id: null,
    name: '',
    source: 'transactions',
    columns: ['street_address','city','close_date','sale_price','gross_commission','agent_names','agent_net','total_office_income','status'],
    filters: [],
    groupBy: 'none',
    sortBy: 'close_date',
    sortDir: 'desc',
  }
}

function emptyFilter(source) {
  const first = FIELDS[source]?.[0]
  return { field: first?.key || '', op: 'contains', value: '', value2: '' }
}

export default function Reports() {
  const [view, setView] = useState('list')
  const [activeReport, setActiveReport] = useState(null)
  const [savedReports, setSavedReports] = useState([])
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [allData, setAllData] = useState(null)
  const [settingsId, setSettingsId] = useState(null)
  const [report, setReport] = useState(emptyReport())
  const [builtinFilters, setBuiltinFilters] = useState({
    dateFrom: new Date().getFullYear() + '-01-01',
    dateTo: new Date().toISOString().slice(0, 10),
    preset: 'ytd',
    agentId: '',
    includeCoAgent: true,
  })

  function applyPreset(preset) {
    if (preset === 'custom' || preset === 'all') {
      setBuiltinFilters(f => ({...f, preset}))
      return
    }
    const range = getDatePreset(preset)
    if (range) setBuiltinFilters({...range, preset})
  }

  useEffect(() => { loadMeta() }, [])

  async function loadMeta() {
    const { data } = await supabase.from('settings').select('id, custom_reports').single()
    setSettingsId(data?.id)
    setSavedReports(data?.custom_reports || [])
    await loadAllData()
  }

  async function loadAllData() {
    const [txnRes, agentRes, trustRes] = await Promise.all([
      supabase.from('transactions').select('*, transaction_agents(*, agents(id,first_name,last_name,office), plans(*))'),
      supabase.from('agents').select('*, plans(*)'),
      supabase.from('trust_entries').select('*, transactions(street_address,city,state,close_date,estimated_close_date)'),
    ])
    const txns = (txnRes.data || []).map(t => enrichTransaction(t, agentRes.data || []))
    const agts = (agentRes.data || []).map(a => enrichAgent(a, txnRes.data || []))
    setAllData({ transactions: txns, agents: agts, rawAgents: agentRes.data || [], trustEntries: trustRes.data || [] })
  }

  function enrichTransaction(t, agentList) {
    const gross = (t.sale_price || 0) * ((t.selling_commission_pct || 0) / 100)
    let agentNet = 0, officeSplit = 0, adminFee = 0
    const agentNames = []
    let agentPctFirst = 0
    ;(t.transaction_agents || []).forEach((ta, i) => {
      const a = ta.agents
      if (a) agentNames.push(a.first_name + ' ' + a.last_name)
      const plan = ta.plans
      const fees = plan?.fees || []
      const feeItem = fees.find(f => f.name === 'Admin Fee')
      // Admin fee is per transaction, not per agent — only apply to primary agent (index 0)
      const feeAmt = i === 0 ? (feeItem?.amt || 0) : 0
      const payer = t.admin_fee_payer || feeItem?.payer || 'client'
      const split = ta.split_type === 'dollar' ? ta.split_value : gross * ((ta.split_value || 100) / 100)
      const agentPct = plan?.type === 'cap' ? (plan.cap_levels?.[0]?.pct || 90) : (plan?.agent_pct || 80)
      if (i === 0) agentPctFirst = agentPct
      let aN = split * (agentPct / 100)
      let bN = split * ((100 - agentPct) / 100)
      if (payer === 'agent') aN -= feeAmt
      else if (payer === 'broker') bN -= feeAmt
      const offAdmin = (payer === 'client' || payer === 'agent') ? feeAmt : 0
      agentNet += aN
      officeSplit += bN
      adminFee += offAdmin
    })
    return {
      ...t,
      gross_commission: gross,
      agent_net: agentNet,
      office_split: officeSplit,
      admin_fee_collected: adminFee,
      total_office_income: officeSplit + adminFee,
      agent_names: agentNames.join(', '),
      agent_split_pct: agentPctFirst,
      volume_credit: (t.transaction_agents || []).reduce((s, ta) => s + (t.sale_price || 0) * ((ta.volume_pct || 100) / 100), 0),
    }
  }

  function enrichAgent(a, txnList) {
    const thisYear = new Date().getFullYear()
    const myTas = txnList.flatMap(t => (t.transaction_agents || []).filter(ta => ta.agent_id === a.id))
    const closedTas = myTas.filter(ta => {
      const t = txnList.find(t => t.id === ta.transaction_id)
      return t?.status === 'closed' && t.close_date && new Date(t.close_date).getFullYear() === thisYear
    })
    const ytdGci = closedTas.reduce((s, ta) => {
      const t = txnList.find(t => t.id === ta.transaction_id)
      return s + (t?.sale_price || 0) * ((t?.selling_commission_pct || 0) / 100) * ((ta.split_value || 100) / 100)
    }, 0)
    const brokerPaidYtd = closedTas.reduce((s, ta) => s + (ta.locked_broker_net || 0), 0)
    const cap = a.plans?.cap_amount || 0
    return {
      ...a,
      plan_name: a.plans?.name || '—',
      cap_amount: cap,
      ytd_gci: ytdGci,
      ytd_deals: closedTas.length,
      broker_paid_ytd: Math.min(brokerPaidYtd, cap),
      cap_remaining: Math.max(0, cap - brokerPaidYtd),
    }
  }

  // ── SAVE / DELETE custom reports ────────────────────────────
  async function saveReport() {
    if (!report.name.trim()) { alert('Please enter a report name.'); return }
    const existing = savedReports
    const updated = report.id
      ? existing.map(r => r.id === report.id ? report : r)
      : [...existing, { ...report, id: 'cr_' + Date.now() }]
    await supabase.from('settings').update({ custom_reports: updated }).eq('id', settingsId)
    setSavedReports(updated)
    alert('Report saved!')
  }

  async function deleteReport(id) {
    if (!window.confirm('Delete this report?')) return
    const updated = savedReports.filter(r => r.id !== id)
    await supabase.from('settings').update({ custom_reports: updated }).eq('id', settingsId)
    setSavedReports(updated)
  }

  // ── RUN CUSTOM REPORT ────────────────────────────────────────
  function runCustomReport(r) {
    if (!allData) return
    setLoading(true)
    setActiveReport(r)
    setView('run')

    const fields = FIELDS[r.source] || []
    let rows = r.source === 'transactions' ? [...allData.transactions] : [...allData.agents]

    // Apply filters
    r.filters.forEach(f => {
      const fieldDef = fields.find(fd => fd.key === f.field)
      if (!fieldDef || !f.field) return
      rows = rows.filter(row => {
        const val = row[f.field]
        const v = String(val || '').toLowerCase()
        const fv = String(f.value || '').toLowerCase()
        switch (f.op) {
          case 'contains':    return v.includes(fv)
          case 'equals':      return v === fv
          case 'not equals':  return v !== fv
          case 'starts with': return v.startsWith(fv)
          case 'not empty':   return val != null && val !== ''
          case 'is empty':    return val == null || val === ''
          case 'greater than':return Number(val) > Number(f.value)
          case 'less than':   return Number(val) < Number(f.value)
          case 'between':     return Number(val) >= Number(f.value) && Number(val) <= Number(f.value2)
          case 'after':       return String(val) > String(f.value)
          case 'before':      return String(val) < String(f.value)
          case 'this year':   return String(val).startsWith(new Date().getFullYear().toString())
          case 'this month':  return String(val).startsWith(new Date().toISOString().slice(0,7))
          default: return true
        }
      })
    })

    // Sort
    if (r.sortBy) {
      rows.sort((a, b) => {
        const av = a[r.sortBy], bv = b[r.sortBy]
        if (av == null) return 1
        if (bv == null) return -1
        const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
        return r.sortDir === 'desc' ? -cmp : cmp
      })
    }

    // Group
    let finalRows = []
    let columns = r.columns.map(k => fields.find(f => f.key === k)?.label || k)

    if (r.groupBy && r.groupBy !== 'none') {
      const grouped = {}
      rows.forEach(row => {
        let key = ''
        switch (r.groupBy) {
          case 'agent':       key = row.agent_names || row.first_name + ' ' + row.last_name; break
          case 'month':       key = row.close_date?.slice(0,7) || 'No Date'; break
          case 'est_month':   key = row.estimated_close_date?.slice(0,7) || 'No Date'; break
          case 'status':      key = row.status || '—'; break
          case 'lead_source': key = row.lead_source || 'Unknown'; break
          case 'office':      key = row.office || row.agent_names || '—'; break
          case 'type':        key = row.type || '—'; break
          case 'property_type': key = row.property_type || '—'; break
          case 'plan':        key = row.plan_name || '—'; break
          default: key = '—'
        }
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(row)
      })

      const numericFields = r.columns.filter(k => {
        const f = fields.find(fd => fd.key === k)
        return f?.type === 'number'
      })
      columns = ['Group', 'Count', ...numericFields.map(k => fields.find(f=>f.key===k)?.label || k)]

      Object.entries(grouped).sort().forEach(([key, groupRows]) => {
        const sums = numericFields.map(k => {
          const total = groupRows.reduce((s, r) => s + (Number(r[k]) || 0), 0)
          const field = fields.find(f => f.key === k)
          return field?.fmt === 'currency' ? fmt$(total) : total.toFixed(2).replace(/\.00$/, '')
        })
        finalRows.push([key, groupRows.length, ...sums])
      })
      // Totals row
      const totals = numericFields.map(k => {
        const total = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)
        const field = fields.find(f => f.key === k)
        return field?.fmt === 'currency' ? fmt$(total) : total.toFixed(2).replace(/\.00$/, '')
      })
      finalRows.push(['TOTALS', rows.length, ...totals])
    } else {
      finalRows = rows.map(row =>
        r.columns.map(k => {
          const val = row[k]
          const field = fields.find(f => f.key === k)
          if (field?.fmt === 'currency') return fmt$(val)
          if (val == null || val === '') return '—'
          return String(val)
        })
      )
    }

    setReportData({ columns, rows: finalRows, total: rows.length })
    setLoading(false)
  }

  // ── RUN BUILT-IN REPORT ──────────────────────────────────────
  function runBuiltinReport(id) {
    if (!allData) return
    setLoading(true)
    setActiveReport({ id, builtin: true, name: BUILTIN_REPORTS.find(r=>r.id===id)?.name })
    setView('run')
    const { transactions, agents } = allData
    const df = builtinFilters.dateFrom, dt = builtinFilters.dateTo
    const inRange = t => { const d = t.close_date; return d && d >= df && d <= dt }
    const closed = transactions.filter(t => t.status === 'closed' && inRange(t))
    const open = transactions.filter(t => {
      if (!(['active','pending'].includes(t.status))) return false
      if (builtinFilters.preset === 'all' || !builtinFilters.dateFrom) return true
      const d = t.estimated_close_date
      return d && d >= df && d <= dt
    })
    let columns = [], rows = []
    const thisYear = new Date().getFullYear()
    const moNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

    switch(id) {
      case 'gci_by_agent': {
        columns = ['Agent','Office','Deals','Total Volume','Gross GCI','Agent Net','Admin Fees','Office Split','Total Office Income']
        const map = {}
        closed.forEach(t => {
          ;(t.transaction_agents||[]).forEach(ta => {
            const a = ta.agents; if(!a) return
            const k = ta.agent_id
            const agentObj = allData.rawAgents.find(ag=>ag.id===k)
            if(!map[k]) map[k]={name:a.first_name+' '+a.last_name,office:agentObj?.office||'—',deals:0,volume:0,gross:0,agentNet:0,adminFee:0,officeSplit:0}
            map[k].deals++
            map[k].volume += (t.sale_price||0)
            map[k].gross += t.gross_commission
            map[k].agentNet += t.agent_net / (t.transaction_agents?.length||1)
            map[k].adminFee += t.admin_fee_collected / (t.transaction_agents?.length||1)
            map[k].officeSplit += t.office_split / (t.transaction_agents?.length||1)
          })
        })
        rows = Object.values(map).sort((a,b)=>b.gross-a.gross).map(r=>[r.name,r.office,r.deals,fmt$(r.volume),fmt$(r.gross),fmt$(r.agentNet),fmt$(r.adminFee),fmt$(r.officeSplit),fmt$(r.officeSplit+r.adminFee)])
        break
      }
      case 'cap_progress': {
        columns = ['Agent','Office','Plan','Cap Amount','Broker Paid YTD','Remaining','Progress','Status']
        agents.filter(a=>a.plans?.type==='cap'&&a.status==='active').forEach(a => {
          const pct = a.cap_amount ? Math.min(100,Math.round(a.broker_paid_ytd/a.cap_amount*100)) : 0
          rows.push([a.first_name+' '+a.last_name,a.office||'—',a.plan_name,fmt$(a.cap_amount),fmt$(a.broker_paid_ytd),fmt$(a.cap_remaining),pct+'%',a.broker_paid_ytd>=(a.cap_amount||0)?'🎯 Capped':pct>=75?'🔥 Near cap':'In progress'])
        })
        break
      }
      case 'transaction_summary': {
        columns = ['Address','City','Type','Status','Sale Price','Gross GCI','Agent(s)','Agent Net','Admin Fee','Office Net','Close Date','Lead Source']
        transactions.filter(t=>t.close_date && inRange(t)).forEach(t => {
          rows.push([t.street_address,t.city,t.type,t.status,fmt$(t.sale_price),fmt$(t.gross_commission),t.agent_names,fmt$(t.agent_net),fmt$(t.admin_fee_collected),fmt$(t.total_office_income),t.close_date||'—',t.lead_source||'—'])
        })
        break
      }
      case 'lead_source': {
        columns = ['Lead Source','Deals','Total Volume','Gross GCI','Avg GCI','Office Income','% of Total']
        const map = {}
        closed.forEach(t => {
          const s = t.lead_source||'Unknown'
          if(!map[s]) map[s]={deals:0,volume:0,gci:0,office:0}
          map[s].deals++; map[s].volume+=(t.sale_price||0); map[s].gci+=t.gross_commission; map[s].office+=t.total_office_income
        })
        const tot = Object.values(map).reduce((s,r)=>s+r.gci,0)
        rows = Object.entries(map).sort((a,b)=>b[1].gci-a[1].gci).map(([s,r])=>[s,r.deals,fmt$(r.volume),fmt$(r.gci),fmt$(r.deals?r.gci/r.deals:0),fmt$(r.office),tot?Math.round(r.gci/tot*100)+'%':'0%'])
        break
      }
      case 'agent_production': {
        columns = ['Rank','Agent','Office','Closed Deals','Total Volume','Gross GCI','Agent Net','Avg Sale Price']
        const map = {}
        closed.forEach(t => {
          ;(t.transaction_agents||[]).forEach(ta => {
            const a=ta.agents; if(!a) return
            const k=ta.agent_id; const agentObj=allData.rawAgents.find(ag=>ag.id===k)
            if(!map[k]) map[k]={name:a.first_name+' '+a.last_name,office:agentObj?.office||'—',deals:0,volume:0,gci:0,agentNet:0}
            map[k].deals++; map[k].volume+=(t.sale_price||0); map[k].gci+=t.gross_commission; map[k].agentNet+=t.agent_net/(t.transaction_agents?.length||1)
          })
        })
        rows = Object.values(map).sort((a,b)=>b.gci-a.gci).map((r,i)=>['#'+(i+1),r.name,r.office,r.deals,fmt$(r.volume),fmt$(r.gci),fmt$(r.agentNet),fmt$(r.deals?r.volume/r.deals:0)])
        break
      }
      case 'monthly_trend': {
        columns = ['Month','Closed Deals','Total Volume','Gross GCI','Agent Net','Admin Fees','Office Split','Total Office Income']
        const map = {}
        transactions.filter(t=>t.status==='closed'&&t.close_date&&new Date(t.close_date).getFullYear()===thisYear).forEach(t => {
          const mo = t.close_date.slice(0,7)
          if(!map[mo]) map[mo]={deals:0,volume:0,gci:0,agentNet:0,adminFee:0,officeSplit:0}
          map[mo].deals++; map[mo].volume+=(t.sale_price||0); map[mo].gci+=t.gross_commission; map[mo].agentNet+=t.agent_net; map[mo].adminFee+=t.admin_fee_collected; map[mo].officeSplit+=t.office_split
        })
        rows = Object.entries(map).sort().map(([mo,r])=>{const[y,m]=mo.split('-');return[moNames[parseInt(m)-1]+' '+y,r.deals,fmt$(r.volume),fmt$(r.gci),fmt$(r.agentNet),fmt$(r.adminFee),fmt$(r.officeSplit),fmt$(r.officeSplit+r.adminFee)]})
        break
      }
      case 'disbursement_summary': {
        columns = ['Address','City','Agent(s)','Close Date','Sale Price','Gross GCI','Agent Net','Admin Fee','Office Split','Total Office Income']
        closed.forEach(t => rows.push([t.street_address,t.city,t.agent_names,t.close_date||'—',fmt$(t.sale_price),fmt$(t.gross_commission),fmt$(t.agent_net),fmt$(t.admin_fee_collected),fmt$(t.office_split),fmt$(t.total_office_income)]))
        const tots = ['','','TOTALS','',fmt$(closed.reduce((s,t)=>s+(t.sale_price||0),0)),fmt$(closed.reduce((s,t)=>s+t.gross_commission,0)),fmt$(closed.reduce((s,t)=>s+t.agent_net,0)),fmt$(closed.reduce((s,t)=>s+t.admin_fee_collected,0)),fmt$(closed.reduce((s,t)=>s+t.office_split,0)),fmt$(closed.reduce((s,t)=>s+t.total_office_income,0))]
        rows.push(tots)
        break
      }
      case 'pending_income': {
        columns = ['Agent','Office','Address','Status','Sale Price','Est. Close','Proj. Gross','Agent Net','Admin Fee','Office Split','Total Office','Plan']
        open.forEach(t => {
          ;(t.transaction_agents||[]).forEach(ta => {
            const a=ta.agents; if(!a) return
            const agentObj=allData.rawAgents.find(ag=>ag.id===ta.agent_id)
            const plan=ta.plans||agentObj?.plans
            const split=ta.split_type==='dollar'?ta.split_value:t.gross_commission*((ta.split_value||100)/100)
            const agentPct=plan?.type==='cap'?(plan.cap_levels?.[0]?.pct||90):(plan?.agent_pct||80)
            const fees=plan?.fees||[]; const feeItem=fees.find(f=>f.name==='Admin Fee')
            const feeAmt=feeItem?.amt||0; const payer=t.admin_fee_payer||feeItem?.payer||'client'
            let aN=split*(agentPct/100), bN=split*((100-agentPct)/100)
            if(payer==='agent') aN-=feeAmt; else if(payer==='broker') bN-=feeAmt
            const offAdmin=(payer==='client'||payer==='agent')?feeAmt:0
            rows.push([a.first_name+' '+a.last_name,agentObj?.office||'—',t.street_address+', '+t.city,t.status,fmt$(t.sale_price),t.estimated_close_date||'—',fmt$(split),fmt$(aN),fmt$(offAdmin),fmt$(bN),fmt$(bN+offAdmin),plan?.name||'—'])
          })
        })
        rows.sort((a,b)=>{if(a[5]==='—')return 1;if(b[5]==='—')return -1;return a[5].localeCompare(b[5])})
        break
      }
      case 'office_pipeline': {
        columns = ['Est. Close','Address','City','Status','Sale Price','Gross Comm','Agent(s)','Agent Net','Admin Fee','Office Split','Total Office','Lead Source']
        open.forEach(t => rows.push([t.estimated_close_date||'—',t.street_address,t.city,t.status,fmt$(t.sale_price),fmt$(t.gross_commission),t.agent_names,fmt$(t.agent_net),fmt$(t.admin_fee_collected),fmt$(t.office_split),fmt$(t.total_office_income),t.lead_source||'—']))
        rows.sort((a,b)=>{if(a[0]==='—')return 1;if(b[0]==='—')return -1;return a[0].localeCompare(b[0])})
        rows.push(['','TOTALS ('+open.length+' deals)','','',fmt$(open.reduce((s,t)=>s+(t.sale_price||0),0)),fmt$(open.reduce((s,t)=>s+t.gross_commission,0)),'',fmt$(open.reduce((s,t)=>s+t.agent_net,0)),fmt$(open.reduce((s,t)=>s+t.admin_fee_collected,0)),fmt$(open.reduce((s,t)=>s+t.office_split,0)),fmt$(open.reduce((s,t)=>s+t.total_office_income,0)),''])
        break
      }
      case 'agent_pipeline': {
        const aid = builtinFilters.agentId
        const inclCo = builtinFilters.includeCoAgent
        const df = builtinFilters.dateFrom, dt = builtinFilters.dateTo

        // Get all transactions where this agent appears (primary or co-agent)
        const agentTxns = transactions.filter(t => {
          // Agent filter — check if selected agent appears on this deal
          const tas = t.transaction_agents || []
          if (aid) {
            const agentEntry = tas.find(ta => ta.agent_id === aid)
            if (!agentEntry) return false
            const isPrimary = tas.indexOf(agentEntry) === 0
            if (!isPrimary && !inclCo) return false // co-agent but checkbox off
          }
          // Date filter: closed deals by close_date, open deals by estimated_close_date
          if (t.status === 'closed') {
            const d = String(t.close_date || '').slice(0,10)
            return d >= df.slice(0,10) && d <= dt.slice(0,10)
          }
          if (t.status === 'active' || t.status === 'pending') {
            const est = String(t.estimated_close_date || '').slice(0,10)
            if (!est || est.length < 10) return false
            return est >= df.slice(0,10) && est <= dt.slice(0,10)
          }
          return false
        })

        const closedInRange = agentTxns.filter(t => t.status === 'closed')
        const openDeals = agentTxns.filter(t => t.status === 'active' || t.status === 'pending')

        // Section 1: Closed income summary
        columns = ['Section','Address','City','Role','Close Date','Sale Price','Gross Comm','Agent Split %','Agent Net','Admin Fee','Office Net','Lead Source']

        closedInRange.forEach(t => {
          const tas = t.transaction_agents || []
          // When an agent is selected, only show that agent's row
          const tasToShow = aid ? tas.filter(ta => ta.agent_id === aid) : tas
          tasToShow.forEach((ta) => {
            const idx = tas.findIndex(t2 => t2 === ta || t2.agent_id === ta.agent_id) // original index for admin fee
            const plan = ta.plans
            const agentPct = plan?.type === 'cap' ? (plan.cap_levels?.[0]?.pct || 90) : (plan?.agent_pct || 80)
            const split = ta.split_type === 'dollar' ? ta.split_value : t.gross_commission * ((ta.split_value || 100) / 100)
            const feeAmt = idx === 0 ? (plan?.fees?.find(f=>f.name==='Admin Fee')?.amt || 0) : 0
            const payer = t.admin_fee_payer || 'client'
            let aN = split * (agentPct / 100)
            let oN = split * ((100 - agentPct) / 100)
            if (payer === 'agent') aN -= feeAmt
            else if (payer === 'broker') oN -= feeAmt
            const offAdmin = (payer === 'client' || payer === 'agent') ? feeAmt : 0
            const role = idx === 0 ? 'Primary' : 'Co-Agent'
            rows.push(['CLOSED', t.street_address + ', ' + t.city, t.city, role, t.close_date || '—', fmt$(t.sale_price), fmt$(t.gross_commission), agentPct + '%', fmt$(aN), fmt$(offAdmin), fmt$(oN + offAdmin), t.lead_source || '—'])
          })
        })

        // Closed totals
        if (closedInRange.length > 0) {
          const totGross = closedInRange.reduce((s,t) => s + t.gross_commission, 0)
          const totAgent = closedInRange.reduce((s,t) => {
            return s + (t.transaction_agents||[]).filter(ta=>!aid||ta.agent_id===aid).reduce((ss,ta,idx) => {
              const plan=ta.plans; const agentPct=plan?.type==='cap'?(plan.cap_levels?.[0]?.pct||90):(plan?.agent_pct||80)
              const split=ta.split_type==='dollar'?ta.split_value:t.gross_commission*((ta.split_value||100)/100)
              const feeAmt=idx===0?(plan?.fees?.find(f=>f.name==='Admin Fee')?.amt||0):0
              let aN=split*(agentPct/100); if(t.admin_fee_payer==='agent') aN-=feeAmt
              return ss+aN
            }, 0)
          }, 0)
          rows.push(['CLOSED TOTALS', closedInRange.length + ' deals', '', '', '', fmt$(closedInRange.reduce((s,t)=>s+(t.sale_price||0),0)), fmt$(totGross), '', fmt$(totAgent), '', '', ''])
          rows.push(['', '', '', '', '', '', '', '', '', '', '', ''])
        }

        // Section 2: Open pipeline
        openDeals.forEach(t => {
          const tas = t.transaction_agents || []
          // When an agent is selected, only show that agent's row
          const tasToShow = aid ? tas.filter(ta => ta.agent_id === aid) : tas
          tasToShow.forEach((ta) => {
            const idx = tas.findIndex(t2 => t2 === ta || t2.agent_id === ta.agent_id)
            const plan = ta.plans
            const agentPct = plan?.type === 'cap' ? (plan.cap_levels?.[0]?.pct || 90) : (plan?.agent_pct || 80)
            const split = ta.split_type === 'dollar' ? ta.split_value : t.gross_commission * ((ta.split_value || 100) / 100)
            const feeAmt = idx === 0 ? (plan?.fees?.find(f=>f.name==='Admin Fee')?.amt || 0) : 0
            const payer = t.admin_fee_payer || 'client'
            let aN = split * (agentPct / 100)
            let oN = split * ((100 - agentPct) / 100)
            if (payer === 'agent') aN -= feeAmt
            const role = idx === 0 ? 'Primary' : 'Co-Agent'
            rows.push(['PIPELINE (' + t.status + ')', t.street_address + ', ' + t.city, t.city, role, t.estimated_close_date || 'TBD', fmt$(t.sale_price), fmt$(t.gross_commission), agentPct + '%', fmt$(aN), fmt$(feeAmt), fmt$(oN), t.lead_source || '—'])
          })
        })

        if (openDeals.length > 0) {
          const totOpenVolume = openDeals.reduce((s,t) => s + (t.sale_price||0), 0)
          const totOpenGross = openDeals.reduce((s,t) => s + t.gross_commission, 0)
          const totOpenAgent = openDeals.reduce((s,t) => {
            return s + (t.transaction_agents||[]).filter(ta=>!aid||ta.agent_id===aid).reduce((ss,ta,idx) => {
              const plan=ta.plans; const agentPct=plan?.type==='cap'?(plan.cap_levels?.[0]?.pct||90):(plan?.agent_pct||80)
              const split=ta.split_type==='dollar'?ta.split_value:t.gross_commission*((ta.split_value||100)/100)
              const feeAmt=idx===0?(plan?.fees?.find(f=>f.name==='Admin Fee')?.amt||0):0
              let aN=split*(agentPct/100); if(t.admin_fee_payer==='agent') aN-=feeAmt
              return ss+aN
            }, 0)
          }, 0)
          rows.push(['PIPELINE TOTALS', openDeals.length + ' deals', '', '', '', fmt$(totOpenVolume), fmt$(totOpenGross), '', fmt$(totOpenAgent), '', '', ''])
        }

        // Grand total (closed + pipeline)
        const allRows = rows.filter(r => r[0].startsWith('CLOSED') || r[0].startsWith('PIPELINE'))
        const closedAgentTotal = closedInRange.reduce((s,t) => {
          return s + (t.transaction_agents||[]).filter(ta=>!aid||ta.agent_id===aid).reduce((ss,ta,idx) => {
            const plan=ta.plans; const agentPct=plan?.type==='cap'?(plan.cap_levels?.[0]?.pct||90):(plan?.agent_pct||80)
            const split=ta.split_type==='dollar'?ta.split_value:t.gross_commission*((ta.split_value||100)/100)
            const feeAmt=idx===0?(plan?.fees?.find(f=>f.name==='Admin Fee')?.amt||0):0
            let aN=split*(agentPct/100); if(t.admin_fee_payer==='agent') aN-=feeAmt
            return ss+aN
          }, 0)
        }, 0)
        const pipelineAgentTotal = openDeals.reduce((s,t) => {
          return s + (t.transaction_agents||[]).filter(ta=>!aid||ta.agent_id===aid).reduce((ss,ta,idx) => {
            const plan=ta.plans; const agentPct=plan?.type==='cap'?(plan.cap_levels?.[0]?.pct||90):(plan?.agent_pct||80)
            const split=ta.split_type==='dollar'?ta.split_value:t.gross_commission*((ta.split_value||100)/100)
            const feeAmt=idx===0?(plan?.fees?.find(f=>f.name==='Admin Fee')?.amt||0):0
            let aN=split*(agentPct/100); if(t.admin_fee_payer==='agent') aN-=feeAmt
            return ss+aN
          }, 0)
        }, 0)
        const grandTotalVolume = [...closedInRange,...openDeals].reduce((s,t)=>s+(t.sale_price||0),0)
        const grandTotalGross = [...closedInRange,...openDeals].reduce((s,t)=>s+t.gross_commission,0)
        rows.push(['', '', '', '', '', '', '', '', '', '', '', ''])
        rows.push(['GRAND TOTAL', (closedInRange.length + openDeals.length) + ' deals', '', '', '', fmt$(grandTotalVolume), fmt$(grandTotalGross), '', fmt$(closedAgentTotal + pipelineAgentTotal), '', '', ''])

        // Cap progress section
        if (aid && allData) {
          const agentObj = allData.rawAgents.find(a => a.id === aid)
          const plan = agentObj?.plans
          if (plan?.type === 'cap') {
            const thisYear = new Date().getFullYear()
            const brokerPaid = transactions
              .filter(t => t.status === 'closed' && t.close_date && new Date(t.close_date).getFullYear() === thisYear)
              .flatMap(t => (t.transaction_agents||[]).filter(ta=>ta.agent_id===aid))
              .reduce((s,ta) => s + (ta.locked_broker_net||0), 0)
            const cap = plan.cap_amount || 0
            const remaining = Math.max(0, cap - brokerPaid)
            rows.push(['', '', '', '', '', '', '', '', '', '', '', ''])
            rows.push(['CAP PROGRESS', plan.name, '', '', '', '', fmt$(cap) + ' cap', '', fmt$(Math.min(brokerPaid, cap)) + ' paid', '', fmt$(remaining) + ' remaining', brokerPaid >= cap ? '🎯 CAPPED' : Math.round(brokerPaid/cap*100) + '% to cap'])
          }
        }

        break
      }

      case 'trust_ledger': {
        columns = ['Transaction', 'City', 'Type', 'Amount', 'Received', 'Status', 'Released', 'Notes']
        const trust = allData.trustEntries || []
        const statusFilter2 = builtinFilters.preset === 'all' ? null : null // show all by default
        trust.forEach(e => {
          const t = e.transactions
          rows.push([
            t?.street_address || '—',
            t?.city || '—',
            e.type || '—',
            fmt$(e.amount),
            e.received_date || '—',
            e.status?.charAt(0).toUpperCase() + e.status?.slice(1) || '—',
            e.released_date || '—',
            e.notes || '—',
          ])
        })
        rows.sort((a,b) => a[5].localeCompare(b[5])) // sort by status: Forfeited, Held, Released
        // Summary rows
        const held = trust.filter(e=>e.status==='held').reduce((s,e)=>s+(e.amount||0),0)
        const released = trust.filter(e=>e.status==='released').reduce((s,e)=>s+(e.amount||0),0)
        const forfeited = trust.filter(e=>e.status==='forfeited').reduce((s,e)=>s+(e.amount||0),0)
        rows.push(['', '', 'CURRENTLY HELD', fmt$(held), '', '', '', ''])
        rows.push(['', '', 'RELEASED', fmt$(released), '', '', '', ''])
        rows.push(['', '', 'FORFEITED', fmt$(forfeited), '', '', '', ''])
        rows.push(['', '', 'TOTAL RECEIVED', fmt$(held+released+forfeited), '', '', '', ''])
        break
      }

      case 'projected_by_month': {
        columns = ['Month','Open Deals','Proj. Gross GCI','Proj. Agent Net','Admin Fees','Office Split','Total Office Income','Avg Deal Size']
        const map = {}
        open.filter(t=>t.estimated_close_date).forEach(t => {
          const mo=t.estimated_close_date.slice(0,7)
          if(!map[mo]) map[mo]={deals:0,volume:0,gci:0,agentNet:0,adminFee:0,officeSplit:0}
          map[mo].deals++; map[mo].volume+=(t.sale_price||0); map[mo].gci+=t.gross_commission; map[mo].agentNet+=t.agent_net; map[mo].adminFee+=t.admin_fee_collected; map[mo].officeSplit+=t.office_split
        })
        rows = Object.entries(map).sort().map(([mo,r])=>{const[y,m]=mo.split('-');return[moNames[parseInt(m)-1]+' '+y,r.deals,fmt$(r.gci),fmt$(r.agentNet),fmt$(r.adminFee),fmt$(r.officeSplit),fmt$(r.officeSplit+r.adminFee),fmt$(r.deals?r.volume/r.deals:0)]})
        const all=Object.values(map)
        rows.push(['TOTAL',open.filter(t=>t.estimated_close_date).length,fmt$(all.reduce((s,r)=>s+r.gci,0)),fmt$(all.reduce((s,r)=>s+r.agentNet,0)),fmt$(all.reduce((s,r)=>s+r.adminFee,0)),fmt$(all.reduce((s,r)=>s+r.officeSplit,0)),fmt$(all.reduce((s,r)=>s+r.officeSplit+r.adminFee,0)),''])
        break
      }
    }
    setReportData({ columns, rows, total: rows.length })
    setLoading(false)
  }

  // ── EXPORT / PRINT ───────────────────────────────────────────
  function exportCSV() {
    if (!reportData) return
    const csv = [reportData.columns, ...reportData.rows].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}))
    a.download = (activeReport?.name||'report')+'.csv'
    a.click()
  }

  function printReport() {
    if (!reportData) return
    const name = activeReport?.name || 'Report'
    const tHead = reportData.columns.map(c=>`<th style="background:#0f2744;color:#fff;padding:7px 10px;text-align:left;font-size:10px;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;">${c}</th>`).join('')
    const tBody = reportData.rows.map((row,i)=>`<tr style="background:${i%2===0?'#fff':'#f8f7f4'}">${row.map(v=>`<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;">${v}</td>`).join('')}</tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${name}</title><style>body{font-family:Segoe UI,system-ui,sans-serif;padding:24px;color:#1a1a1a;}table{width:100%;border-collapse:collapse;}@media print{.no-print{display:none!important;}}</style></head><body>
    <div style="display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:14px;border-bottom:3px solid #0f2744;">
      <div><div style="font-size:22px;font-weight:800;color:#0f2744;">Jewell Real Estate</div><div style="font-size:15px;font-weight:600;margin-top:3px;">${name}</div></div>
      <div style="text-align:right;font-size:12px;color:#888;"><div>Generated: ${new Date().toLocaleDateString()}</div><div>${reportData.total} records</div></div>
    </div>
    <table><thead><tr>${tHead}</tr></thead><tbody>${tBody}</tbody></table>
    <div class="no-print" style="text-align:center;margin-top:20px;"><button onclick="window.print()" style="background:#0f2744;color:#fff;border:none;padding:10px 24px;border-radius:6px;font-size:14px;cursor:pointer;">⎙ Print / Save as PDF</button></div>
    </body></html>`
    const w = window.open('','_blank'); w.document.write(html); w.document.close()
  }

  // ── VIEWS ────────────────────────────────────────────────────

  // RUN VIEW
  if (view === 'run') {
    const isBuiltin = activeReport?.builtin
    return (
      <div>
        <div className="back-btn" onClick={()=>{setView('list');setReportData(null)}}>← Back to Reports</div>
        <div className="sec-hdr">
          <div>
            <div className="sec-title">{activeReport?.name}</div>
            <div className="sec-sub">{reportData ? reportData.total + ' records' : 'Loading…'}</div>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            {isBuiltin && (
              <>
                {!['pending_income','office_pipeline','projected_by_month','trust_ledger','agent_pipeline'].includes(activeReport.id) && <>
                  <select className="form-ctrl" value={builtinFilters.preset} onChange={e=>applyPreset(e.target.value)} style={{width:160}}>
                    {DATE_PRESETS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <input className="form-ctrl" type="date" value={builtinFilters.dateFrom} onChange={e=>setBuiltinFilters(f=>({...f,dateFrom:e.target.value,preset:'custom'}))} style={{width:140}}/>
                  <span style={{color:'rgba(255,255,255,.5)',fontSize:12}}>→</span>
                  <input className="form-ctrl" type="date" value={builtinFilters.dateTo} onChange={e=>setBuiltinFilters(f=>({...f,dateTo:e.target.value,preset:'custom'}))} style={{width:140}}/>
                </>}
                {['pending_income','office_pipeline','projected_by_month','trust_ledger'].includes(activeReport.id) && <>
                  <span style={{fontSize:11,color:'rgba(255,255,255,.5)'}}>Est. Close:</span>
                  <select className="form-ctrl" value={builtinFilters.preset} onChange={e=>applyPreset(e.target.value)} style={{width:160}}>
                    <option value="all">All Open Deals</option>
                    {DATE_PRESETS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  {builtinFilters.preset !== 'all' && <>
                    <input className="form-ctrl" type="date" value={builtinFilters.dateFrom} onChange={e=>setBuiltinFilters(f=>({...f,dateFrom:e.target.value,preset:'custom'}))} style={{width:140}}/>
                    <span style={{color:'rgba(255,255,255,.5)',fontSize:12}}>→</span>
                    <input className="form-ctrl" type="date" value={builtinFilters.dateTo} onChange={e=>setBuiltinFilters(f=>({...f,dateTo:e.target.value,preset:'custom'}))} style={{width:140}}/>
                  </>}
                </>}
                {activeReport.id === 'agent_pipeline' && <>
                  <select className="form-ctrl" value={builtinFilters.agentId} onChange={e=>setBuiltinFilters(f=>({...f,agentId:e.target.value}))} style={{width:180}}>
                    <option value="">— All Agents —</option>
                    {(allData?.rawAgents||[]).filter(a=>a.status==='active').sort((a,b)=>a.last_name.localeCompare(b.last_name)).map(a=><option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
                  </select>
                  <label style={{display:'flex',alignItems:'center',gap:6,color:'rgba(255,255,255,.7)',fontSize:12,cursor:'pointer'}}>
                    <input type="checkbox" checked={builtinFilters.includeCoAgent} onChange={e=>setBuiltinFilters(f=>({...f,includeCoAgent:e.target.checked}))}/>
                    Include as Co-Agent
                  </label>
                  <span style={{fontSize:11,color:'rgba(255,255,255,.5)'}}>Close/Est. Close:</span>
                  <select className="form-ctrl" value={builtinFilters.preset} onChange={e=>applyPreset(e.target.value)} style={{width:160}}>
                    {DATE_PRESETS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <input className="form-ctrl" type="date" value={builtinFilters.dateFrom} onChange={e=>setBuiltinFilters(f=>({...f,dateFrom:e.target.value,preset:'custom'}))} style={{width:130}}/>
                  <span style={{color:'rgba(255,255,255,.5)',fontSize:12}}>→</span>
                  <input className="form-ctrl" type="date" value={builtinFilters.dateTo} onChange={e=>setBuiltinFilters(f=>({...f,dateTo:e.target.value,preset:'custom'}))} style={{width:130}}/>
                </>}
                <button className="btn btn-navy btn-sm" onClick={()=>runBuiltinReport(activeReport.id)}>↻ Run</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>{
                  const base = FIELDS.transactions
                  setReport({...emptyReport(), name: activeReport.name + ' (Custom)', id: null})
                  setView('builder')
                }}>✏ Customize</button>
              </>
            )}
            {!isBuiltin && <button className="btn btn-ghost btn-sm" onClick={()=>{setReport(activeReport);setView('builder')}}>✏ Edit Report</button>}
            <button className="btn btn-ghost" onClick={exportCSV}>⬇ CSV</button>
            <button className="btn btn-ghost" onClick={printReport}>⎙ Print</button>
          </div>
        </div>
        {loading && <div className="loading"><div className="spinner"/>Running…</div>}
        {!loading && reportData && (
          <div className="card">
            <div className="tbl-wrap" style={{maxHeight:'70vh',overflowY:'auto'}}>
              <table>
                <thead style={{position:'sticky',top:0,zIndex:1}}>
                  <tr>{reportData.columns.map((c,i)=><th key={i}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {reportData.rows.length===0 && <tr><td colSpan={reportData.columns.length} style={{textAlign:'center',color:'var(--txt3)',padding:30}}>No data matches your criteria.</td></tr>}
                  {reportData.rows.map((row,ri)=>(
                    <tr key={ri} style={(row[0]==='TOTALS'||row[0]==='TOTAL'||row[2]==='TOTALS'||row[0]==='CLOSED TOTALS'||row[0]==='PIPELINE TOTALS'||row[0]==='GRAND TOTAL')?{background:'var(--gold-pale)',fontWeight:700}:{}}>
                      {row.map((cell,ci)=><td key={ci}>{cell}</td>)}
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

  // BUILDER VIEW
  if (view === 'builder') {
    const fields = FIELDS[report.source] || []
    const groupOpts = GROUP_OPTIONS[report.source] || []

    function updFilter(i, key, val) {
      const f = [...report.filters]
      f[i] = {...f[i], [key]: val}
      // Reset op when field changes
      if (key === 'field') {
        const fd = fields.find(fd=>fd.key===val)
        f[i].op = FILTER_OPS[fd?.type||'text'][0]
        f[i].value = ''
        f[i].value2 = ''
      }
      setReport(r=>({...r,filters:f}))
    }

    function moveColumn(i, dir) {
      const cols = [...report.columns]
      const j = i + dir
      if (j < 0 || j >= cols.length) return
      ;[cols[i], cols[j]] = [cols[j], cols[i]]
      setReport(r=>({...r,columns:cols}))
    }

    return (
      <div>
        <div className="back-btn" onClick={()=>setView('list')}>← Back to Reports</div>
        <div className="sec-hdr">
          <div>
            <div className="sec-title">{report.id ? 'Edit Report' : 'New Custom Report'}</div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn btn-ghost" onClick={()=>setView('list')}>Cancel</button>
            <button className="btn btn-navy" onClick={()=>{runCustomReport(report)}}>▶ Preview</button>
            <button className="btn btn-gold" onClick={saveReport}>💾 Save Report</button>
          </div>
        </div>

        {/* Report name + source */}
        <div className="card" style={{marginBottom:14}}>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">Report Name <span className="req">*</span></label>
                <input className="form-ctrl" value={report.name} placeholder="e.g. Q1 Agent GCI" onChange={e=>setReport(r=>({...r,name:e.target.value}))}/>
              </div>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">Data Source</label>
                <select className="form-ctrl" value={report.source} onChange={e=>setReport(r=>({...r,source:e.target.value,columns:[],filters:[],groupBy:'none',sortBy:''}))}>
                  <option value="transactions">Transactions</option>
                  <option value="agents">Agents</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
          {/* Columns */}
          <div className="card">
            <div className="card-hdr"><span className="card-title">Columns</span><span style={{fontSize:10,color:'var(--txt3)'}}>Check to include · arrows to reorder</span></div>
            <div style={{maxHeight:320,overflowY:'auto'}}>
              {fields.map(f => {
                const idx = report.columns.indexOf(f.key)
                const checked = idx > -1
                return (
                  <div key={f.key} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 14px',borderBottom:'1px solid var(--bdr)',background:checked?'var(--teal-lt)':'transparent'}}>
                    <input type="checkbox" checked={checked} onChange={e=>{
                      if(e.target.checked) setReport(r=>({...r,columns:[...r.columns,f.key]}))
                      else setReport(r=>({...r,columns:r.columns.filter(c=>c!==f.key)}))
                    }}/>
                    <span style={{flex:1,fontSize:12,fontWeight:checked?600:400}}>{f.label}{f.computed?<span style={{fontSize:9,color:'var(--txt3)',marginLeft:4}}>(computed)</span>:''}</span>
                    {checked && (
                      <div style={{display:'flex',gap:2}}>
                        <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--txt3)',fontSize:12,padding:'0 3px'}} onClick={()=>moveColumn(idx,-1)}>▲</button>
                        <button style={{background:'none',border:'none',cursor:'pointer',color:'var(--txt3)',fontSize:12,padding:'0 3px'}} onClick={()=>moveColumn(idx,1)}>▼</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Sort + Group */}
          <div>
            <div className="card" style={{marginBottom:14}}>
              <div className="card-hdr"><span className="card-title">Sort & Group</span></div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Group By</label>
                  <select className="form-ctrl" value={report.groupBy} onChange={e=>setReport(r=>({...r,groupBy:e.target.value}))}>
                    {groupOpts.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                  {report.groupBy!=='none'&&<div className="form-hint">When grouped, numeric columns are summed per group.</div>}
                </div>
                <div className="form-grid">
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Sort By</label>
                    <select className="form-ctrl" value={report.sortBy} onChange={e=>setReport(r=>({...r,sortBy:e.target.value}))}>
                      <option value="">— None —</option>
                      {fields.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{marginBottom:0}}>
                    <label className="form-label">Direction</label>
                    <select className="form-ctrl" value={report.sortDir} onChange={e=>setReport(r=>({...r,sortDir:e.target.value}))}>
                      <option value="asc">A→Z / Low→High</option>
                      <option value="desc">Z→A / High→Low</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="card">
          <div className="card-hdr">
            <span className="card-title">Filters</span>
            <button className="btn btn-ghost btn-sm" onClick={()=>setReport(r=>({...r,filters:[...r.filters,emptyFilter(r.source)]}))}>+ Add Filter</button>
          </div>
          <div className="card-body" style={{padding:report.filters.length===0?16:0}}>
            {report.filters.length===0 && <div style={{color:'var(--txt3)',fontSize:12}}>No filters — showing all records. Click "+ Add Filter" to narrow results.</div>}
            {report.filters.map((f,i) => {
              const fd = fields.find(fd=>fd.key===f.field)
              const ops = FILTER_OPS[fd?.type||'text'] || []
              const needsValue2 = f.op === 'between'
              const noValue = f.op === 'not empty' || f.op === 'is empty' || f.op === 'this year' || f.op === 'this month'
              return (
                <div key={i} style={{display:'flex',gap:8,padding:'10px 14px',borderBottom:'1px solid var(--bdr)',alignItems:'flex-end',flexWrap:'wrap'}}>
                  <div style={{flex:'0 0 180px'}}>
                    {i===0&&<label className="form-label">Field</label>}
                    <select className="form-ctrl" value={f.field} onChange={e=>updFilter(i,'field',e.target.value)}>
                      {fields.map(fd=><option key={fd.key} value={fd.key}>{fd.label}</option>)}
                    </select>
                  </div>
                  <div style={{flex:'0 0 160px'}}>
                    {i===0&&<label className="form-label">Condition</label>}
                    <select className="form-ctrl" value={f.op} onChange={e=>updFilter(i,'op',e.target.value)}>
                      {ops.map(op=><option key={op}>{op}</option>)}
                    </select>
                  </div>
                  {!noValue && (
                    <div style={{flex:'0 0 160px'}}>
                      {i===0&&<label className="form-label">Value</label>}
                      {fd?.type==='select' ? (
                        <select className="form-ctrl" value={f.value} onChange={e=>updFilter(i,'value',e.target.value)}>
                          <option value="">— Any —</option>
                          {(fd.options||[]).map(o=><option key={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input className="form-ctrl" type={fd?.type==='date'?'date':fd?.type==='number'?'number':'text'} value={f.value} onChange={e=>updFilter(i,'value',e.target.value)} placeholder="Value…"/>
                      )}
                    </div>
                  )}
                  {needsValue2 && (
                    <div style={{flex:'0 0 160px'}}>
                      {i===0&&<label className="form-label">To</label>}
                      <input className="form-ctrl" type={fd?.type==='date'?'date':'number'} value={f.value2} onChange={e=>updFilter(i,'value2',e.target.value)} placeholder="To…"/>
                    </div>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{color:'var(--red)',flexShrink:0}} onClick={()=>setReport(r=>({...r,filters:r.filters.filter((_,j)=>j!==i)}))}>✕ Remove</button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── REPORT LIST ──────────────────────────────────────────────
  return (
    <div>
      <div className="sec-hdr">
        <div><div className="sec-title">Reports</div><div className="sec-sub">Built-in reports and your saved custom reports</div></div>
        <button className="btn btn-gold" onClick={()=>{setReport(emptyReport());setView('builder')}}>+ New Custom Report</button>
      </div>

      <div style={{marginBottom:8,fontSize:11,fontWeight:700,color:'var(--txt3)',letterSpacing:'.06em',textTransform:'uppercase'}}>Built-In Reports</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:28}}>
        {BUILTIN_REPORTS.map(r=>(
          <div key={r.id} className="card" style={{cursor:'pointer'}} onClick={()=>runBuiltinReport(r.id)}
            onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.12)'}
            onMouseLeave={e=>e.currentTarget.style.boxShadow=''}>
            <div className="card-body" style={{padding:'14px 16px'}}>
              <div style={{fontSize:22,marginBottom:6}}>{r.icon}</div>
              <div style={{fontWeight:700,color:'var(--navy)',fontSize:12,marginBottom:3}}>{r.name}</div>
              <div style={{fontSize:11,color:'var(--txt3)'}}>{r.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{marginBottom:8,fontSize:11,fontWeight:700,color:'var(--txt3)',letterSpacing:'.06em',textTransform:'uppercase'}}>My Custom Reports</div>
      {savedReports.length===0 ? (
        <div style={{padding:24,background:'var(--white)',borderRadius:'var(--rl)',border:'1px dashed var(--bdr)',textAlign:'center',color:'var(--txt3)'}}>
          No custom reports yet. Click <strong>+ New Custom Report</strong> to build one.
        </div>
      ) : (
        <div className="card">
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Name</th><th>Source</th><th>Columns</th><th>Filters</th><th>Group By</th><th></th></tr></thead>
              <tbody>
                {savedReports.map(r=>(
                  <tr key={r.id}>
                    <td style={{fontWeight:600}}>{r.name}</td>
                    <td style={{textTransform:'capitalize'}}>{r.source}</td>
                    <td style={{fontSize:11,color:'var(--txt3)'}}>{r.columns.length} columns</td>
                    <td style={{fontSize:11,color:'var(--txt3)'}}>{r.filters.length} filters</td>
                    <td style={{fontSize:11,color:'var(--txt3)'}}>{GROUP_OPTIONS[r.source]?.find(g=>g.key===r.groupBy)?.label||'None'}</td>
                    <td>
                      <div style={{display:'flex',gap:6}}>
                        <button className="btn btn-teal btn-sm" onClick={()=>runCustomReport(r)}>▶ Run</button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>{setReport(r);setView('builder')}}>✏ Edit</button>
                        <button className="btn btn-ghost btn-sm" style={{color:'var(--red)'}} onClick={()=>deleteReport(r.id)}>✕</button>
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
