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
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveErrors, setSaveErrors] = useState<string[]>([]);

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

  // Derived calculations
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
    if (isSaving) return;
    try {
      setIsSaving(true);
      setSaveError('');
      setSaveErrors([]);

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

      const sanitizedStructuredTerms = structuredTerms
        .filter(t => t.title?.trim() || t.content?.trim())
        .map(t => ({
          title: (t.title || t.content || '').trim(),
          content: (t.content || '').trim()
        }));

      const sanitizedSchedules = schedules
        .filter(s => s.title?.trim() || s.time?.trim())
        .map(s => ({
          title: (s.title || 'Schedule').trim(),
          time: (s.time || '').trim()
        }));

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
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-xl border border-red-200 max-w-2xl mx-auto mt-8 shadow-sm">
        <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
        <p>{error || 'Unable to load event details.'}</p>
        <div className="mt-6">
          <Link to="/admin/events" className="inline-flex items-center gap-2 bg-white text-red-700 px-4 py-2 border border-red-200 rounded-lg hover:bg-red-50 font-medium transition-colors">
            <ArrowLeft className="w-4 h-4" /> Go Back
          </Link>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="max-w-[1400px] mx-auto pb-24 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to={`/admin/events/${id}`} className="p-2 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg transition-colors text-gray-500 shadow-sm">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
              Quotation Builder
            </h1>
            <p className="text-gray-500 text-sm mt-1">Editing draft for <span className="font-semibold text-gray-700">{event.title}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-2 bg-white text-gray-700 px-5 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all font-semibold shadow-sm text-sm"
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={isSaving}
            className="flex items-center gap-2 bg-white text-gray-700 px-5 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all font-semibold shadow-sm text-sm"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Draft
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={isSaving}
            className="flex items-center gap-2 bg-[#111827] text-white px-5 py-2.5 rounded-lg hover:bg-gray-800 transition-colors shadow-sm font-semibold text-sm"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Issue Quotation
          </button>
        </div>
      </div>

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
          <p className="text-red-700 font-bold text-sm">{saveError}</p>
          {saveErrors.length > 0 && (
            <ul className="mt-2 space-y-1">
              {saveErrors.map((e, i) => (
                <li key={i} className="text-red-600 text-xs flex items-start gap-1.5 font-medium">
                  <span className="mt-0.5">•</span><span>{e}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left Column - Form */}
        <div className="xl:col-span-2 space-y-6">

          {/* Services & Pricing */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Services & Pricing</h2>
            </div>

            <div className="p-6 space-y-4">
              {items.map((item, index) => (
                <div key={item.serviceId} className="border border-gray-200 rounded-lg overflow-hidden transition-all duration-300">
                  <div
                    className="flex justify-between items-center p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
                    onClick={() => setExpandedService(expandedService === item.serviceId ? null : item.serviceId)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-sm text-gray-900">{item.name}</span>
                      <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-[10px] font-bold rounded uppercase tracking-widest">{item.pricingType?.replace('_', ' ') || 'Service'}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-gray-900">{formatCurrency(item.quantity * item.unitPrice)}</span>
                      {expandedService === item.serviceId ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {expandedService === item.serviceId && (
                    <div className="p-5 space-y-5 bg-white border-t border-gray-200">

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Scope</label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="e.g. 500 plates"
                            value={item.scope}
                            onChange={e => updateItem(index, 'scope', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Client Requirements</label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Requirements"
                            value={item.requirements}
                            onChange={e => updateItem(index, 'requirements', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 bg-gray-50 p-4 rounded-md border border-gray-100">
                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                            {item.pricingType === 'per_guest' ? 'Quantity (Guests)' : 'Quantity'}
                          </label>
                          <input
                            type="number" min="1" step="1"
                            className="w-full border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                            value={item.quantity}
                            onChange={e => updateItem(index, 'quantity', Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                            Unit Price {item.pricingType === 'per_guest' ? '(Per Guest)' : ''}
                          </label>
                          <input
                            type="number" min="0"
                            className="w-full border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                            value={item.unitPrice}
                            onChange={e => updateItem(index, 'unitPrice', Number(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Amount</label>
                          <div className="w-full border border-gray-200 rounded-md bg-gray-100 text-gray-900 font-bold text-sm py-2 px-3 flex items-center">
                            {formatCurrency(item.quantity * item.unitPrice)}
                          </div>
                        </div>
                      </div>

                      {/* Detailed Content */}
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <label className="block text-sm font-bold text-gray-900">Detailed Scope / Sub-items</label>
                          <button
                            className="text-indigo-600 text-[11px] font-bold uppercase tracking-widest flex items-center gap-1 hover:text-indigo-800 transition-colors"
                            onClick={() => {
                              const newContent = [...(item.detailedContent || []), { sectionName: '', items: [''] }];
                              updateItem(index, 'detailedContent', newContent);
                            }}
                          >
                            <Plus className="w-3 h-3" /> Add Section
                          </button>
                        </div>

                        <div className="space-y-4">
                          {item.detailedContent?.map((section: any, sIdx: number) => (
                            <div key={sIdx} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                              <div className="flex gap-2 mb-3">
                                <input
                                  type="text"
                                  className="flex-1 border border-gray-300 rounded-md shadow-sm text-sm py-1.5 px-3 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                  placeholder="Section Name (e.g. Main Course)"
                                  value={section.sectionName}
                                  onChange={e => {
                                    const newContent = [...item.detailedContent];
                                    newContent[sIdx].sectionName = e.target.value;
                                    updateItem(index, 'detailedContent', newContent);
                                  }}
                                />
                                <button
                                  className="text-gray-400 p-1.5 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors border border-transparent hover:border-red-100"
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
                                    <span className="text-gray-300 text-xs shrink-0">■</span>
                                    <input
                                      type="text"
                                      className="flex-1 border border-gray-300 rounded-md shadow-sm text-sm py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
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
                                        className="text-gray-400 hover:text-indigo-600 p-1.5 rounded-md hover:bg-indigo-50 transition-colors"
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
                                        className="text-gray-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition-colors"
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
              <h2 className="text-base font-bold text-gray-900">Tax Configuration</h2>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Tax Mode</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(['none', 'gst', 'vat', 'custom'] as TaxType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => { setTaxType(t); setTaxRate(0); }}
                      className={`py-2 px-3 rounded-md text-sm font-bold border transition-all ${taxType === t
                          ? 'bg-[#111827] text-white border-[#111827] shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                      {t === 'none' ? 'No Tax' : t.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {taxType !== 'none' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                        Tax Rate (%)
                      </label>
                      <input
                        type="number" min="0" max="100" step="0.01"
                        className="w-full border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
                        placeholder="e.g. 18"
                        value={taxRate}
                        onChange={e => setTaxRate(Number(e.target.value) || 0)}
                      />
                    </div>
                    {taxType === 'gst' && (
                      <div>
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">GST Treatment</label>
                        <select
                          className="w-full border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium bg-white"
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Place of Supply <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                        <input
                          type="text"
                          className="w-full border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="e.g. Kerala"
                          value={placeOfSupply}
                          onChange={e => setPlaceOfSupply(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Customer GSTIN <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                        <input
                          type="text"
                          className="w-full border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono uppercase"
                          placeholder="e.g. 29ABCDE1234F1Z5"
                          value={customerGstin}
                          onChange={e => setCustomerGstin(e.target.value.toUpperCase())}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Schedules */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
              <h2 className="text-base font-bold text-gray-900">Event Schedules</h2>
              <button
                onClick={() => setSchedules([...schedules, { title: '', time: '' }])}
                className="text-[11px] text-indigo-600 font-bold uppercase tracking-widest flex items-center gap-1 hover:text-indigo-800 transition-colors"
              >
                <Plus className="w-3 h-3" /> Add Schedule
              </button>
            </div>
            <div className="p-6">
              {schedules.length === 0 ? (
                <p className="text-gray-500 italic text-sm text-center py-2">No schedules added.</p>
              ) : (
                <div className="space-y-3">
                  {schedules.map((sch, idx) => (
                    <div key={idx} className="flex gap-3 items-start">
                      <input
                        type="text" placeholder="Title (e.g. Venue Handover)"
                        className="flex-1 border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        value={sch.title}
                        onChange={e => {
                          const newSch = [...schedules];
                          newSch[idx].title = e.target.value;
                          setSchedules(newSch);
                        }}
                      />
                      <input
                        type="text" placeholder="Time (e.g. 7:00 AM)"
                        className="w-32 border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        value={sch.time}
                        onChange={e => {
                          const newSch = [...schedules];
                          newSch[idx].time = e.target.value;
                          setSchedules(newSch);
                        }}
                      />
                      <button onClick={() => setSchedules(schedules.filter((_, i) => i !== idx))} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md border border-transparent hover:border-red-100 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Payment Plan */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
              <h2 className="text-base font-bold text-gray-900">Payment Plan</h2>
              <button
                onClick={() => setPaymentPlan([...paymentPlan, { title: '', amount: 0, dueDateDescription: '', purpose: [] }])}
                className="text-[11px] text-indigo-600 font-bold uppercase tracking-widest flex items-center gap-1 hover:text-indigo-800 transition-colors"
              >
                <Plus className="w-3 h-3" /> Add Installment
              </button>
            </div>
            <div className="p-6">
              {paymentPlan.length === 0 ? (
                <p className="text-gray-500 italic text-sm text-center py-2">No payment installments added.</p>
              ) : (
                <div className="space-y-4">
                  {paymentPlan.map((plan, idx) => (
                    <div key={idx} className="border border-gray-200 p-4 rounded-lg flex gap-4 bg-gray-50/50">
                      <div className="flex-1 space-y-3">
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Title</label>
                            <input
                              type="text" placeholder="e.g. Booking Advance"
                              className="w-full border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              value={plan.title}
                              onChange={e => {
                                const newP = [...paymentPlan];
                                newP[idx].title = e.target.value;
                                setPaymentPlan(newP);
                              }}
                            />
                          </div>
                          <div className="w-32">
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Amount (₹)</label>
                            <input
                              type="number" placeholder="0" min="0"
                              className="w-full border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-gray-900"
                              value={plan.amount}
                              onChange={e => {
                                const newP = [...paymentPlan];
                                newP[idx].amount = Number(e.target.value) || 0;
                                setPaymentPlan(newP);
                              }}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Due Condition</label>
                          <input
                            type="text" placeholder="e.g. Immediate upon acceptance"
                            className="w-full border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            value={plan.dueDateDescription}
                            onChange={e => {
                              const newP = [...paymentPlan];
                              newP[idx].dueDateDescription = e.target.value;
                              setPaymentPlan(newP);
                            }}
                          />
                        </div>
                      </div>
                      <button onClick={() => setPaymentPlan(paymentPlan.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-md transition-colors h-fit border border-transparent hover:border-red-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Terms */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
              <h2 className="text-base font-bold text-gray-900">Structured Terms</h2>
              <button
                onClick={() => setStructuredTerms([...structuredTerms, { title: '', content: '' }])}
                className="text-[11px] text-indigo-600 font-bold uppercase tracking-widest flex items-center gap-1 hover:text-indigo-800 transition-colors"
              >
                <Plus className="w-3 h-3" /> Add Term
              </button>
            </div>
            <div className="p-6">
              {structuredTerms.length === 0 ? (
                <p className="text-gray-500 italic text-sm text-center py-2">No structured terms added.</p>
              ) : (
                <div className="space-y-4">
                  {structuredTerms.map((term, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="flex-1 space-y-2">
                        <input
                          type="text" placeholder="Title (e.g. Validity, Cancellation)"
                          className="w-full border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          value={term.title}
                          onChange={e => {
                            const newT = [...structuredTerms];
                            newT[idx].title = e.target.value;
                            setStructuredTerms(newT);
                          }}
                        />
                        <textarea
                          placeholder="Content (optional)..."
                          className="w-full border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          rows={2}
                          value={term.content}
                          onChange={e => {
                            const newT = [...structuredTerms];
                            newT[idx].content = e.target.value;
                            setStructuredTerms(newT);
                          }}
                        />
                      </div>
                      <button onClick={() => setStructuredTerms(structuredTerms.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-md transition-colors h-fit border border-transparent hover:border-red-100 mt-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Notes & Additional Info */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
              <h2 className="text-base font-bold text-gray-900">Additional Information</h2>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">General Notes</label>
                <textarea
                  className="w-full border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500" rows={2}
                  value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Notes visible to client..."
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Standard Terms & Conditions</label>
                <textarea
                  className="w-full border border-gray-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500" rows={2}
                  value={terms} onChange={e => setTerms(e.target.value)}
                  placeholder="General terms..."
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 text-amber-600">Internal Concierge Notes (Admin Only)</label>
                <textarea
                  className="w-full border border-amber-300 rounded-md shadow-sm text-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-amber-500 bg-amber-50" rows={2}
                  value={conciergeNotes} onChange={e => setConciergeNotes(e.target.value)}
                  placeholder="Notes for internal team..."
                />
              </div>
            </div>
          </div>

        </div>

        {/* Right Column - Summary & Settings */}
        <div className="space-y-6">

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm sticky top-6">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900">Financial Summary</h3>
            </div>

            <div className="p-5">
              <div className="space-y-3 text-sm mb-6">
                <div className="flex justify-between items-center text-gray-600">
                  <span className="font-medium">Subtotal</span>
                  <span className="font-bold text-gray-900">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-gray-600">
                  <span className="font-medium">Discount</span>
                  <input
                    type="number" min="0" max={subtotal}
                    className="w-24 border border-gray-300 rounded-md py-1 px-2 text-right text-red-600 font-bold text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={discount}
                    onChange={e => setDiscount(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="flex justify-between items-center text-gray-600">
                  <span className="font-medium">Taxable Amount</span>
                  <span className="font-bold text-gray-900">{formatCurrency(taxableAmount)}</span>
                </div>

                {taxType !== 'none' && taxAmount > 0 && (
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 space-y-2 mt-2">
                    {taxType === 'gst' && gstTreatment === 'intra_state' && (
                      <>
                        <div className="flex justify-between text-gray-500 text-xs">
                          <span>CGST ({(taxRate / 2).toFixed(2)}%)</span>
                          <span className="font-medium">{formatCurrency(cgst)}</span>
                        </div>
                        <div className="flex justify-between text-gray-500 text-xs">
                          <span>SGST ({(taxRate / 2).toFixed(2)}%)</span>
                          <span className="font-medium">{formatCurrency(sgst)}</span>
                        </div>
                      </>
                    )}
                    {taxType === 'gst' && gstTreatment === 'inter_state' && (
                      <div className="flex justify-between text-gray-500 text-xs">
                        <span>IGST ({taxRate}%)</span>
                        <span className="font-medium">{formatCurrency(igst)}</span>
                      </div>
                    )}
                    {(taxType === 'vat' || taxType === 'custom') && (
                      <div className="flex justify-between text-gray-500 text-xs">
                        <span>{taxType.toUpperCase()} ({taxRate}%)</span>
                        <span className="font-medium">{formatCurrency(taxAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-700 text-xs font-bold pt-2 border-t border-gray-200">
                      <span>Total Tax</span>
                      <span>{formatCurrency(taxAmount)}</span>
                    </div>
                  </div>
                )}

                {taxType !== 'none' && taxAmount === 0 && (
                  <div className="flex justify-between items-center text-gray-400 text-xs italic mt-2">
                    <span>Tax ({taxType.toUpperCase()})</span>
                    <span>₹0.00 (Exempt / 0%)</span>
                  </div>
                )}

                <div className="pt-4 mt-2 border-t border-gray-200 flex justify-between items-center">
                  <span className="font-bold text-gray-900">Total Amount</span>
                  <span className="font-black text-indigo-600 text-xl">{formatCurrency(finalAmount)}</span>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-gray-100">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Advance Required (₹)</label>
                  <input
                    type="number" min="0" max={finalAmount}
                    className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={advanceAmount}
                    onChange={e => setAdvanceAmount(Number(e.target.value) || 0)}
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-2 font-medium">
                    <span>Remaining Balance:</span>
                    <span>{formatCurrency(remainingAmount)}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Valid Until</label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    value={validUntil}
                    onChange={e => setValidUntil(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-5 pt-5 border-t border-gray-100">
                <p className="text-[10px] text-gray-400 text-center uppercase tracking-widest font-bold">
                  Calculations performed securely on backend.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/60 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[95vh] overflow-y-auto shadow-2xl relative border border-gray-200">
            <button
              onClick={() => setShowPreview(false)}
              className="sticky top-4 float-right mr-4 z-10 p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors bg-white/80 backdrop-blur shadow-sm border border-gray-200"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-8 sm:p-12">

              {/* Header */}
              <div className="border-b-2 border-[#111827] pb-6 mb-8 flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                <div>
                  <h2 className="text-3xl font-black text-[#111827] tracking-tight uppercase">Quotation</h2>
                  <p className="text-gray-400 mt-1 text-sm font-medium">Draft Preview — not yet issued</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Date</p>
                  <p className="text-base font-bold text-gray-900">
                    {new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  {validUntil && (
                    <p className="text-xs text-gray-500 mt-1 font-medium">
                      Valid until {new Date(validUntil).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>

              {/* Client & Event Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-10 p-6 bg-gray-50/50 rounded-lg border border-gray-100">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Prepared For</p>
                  <p className="text-lg font-bold text-gray-900 leading-tight">{event?.clientInfo?.name || (event?.clientId as any)?.name || '—'}</p>
                  <p className="text-sm text-gray-500 mt-1">{event?.clientInfo?.email || (event?.clientId as any)?.email || ''}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Event Details</p>
                  <p className="text-lg font-bold text-gray-900 leading-tight">{event?.title}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {event?.eventType && <span className="capitalize">{event.eventType}</span>}
                    {event?.date && <span> · {new Date(event.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                    {event?.guestCount && <span> · {event.guestCount} guests</span>}
                  </p>
                  {(event?.location as any)?.address && (
                    <p className="text-sm text-gray-400 mt-1">{(event.location as any).address}</p>
                  )}
                </div>
              </div>

              {/* Services Table */}
              <div className="mb-10">
                <h3 className="text-sm font-bold text-[#111827] uppercase tracking-widest border-b-2 border-gray-200 pb-2 mb-0">Services &amp; Pricing</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] text-gray-400 font-bold uppercase tracking-widest border-b border-gray-200">
                        <th className="py-3 pr-4">Description</th>
                        <th className="py-3 px-2 text-center w-16">Qty</th>
                        <th className="py-3 px-2 text-right w-28">Rate</th>
                        <th className="py-3 pl-2 text-right w-28">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} className="border-b border-gray-100 align-top">
                          <td className="py-4 pr-4">
                            <p className="font-bold text-gray-900 text-sm">{item.name}</p>
                            {item.scope && (
                              <p className="text-xs text-gray-500 mt-1">
                                <span className="font-semibold text-gray-600">Scope:</span> {item.scope}
                              </p>
                            )}
                            {item.requirements && (
                              <p className="text-xs text-gray-500 mt-1">
                                <span className="font-semibold text-gray-600">Reqs:</span> {item.requirements}
                              </p>
                            )}
                            {/* Detailed sections */}
                            {item.detailedContent && item.detailedContent.length > 0 && (
                              <div className="mt-3 space-y-3 bg-gray-50 p-3 rounded-md border border-gray-100">
                                {item.detailedContent.map((section: any, sIdx: number) => (
                                  section.sectionName || section.items?.some((i: string) => i) ? (
                                    <div key={sIdx}>
                                      {section.sectionName && (
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{section.sectionName}</p>
                                      )}
                                      <ul className="space-y-1">
                                        {section.items?.filter((i: string) => i).map((sItem: string, iIdx: number) => (
                                          <li key={iIdx} className="text-xs text-gray-600 flex items-start gap-1.5">
                                            <span className="text-gray-300 mt-0.5">•</span>
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
                          <td className="py-4 px-2 text-center font-semibold text-gray-700 text-sm">
                            {item.quantity}
                          </td>
                          <td className="py-4 px-2 text-right text-gray-600 text-sm">
                            {formatCurrency(item.unitPrice)}
                          </td>
                          <td className="py-4 pl-2 text-right font-bold text-gray-900 text-sm">{formatCurrency(item.quantity * item.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financials & Left Column Info */}
              <div className="flex flex-col md:flex-row justify-between gap-10 mb-10">

                {/* Left Side: Schedules & Plans */}
                <div className="flex-1 space-y-8 order-2 md:order-1">

                  {schedules.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Event Schedule</h3>
                      <div className="space-y-2">
                        {schedules.map((sch, idx) => (
                          <div key={idx} className="flex items-start gap-4">
                            <span className="text-xs font-bold text-gray-900 w-20 shrink-0 mt-0.5">{sch.time || '—'}</span>
                            <span className="text-xs text-gray-600">{sch.title || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {paymentPlan.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Payment Plan</h3>
                      <div className="space-y-3">
                        {paymentPlan.map((plan, idx) => (
                          <div key={idx} className="flex justify-between items-start border-b border-gray-100 pb-2">
                            <div>
                              <p className="text-xs font-bold text-gray-900">{plan.title || `Installment ${idx + 1}`}</p>
                              {plan.dueDateDescription && (
                                <p className="text-[11px] text-gray-500 mt-0.5">{plan.dueDateDescription}</p>
                              )}
                            </div>
                            <span className="text-xs font-bold text-gray-900 shrink-0 ml-4">{formatCurrency(plan.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {structuredTerms.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Terms &amp; Conditions</h3>
                      <div className="space-y-3">
                        {structuredTerms.map((term, idx) => (
                          <div key={idx}>
                            {term.title && <p className="text-xs font-bold text-gray-900 mb-0.5">{term.title}</p>}
                            {term.content && <p className="text-xs text-gray-600 leading-relaxed">{term.content}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {terms && (
                    <div>
                      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">General Terms</h3>
                      <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{terms}</p>
                    </div>
                  )}

                  {notes && (
                    <div>
                      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Notes</h3>
                      <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{notes}</p>
                    </div>
                  )}
                </div>

                {/* Right Side: Totals Summary */}
                <div className="w-full md:w-80 shrink-0 order-1 md:order-2">
                  <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                    <div className="p-5 space-y-2.5">
                      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Quotation Summary</h3>

                      <div className="flex justify-between text-gray-600 text-xs">
                        <span className="font-medium">Subtotal</span>
                        <span className="font-bold text-gray-900">{formatCurrency(subtotal)}</span>
                      </div>
                      {discountSafe > 0 && (
                        <div className="flex justify-between text-red-600 text-xs">
                          <span className="font-medium">Discount</span>
                          <span className="font-bold">− {formatCurrency(discountSafe)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-gray-600 text-xs pb-2 border-b border-gray-200">
                        <span className="font-medium">Taxable Amount</span>
                        <span className="font-bold text-gray-900">{formatCurrency(taxableAmount)}</span>
                      </div>

                      {taxType !== 'none' && (
                        <div className="pt-2 space-y-2">
                          {taxType === 'gst' && gstTreatment === 'intra_state' && taxAmount > 0 && (
                            <>
                              <div className="flex justify-between text-gray-500 text-[11px]">
                                <span>CGST ({(taxRate / 2).toFixed(2)}%)</span>
                                <span>{formatCurrency(cgst)}</span>
                              </div>
                              <div className="flex justify-between text-gray-500 text-[11px]">
                                <span>SGST ({(taxRate / 2).toFixed(2)}%)</span>
                                <span>{formatCurrency(sgst)}</span>
                              </div>
                            </>
                          )}
                          {taxType === 'gst' && gstTreatment === 'inter_state' && taxAmount > 0 && (
                            <div className="flex justify-between text-gray-500 text-[11px]">
                              <span>IGST ({taxRate}%)</span>
                              <span>{formatCurrency(igst)}</span>
                            </div>
                          )}
                          {taxType === 'gst' && (gstTreatment === 'exempt' || taxAmount === 0) && (
                            <div className="flex justify-between text-gray-400 text-[11px] italic">
                              <span>GST (Exempt)</span>
                              <span>₹0.00</span>
                            </div>
                          )}
                          {(taxType === 'vat' || taxType === 'custom') && (
                            <div className="flex justify-between text-gray-500 text-[11px]">
                              <span>{taxType.toUpperCase()} ({taxRate}%)</span>
                              <span>{formatCurrency(taxAmount)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="bg-[#111827] text-white p-5 m-1 rounded-md flex flex-col justify-center text-right">
                      <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-1">Total Amount</span>
                      <span className="text-2xl font-black tracking-tight">{formatCurrency(finalAmount)}</span>
                    </div>
                  </div>

                  {/* Authorized Signature Placeholder */}
                  <div className="mt-12 text-right">
                    <p className="text-gray-400 text-[10px] mb-1 uppercase tracking-widest font-bold">Authorized Signatory</p>
                    <p className="font-bold text-gray-900 uppercase text-xs tracking-wider">EventOps Management</p>
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                <p className="text-[10px] text-gray-400 font-medium">
                  This document is a preview. Final quotation calculations are processed on the server.
                </p>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};
