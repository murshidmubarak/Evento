import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getEventById } from '../../features/events/eventsApi';
import { createQuotation, sendQuotation } from '../../features/quotations/quotationApi';
import type { ClientEvent } from '../../features/events/event.types';
import type { CreateQuotationRequest, IStructuredTerm, IQuotationSchedule, IPaymentInstallment, TaxType, GstTreatment } from '../../features/quotations/quotation.types';
import { Loader2, Plus, Trash2, ArrowLeft, Save, Send, ChevronDown, ChevronUp, Eye, X } from 'lucide-react';

const round2 = (n: number) => Math.round(n * 100) / 100;

export const AdminCreateQuotation = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [event, setEvent] = useState<ClientEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');         // page-load error
  const [saveError, setSaveError] = useState(''); // inline form save error
  const [saveErrors, setSaveErrors] = useState<string[]>([]); // detailed field errors from backend

  // Form State
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [conciergeNotes, setConciergeNotes] = useState('');
  
  const [discount, setDiscount] = useState(0);
  const [advanceAmount, setAdvanceAmount] = useState(0);

  // Tax State
  const [taxType, setTaxType] = useState<TaxType>('none');
  const [taxRate, setTaxRate] = useState(0);
  const [gstTreatment, setGstTreatment] = useState<GstTreatment>('intra_state');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  
  const [items, setItems] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<IQuotationSchedule[]>([]);
  const [paymentPlan, setPaymentPlan] = useState<IPaymentInstallment[]>([]);
  const [structuredTerms, setStructuredTerms] = useState<IStructuredTerm[]>([]);
  
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        setIsLoading(true);
        if (id) {
          const data = await getEventById(id);
          setEvent(data);
          
          // Initialize items based on selected services
          if (data.selectedServices) {
              const initialItems = data.selectedServices.map(s => {
                const isPerGuest = s.pricingType === 'per_guest';
                return {
                  serviceId: s.serviceId,
                  name: s.serviceName,
                  pricingType: s.pricingType || 'per_event',
                  scope: '',
                  requirements: Object.entries(s.preferences || {}).map(([k, v]) => `${k}: ${v}`).join(', '),
                  quantity: isPerGuest ? (data.guestCount || 1) : 1,
                  unitPrice: s.basePrice || 0,
                  detailedContent: []
                };
              });
            setItems(initialItems);
            if (initialItems.length > 0) setExpandedService(initialItems[0].serviceId);
          }
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load event details');
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvent();
  }, [id]);

  // Derived calculations — mirrors backend logic
  const subtotal = round2(items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0));
  const discountSafe = round2(Math.max(0, Math.min(discount, subtotal)));
  const taxableAmount = round2(subtotal - discountSafe);

  let taxAmount = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (taxType === 'gst') {
    if (gstTreatment === 'exempt' || taxRate === 0) {
      taxAmount = 0;
    } else if (gstTreatment === 'intra_state') {
      taxAmount = round2(taxableAmount * (taxRate / 100));
      cgst = round2(taxAmount / 2);
      sgst = round2(taxAmount - cgst);
    } else if (gstTreatment === 'inter_state') {
      taxAmount = round2(taxableAmount * (taxRate / 100));
      igst = taxAmount;
    }
  } else if (taxType === 'vat' || taxType === 'custom') {
    taxAmount = taxRate > 0 ? round2(taxableAmount * (taxRate / 100)) : 0;
  }

  const finalAmount = round2(taxableAmount + taxAmount);
  const remainingAmount = round2(Math.max(0, finalAmount - advanceAmount));

  const handleSave = async (issue: boolean = false) => {
    if (isSaving) return; // Guard against double-click creating multiple revisions
    try {
      setIsSaving(true);
      setSaveError('');
      setSaveErrors([]);

      // Ensure all quantities are positive integers and detailedContent is clean
      const sanitizedItems = items.map(i => ({
        serviceId: i.serviceId,
        quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
        unitPrice: Math.max(0, Number(i.unitPrice) || 0),
        requirements: i.requirements || '',
        scope: i.scope || '',
        detailedContent: (i.detailedContent || [])
          .filter((s: any) => s.sectionName?.trim() || s.items?.some((x: string) => x?.trim()))
          .map((s: any) => ({
            sectionName: (s.sectionName?.trim() || 'Details'),
            items: (s.items || []).filter((x: string) => typeof x === 'string' && x.trim().length > 0)
          }))
      }));

      // Sanitize structuredTerms: filter empty rows, provide defaults
      const sanitizedStructuredTerms = structuredTerms
        .filter(t => t.title?.trim() || t.content?.trim())
        .map(t => ({
          title: (t.title || t.content || '').trim(),
          content: (t.content || '').trim()
        }));

      // Sanitize schedules: filter empty rows
      const sanitizedSchedules = schedules
        .filter(s => s.title?.trim() || s.time?.trim())
        .map(s => ({
          title: (s.title || 'Schedule').trim(),
          time: (s.time || '').trim()
        }));

      // Sanitize paymentPlan: filter empty rows
      const sanitizedPaymentPlan = paymentPlan
        .filter(p => p.title?.trim() || (Number(p.amount) > 0))
        .map(p => ({
          title: (p.title || 'Installment').trim(),
          amount: Math.max(0, Number(p.amount) || 0),
          dueDateDescription: (p.dueDateDescription || '').trim(),
          percentage: p.percentage,
          purpose: p.purpose || [],
          status: p.status || 'Pending'
        }));
      
      const request: CreateQuotationRequest = {
        eventId: id!,
        items: sanitizedItems,
        discount,
        advanceAmount,
        tax: taxType === 'none'
          ? { taxType: 'none', taxRate: 0 }
          : {
              taxType,
              taxRate,
              ...(taxType === 'gst' ? { gstTreatment } : {}),
              ...(placeOfSupply ? { placeOfSupply } : {}),
              ...(customerGstin ? { customerGstin } : {}),
            },
        validUntil: validUntil || undefined,
        notes,
        terms,
        structuredTerms: sanitizedStructuredTerms,
        schedules: sanitizedSchedules,
        paymentPlan: sanitizedPaymentPlan,
        conciergeNotes
      };

      const qtn = await createQuotation(request);
      
      if (issue) {
        await sendQuotation(qtn._id);
      }
      navigate(`/admin/quotations/success/${qtn._id}`);
    } catch (err: any) {
      // Use saveError (not error) so the full-page load error check is NOT triggered
      const msg = err.response?.data?.message || 'Failed to save quotation';
      const details: string[] = err.response?.data?.error?.errors || [];
      setSaveError(msg);
      setSaveErrors(details);
    } finally {
      setIsSaving(false);
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-100 max-w-2xl mx-auto mt-8 shadow-sm">
        <h2 className="text-xl font-bold mb-2">Error</h2>
        <p>{error || 'Event not found'}</p>
        <Link to="/admin/events" className="inline-block mt-4 text-indigo-600 hover:underline font-medium">
          ← Back to Events
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-24 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={`/admin/events/${id}`} className="p-2 hover:bg-white/50 rounded-xl transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Create Quotation</h1>
            <p className="text-gray-500 font-medium mt-1">For {event.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-2 bg-white text-gray-700 px-6 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all font-semibold shadow-sm"
          >
            <Eye className="w-5 h-5" />
            Preview
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={isSaving}
            className="flex items-center gap-2 bg-white text-gray-700 px-6 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all font-semibold shadow-sm"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Save Draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={isSaving}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-2.5 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md font-semibold"
          >
            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Issue Quotation
          </button>
        </div>
      </div>

      {/* Inline save error — shown inside the form, never replaces the page */}
      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-red-700 font-semibold text-sm">{saveError}</p>
          {saveErrors.length > 0 && (
            <ul className="mt-2 space-y-1">
              {saveErrors.map((e, i) => (
                <li key={i} className="text-red-600 text-xs flex items-start gap-1.5">
                  <span className="mt-0.5">•</span><span>{e}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column - Form */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Services & Pricing */}
          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center justify-between">
              Services & Pricing
            </h2>
            
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={item.serviceId} className="border border-gray-200 rounded-2xl overflow-hidden transition-all duration-300">
                  <div 
                    className="flex justify-between items-center p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
                    onClick={() => setExpandedService(expandedService === item.serviceId ? null : item.serviceId)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-lg text-gray-900">{item.name}</span>
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-md uppercase">{item.pricingType?.replace('_', ' ') || 'Service'}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-semibold text-gray-900">₹{(item.quantity * item.unitPrice).toLocaleString()}</span>
                      {expandedService === item.serviceId ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                    </div>
                  </div>
                  
                  {expandedService === item.serviceId && (
                    <div className="p-6 space-y-6 bg-white border-t border-gray-100">
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                          <input 
                            type="text" 
                            className="w-full border-gray-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500" 
                            placeholder="e.g. 500 plates"
                            value={item.scope}
                            onChange={e => updateItem(index, 'scope', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Client Requirements</label>
                          <input 
                            type="text" 
                            className="w-full border-gray-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm" 
                            placeholder="Requirements"
                            value={item.requirements}
                            onChange={e => updateItem(index, 'requirements', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 bg-gray-50 p-4 rounded-xl">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {item.pricingType === 'per_guest' ? 'Quantity (Guests)' : 'Quantity'}
                          </label>
                          <input 
                            type="number" min="1" step="1"
                            className="w-full border-gray-200 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" 
                            value={item.quantity}
                            onChange={e => updateItem(index, 'quantity', Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Unit Price (₹) {item.pricingType === 'per_guest' ? '/ Guest' : ''}
                          </label>
                          <input 
                            type="number" min="0"
                            className="w-full border-gray-200 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" 
                            value={item.unitPrice}
                            onChange={e => updateItem(index, 'unitPrice', Number(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                          <input 
                            type="text"
                            className="w-full border-gray-200 rounded-lg bg-gray-100 text-gray-600 font-semibold" 
                            value={`₹${(item.quantity * item.unitPrice).toLocaleString()}`}
                            disabled
                          />
                        </div>
                      </div>
                      
                      {/* Detailed Content */}
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <label className="block text-sm font-bold text-gray-900">Detailed Sections (e.g. Main Course, Desserts)</label>
                          <button 
                            className="text-indigo-600 text-sm font-medium flex items-center gap-1 hover:text-indigo-800"
                            onClick={() => {
                              const newContent = [...(item.detailedContent || []), { sectionName: '', items: [''] }];
                              updateItem(index, 'detailedContent', newContent);
                            }}
                          >
                            <Plus className="w-4 h-4" /> Add Section
                          </button>
                        </div>
                        
                        <div className="space-y-4">
                          {item.detailedContent?.map((section: any, sIdx: number) => (
                            <div key={sIdx} className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm">
                              <div className="flex gap-2 mb-3">
                                <input 
                                  type="text" 
                                  className="flex-1 border-gray-200 rounded-lg font-semibold focus:ring-indigo-500"
                                  placeholder="Section Name (e.g. Starters Platter)"
                                  value={section.sectionName}
                                  onChange={e => {
                                    const newContent = [...item.detailedContent];
                                    newContent[sIdx].sectionName = e.target.value;
                                    updateItem(index, 'detailedContent', newContent);
                                  }}
                                />
                                <button 
                                  className="text-red-500 p-2 hover:bg-red-50 rounded-lg"
                                  onClick={() => {
                                    const newContent = item.detailedContent.filter((_: any, i: number) => i !== sIdx);
                                    updateItem(index, 'detailedContent', newContent);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="space-y-2">
                                {section.items.map((strItem: string, iIdx: number) => (
                                  <div key={iIdx} className="flex gap-2 items-center">
                                    <span className="text-gray-400">•</span>
                                    <input 
                                      type="text"
                                      className="flex-1 text-sm border-gray-200 rounded-lg focus:ring-indigo-500 py-1.5"
                                      placeholder="Item detail..."
                                      value={strItem}
                                      onChange={e => {
                                        const newContent = [...item.detailedContent];
                                        newContent[sIdx].items[iIdx] = e.target.value;
                                        updateItem(index, 'detailedContent', newContent);
                                      }}
                                    />
                                    {iIdx === section.items.length - 1 ? (
                                      <button 
                                        onClick={() => {
                                          const newContent = [...item.detailedContent];
                                          newContent[sIdx].items.push('');
                                          updateItem(index, 'detailedContent', newContent);
                                        }}
                                        className="text-indigo-600 p-1"
                                      >
                                        <Plus className="w-4 h-4" />
                                      </button>
                                    ) : (
                                      <button 
                                        onClick={() => {
                                          const newContent = [...item.detailedContent];
                                          newContent[sIdx].items = newContent[sIdx].items.filter((_: any, i: number) => i !== iIdx);
                                          updateItem(index, 'detailedContent', newContent);
                                        }}
                                        className="text-gray-400 hover:text-red-500 p-1"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tax Configuration */}
          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Tax Configuration</h2>
            <div className="space-y-5">
              {/* Tax Type Pills */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tax Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['none', 'gst', 'vat', 'custom'] as TaxType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => { setTaxType(t); setTaxRate(0); }}
                      className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                        taxType === t
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                      }`}
                    >
                      {t === 'none' ? 'No Tax' : t.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {taxType !== 'none' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tax Rate (%)
                        {taxType === 'gst' && <span className="text-xs text-gray-400 ml-1">— CGST+SGST or IGST</span>}
                      </label>
                      <input
                        type="number" min="0" max="100" step="0.01"
                        className="w-full border-gray-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 font-semibold"
                        placeholder="e.g. 18"
                        value={taxRate}
                        onChange={e => setTaxRate(Number(e.target.value) || 0)}
                      />
                    </div>
                    {taxType === 'gst' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">GST Treatment</label>
                        <select
                          className="w-full border-gray-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 font-medium"
                          value={gstTreatment}
                          onChange={e => setGstTreatment(e.target.value as GstTreatment)}
                        >
                          <option value="intra_state">Intra-State (CGST + SGST)</option>
                          <option value="inter_state">Inter-State (IGST)</option>
                          <option value="exempt">Exempt (0% Tax)</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {taxType === 'gst' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Place of Supply <span className="text-gray-400 font-normal">(optional)</span></label>
                        <input
                          type="text"
                          className="w-full border-gray-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          placeholder="e.g. Kerala, Maharashtra"
                          value={placeOfSupply}
                          onChange={e => setPlaceOfSupply(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Customer GSTIN <span className="text-gray-400 font-normal">(optional)</span></label>
                        <input
                          type="text"
                          className="w-full border-gray-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono"
                          placeholder="e.g. 29ABCDE1234F1Z5"
                          value={customerGstin}
                          onChange={e => setCustomerGstin(e.target.value.toUpperCase())}
                        />
                      </div>
                    </div>
                  )}

                  {taxRate > 0 && (
                    <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
                      <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-3">Tax Preview</p>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between text-gray-600">
                          <span>Taxable Amount</span>
                          <span className="font-semibold text-gray-800">₹{taxableAmount.toLocaleString()}</span>
                        </div>
                        {taxType === 'gst' && gstTreatment === 'intra_state' && (
                          <>
                            <div className="flex justify-between text-gray-500">
                              <span>CGST ({(taxRate / 2).toFixed(2)}%)</span>
                              <span>₹{cgst.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-gray-500">
                              <span>SGST ({(taxRate / 2).toFixed(2)}%)</span>
                              <span>₹{sgst.toLocaleString()}</span>
                            </div>
                          </>
                        )}
                        {taxType === 'gst' && gstTreatment === 'inter_state' && (
                          <div className="flex justify-between text-gray-500">
                            <span>IGST ({taxRate}%)</span>
                            <span>₹{igst.toLocaleString()}</span>
                          </div>
                        )}
                        {(taxType === 'vat' || taxType === 'custom') && (
                          <div className="flex justify-between text-gray-500">
                            <span>{taxType.toUpperCase()} ({taxRate}%)</span>
                            <span>₹{taxAmount.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-indigo-700 pt-1 border-t border-indigo-200">
                          <span>Total Tax</span>
                          <span>₹{taxAmount.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Schedules */}
          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Schedules</h2>
              <button 
                onClick={() => setSchedules([...schedules, { title: '', time: '' }])}
                className="text-sm bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-100 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Schedule
              </button>
            </div>
            {schedules.length === 0 ? (
              <p className="text-gray-500 italic text-sm">No schedules added.</p>
            ) : (
              <div className="space-y-3">
                {schedules.map((sch, idx) => (
                  <div key={idx} className="flex gap-3 items-center">
                    <input 
                      type="text" placeholder="Title (e.g. Venue Handover)" 
                      className="flex-1 border-gray-200 rounded-xl"
                      value={sch.title}
                      onChange={e => {
                        const newSch = [...schedules];
                        newSch[idx].title = e.target.value;
                        setSchedules(newSch);
                      }}
                    />
                    <input 
                      type="text" placeholder="Time (e.g. 7:00 AM)" 
                      className="w-32 border-gray-200 rounded-xl"
                      value={sch.time}
                      onChange={e => {
                        const newSch = [...schedules];
                        newSch[idx].time = e.target.value;
                        setSchedules(newSch);
                      }}
                    />
                    <button onClick={() => setSchedules(schedules.filter((_, i) => i !== idx))} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment Plan */}
          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Payment Plan</h2>
              <button 
                onClick={() => setPaymentPlan([...paymentPlan, { title: '', amount: 0, dueDateDescription: '', purpose: [] }])}
                className="text-sm bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-100 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Installment
              </button>
            </div>
            
            <div className="space-y-4">
              {paymentPlan.map((plan, idx) => (
                <div key={idx} className="border border-gray-200 p-4 rounded-2xl flex gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex gap-3">
                      <input 
                        type="text" placeholder="Title (e.g. Booking Advance)" 
                        className="flex-1 border-gray-200 rounded-lg"
                        value={plan.title}
                        onChange={e => {
                          const newP = [...paymentPlan];
                          newP[idx].title = e.target.value;
                          setPaymentPlan(newP);
                        }}
                      />
                      <input 
                        type="number" placeholder="Amount (₹)" 
                        className="w-32 border-gray-200 rounded-lg"
                        value={plan.amount}
                        onChange={e => {
                          const newP = [...paymentPlan];
                          newP[idx].amount = Number(e.target.value) || 0;
                          setPaymentPlan(newP);
                        }}
                      />
                    </div>
                    <input 
                      type="text" placeholder="Due Date Description (e.g. Immediate upon acceptance)" 
                      className="w-full border-gray-200 rounded-lg text-sm"
                      value={plan.dueDateDescription}
                      onChange={e => {
                        const newP = [...paymentPlan];
                        newP[idx].dueDateDescription = e.target.value;
                        setPaymentPlan(newP);
                      }}
                    />
                  </div>
                  <button onClick={() => setPaymentPlan(paymentPlan.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Terms */}
          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Structured Terms</h2>
              <button 
                onClick={() => setStructuredTerms([...structuredTerms, { title: '', content: '' }])}
                className="text-sm bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-100 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Term
              </button>
            </div>
            <div className="space-y-4">
              {structuredTerms.map((term, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="flex-1 space-y-2">
                    <input 
                      type="text" placeholder="Title (e.g. Validity, Cancellation)" 
                      className="w-full border-gray-200 rounded-lg font-medium"
                      value={term.title}
                      onChange={e => {
                        const newT = [...structuredTerms];
                        newT[idx].title = e.target.value;
                        setStructuredTerms(newT);
                      }}
                    />
                    <textarea 
                      placeholder="Content (optional)..." 
                      className="w-full border-gray-200 rounded-lg text-sm"
                      rows={2}
                      value={term.content}
                      onChange={e => {
                        const newT = [...structuredTerms];
                        newT[idx].content = e.target.value;
                        setStructuredTerms(newT);
                      }}
                    />
                  </div>
                  <button onClick={() => setStructuredTerms(structuredTerms.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 self-start mt-2">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes & Additional Info */}
          <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Additional Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">General Notes</label>
                <textarea 
                  className="w-full border-gray-200 rounded-lg text-sm" rows={2}
                  value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Notes visible to client..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Standard Terms & Conditions</label>
                <textarea 
                  className="w-full border-gray-200 rounded-lg text-sm" rows={2}
                  value={terms} onChange={e => setTerms(e.target.value)}
                  placeholder="General terms..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Internal Concierge Notes (Admin Only)</label>
                <textarea 
                  className="w-full border-gray-200 rounded-lg text-sm" rows={2}
                  value={conciergeNotes} onChange={e => setConciergeNotes(e.target.value)}
                  placeholder="Notes for internal team..."
                />
              </div>
            </div>
          </div>

        </div>

        {/* Right Column - Summary & Settings */}
        <div className="space-y-6">
          
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm sticky top-6">
            <h3 className="text-lg font-bold text-gray-900 mb-6">Financial Summary</h3>
            
            <div className="space-y-3 text-sm mb-6">
              <div className="flex justify-between items-center text-gray-600">
                <span>Subtotal</span>
                <span className="font-semibold text-gray-900">₹{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-gray-600">
                <span>Discount</span>
                <input 
                  type="number" min="0" max={subtotal}
                  className="w-24 border-gray-200 rounded-lg py-1 px-2 text-right text-gray-900 font-semibold" 
                  value={discount}
                  onChange={e => setDiscount(Number(e.target.value) || 0)}
                />
              </div>
              <div className="flex justify-between items-center text-gray-500">
                <span>Taxable Amount</span>
                <span className="font-medium">₹{taxableAmount.toLocaleString()}</span>
              </div>
              {taxType !== 'none' && taxAmount > 0 && (
                <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 space-y-1.5">
                  {taxType === 'gst' && gstTreatment === 'intra_state' && (
                    <>
                      <div className="flex justify-between text-amber-700 text-xs">
                        <span>CGST ({(taxRate / 2).toFixed(2)}%)</span>
                        <span>₹{cgst.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-amber-700 text-xs">
                        <span>SGST ({(taxRate / 2).toFixed(2)}%)</span>
                        <span>₹{sgst.toLocaleString()}</span>
                      </div>
                    </>
                  )}
                  {taxType === 'gst' && gstTreatment === 'inter_state' && (
                    <div className="flex justify-between text-amber-700 text-xs">
                      <span>IGST ({taxRate}%)</span>
                      <span>₹{igst.toLocaleString()}</span>
                    </div>
                  )}
                  {(taxType === 'vat' || taxType === 'custom') && (
                    <div className="flex justify-between text-amber-700 text-xs">
                      <span>{taxType.toUpperCase()} ({taxRate}%)</span>
                      <span>₹{taxAmount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-amber-800 text-xs font-bold pt-1 border-t border-amber-200">
                    <span>Total Tax</span>
                    <span>₹{taxAmount.toLocaleString()}</span>
                  </div>
                </div>
              )}
              {taxType !== 'none' && taxAmount === 0 && (
                <div className="flex justify-between items-center text-gray-400 text-xs italic">
                  <span>Tax ({taxType.toUpperCase()})</span>
                  <span>₹0.00 (Exempt / 0%)</span>
                </div>
              )}
              <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                <span className="font-bold text-gray-900 text-base">Final Amount</span>
                <span className="font-extrabold text-indigo-600 text-xl">₹{finalAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-gray-600 pt-1">
                <span>Remaining</span>
                <span className="font-semibold text-gray-900">₹{remainingAmount.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Advance Required (₹)</label>
                <input 
                  type="number" min="0" max={finalAmount}
                  className="w-full border-gray-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 font-semibold" 
                  value={advanceAmount}
                  onChange={e => setAdvanceAmount(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
                <input 
                  type="date"
                  className="w-full border-gray-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500" 
                  value={validUntil}
                  onChange={e => setValidUntil(e.target.value)}
                />
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">
                The backend performs authoritative calculation of amounts.
              </p>
            </div>
          </div>
          
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button
              onClick={() => setShowPreview(false)}
              className="sticky top-4 float-right mr-4 z-10 p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="p-12 pt-10">

              {/* Header */}
              <div className="border-b-2 border-indigo-600 pb-6 mb-8 flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight uppercase">Quotation</h2>
                  <p className="text-gray-400 mt-1 text-sm">Draft Preview — not yet issued</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 font-medium uppercase tracking-wider mb-1">Date</p>
                  <p className="text-base font-bold text-gray-900">
                    {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  {validUntil && (
                    <p className="text-sm text-red-500 mt-1 font-medium">
                      Valid until {new Date(validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>

              {/* Client & Event Info */}
              <div className="grid grid-cols-2 gap-8 mb-10 p-5 bg-gray-50 rounded-2xl">
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Client</p>
                  <p className="text-lg font-bold text-gray-900">{event?.clientInfo?.name || (event?.clientId as any)?.name || '—'}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{event?.clientInfo?.email || (event?.clientId as any)?.email || ''}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Event</p>
                  <p className="text-lg font-bold text-gray-900">{event?.title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {event?.eventType && <span className="capitalize">{event.eventType}</span>}
                    {event?.date && <span> · {new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                    {event?.guestCount && <span> · {event.guestCount} guests</span>}
                  </p>
                  {(event?.location as any)?.address && (
                    <p className="text-sm text-gray-400 mt-0.5">{(event.location as any).address}</p>
                  )}
                </div>
              </div>

              {/* Services Table */}
              <div className="mb-10">
                <h3 className="text-base font-bold text-gray-900 uppercase tracking-wider border-b-2 border-gray-900 pb-2 mb-0">Services &amp; Pricing</h3>
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-200">
                      <th className="py-3 font-semibold">Description</th>
                      <th className="py-3 font-semibold text-center w-16">Qty</th>
                      <th className="py-3 font-semibold text-right w-28">Unit Price</th>
                      <th className="py-3 font-semibold text-right w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-5 pr-4">
                          <p className="font-bold text-gray-900 text-base">{item.name}</p>
                          {item.scope && (
                            <p className="text-sm text-gray-500 mt-1">
                              <span className="font-medium text-gray-600">Scope:</span> {item.scope}
                            </p>
                          )}
                          {item.requirements && (
                            <p className="text-sm text-gray-500 mt-0.5">
                              <span className="font-medium text-gray-600">Requirements:</span> {item.requirements}
                            </p>
                          )}
                          {/* Detailed sections */}
                          {item.detailedContent && item.detailedContent.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {item.detailedContent.map((section: any, sIdx: number) => (
                                section.sectionName || section.items?.some((i: string) => i) ? (
                                  <div key={sIdx} className="pl-3 border-l-2 border-indigo-200">
                                    {section.sectionName && (
                                      <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-1">{section.sectionName}</p>
                                    )}
                                    <ul className="space-y-0.5">
                                      {section.items?.filter((i: string) => i).map((sItem: string, iIdx: number) => (
                                        <li key={iIdx} className="text-xs text-gray-600 flex items-start gap-1.5">
                                          <span className="text-indigo-400 mt-0.5">•</span>
                                          <span>{sItem}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-5 text-center font-semibold text-gray-900">
                          {item.quantity} 
                          <span className="block text-[10px] text-gray-400 font-normal mt-0.5 uppercase">
                            {item.pricingType === 'per_guest' ? 'Guests' : item.pricingType === 'per_event' ? 'Event' : 'Pkg'}
                          </span>
                        </td>
                        <td className="py-5 text-right text-gray-600">
                          ₹{item.unitPrice.toLocaleString('en-IN')}
                          <span className="block text-[10px] text-gray-400 font-normal mt-0.5 uppercase">
                            {item.pricingType === 'per_guest' ? '/ Guest' : item.pricingType === 'per_event' ? '/ Event' : '/ Pkg'}
                          </span>
                        </td>
                        <td className="py-5 text-right font-bold text-gray-900">₹{(item.quantity * item.unitPrice).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financials */}
              <div className="flex justify-end mb-10">
                <div className="w-80 space-y-2 border border-gray-200 rounded-2xl p-5">
                  <div className="flex justify-between text-gray-600 text-sm">
                    <span>Subtotal</span>
                    <span>₹{subtotal.toLocaleString('en-IN')}</span>
                  </div>
                  {discountSafe > 0 && (
                    <div className="flex justify-between text-red-500 text-sm">
                      <span>Discount</span>
                      <span>− ₹{discountSafe.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-600 text-sm">
                    <span>Taxable Amount</span>
                    <span>₹{taxableAmount.toLocaleString('en-IN')}</span>
                  </div>

                  {taxType !== 'none' && (
                    <div className="border-t border-dashed border-gray-200 pt-2 space-y-1.5">
                      {taxType === 'gst' && gstTreatment === 'intra_state' && taxAmount > 0 && (
                        <>
                          <div className="flex justify-between text-gray-500 text-sm">
                            <span>CGST ({(taxRate / 2).toFixed(2)}%)</span>
                            <span>₹{cgst.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between text-gray-500 text-sm">
                            <span>SGST ({(taxRate / 2).toFixed(2)}%)</span>
                            <span>₹{sgst.toLocaleString('en-IN')}</span>
                          </div>
                        </>
                      )}
                      {taxType === 'gst' && gstTreatment === 'inter_state' && taxAmount > 0 && (
                        <div className="flex justify-between text-gray-500 text-sm">
                          <span>IGST ({taxRate}%)</span>
                          <span>₹{igst.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {taxType === 'gst' && (gstTreatment === 'exempt' || taxAmount === 0) && (
                        <div className="flex justify-between text-gray-400 text-sm italic">
                          <span>GST (Exempt)</span>
                          <span>₹0</span>
                        </div>
                      )}
                      {(taxType === 'vat' || taxType === 'custom') && (
                        <div className="flex justify-between text-gray-500 text-sm">
                          <span>{taxType.toUpperCase()} ({taxRate}%)</span>
                          <span>₹{taxAmount.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between text-xl font-extrabold text-gray-900 pt-3 border-t-2 border-gray-900">
                    <span>Total</span>
                    <span>₹{finalAmount.toLocaleString('en-IN')}</span>
                  </div>

                  {advanceAmount > 0 && (
                    <>
                      <div className="flex justify-between text-sm text-indigo-600 font-semibold mt-1">
                        <span>Advance Required</span>
                        <span>₹{advanceAmount.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Remaining Balance</span>
                        <span>₹{remainingAmount.toLocaleString('en-IN')}</span>
                      </div>
                    </>
                  )}

                  {(placeOfSupply || customerGstin) && (
                    <div className="border-t border-gray-100 pt-2 space-y-1 mt-1">
                      {placeOfSupply && <p className="text-xs text-gray-400">Place of Supply: {placeOfSupply}</p>}
                      {customerGstin && <p className="text-xs text-gray-400 font-mono">GSTIN: {customerGstin}</p>}
                    </div>
                  )}
                </div>
              </div>

              {/* Schedules */}
              {schedules.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-base font-bold text-gray-900 uppercase tracking-wider border-b border-gray-200 pb-2 mb-4">Event Schedule</h3>
                  <div className="space-y-2">
                    {schedules.map((sch, idx) => (
                      <div key={idx} className="flex items-center gap-4 py-2">
                        <span className="text-sm font-bold text-indigo-600 w-20 shrink-0">{sch.time || '—'}</span>
                        <span className="text-sm text-gray-700">{sch.title || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Plan */}
              {paymentPlan.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-base font-bold text-gray-900 uppercase tracking-wider border-b border-gray-200 pb-2 mb-4">Payment Plan</h3>
                  <div className="space-y-3">
                    {paymentPlan.map((plan, idx) => (
                      <div key={idx} className="flex items-start justify-between py-2 border-b border-gray-50">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{plan.title || `Installment ${idx + 1}`}</p>
                          {plan.dueDateDescription && (
                            <p className="text-xs text-gray-500 mt-0.5">{plan.dueDateDescription}</p>
                          )}
                        </div>
                        <span className="text-sm font-bold text-gray-900 shrink-0 ml-4">₹{(plan.amount || 0).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Structured Terms */}
              {structuredTerms.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-base font-bold text-gray-900 uppercase tracking-wider border-b border-gray-200 pb-2 mb-4">Terms &amp; Conditions</h3>
                  <div className="space-y-4">
                    {structuredTerms.map((term, idx) => (
                      <div key={idx}>
                        {term.title && <p className="text-sm font-bold text-gray-800 mb-1">{term.title}</p>}
                        {term.content && <p className="text-sm text-gray-600 leading-relaxed">{term.content}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* General Terms (plain text) */}
              {terms && (
                <div className="mb-8">
                  <h3 className="text-base font-bold text-gray-900 uppercase tracking-wider border-b border-gray-200 pb-2 mb-3">General Terms</h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{terms}</p>
                </div>
              )}

              {/* Notes */}
              {notes && (
                <div className="mb-8 bg-amber-50 rounded-xl p-4 border border-amber-100">
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Notes</p>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{notes}</p>
                </div>
              )}

              {/* Footer */}
              <div className="mt-10 pt-6 border-t border-gray-200 text-center">
                <p className="text-xs text-gray-400 italic">
                  This is a draft preview. The final quotation is generated by the server upon issuance.
                </p>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};

