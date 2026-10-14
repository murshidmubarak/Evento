import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEventById } from '../../features/events/eventsApi';
import { getQuotations } from '../../features/quotations/quotationApi';
import type { ClientEvent } from '../../features/events/event.types';
import type { Quotation } from '../../features/quotations/quotation.types';
import {
  Loader2,
  Calendar,
  Clock,
  MapPin,
  Users,
  Mail,
  Phone,
  ArrowLeft,
  FileText,
  ImageIcon,
  Eye,
  Building2,
  User,
  CreditCard,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  History,
  X,
  Bell,
} from 'lucide-react';
import { ReadOnlyMap } from '../../components/common/ReadOnlyMap';
import { getAdvanceSummary, renewPaymentLink } from '../../features/payments/paymentsApi';
import type { AdvancePaymentSummary, InstallmentPaymentSummary } from '../../features/payments/payment.types';
import { formatCurrency, formatDate } from '../../utils/formatters';

export const AdminEventDetails = () => {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<ClientEvent | null>(null);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<AdvancePaymentSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Renewal Modal State
  const [selectedInstallmentForRenewal, setSelectedInstallmentForRenewal] = useState<InstallmentPaymentSummary | null>(null);
  const [isRenewalModalOpen, setIsRenewalModalOpen] = useState(false);
  const [newExpiryDateStr, setNewExpiryDateStr] = useState('');
  const [isRenewing, setIsRenewing] = useState(false);
  const [renewalSuccessMsg, setRenewalSuccessMsg] = useState('');
  const [renewalErrorMsg, setRenewalErrorMsg] = useState('');
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [expandedHistoryIdx, setExpandedHistoryIdx] = useState<number | null>(null);

  useEffect(() => {
    const fetchEventData = async () => {
      try {
        setIsLoading(true);
        if (id) {
          const eventData = await getEventById(id);
          setEvent(eventData);

          try {
            const quotationsData = await getQuotations(id);
            if (quotationsData && quotationsData.length > 0) {
              const sorted = [...quotationsData].sort((a, b) => b.revision - a.revision);
              setQuotation(sorted[0]);
            }
          } catch (qErr) {
            console.error('Failed to fetch quotation for this event', qErr);
          }

          try {
            const summaryData = await getAdvanceSummary(id);
            setPaymentSummary(summaryData);
          } catch (pErr) {
            // No accepted quotation or payment yet, quietly ignore
          }
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load event details');
      } finally {
        setIsLoading(false);
      }
    };
    fetchEventData();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-xl border border-red-200 max-w-2xl mx-auto shadow-sm">
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

  const client = event.clientId as any;
  const manager = event.eventManagerId as any;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'requested':
        return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-bold uppercase tracking-wider rounded-md border border-amber-200/50">Requested</span>;
      case 'confirmed':
        return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider rounded-md border border-emerald-200/50">Confirmed</span>;
      case 'awaiting_payment':
        return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider rounded-md border border-blue-200/50">Awaiting Payment</span>;
      default:
        return <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-bold uppercase tracking-wider rounded-md border border-gray-200/50">{status.replace('_', ' ')}</span>;
    }
  };

  const handleOpenRenewalModal = (inst: InstallmentPaymentSummary) => {
    setSelectedInstallmentForRenewal(inst);
    // Default 7 days from now formatted YYYY-MM-DD
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    setNewExpiryDateStr(nextWeek.toISOString().split('T')[0]);
    setRenewalErrorMsg('');
    setRenewalSuccessMsg('');
    setIsRenewalModalOpen(true);
  };

  const handleRenewPaymentLink = async () => {
    if (!id || !selectedInstallmentForRenewal) return;
    try {
      setIsRenewing(true);
      setRenewalErrorMsg('');
      const res = await renewPaymentLink({
        eventId: id,
        installmentIndex: selectedInstallmentForRenewal.installmentIndex,
        newExpiryDate: newExpiryDateStr,
      });
      setRenewalSuccessMsg(`Replacement link created for ₹${res.outstandingAmount.toLocaleString('en-IN')}! Email notification sent.`);
      const updated = await getAdvanceSummary(id);
      setPaymentSummary(updated);
      setTimeout(() => {
        setIsRenewalModalOpen(false);
        setRenewalSuccessMsg('');
      }, 1500);
    } catch (err: any) {
      setRenewalErrorMsg(err.response?.data?.message || 'Failed to renew payment link.');
    } finally {
      setIsRenewing(false);
    }
  };

  const handleCopyLink = (linkId: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLinkId(linkId);
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">

      {/* Breadcrumbs & Actions Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <Link to="/admin/events" className="p-2 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg transition-colors text-gray-500 shadow-sm shrink-0 mt-0.5 sm:mt-0">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight flex flex-wrap items-center gap-2.5">
              <span>{event.title}</span>
              {getStatusBadge(event.status)}
            </h1>
            <p className="text-gray-400 text-xs mt-1 font-mono truncate">{event._id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {!quotation || quotation.status === 'draft' ? (
            <Link
              to={`/admin/events/${event._id}/quotation/create${quotation?._id ? `?draftId=${quotation._id}` : ''}`}
              className="flex items-center gap-2 bg-[#111827] text-white px-4 sm:px-5 py-2.5 rounded-lg hover:bg-gray-800 transition-colors shadow-sm font-semibold text-xs sm:text-sm"
            >
              <FileText className="w-4 h-4" />
              {quotation?.status === 'draft' ? 'Continue Draft Quotation' : 'Create Quotation'}
            </Link>
          ) : quotation.status === 'changes_requested' ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/admin/events/${event._id}/quotation/create?revise=${quotation._id}`}
                className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 sm:px-5 py-2.5 rounded-lg transition-colors shadow-sm font-bold text-xs sm:text-sm"
              >
                <FileText className="w-4 h-4" />
                Review & Edit Changes
              </Link>
              <Link
                to={`/admin/quotations/${quotation._id}`}
                className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 sm:px-5 py-2.5 rounded-lg hover:bg-gray-50 transition-colors shadow-sm font-semibold text-xs sm:text-sm"
              >
                <Eye className="w-4 h-4 text-gray-500" />
                View Quotation
              </Link>
            </div>
          ) : (
            <Link
              to={`/admin/quotations/${quotation._id}`}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 sm:px-5 py-2.5 rounded-lg hover:bg-gray-50 transition-colors shadow-sm font-semibold text-xs sm:text-sm"
            >
              <Eye className="w-4 h-4 text-gray-500" />
              View Quotation
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left Column - Main Details */}
        <div className="xl:col-span-2 space-y-6">

          {/* Selected Services Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
              <h2 className="text-base font-bold text-gray-900">Selected Services</h2>
            </div>

            <div className="p-6">
              {event.selectedServices && event.selectedServices.length > 0 ? (
                <div className="space-y-6">
                  {event.selectedServices.map((service: any) => (
                    <div key={service.serviceId} className="border border-gray-200 rounded-lg p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900 mb-1">{service.serviceName}</h3>
                          {service.serviceDescription && (
                            <p className="text-sm text-gray-500">{service.serviceDescription}</p>
                          )}
                        </div>
                        <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-widest rounded border border-indigo-100">
                          Service
                        </span>
                      </div>

                      {/* Client Preferences */}
                      {Object.keys(service.preferences || {}).length > 0 && (
                        <div className="mb-5 bg-gray-50 rounded-lg p-4 border border-gray-100">
                          <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Client Preferences</h4>
                          <div className="grid sm:grid-cols-2 gap-y-3 gap-x-4">
                            {Object.entries(service.preferences).map(([key, value]: [string, any]) => {
                              const renderVal = (v: any): React.ReactNode => {
                                if (v === null || v === undefined) return 'None';
                                if (Array.isArray(v)) {
                                  if (v.length === 0) return 'None';
                                  return (
                                    <div className="space-y-1 mt-0.5">
                                      {v.map((item: any, idx: number) => {
                                        if (typeof item === 'string') {
                                          return <div key={idx} className="text-xs text-gray-800">• {item}</div>;
                                        }
                                        if (typeof item === 'object' && item !== null) {
                                          const headingName = item.heading || item.name || item.title;
                                          if (headingName && Array.isArray(item.items)) {
                                            return (
                                              <div key={idx} className="text-xs text-gray-800">
                                                <span className="font-semibold">• {headingName}:</span> {item.items.join(', ')}
                                              </div>
                                            );
                                          }
                                          const title = (item.title || item.name || '').trim();
                                          const desc = (item.description || item.details || '').trim();
                                          if (!title && !desc) return null;
                                          return (
                                            <div key={idx} className="text-xs text-gray-800">
                                              <span className="font-semibold">• {title}</span>
                                              {desc && <span className="text-gray-500">: {desc}</span>}
                                            </div>
                                          );
                                        }
                                        return <div key={idx} className="text-xs text-gray-800">• {String(item)}</div>;
                                      })}
                                    </div>
                                  );
                                }
                                if (typeof v === 'object' && v !== null) {
                                  return JSON.stringify(v);
                                }
                                return String(v);
                              };

                              return (
                                <div key={key}>
                                  <span className="block text-[11px] font-medium text-gray-500 mb-0.5 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                  <div className="text-sm font-semibold text-gray-900">
                                    {renderVal(value)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Reference Images */}
                      {service.referenceImages && service.referenceImages.length > 0 && (
                        <div>
                          <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5" />
                            Reference Images
                          </h4>
                          <div className="flex gap-3 overflow-x-auto pb-2">
                            {service.referenceImages.map((img: any) => (
                              <a href={img.url} target="_blank" rel="noopener noreferrer" key={img.publicId} className="shrink-0 group">
                                <img
                                  src={img.url}
                                  alt="Reference"
                                  className="w-24 h-24 object-cover rounded-lg border border-gray-200 group-hover:opacity-90 transition-opacity shadow-sm"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500 italic">This event does not contain any selected services.</p>
                </div>
              )}
            </div>
          </div>

          {/* Notes Card */}
          {event.notes && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-amber-200 bg-amber-100/50">
                <h2 className="text-base font-bold text-amber-900">Client Notes</h2>
              </div>
              <div className="p-6">
                <p className="text-sm text-amber-900 whitespace-pre-wrap">{event.notes}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Meta Info */}
        <div className="space-y-6">

          {/* Payment & Installments Management Card */}
          {paymentSummary && paymentSummary.hasAcceptedQuotation && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-indigo-600" />
                    Payment & Installments Management
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Quotation #{paymentSummary.quotationNumber} (Rev {paymentSummary.quotationRevision})
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    paymentSummary.isFullyPaid
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : paymentSummary.advancePaidAmount > 0
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {paymentSummary.isFullyPaid
                    ? 'Advance Settled'
                    : paymentSummary.advancePaidAmount > 0
                    ? 'Partial Advance'
                    : 'Advance Pending'}
                </span>
              </div>

              <div className="p-5 space-y-5">
                {/* Overall Financial Metrics */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">Total Agreed Value</span>
                    <span className="text-sm font-black text-gray-900">{formatCurrency(paymentSummary.totalQuotationAmount)}</span>
                  </div>
                  <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-100">
                    <span className="text-indigo-700 block text-[10px] uppercase font-bold">Required Advance</span>
                    <span className="text-sm font-black text-indigo-700">{formatCurrency(paymentSummary.requiredAdvance)}</span>
                  </div>
                  <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-100">
                    <span className="text-emerald-700 block text-[10px] uppercase font-bold">Verified Advance Paid</span>
                    <span className="text-sm font-black text-emerald-700">{formatCurrency(paymentSummary.advancePaidAmount)}</span>
                  </div>
                  <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-100">
                    <span className="text-amber-700 block text-[10px] uppercase font-bold">Outstanding Advance</span>
                    <span className="text-sm font-black text-amber-700">{formatCurrency(paymentSummary.outstandingAdvance)}</span>
                  </div>
                </div>

                {/* Installment-Level Schedule & Link Renewal */}
                {paymentSummary.installments && paymentSummary.installments.length > 0 && (
                  <div className="pt-2 border-t border-gray-100 space-y-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
                      Scheduled Installments ({paymentSummary.installments.length})
                    </span>

                    <div className="space-y-3">
                      {paymentSummary.installments.map((inst, idx) => {
                        const isExpiredLink = inst.isExpired && inst.outstandingAmount > 0;
                        const isHistoryExpanded = expandedHistoryIdx === idx;

                        return (
                          <div
                            key={inst.installmentId || idx}
                            className={`p-3.5 rounded-lg border text-xs space-y-3 transition-colors ${
                              isExpiredLink
                                ? 'bg-rose-50/40 border-rose-200'
                                : inst.baseStatus === 'Paid'
                                ? 'bg-emerald-50/30 border-emerald-100'
                                : 'bg-gray-50/70 border-gray-200'
                            }`}
                          >
                            {/* Installment Header & Status */}
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-extrabold text-gray-900">{inst.title}</span>
                                  {idx === 0 && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-indigo-100 text-indigo-700">
                                      Advance
                                    </span>
                                  )}
                                  {/* Status Badges */}
                                  {inst.baseStatus === 'Paid' ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                                      Paid
                                    </span>
                                  ) : isExpiredLink ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                                      Link Expired
                                    </span>
                                  ) : inst.isOverdue ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
                                      Overdue
                                    </span>
                                  ) : inst.verifiedPaidAmount > 0 ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800">
                                      Partially Paid
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-200 text-gray-700">
                                      Pending
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 mt-1">
                                  {inst.dueDate && <span>Due: {formatDate(inst.dueDate)}</span>}
                                  {inst.expiryDate && (
                                    <span className={isExpiredLink ? 'text-rose-600 font-bold' : ''}>
                                      Expiry: {formatDate(inst.expiryDate)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="font-bold text-gray-900 block">{formatCurrency(inst.scheduledAmount)}</span>
                                <span className="text-[10px] text-gray-500">
                                  Paid: {formatCurrency(inst.verifiedPaidAmount)}
                                </span>
                              </div>
                            </div>

                            {/* Outstanding & Renewal Section */}
                            <div className="flex items-center justify-between pt-2 border-t border-gray-200/60">
                              <div>
                                <span className="text-[10px] text-gray-500 uppercase font-semibold">Outstanding: </span>
                                <strong className={`font-black text-xs ${inst.outstandingAmount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                  {formatCurrency(inst.outstandingAmount)}
                                </strong>
                              </div>

                              {/* Admin Renew Payment Link Button */}
                              {isExpiredLink && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRenewalModal(inst)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>Renew Payment Link</span>
                                </button>
                              )}
                            </div>

                            {/* Active Payment Link display */}
                            {inst.currentPaymentLink && !inst.isExpired && (
                              <div className="p-2 bg-white rounded border border-gray-200 flex items-center justify-between gap-2 text-[11px]">
                                <span className="text-gray-500 font-mono truncate max-w-[200px]">
                                  {inst.currentPaymentLink.shortUrl}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyLink(inst.currentPaymentLink!.linkId || inst.currentPaymentLink!.shortUrl, inst.currentPaymentLink!.shortUrl)}
                                  className="text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 shrink-0"
                                >
                                  {copiedLinkId === (inst.currentPaymentLink.linkId || inst.currentPaymentLink.shortUrl) ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-600" />
                                      <span className="text-emerald-600">Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            )}

                            {/* Reminder status indicators */}
                            {(inst.latestDueDateReminder || inst.latestExpiryWarning) && (
                              <div className="flex flex-wrap gap-1.5 pt-1 text-[10px]">
                                {inst.latestDueDateReminder && (
                                  <span
                                    className={`px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${
                                      inst.latestDueDateReminder.status === 'sent'
                                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                        : inst.latestDueDateReminder.status === 'failed'
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                        : 'bg-gray-50 text-gray-600 border border-gray-200'
                                    }`}
                                    title={inst.latestDueDateReminder.failureReason || `Sent to ${inst.latestDueDateReminder.recipientEmail}`}
                                  >
                                    <Bell className="w-2.5 h-2.5" />
                                    {inst.latestDueDateReminder.status === 'sent'
                                      ? `Due Reminder Sent (${formatDate(inst.latestDueDateReminder.sentAt)})`
                                      : inst.latestDueDateReminder.status === 'failed'
                                      ? 'Due Reminder Failed'
                                      : `Due Reminder: ${inst.latestDueDateReminder.status}`}
                                  </span>
                                )}
                                {inst.latestExpiryWarning && (
                                  <span
                                    className={`px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${
                                      inst.latestExpiryWarning.status === 'sent'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                        : inst.latestExpiryWarning.status === 'failed'
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                        : 'bg-gray-50 text-gray-600 border border-gray-200'
                                    }`}
                                    title={inst.latestExpiryWarning.failureReason || `Sent to ${inst.latestExpiryWarning.recipientEmail}`}
                                  >
                                    <AlertCircle className="w-2.5 h-2.5" />
                                    {inst.latestExpiryWarning.status === 'sent'
                                      ? `Expiry Warning Sent (${formatDate(inst.latestExpiryWarning.sentAt)})`
                                      : inst.latestExpiryWarning.status === 'failed'
                                      ? 'Expiry Warning Failed'
                                      : `Expiry Warning: ${inst.latestExpiryWarning.status}`}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Previous Link History Toggle */}
                            {inst.linkHistory && inst.linkHistory.length > 0 && (
                              <div className="pt-1">
                                <button
                                  type="button"
                                  onClick={() => setExpandedHistoryIdx(isHistoryExpanded ? null : idx)}
                                  className="text-[11px] font-semibold text-gray-500 hover:text-gray-800 flex items-center gap-1 transition-colors"
                                >
                                  <History className="w-3 h-3" />
                                  <span>Link History ({inst.linkHistory.length})</span>
                                  {isHistoryExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>

                                {isHistoryExpanded && (
                                  <div className="mt-2 space-y-1.5 p-2.5 bg-white rounded border border-gray-200 animate-in fade-in text-[10px]">
                                    {inst.linkHistory.map((lh) => (
                                      <div key={lh.id} className="p-1.5 bg-gray-50 rounded flex items-center justify-between gap-2">
                                        <div>
                                          <span className="font-mono text-gray-700 block truncate max-w-[170px]">{lh.shortUrl || lh.linkId}</span>
                                          <span className="text-gray-400">
                                            Status: <strong className="uppercase">{lh.status}</strong> • Exp: {formatDate(lh.expiresAt)}
                                          </span>
                                        </div>
                                        {lh.renewedBy && (
                                          <span className="text-gray-400 shrink-0">By: {lh.renewedBy}</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Verified Transactions List */}
                {paymentSummary.payments && paymentSummary.payments.length > 0 && (
                  <div className="pt-2 border-t border-gray-100 space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
                      Verified Transactions ({paymentSummary.payments.length})
                    </span>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {paymentSummary.payments.map((p) => (
                        <div key={p.id} className="p-2 bg-gray-50 rounded text-[11px] space-y-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-bold text-gray-900">{formatCurrency(p.amount)}</span>
                              <span className="text-gray-400 block text-[10px] font-mono truncate max-w-[140px]">
                                {p.razorpayPaymentId || p.receiptReference}
                              </span>
                            </div>
                            <span className="text-gray-400 text-[10px]">{formatDate(p.createdAt)}</span>
                          </div>
                          {p.allocations && p.allocations.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {p.allocations.map((a, aIdx) => (
                                <span key={aIdx} className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 text-[9px] font-bold">
                                  {a.installmentTitle}: {formatCurrency(a.allocatedAmount)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Admin Payment Link Renewal Modal */}
          {isRenewalModalOpen && selectedInstallmentForRenewal && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-200 space-y-5 animate-in zoom-in-95">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div>
                    <h3 className="text-base font-extrabold text-gray-900">Renew Payment Link</h3>
                    <p className="text-xs text-gray-500">{selectedInstallmentForRenewal.title}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRenewalModalOpen(false);
                      setRenewalErrorMsg('');
                      setRenewalSuccessMsg('');
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Authoritative Financial Balances */}
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Scheduled Installment:</span>
                    <strong className="text-gray-900">{formatCurrency(selectedInstallmentForRenewal.scheduledAmount)}</strong>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>Verified Amount Paid:</span>
                    <strong className="text-emerald-700">{formatCurrency(selectedInstallmentForRenewal.verifiedPaidAmount)}</strong>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-200 text-sm">
                    <span className="font-bold text-gray-900">Replacement Link Amount:</span>
                    <strong className="font-black text-amber-700">
                      {formatCurrency(selectedInstallmentForRenewal.outstandingAmount)}
                    </strong>
                  </div>
                  <p className="text-[11px] text-gray-400 pt-1">
                    * Per authoritative rules, replacement link will request strictly the current outstanding balance.
                  </p>
                </div>

                {/* Expiry Date Picker */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-700">
                    New Link Expiry Date
                  </label>
                  <input
                    type="date"
                    min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                    value={newExpiryDateStr}
                    onChange={(e) => setNewExpiryDateStr(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-gray-300 text-sm font-semibold text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-gray-400">
                    Original installment due date ({formatDate(selectedInstallmentForRenewal.dueDate)}) remains preserved.
                  </p>
                </div>

                {/* Success / Error Messages */}
                {renewalSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{renewalSuccessMsg}</span>
                  </div>
                )}

                {renewalErrorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{renewalErrorMsg}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRenewalModalOpen(false);
                      setRenewalErrorMsg('');
                      setRenewalSuccessMsg('');
                    }}
                    disabled={isRenewing}
                    className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleRenewPaymentLink}
                    disabled={isRenewing || !newExpiryDateStr}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors shadow-xs"
                  >
                    {isRenewing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Renewing Link...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Issue Replacement Link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Client Information */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900">Client Information</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 border border-indigo-100">
                  <User className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500">Host Name</p>
                  <p className="font-bold text-gray-900 truncate">{event.clientInfo?.name || client?.name || 'Unknown'}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-gray-100 space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700 truncate">{event.clientInfo?.email || client?.email || 'No email provided'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">{event.clientInfo?.phone || client?.phone || 'No phone provided'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Event Particulars */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900">Event Information</h3>
            </div>
            <div className="p-5 space-y-5">
              <div className="flex items-start gap-3">
                <Calendar className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Date</p>
                  <p className="text-sm font-semibold text-gray-900">{new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Time</p>
                  <p className="text-sm font-semibold text-gray-900">{event.startTime} – {event.endTime}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Users className="w-4 h-4 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Expected Guests</p>
                  <p className="text-sm font-semibold text-gray-900">{event.guestCount} pax</p>
                </div>
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900">Location</h3>
            </div>
            <div className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <p className="text-sm font-semibold text-gray-900">{event.location?.address || 'Not specified'}</p>
              </div>
              {event.location?.lat !== undefined && event.location?.lng !== undefined && (
                <div className="w-full h-40 rounded-lg overflow-hidden border border-gray-200">
                  <ReadOnlyMap lat={event.location.lat} lng={event.location.lng} />
                </div>
              )}
            </div>
          </div>

          {/* Manager Info */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50">
              <h3 className="text-sm font-bold text-gray-900">Event Manager</h3>
            </div>
            <div className="p-5">
              {manager ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 border border-emerald-100">
                    <Building2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{manager.name}</p>
                    <p className="text-xs text-gray-500">{manager.email}</p>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center">
                  <p className="text-sm font-medium text-gray-500">Not Assigned Yet</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
