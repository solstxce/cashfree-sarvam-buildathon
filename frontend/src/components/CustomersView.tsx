import { Pagination, usePagination } from './Pagination'
import React, { useState } from 'react'
import { Customer, AgentInteraction } from '@/types/database'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent } from './ui/card'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Search,
  UserPlus, Upload,
  PhoneCall,
  LayoutGrid,
  List,
  Eye,
  Filter,
  ArrowUpDown,
  Mail,
  Phone,
  Calendar,
} from 'lucide-react'

interface CustomersViewProps {
  customers: Customer[]
  interactions: AgentInteraction[]
  onSelectCustomer: (customer: Customer) => void
  callingCustomerId?: number | null
  onImportCsv: () => void
  onNewCustomer: () => void
  onNewCall: (customerId: number) => void
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  interactions,
  onSelectCustomer,
  onNewCustomer, onImportCsv, callingCustomerId,
  onNewCall,
}) => {
  const [search, setSearch] = useState('')
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'active' | 'settled'>('all')
  const [languageFilter, setLanguageFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => window.matchMedia('(max-width: 760px)').matches ? 'grid' : 'table')
  const [sortBy, setSortBy] = useState<'outstanding' | 'due_date' | 'name' | 'principal'>('outstanding')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Get distinct languages
  const languages = Array.from(
    new Set(customers.map((c) => c.language).filter(Boolean))
  ) as string[]

  // Filter & sort
  const filtered = customers
    .filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone_number.toLowerCase().includes(search.toLowerCase()) ||
        (c.email && c.email.toLowerCase().includes(search.toLowerCase())) ||
        String(c.customer_id).includes(search)

      const matchLang = languageFilter === 'all' || c.language === languageFilter
      const matchBalance = balanceFilter === 'all' || (balanceFilter === 'active' ? Number(c.outstanding_amount) > 0 : Number(c.outstanding_amount) === 0)
      return matchSearch && matchLang && matchBalance
    })
    .sort((a, b) => {
      let comparison = 0
      if (sortBy === 'outstanding') {
        comparison = Number(a.outstanding_amount || 0) - Number(b.outstanding_amount || 0)
      } else if (sortBy === 'principal') {
        comparison = Number(a.principal_amount || 0) - Number(b.principal_amount || 0)
      } else if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name)
      } else if (sortBy === 'due_date') {
        const da = a.due_date ? new Date(a.due_date).getTime() : 0
        const db = b.due_date ? new Date(b.due_date).getTime() : 0
        comparison = da - db
      }
      return sortOrder === 'desc' ? -comparison : comparison
    })

  const { visible, controls } = usePagination(filtered, JSON.stringify([search, balanceFilter, languageFilter, sortBy, sortOrder]))

  return (
    <div className="space-y-4">
      <div className="borrower-scope"><div className="filter-tabs">{(['all','active','settled'] as const).map(value => <button key={value} aria-pressed={balanceFilter === value} className={balanceFilter === value ? 'active' : ''} onClick={() => setBalanceFilter(value)}>{value === 'all' ? 'All borrowers' : value === 'active' ? 'Open balances' : 'Settled'}</button>)}</div><span>{filtered.length} of {customers.length} borrowers</span></div>
      {/* Action and Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative min-w-[220px] max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              aria-label="Search borrowers"
              type="text"
              placeholder="Search by name, phone, email, ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Language filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              aria-label="Filter by language" value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
            >
              <option value="all">All Languages ({customers.length})</option>
              {languages.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1.5 text-xs">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
            <select
              aria-label="Sort borrowers" value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-800 dark:bg-slate-950"
            >
              <option value="outstanding">Outstanding Amount</option>
              <option value="due_date">Due Date</option>
              <option value="principal">Principal Amount</option>
              <option value="name">Customer Name</option>
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="h-9 px-2 text-xs"
              title={sortOrder === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
            >
              <ArrowUpDown className="h-4 w-4" /><span className="sr-only">{sortOrder === 'asc' ? 'Ascending' : 'Descending'}</span>
            </Button>
          </div>
        </div>

        {/* View toggle & Add button */}
        <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
          <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-lg p-0.5">
            <Button
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              className="h-7 w-7 p-0"
              title="Table View"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="h-7 w-7 p-0"
              title="Card Grid View"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>

          <Button size="sm" variant="outline" onClick={onImportCsv} className="gap-1.5 text-xs"><Upload className="h-4 w-4" />Upload CSV</Button>
          <Button size="sm" onClick={onNewCustomer} className="gap-1.5 text-xs">
            <UserPlus className="h-4 w-4" />
            Add borrower
          </Button>
        </div>
      </div>

      {/* Main Content: Table or Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center bg-white dark:bg-slate-900">
          <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
            <Search className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            No customers match your criteria
          </p>
          <p className="text-xs text-slate-500 mt-1">Try a different search or reset your filters.</p><Button className="mt-4" variant="outline" onClick={() => {setSearch('');setLanguageFilter('all');setBalanceFilter('all')}}>Reset filters</Button>
        </div>
      ) : viewMode === 'table' ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Borrower</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Language</th>
                  <th className="py-3 px-4">Lending / Due</th>
                  <th className="py-3 px-4 text-right">Principal</th>
                  <th className="py-3 px-4 text-right">Interest</th>
                  <th className="py-3 px-4 text-right">Outstanding</th>
                  <th className="py-3 px-4 text-center">Interactions</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {visible.map((customer) => {
                  const callCount = interactions.filter(
                    (i) => i.customer_id === customer.customer_id
                  ).length
                  const isSettled = Number(customer.outstanding_amount) === 0

                  return (
                    <tr
                      key={customer.customer_id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Name & ID */}
                      <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                        <button type="button"
                          onClick={() => onSelectCustomer(customer)}
                          className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 group flex items-center gap-2"
                        >
                          <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center shrink-0">
                            {customer.name.slice(0, 1)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:underline">
                              {customer.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              ID: #{customer.customer_id}
                            </div>
                          </div>
                        </button>
                      </td>

                      {/* Phone & Email */}
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {customer.phone_number}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                          {customer.email || '—'}
                        </div>
                      </td>

                      {/* Language */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {customer.language || 'English'}
                        </span>
                      </td>

                      {/* Dates */}
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                        <div className="text-[11px]">Due: {formatDate(customer.due_date)}</div>
                        <div className="text-[10px] text-slate-400">
                          Disbursed: {formatDate(customer.lending_date)}
                        </div>
                      </td>

                      {/* Principal */}
                      <td className="py-3.5 px-4 text-right font-medium text-slate-700 dark:text-slate-300">
                        {formatCurrency(customer.principal_amount)}
                      </td>

                      {/* Interest Rate */}
                      <td className="py-3.5 px-4 text-right text-slate-600 dark:text-slate-400">
                        {customer.interest_rate}%
                      </td>

                      {/* Outstanding */}
                      <td className="py-3.5 px-4 text-right">
                        {isSettled ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            Settled (₹0)
                          </span>
                        ) : (
                          <span className="font-bold text-rose-600 dark:text-rose-400">
                            {formatCurrency(customer.outstanding_amount)}
                          </span>
                        )}
                      </td>

                      {/* Interactions Count */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                          {callCount} {callCount === 1 ? 'call' : 'calls'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSelectCustomer(customer)}
                            className="h-7 px-2 text-xs text-blue-600"
                            title="View Customer Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onNewCall(customer.customer_id)}
                            disabled={callingCustomerId != null}
                            aria-label={callingCustomerId === customer.customer_id ? 'Starting call' : `Call ${customer.name}`}
                            className="h-7 px-2 text-xs text-emerald-600"
                            title="Start collection call"
                          >
                            <PhoneCall className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Grid / Card View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((customer) => {
            const callCount = interactions.filter(
              (i) => i.customer_id === customer.customer_id
            ).length
            const isSettled = Number(customer.outstanding_amount) === 0

            return (
              <Card
                key={customer.customer_id}
                className="hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between" role="button" tabIndex={0} aria-label={`View ${customer.name}`} onKeyDown={e => {if(e.key === 'Enter' || e.key === ' ') {e.preventDefault();onSelectCustomer(customer)}}}
                onClick={() => onSelectCustomer(customer)}
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-bold text-sm flex items-center justify-center">
                        {customer.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 hover:text-blue-600">
                          {customer.name}
                        </h4>
                        <div className="text-[11px] text-slate-400 font-mono">
                          ID: #{customer.customer_id} • {customer.language || 'English'}
                        </div>
                      </div>
                    </div>

                    {isSettled ? (
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                        Settled
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-rose-600 dark:text-rose-400">
                        {formatCurrency(customer.outstanding_amount)}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-xs text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <span>{customer.phone_number}</span>
                    </div>
                    {customer.email && (
                      <div className="flex items-center gap-1.5 truncate">
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        <span className="truncate">{customer.email}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span>Due Date: {formatDate(customer.due_date)}</span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-950/60 p-2 rounded-lg">
                    <span>
                      Principal: <strong>{formatCurrency(customer.principal_amount)}</strong> ({customer.interest_rate}%)
                    </span>
                    <span className="text-blue-600 font-semibold">{callCount} Calls</span>
                    <Button size="sm" disabled={callingCustomerId != null} onKeyDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); onNewCall(customer.customer_id) }}><PhoneCall size={14}/>{callingCustomerId === customer.customer_id ? 'Starting…' : 'Call'}</Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
      <Pagination {...controls}/>
    </div>
  )
}
