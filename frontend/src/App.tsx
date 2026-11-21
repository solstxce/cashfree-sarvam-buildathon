import { startCollectionCall } from '@/lib/callWorkflow'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Customer, AgentInteraction } from '@/types/database'
import { fetchCustomersData, fetchInteractionsData, addCustomer, addInteraction, importCustomers, getStoredSupabaseConfig } from '@/lib/supabaseClient'
import { fetchCallQueue, addToCallQueue, CallQueue } from '@/lib/collectionsApi'
import { MetricsOverview } from '@/components/MetricsOverview'
import { CustomersView } from '@/components/CustomersView'
import { InteractionsView } from '@/components/InteractionsView'
import { CustomerDetailModal } from '@/components/CustomerDetailModal'
import { InteractionDetailModal } from '@/components/InteractionDetailModal'
import { BulkImportModal } from '@/components/BulkImportModal'
import { NewCustomerModal } from '@/components/NewCustomerModal'
import { NewInteractionModal } from '@/components/NewInteractionModal'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { LayoutDashboard, Users, PhoneCall, RefreshCw, Sun, Moon, AlertCircle, Plus, Download, Upload, ChevronRight, Menu, X, Landmark, CalendarDays, Check } from 'lucide-react'
import './App.css'

type View = 'overview' | 'customers' | 'interactions'
export function Dashboard({ onSignOut, accountName }: { onSignOut: () => void; accountName: string }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [interactions, setInteractions] = useState<AgentInteraction[]>([])
  const [loading, setLoading] = useState(true)
  const [isLiveSupabase, setIsLiveSupabase] = useState(false)
  const [supabaseError, setSupabaseError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<View>('overview')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedInteraction, setSelectedInteraction] = useState<AgentInteraction | null>(null)
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false)
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false)
  const [isNewInteractionOpen, setIsNewInteractionOpen] = useState(false)
  const [preselectedCustomerId, setPreselectedCustomerId] = useState<number | undefined>()
  const [mobileNav, setMobileNav] = useState(false)
  const callInFlight = useRef(false)
  const [callingCustomerId, setCallingCustomerId] = useState<number | null>(null)
  const [callError, setCallError] = useState('')
  const [notice, setNotice] = useState('')
  const [callQueue, setCallQueue] = useState<CallQueue | 'unavailable' | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark')
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode)
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer) } }, [notice])
  const loadCallQueue = useCallback(() => fetchCallQueue().then(setCallQueue, () => setCallQueue('unavailable')), [])
  const loadData = useCallback(async () => {
    setLoading(true); setSupabaseError(null); loadCallQueue()
    try {
      const [c, i] = await Promise.all([fetchCustomersData(), fetchInteractionsData()])
      setCustomers(c.data); setInteractions(i.data); setIsLiveSupabase(c.isLive && i.isLive)
      setSupabaseError(c.error || i.error || null)
    } catch (error) { setSupabaseError(error instanceof Error ? error.message : 'Could not load records. Please refresh.') }
    finally { setLoading(false) }
  }, [loadCallQueue])
  useEffect(() => { loadData() }, [loadData])
  // Runs after the CRM save and never undoes it; the outcome is appended to the notice.
  const queueSaved = async (saved: Customer[]) => {
    const due = saved.filter(c => c.due_date && Number(c.outstanding_amount) > 0)
    let added = 0, reason = ''
    for (const c of due) {
      try { const result = await addToCallQueue(c); if (result.installment_id) added++; else reason ||= result.reason || result.status }
      catch (error) { reason = error instanceof Error ? error.message : 'Collections API unavailable'; break }
    }
    if (due.length) loadCallQueue()
    return (added ? `; ${added} added to the call queue` : '') + (reason ? `; ${due.length - added} not added to the call queue: ${reason}` : '')
  }
  const handleCreateCustomer = async (data: Omit<Customer, 'customer_id'>) => {
    const result = await addCustomer(data)
    if (!result.success || !result.data) throw new Error(result.error || 'Could not save customer')
    setCustomers(prev => [...prev, result.data!]);
    const message = result.storage === 'supabase' ? 'Borrower saved to Supabase' : 'Borrower saved on this device only'
    setNotice(message); queueSaved([result.data]).then(queued => queued && setNotice(message + queued))
    if (result.error) {setIsLiveSupabase(false);setSupabaseError(result.error + ' This borrower is saved on this device only; it has not synced to Supabase.')}
  }
  const handleCreateInteraction = async (data: Omit<AgentInteraction, 'interaction_id'>) => {
    const result = await addInteraction(data)
    if (!result.success || !result.data) throw new Error(result.error || 'Could not save interaction')
    setInteractions(prev => [result.data!, ...prev]);
    setNotice(result.storage === 'supabase' ? 'Interaction saved to Supabase' : 'Interaction saved on this device only')
    if (result.error) {setIsLiveSupabase(false);setSupabaseError(result.error + ' This interaction is saved on this device only; it has not synced to Supabase.')}
  }
  const newCall = (id?: number) => {
    setSelectedCustomer(null); setSelectedInteraction(null)
    setPreselectedCustomerId(id ?? customers[0]?.customer_id); setIsNewInteractionOpen(true)
  }
  const startBorrowerCall = async (id: number) => {
    if (callInFlight.current) return
    callInFlight.current = true; setCallingCustomerId(id); setCallError('')
    try {
      const result = await startCollectionCall(id, crypto.randomUUID())
      setNotice(result.message)
    } catch (error) { setCallError(error instanceof Error ? error.message : 'Could not start call.') }
    finally { callInFlight.current = false; setCallingCustomerId(null) }
  }
  const navigate = (view: View) => { setActiveTab(view); setMobileNav(false) }
  const exportPortfolio = () => {
    const columns: (keyof Customer)[] = ['customer_id','name','phone_number','email','language','lending_date','due_date','principal_amount','outstanding_amount','interest_rate']
    const escape = (value: unknown) => { const text = String(value ?? ''); return '"' + (/^[=+\-@\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"' }
    const csv = [columns.join(','), ...customers.map(c => columns.map(key => escape(c[key])).join(','))].join('\r\n')
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], {type:'text/csv;charset=utf-8;'}))
    const link = document.createElement('a'); link.href = url; link.download = 'cashfree-portfolio.csv'; link.click(); URL.revokeObjectURL(url)
    setNotice('Portfolio exported')
  }
  const live = getStoredSupabaseConfig().hasCredentials && isLiveSupabase
  const outstandingCustomers = customers.filter(c => Number(c.outstanding_amount) > 0)
  const priorities = [...outstandingCustomers].sort((a,b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')).slice(0,3)
  const queueRows = callQueue && callQueue !== 'unavailable' ? [...callQueue.call_queue, ...callQueue.other] : []
  const promises = interactions.filter(i => i.payment_status?.toLowerCase() === 'promised to pay').sort((a,b) => (a.promise_to_pay_date || '9999').localeCompare(b.promise_to_pay_date || '9999'))
  const title = activeTab === 'overview' ? 'Portfolio overview' : activeTab === 'customers' ? 'Borrowers & loans' : 'Agent interactions'
  return (
    <div className="workspace">
      <a href="#main-content" className="skip-link">Skip to content</a>
      {mobileNav && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`} aria-label="Main navigation">
        <button className="brand" onClick={() => navigate('overview')} aria-label="Cashfree home"><span className="brand-symbol"><Landmark size={23}/></span><span>cashfree<span className="brand-period">.</span></span></button>
        <div className="workspace-switch"><div className="workspace-avatar">CF</div><div><strong>Collections workspace</strong><span>Loan Recovery & Agent CRM</span></div></div>
        <nav className="primary-nav">
          {([{id:'overview',label:'Overview',icon:LayoutDashboard},{id:'customers',label:'Borrowers & loans',icon:Users},{id:'interactions',label:'Agent interactions',icon:PhoneCall}] as const).map(item => <button key={item.id} className={activeTab === item.id ? 'nav-item active' : 'nav-item'} aria-current={activeTab === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={19}/><span>{item.label}</span>{item.id !== 'overview' && <span className="nav-count">{item.id === 'customers' ? customers.length : interactions.length}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={onSignOut}>Sign out</button><div className="sidebar-profile"><div className="profile-avatar">CW</div><div><strong>{accountName}</strong><span>{live ? 'Connected workspace' : 'Demo workspace'}</span></div><span className="profile-state" aria-label={live ? 'Connected' : 'Demo mode'}/></div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Open navigation"><Menu size={20}/></button><span>Workspace</span><ChevronRight size={14}/><strong>{activeTab === 'overview' ? 'Overview' : activeTab === 'customers' ? 'Borrowers' : 'Interactions'}</strong></div><div className="topbar-actions"><span className={`connection-status ${live ? 'connected' : ''}`}><span/>{live ? 'Supabase connected' : 'Demo workspace'}</span><span className="topbar-divider"/><button className="icon-button" title="Refresh data" aria-label="Refresh data" disabled={loading} onClick={loadData}><RefreshCw size={18} className={loading ? 'animate-spin' : ''}/></button><button className="icon-button" title={isDarkMode ? 'Use light theme' : 'Use dark theme'} aria-label={isDarkMode ? 'Use light theme' : 'Use dark theme'} onClick={() => setIsDarkMode(!isDarkMode)}>{isDarkMode ? <Sun size={19}/> : <Moon size={19}/>}</button><div className="topbar-avatar" aria-label="Collections workspace">CW</div></div></header>
        <main id="main-content" className="page-content">
          <section className="page-heading"><div><h1>{title}</h1><p>{activeTab === 'overview' ? 'A clear view of your portfolio. A better next step for every borrower.' : activeTab === 'customers' ? 'The people behind your portfolio, with every loan in one place.' : 'Every conversation, commitment, and follow-up in one place.'}</p></div><div className="heading-actions">{activeTab !== 'interactions' && <Button variant="outline" onClick={() => setIsBulkImportOpen(true)} disabled={loading}><Upload size={16}/>Upload CSV</Button>}<Button variant="outline" onClick={exportPortfolio} disabled={loading || customers.length === 0}><Download size={16}/>Export portfolio</Button><Button onClick={() => activeTab === 'interactions' ? newCall() : setIsNewCustomerOpen(true)} disabled={activeTab === 'interactions' && !customers.length}><Plus size={17}/>{activeTab === 'interactions' ? 'Log interaction' : 'Add borrower'}</Button></div></section>
          {callError && <div className="query-notice" role="alert"><AlertCircle size={19}/><p>{callError}</p><button onClick={() => setCallError('')}>Dismiss</button></div>}
          {supabaseError && <div className="query-notice" role="alert"><AlertCircle size={19}/><div><strong>Could not load your portfolio</strong><p>{supabaseError}</p></div><button onClick={loadData} disabled={loading}>Retry</button></div>}
          {loading ? <div className="workspace-loading" aria-label="Loading portfolio" role="status"><span className="sr-only">Loading portfolio</span><div className="skeleton summary-skeleton"/><div className="skeleton content-skeleton"/></div> : <>
            <MetricsOverview customers={customers} interactions={interactions}/>
            {activeTab === 'overview' && <section className="overview-grid">
              <div className="priority-panel"><div className="section-heading"><div><h2>Upcoming balances</h2><p>Open balances, ordered by earliest due date</p></div><button className="text-button" onClick={() => navigate('customers')}>View all borrowers</button></div><div className="queue-list">{priorities.length ? priorities.map(c => <button className="queue-row" key={c.customer_id} onClick={() => setSelectedCustomer(c)}><span className="borrower-avatar">{c.name.split(' ').map(n => n[0]).slice(0,2).join('')}</span><span className="queue-identity"><strong>{c.name}</strong><span>Due {formatDate(c.due_date)}</span></span><span className="queue-balance">{formatCurrency(c.outstanding_amount)}<span>Outstanding</span></span><ChevronRight size={17}/></button>) : <div className="simple-empty"><Check size={24}/><p>No open balances. Your portfolio is up to date.</p></div>}</div></div>
              <div className="commitment-panel"><div className="section-heading"><div><h2>Payment commitments</h2><p>{promises.length} recorded {promises.length === 1 ? 'promise' : 'promises'} to pay</p></div><CalendarDays size={20}/></div><div className="commitment-list">{promises.slice(0,3).map(i => <button className="commitment-row" key={i.interaction_id} onClick={() => setSelectedInteraction(i)}><span className="commitment-date"><CalendarDays size={16}/>{formatDate(i.promise_to_pay_date)}</span><span><strong>{customers.find(c => c.customer_id === i.customer_id)?.name || `Borrower #${i.customer_id}`}</strong><b>{formatCurrency(i.promise_to_pay_amount)}</b></span></button>)}{!promises.length && <p className="simple-empty">Log a call to record a payment commitment.</p>}</div></div>
              <div className="priority-panel col-span-full"><div className="section-heading"><div><h2>Call queue</h2><p>{callQueue && callQueue !== 'unavailable' ? `${callQueue.call_queue.length} ready to call, ranked by earliest due date · ${callQueue.other.length} other` : 'From the collections API'}</p></div><PhoneCall size={20}/></div><div className="queue-list">{callQueue === null ? <p className="simple-empty">Loading call queue…</p> : callQueue === 'unavailable' ? <p className="simple-empty">Call queue unavailable. Start the collections API.</p> : queueRows.length ? queueRows.slice(0,5).map(r => <div className="queue-row" key={r.installment_id}><span className="borrower-avatar">{r.name.split(' ').map(n => n[0]).slice(0,2).join('')}</span><span className="queue-identity"><strong>{r.name}</strong><span>{r.rank ? `#${r.rank} · ` : ''}Due {formatDate(r.due_date)} · {r.reason}</span></span><span className="queue-balance">{formatCurrency(r.outstanding_amount)}<span>Outstanding</span></span></div>) : <p className="simple-empty">No installments in the call queue yet.</p>}</div></div>
            </section>}
            <section className="records-section"><div className="section-heading records-heading"><div><h2>{activeTab === 'interactions' ? 'Call activity' : activeTab === 'overview' ? 'Your borrowers' : 'Borrower directory'}</h2><p>{activeTab === 'interactions' ? `${interactions.length} recorded conversations` : `${customers.length} borrowers · ${outstandingCustomers.length} with open balances`}</p></div>{activeTab === 'overview' && <div className="section-tabs"><button className="selected" aria-current="true">Borrowers</button><button onClick={() => navigate('interactions')}>Call activity <span>{interactions.length}</span></button></div>}</div>{activeTab === 'interactions' ? <InteractionsView interactions={interactions} customers={customers} onSelectInteraction={setSelectedInteraction} onNewCall={() => newCall()} onSelectCustomer={setSelectedCustomer}/> : <CustomersView customers={customers} interactions={interactions} onSelectCustomer={setSelectedCustomer} onNewCustomer={() => setIsNewCustomerOpen(true)} callingCustomerId={callingCustomerId} onImportCsv={() => setIsBulkImportOpen(true)} onNewCall={startBorrowerCall}/>}</section>
          </>}
        </main>
      </div>
      {notice && <div className="toast" role="status"><Check size={18}/>{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16}/></button></div>}
      <CustomerDetailModal customer={selectedCustomer} interactions={interactions} isOpen={!!selectedCustomer} onClose={() => setSelectedCustomer(null)} onSelectInteraction={i => {setSelectedCustomer(null); setSelectedInteraction(i)}} onNewCall={newCall}/>
      <InteractionDetailModal interaction={selectedInteraction} customer={customers.find(c => c.customer_id === selectedInteraction?.customer_id)} isOpen={!!selectedInteraction} onClose={() => setSelectedInteraction(null)} onViewCustomer={setSelectedCustomer}/>
      {isBulkImportOpen && <BulkImportModal onClose={() => setIsBulkImportOpen(false)} onImport={async rows => { const saved = await importCustomers(rows); setCustomers(previous => [...previous, ...saved]); const message = rows.length + ' borrowers imported successfully'; setNotice(message); queueSaved(saved).then(queued => queued && setNotice(message + queued)) }}/>}
      {isNewCustomerOpen && <NewCustomerModal isOpen onClose={() => setIsNewCustomerOpen(false)} onSubmit={handleCreateCustomer}/>}
      {isNewInteractionOpen && <NewInteractionModal customers={customers} defaultCustomerId={preselectedCustomerId} isOpen onClose={() => setIsNewInteractionOpen(false)} onSubmit={handleCreateInteraction}/>}
    </div>
  )
}
export { AuthApp as App, AuthApp as default } from './components/AuthApp'

