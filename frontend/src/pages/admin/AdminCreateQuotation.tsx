import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getEventById } from '../../features/events/eventsApi';
import { createQuotation, sendQuotation } from '../../features/quotations/quotationApi';
import type { ClientEvent } from '../../features/events/event.types';
import type { CreateQuotationRequest, IStructuredTerm, IQuotationSchedule, IPaymentInstallment } from '../../features/quotations/quotation.types';
import { Loader2, Plus, Trash2, ArrowLeft, Save, Send, ChevronDown, ChevronUp, Eye, X } from 'lucide-react';

export const AdminCreateQuotation = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [event, setEvent] = useState<ClientEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [conciergeNotes, setConciergeNotes] = useState('');
  
  const [discount, setDiscount] = useState(0);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  
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
            const initialItems = data.selectedServices.map(s => ({
              serviceId: s.serviceId,
              name: s.serviceName,
              scope: '',
              requirements: Object.entries(s.preferences || {}).map(([k, v]) => `${k}: ${v}`).join(', '),
              quantity: 1,
              unitPrice: 0,
              detailedContent: []
            }));
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
  const subtotal = items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  const finalAmount = Math.max(0, subtotal - discount);
  const remainingAmount = Math.max(0, finalAmount - advanceAmount);

  const handleSave = async (issue: boolean = false) => {
    try {
      setIsSaving(true);
      setError('');
      
      const request: CreateQuotationRequest = {
        eventId: id!,
        items: items.map(i => ({
          serviceId: i.serviceId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          requirements: i.requirements,
          scope: i.scope,
          detailedContent: i.detailedContent
        })),
        discount,
        advanceAmount,
        validUntil: validUntil || undefined,
        notes,
        terms,
        structuredTerms,
        schedules,
        paymentPlan,
        conciergeNotes
      };

      const qtn = await createQuotation(request);
      
      if (issue) {
        await sendQuotation(qtn._id);
        navigate(`/admin/events/${id}`);
      } else {
        navigate(`/admin/events/${id}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save quotation');
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
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-md uppercase">Service</span>
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
                          <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                          <input 
                            type="number" min="1"
                            className="w-full border-gray-200 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" 
                            value={item.quantity}
                            onChange={e => updateItem(index, 'quantity', Number(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price (₹)</label>
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
                      placeholder="Content..." 
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
            
            <div className="space-y-4 text-sm mb-6">
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
              <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                <span className="font-bold text-gray-900 text-base">Final Amount</span>
                <span className="font-extrabold text-indigo-600 text-xl">₹{finalAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-gray-600 pt-2">
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
              className="absolute top-6 right-6 p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="p-12">
              <div className="border-b-2 border-indigo-600 pb-6 mb-8 text-center">
                <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight uppercase">Quotation</h2>
                <p className="text-gray-500 mt-2 text-lg">EventOps Management</p>
              </div>

              <div className="flex justify-between mb-12">
                <div>
                  <p className="text-sm text-gray-500 font-medium uppercase tracking-wider mb-1">To</p>
                  <p className="text-xl font-bold text-gray-900">{(event?.clientId as any)?.name}</p>
                  <p className="text-gray-600 mt-1">{event?.title}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 font-medium uppercase tracking-wider mb-1">Date Issued</p>
                  <p className="text-lg font-bold text-gray-900">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  {validUntil && (
                    <p className="text-sm text-red-500 mt-1 font-medium">Valid until {new Date(validUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  )}
                </div>
              </div>

              <div className="mb-12">
                <h3 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">Services</h3>
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-sm text-gray-500 uppercase tracking-wider border-b border-gray-200">
                      <th className="pb-3 font-medium">Description</th>
                      <th className="pb-3 font-medium text-center">Qty</th>
                      <th className="pb-3 font-medium text-right">Unit Price</th>
                      <th className="pb-3 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-4">
                          <p className="font-bold text-gray-900">{item.name}</p>
                          {item.scope && <p className="text-sm text-gray-500 mt-1">{item.scope}</p>}
                        </td>
                        <td className="py-4 text-center font-medium text-gray-900">{item.quantity}</td>
                        <td className="py-4 text-right text-gray-600">₹{item.unitPrice.toLocaleString()}</td>
                        <td className="py-4 text-right font-bold text-gray-900">₹{(item.quantity * item.unitPrice).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end mb-12">
                <div className="w-64 space-y-3">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>₹{subtotal.toLocaleString()}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-red-500">
                      <span>Discount</span>
                      <span>-₹{discount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-bold text-gray-900 pt-4 border-t-2 border-gray-200">
                    <span>Total</span>
                    <span>₹{finalAmount.toLocaleString()}</span>
                  </div>
                  {advanceAmount > 0 && (
                    <div className="flex justify-between text-sm text-gray-600 mt-2">
                      <span>Advance Required</span>
                      <span className="font-semibold text-indigo-600">₹{advanceAmount.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-12 text-sm text-gray-500 italic text-center">
                This is a preview. Final quotation document is generated by the server upon issuance.
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
