import { parseReceipt } from '@/lib/receiptParser'
import { LanguageSelect } from './LanguageSelect'
import { DialogFrame } from './ui/DialogFrame'
import React, { useEffect, useRef, useState } from 'react'
import { Customer } from '@/types/database'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { X, UserPlus, Save, ReceiptText, Upload, FileText, ArrowRight } from 'lucide-react'

interface NewCustomerModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (customer: Omit<Customer, 'customer_id'>) => Promise<void>
}

export const NewCustomerModal: React.FC<NewCustomerModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('+91 ')
  const [email, setEmail] = useState('')
  const [language, setLanguage] = useState('English')
  const [lendingDate, setLendingDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [principalAmount, setPrincipalAmount] = useState('')
  const [outstandingAmount, setOutstandingAmount] = useState('')
  const [interestRate, setInterestRate] = useState('12.5')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const parsingController = useRef<AbortController | null>(null)
  const [parsing, setParsing] = useState(false)
  const [receiptParsed, setReceiptParsed] = useState(false)
  useEffect(() => () => parsingController.current?.abort(), [])
  const [entryMethod, setEntryMethod] = useState<'manual' | 'receipt'>('manual')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [receiptError, setReceiptError] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const selectReceipt = (file?: File) => {
    if (!file || parsing) return
    setReceipt(null); setReceiptParsed(false)
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
      setReceiptError('Choose a JPG, PNG, or PDF receipt.')
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      setReceiptError('Choose a receipt up to 3 MB.')
      return
    }
    setReceipt(file)
    setReceiptError('')
  }

  const handleParseReceipt = async () => {
    if (!receipt || parsing) return
    const controller = new AbortController(); parsingController.current = controller
    setParsing(true); setReceiptError('')
    try {
      const fields = await parseReceipt(receipt, controller.signal)
      if (controller.signal.aborted) return
      const field = (key: keyof typeof fields) => fields[key] == null ? '' : String(fields[key])
      const numeric = (key: keyof typeof fields) => field(key).replace(/[₹,%\s]/g, '')
      const date = (key: keyof typeof fields) => /^\d{4}-\d{2}-\d{2}$/.test(field(key)) && Number.isFinite(Date.parse(field(key))) && new Date(field(key)).toISOString().slice(0, 10) === field(key) ? field(key) : ''
      const phoneDigits = field('phone_number').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')
      const locales: Record<string, string> = { 'te-IN': 'Telugu', 'en-IN': 'English', 'ta-IN': 'Tamil', 'hi-IN': 'Hindi', 'kn-IN': 'Kannada', 'ml-IN': 'Malayalam' }
      setName(field('name')); setPhone(phoneDigits ? `+91 ${phoneDigits}` : '+91 '); setEmail(field('email'))
      setLanguage(locales[field('language')] || field('language') || 'English')
      setLendingDate(date('lending_date')); setDueDate(date('due_date'))
      setPrincipalAmount(numeric('principal_amount')); setOutstandingAmount(numeric('outstanding_amount')); setInterestRate(numeric('interest_rate'))
      setError(''); setReceiptParsed(true); setEntryMethod('manual')
    } catch (error) { if (!controller.signal.aborted) setReceiptError(error instanceof Error ? error.message : 'Could not parse receipt.') }
    finally { if (!controller.signal.aborted) setParsing(false) }
  }
  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (!name.trim() || !phone.trim()) throw new Error('Enter the borrower’s name and phone number.')
      if (dueDate && lendingDate && dueDate < lendingDate) throw new Error('Due date must be on or after the lending date.')
      if (!/^\+91[6-9]\d{9}$/.test(phone.replace(/\s/g, ''))) throw new Error('Enter a valid 10-digit Indian mobile number with +91.')
      const principal = parseFloat(principalAmount) || 0
      const outstanding = outstandingAmount ? parseFloat(outstandingAmount) : principal

      await onSubmit({
        name: name.trim(),
        phone_number: phone.trim(),
        email: email.trim() || null,
        language: language.trim() || 'English',
        lending_date: lendingDate || null,
        due_date: dueDate || null,
        principal_amount: principal,
        outstanding_amount: outstanding,
        interest_rate: parseFloat(interestRate) || 0,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <DialogFrame title="Add borrower" onClose={onClose}>
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-600/10 text-emerald-600 flex items-center justify-center">
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Add borrower
              </h2>
              <p className="text-xs text-slate-500">Add contact details and loan information.</p>
            </div>
          </div>
          <Button aria-label="Close dialog" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-slate-500">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 px-6 pt-5" aria-label="Borrower entry method">
          <Button variant={entryMethod === 'manual' ? 'default' : 'outline'} disabled={parsing} onClick={() => setEntryMethod('manual')} aria-pressed={entryMethod === 'manual'} className="gap-2">
            <UserPlus size={16} />Enter manually
          </Button>
          <Button variant={entryMethod === 'receipt' ? 'default' : 'outline'} disabled={parsing} onClick={() => setEntryMethod('receipt')} aria-pressed={entryMethod === 'receipt'} className="gap-2">
            <ReceiptText size={16} />Upload receipt
          </Button>
        </div>

        {entryMethod === 'receipt' ? <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Start with a receipt</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">Upload a loan receipt and parse its borrower and loan details with Sarvam.</p>
          </div>
          <label
            className={`relative flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors focus-within:ring-2 focus-within:ring-blue-500 ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-slate-200 bg-slate-50 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-950/40'}`}
            onDragOver={event => { event.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={event => { event.preventDefault(); setIsDragging(false); selectReceipt(event.dataTransfer.files[0]) }}
          >
            <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="sr-only" disabled={parsing} aria-label="Choose receipt" onChange={event => { selectReceipt(event.target.files?.[0]); event.target.value = '' }} />
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"><Upload size={22} /></span>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Click to upload or drag and drop</span>
            <span className="text-xs text-slate-500">JPG, PNG or PDF · Up to 3 MB</span>
          </label>
          {receiptError && <p className="form-error" role="alert">{receiptError}</p>}
          {receipt && <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700" role="status">
            <FileText size={22} className="shrink-0 text-blue-600" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{receipt.name}</p><p className="text-xs text-slate-500">{(receipt.size / 1024 / 1024).toFixed(2)} MB · Selected</p></div>
            <Button variant="ghost" size="icon" disabled={parsing} aria-label="Remove receipt" onClick={() => setReceipt(null)}><X size={16} /></Button>
          </div>}
          <p className="rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">Parse the receipt to prefill this form. Review all extracted details before saving. The receipt is sent to Sarvam for processing; no borrower is created and no call is started by parsing.</p>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="outline" size="sm" disabled={parsing} onClick={() => setEntryMethod('manual')}>Enter manually</Button><Button size="sm" onClick={handleParseReceipt} disabled={!receipt || parsing} className="gap-1.5">{parsing ? 'Parsing receipt…' : 'Parse receipt'}<ArrowRight size={14} /></Button>
          </div>
        </div> :
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {receiptParsed && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700" role="status">Receipt parsed. Review and correct every field, including any missing details, before creating the borrower.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Full Name *
              </label>
              <Input
                type="text"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Phone Number *
              </label>
              <Input
                type="tel"
                placeholder="+91 98765 43210"
                pattern="\+91[ ]*[6-9][0-9 ]{9,}"
                title="Enter an Indian mobile number with +91 followed by 10 digits"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Email Address
              </label>
              <Input
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Language
              </label>
              <LanguageSelect id="borrower-language" label="Language" value={language} onChange={setLanguage}/>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Lending Date
              </label>
              <Input
                type="date"
                value={lendingDate}
                onChange={(e) => setLendingDate(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Due Date
              </label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200/80 dark:border-slate-800">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Principal (₹) *
              </label>
              <Input
                type="number"
                step="0.01" min="0"
                placeholder="5000"
                value={principalAmount}
                onChange={(e) => {
                  setPrincipalAmount(e.target.value)
                  // Leave blank to use the final principal amount on save.
                }}
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Outstanding (₹)
              </label>
              <Input
                type="number"
                step="0.01" min="0"
                placeholder="5000"
                value={outstandingAmount}
                onChange={(e) => setOutstandingAmount(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                Interest Rate (%) *
              </label>
              <Input
                type="number"
                step="0.01" min="0"
                placeholder="12.5"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading} className="gap-1.5">
              <Save className="h-4 w-4" />
              {loading ? 'Adding...' : 'Create borrower'}
            </Button>
          </div>
        </form>}
      </div>
    </DialogFrame>
  )
}
