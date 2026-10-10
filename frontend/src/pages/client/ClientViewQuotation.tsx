import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getQuotationById,
  acceptQuotation,
  rejectQuotation,
  requestChangesQuotation,
} from '../../features/quotations/quotationApi';
import type { Quotation } from '../../features/quotations/quotation.types';
import {
  Loader2,
  ArrowLeft,
  Printer,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  FileEdit,
  Calculator,
  AlertTriangle,
  ArrowRight,
  Info,
  MapPin,
  Users,
  Calendar,
  Sparkles,
} from 'lucide-react';

export const ClientViewQuotation: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Decision Modal States
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showChangesModal, setShowChangesModal] = useState(false);

  // Form Inputs & Loading
  const [changeNotes, setChangeNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [successBanner, setSuccessBanner] = useState<{
    type: 'accepted' | 'rejected' | 'changes_requested';
    message: string;
  } | null>(null);

  useEffect(() => {
    const fetchQuotation = async () => {
      try {
        setIsLoading(true);
        setError('');
        if (id) {
          const data = await getQuotationById(id);
          setQuotation(data);
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load quotation');
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuotation();
  }, [id]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const toTitleCase = (str?: string) => {
    if (!str) return '—';
    return str
      .split(' ')
      .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ''))
      .join(' ');
  };

  const cleanRequirementText = (text?: string) => {
    if (!text) return '';
    return text
      .replace(/serviceMode:\s*/gi, 'Service Mode: ')
      .replace(/starters:\s*/gi, 'Starters: ')
      .replace(/mainDishes:\s*/gi, 'Main Courses: ')
      .replace(/desserts:\s*/gi, 'Desserts: ')
      .replace(/style:\s*/gi, 'Style: ')
      .replace(/coverage:\s*/gi, 'Coverage: ')
      .replace(/deliverables:\s*/gi, 'Deliverables: ')
      .replace(/package:\s*/gi, 'Package: ');
  };

  const isExpired = (validUntil?: string) => {
    if (!validUntil) return false;
    return new Date() > new Date(validUntil);
  };

  const isReviewable = () => {
    if (!quotation) return false;
    return (
      (quotation.status === 'sent' || quotation.status === 'awaiting_approval') &&
      !isExpired(quotation.validUntil)
    );
  };

  const handlePrint = () => {
    window.print();
  };

  // Decision Actions
  const handleAccept = async () => {
    if (!quotation || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setActionError('');
      const updated = await acceptQuotation(quotation._id);
      setQuotation(updated);
      setShowAcceptModal(false);
      setSuccessBanner({
        type: 'accepted',
        message:
          'Quotation accepted successfully! Your event is now in Awaiting Advance Payment status.',
      });
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to accept quotation. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!quotation || isSubmitting) return;
    try {
      setIsSubmitting(true);
      setActionError('');
      const updated = await rejectQuotation(quotation._id, rejectReason.trim() || undefined);
      setQuotation(updated);
      setShowRejectModal(false);
      setSuccessBanner({
        type: 'rejected',
        message: 'You have rejected this quotation.',
      });
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to reject quotation. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quotation || isSubmitting) return;
    if (!changeNotes.trim()) {
      setActionError('Please describe the changes you would like to request.');
      return;
    }

    try {
      setIsSubmitting(true);
      setActionError('');
      const updated = await requestChangesQuotation(quotation._id, changeNotes.trim());
      setQuotation(updated);
      setShowChangesModal(false);
      setSuccessBanner({
        type: 'changes_requested',
        message:
          'Your requested changes have been sent to our event team. We will review them and issue an updated revision.',
      });
    } catch (err: any) {
      setActionError(
        err.response?.data?.message || 'Failed to submit change request. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mb-4" />
        <p className="text-gray-500 font-medium text-sm">Loading quotation document...</p>
      </div>
    );
  }

  if (error || !quotation) {
    return (
      <div className="bg-red-50 text-red-700 p-8 rounded-2xl border border-red-200 max-w-2xl mx-auto mt-8 shadow-xs text-center">
        <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold mb-2">Unable to Load Quotation</h2>
        <p className="text-sm text-red-600 mb-6">{error || 'Quotation not found or access restricted.'}</p>
        <Link
          to="/client/quotations"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Quotations
        </Link>
      </div>
    );
  }

  const expired = isExpired(quotation.validUntil) && ['draft', 'sent', 'awaiting_approval'].includes(quotation.status);

  return (
    <div className="max-w-[1020px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-500 pb-20 print:p-0 print:m-0 print:space-y-0">
      {/* Top Bar (Hidden when printing) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            to="/client/quotations"
            className="p-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl transition-colors shadow-xs text-gray-600"
            title="Back to Quotations"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                Quotation {quotation.quotationNumber}
              </h1>
              <span className="px-2 py-0.5 text-xs font-bold bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100">
                Revision {quotation.revision}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Event: <span className="font-semibold text-gray-700">{quotation.eventSnapshot?.title || 'Event'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-xs font-semibold text-xs sm:text-sm"
          >
            <Printer className="w-4 h-4 text-gray-500" />
            Print Document
          </button>
        </div>
      </div>

      {/* Dynamic Status / Decision Notification Banner */}
      {successBanner ? (
        <div
          className={`p-4 sm:p-5 rounded-xl border flex items-start gap-3.5 print:hidden shadow-xs animate-in fade-in ${successBanner.type === 'accepted'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : successBanner.type === 'changes_requested'
                ? 'bg-purple-50 border-purple-200 text-purple-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
        >
          {successBanner.type === 'accepted' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : successBanner.type === 'changes_requested' ? (
            <Clock className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className="font-bold text-sm">{successBanner.message}</p>
            {successBanner.type === 'accepted' && (
              <div className="mt-2.5 flex items-center gap-3">
                <Link
                  to={`/client/events/${quotation.eventId}`}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 underline"
                >
                  View Event Details
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link
                  to="/client/quotations"
                  className="text-xs font-semibold text-emerald-700 hover:underline"
                >
                  Return to Quotations List
                </Link>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="print:hidden">
          {expired ? (
            <div className="bg-red-50 border border-red-200 p-4 sm:p-5 rounded-xl text-red-800 flex items-start gap-3.5 shadow-xs">
              <Clock className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">Quotation Expired</p>
                <p className="text-xs text-red-600 mt-0.5">
                  The validity date for this quotation passed on {formatDate(quotation.validUntil)}. It can no longer be accepted. Please contact the event team if you need an extension or updated quote.
                </p>
              </div>
            </div>
          ) : quotation.status === 'sent' || quotation.status === 'awaiting_approval' ? (
            <div className="bg-amber-50/90 border border-amber-200/90 p-4 sm:p-5 rounded-xl text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-sm text-amber-950">Awaiting Your Review & Decision</p>
                  <p className="text-xs text-amber-800/90 mt-0.5">
                    Please review the detailed services, pricing, schedule, and terms below. You can accept this quotation to proceed, request changes, or reject it.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-stretch sm:self-auto">
                <button
                  onClick={() => setShowAcceptModal(true)}
                  className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs inline-flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Accept Quotation
                </button>
              </div>
            </div>
          ) : quotation.status === 'accepted' ? (
            <div className="bg-emerald-50 border border-emerald-200 p-4 sm:p-5 rounded-xl text-emerald-900 flex items-start justify-between gap-4 shadow-xs">
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-sm text-emerald-950">Quotation Accepted</p>
                  <p className="text-xs text-emerald-800/90 mt-0.5">
                    You have confirmed and accepted this quotation. The event status is currently{' '}
                    <span className="font-bold uppercase tracking-wider text-[11px] bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-800">
                      Awaiting Payment
                    </span>
                    . Event confirmation occurs once the required advance payment is verified.
                  </p>
                </div>
              </div>
              <Link
                to={`/client/events/${quotation.eventId}`}
                className="shrink-0 px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors shadow-xs hidden sm:inline-flex items-center gap-1.5"
              >
                View Event
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : quotation.status === 'changes_requested' ? (
            <div className="bg-purple-50 border border-purple-200 p-4 sm:p-5 rounded-xl text-purple-900 flex items-start gap-3.5 shadow-xs">
              <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-sm text-purple-950">Changes Requested</p>
                <p className="text-xs text-purple-800/90 mt-0.5">
                  Your revision requests have been submitted. The event planning team is currently preparing an updated quotation revision for your review.
                </p>
                {quotation.clientNotes && (
                  <div className="mt-2.5 bg-white/80 p-3 rounded-lg border border-purple-200/70 text-xs">
                    <span className="font-semibold text-purple-900 block mb-0.5">Your Requested Changes:</span>
                    <p className="text-purple-950 whitespace-pre-wrap">{quotation.clientNotes}</p>
                  </div>
                )}
              </div>
            </div>
          ) : quotation.status === 'rejected' ? (
            <div className="bg-red-50 border border-red-200 p-4 sm:p-5 rounded-xl text-red-900 flex items-start gap-3.5 shadow-xs">
              <div className="w-9 h-9 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-sm text-red-950">Quotation Rejected</p>
                <p className="text-xs text-red-800/90 mt-0.5">
                  This quotation has been marked as rejected.
                </p>
                {quotation.rejectionReason && (
                  <div className="mt-2.5 bg-white/80 p-3 rounded-lg border border-red-200/70 text-xs">
                    <span className="font-semibold text-red-900 block mb-0.5">Rejection Reason:</span>
                    <p className="text-red-950 whitespace-pre-wrap">{quotation.rejectionReason}</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ======================================================== */}
      {/* Professional Quotation Document Container (Printable A4) */}
      {/* ======================================================== */}
      <div className="bg-white shadow-sm rounded-xl border border-slate-200/90 print:border-none print:shadow-none print:rounded-none overflow-hidden text-slate-800 relative">
        <div className="p-8 sm:p-12 space-y-8">
          {/* Masthead Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-slate-200 pb-8">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-xs">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 leading-tight">
                    EVENTO
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Bespoke Event Experiences & Production
                  </p>
                </div>
              </div>
              <div className="text-xs text-slate-500 space-y-0.5 pl-0.5">
                <p>Evento Events & Production Studio</p>
                <p>concierge@evento.com · +91 (800) 123-4567</p>
                {quotation.tax?.customerGstin && (
                  <p className="text-slate-600">Client GSTIN: {quotation.tax.customerGstin}</p>
                )}
              </div>
            </div>

            <div className="text-left sm:text-right flex flex-col items-start sm:items-end w-full sm:w-auto">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
                QUOTATION
              </h1>
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3.5 w-full sm:min-w-[260px] text-xs">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-1 text-slate-500 font-medium">Quotation No</td>
                      <td className="py-1 font-bold text-slate-900 text-right">
                        {quotation.quotationNumber}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-500 font-medium">Revision</td>
                      <td className="py-1 font-semibold text-slate-800 text-right">
                        Rev {quotation.revision}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-500 font-medium">Date Issued</td>
                      <td className="py-1 font-medium text-slate-800 text-right">
                        {formatDate(quotation.createdAt)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1 text-slate-500 font-medium">Valid Until</td>
                      <td className="py-1 font-medium text-slate-800 text-right">
                        {formatDate(quotation.validUntil)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Client & Event Specifications Brief */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 border-b border-slate-200 pb-8">
            {/* Client Info */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Prepared For
              </h3>
              <p className="text-lg font-bold text-slate-900">
                {toTitleCase(quotation.eventSnapshot?.clientName || 'Valued Client')}
              </p>
              <div className="flex items-start gap-1.5 text-xs text-slate-600 mt-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                <span>
                  {quotation.eventSnapshot?.location?.address ||
                    quotation.eventSnapshot?.location ||
                    'Venue details as specified in event plan'}
                </span>
              </div>
            </div>

            {/* Event Info */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Event Specifications
              </h3>
              <p className="text-lg font-bold text-slate-900">
                {toTitleCase(quotation.eventSnapshot?.title || 'Private Event')}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Sparkles className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Type: <strong className="text-slate-800">{toTitleCase(quotation.eventSnapshot?.eventType || 'Event')}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Date: <strong className="text-slate-800">{formatDate(quotation.eventSnapshot?.date)}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Time: <strong className="text-slate-800">{quotation.eventSnapshot?.startTime || '—'} – {quotation.eventSnapshot?.endTime || '—'}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Guests: <strong className="text-slate-800">{quotation.eventSnapshot?.guestCount || '—'} Expected</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Scope of Services & Deliverables
            </h3>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200">
                    <th className="px-4 py-3 font-semibold text-slate-700 w-[50%]">
                      Service & Specifications
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700 text-center w-[12%]">
                      Qty
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700 text-right w-[18%]">
                      Unit Rate
                    </th>
                    <th className="px-4 py-3 font-semibold text-slate-700 text-right w-[20%]">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quotation.items.map((item, idx) => {
                    const hasDetailed = item.detailedContent && item.detailedContent.length > 0;

                    return (
                      <tr key={idx} className="align-top hover:bg-slate-50/40 transition-colors">
                        <td className="px-4 py-4 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900 text-sm">
                              {item.name}
                            </span>
                            {item.scope && (
                              <span className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700 rounded border border-slate-200/60">
                                {item.scope}
                              </span>
                            )}
                          </div>

                          {/* Render structured detailed content if available (without raw duplicate text) */}
                          {hasDetailed ? (
                            <div className="mt-2 bg-slate-50/80 border border-slate-200/70 rounded-lg p-3 space-y-2.5">
                              <span className="text-[11px] font-semibold text-slate-600 block">
                                Inclusions & Deliverables:
                              </span>
                              <div
                                className={`grid gap-3 ${
                                  item.detailedContent!.length >= 3
                                    ? 'grid-cols-1 sm:grid-cols-3'
                                    : item.detailedContent!.length === 2
                                    ? 'grid-cols-1 sm:grid-cols-2'
                                    : 'grid-cols-1'
                                }`}
                              >
                                {item.detailedContent!.map((section, sidx) => (
                                  <div key={sidx} className="text-xs space-y-1">
                                    <p className="font-semibold text-slate-800 text-[11px]">
                                      {section.sectionName}
                                    </p>
                                    <ul className="space-y-0.5 text-slate-600">
                                      {section.items.map((it, lidx) => (
                                        <li key={lidx} className="flex items-start gap-1">
                                          <span className="text-slate-400">•</span>
                                          <span>{it}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : item.requirements ? (
                            <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-200/50 leading-relaxed whitespace-pre-wrap">
                              {cleanRequirementText(item.requirements)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-center font-medium text-slate-700 tabular-nums">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-4 text-right font-medium text-slate-700 tabular-nums">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment Plan & Commercial Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-4 border-t border-slate-200">
            {/* Left Column: Payment Milestones & Terms (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Payment Schedule */}
              {quotation.paymentPlan && quotation.paymentPlan.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Milestone Payment Schedule
                  </h4>
                  <div className="space-y-2">
                    {quotation.paymentPlan.map((plan, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg flex items-center justify-between gap-4 text-xs"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {plan.title}
                            </span>
                            {plan.percentage && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-200/80 text-slate-700">
                                {plan.percentage}%
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-slate-500 text-[11px]">
                            {plan.dueDate && (
                              <span className="inline-flex items-center gap-1 text-slate-700">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                {new Date(plan.dueDate).toLocaleDateString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            )}
                            {plan.dueDateDescription && <span>• {plan.dueDateDescription}</span>}
                          </div>
                        </div>
                        <span className="font-bold text-slate-900 tabular-nums text-sm shrink-0">
                          {formatCurrency(plan.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Terms & Conditions */}
              {quotation.structuredTerms && quotation.structuredTerms.length > 0 ? (
                <div className="space-y-2.5 pt-2">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Commercial Terms & Conditions
                  </h4>
                  <div className="bg-slate-50/50 border border-slate-200/80 rounded-lg p-3.5 space-y-2 text-xs">
                    {quotation.structuredTerms.map((term, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-slate-400 font-semibold">{idx + 1}.</span>
                        <div className="leading-relaxed">
                          <strong className="text-slate-800">{term.title}: </strong>
                          <span className="text-slate-600">{term.content}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : quotation.terms ? (
                <div className="space-y-2 pt-2">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Terms & Conditions
                  </h4>
                  <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200/60 leading-relaxed whitespace-pre-wrap">
                    {quotation.terms}
                  </p>
                </div>
              ) : null}

              {/* Notes */}
              {quotation.notes && (
                <div className="space-y-1.5 pt-1">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Special Notes
                  </h4>
                  <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200/60 leading-relaxed whitespace-pre-wrap">
                    {quotation.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Right Column: Financial Totals Breakdown (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Financial Summary
              </h4>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(quotation.subtotal)}
                    </span>
                  </div>

                  {quotation.discount > 0 && (
                    <div className="flex justify-between items-center text-rose-600 font-medium">
                      <span>Applied Discount</span>
                      <span className="tabular-nums">
                        -{formatCurrency(quotation.discount)}
                      </span>
                    </div>
                  )}

                  {quotation.discount > 0 && (
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Taxable Subtotal</span>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        {formatCurrency(quotation.taxableAmount)}
                      </span>
                    </div>
                  )}

                  {quotation.tax?.taxType && quotation.tax.taxType !== 'none' && (
                    <div className="space-y-1 pt-1 border-t border-slate-200/70">
                      <div className="flex justify-between items-center text-slate-600">
                        <span>
                          Tax ({quotation.tax.taxType.toUpperCase()} @ {quotation.tax.taxRate}%)
                        </span>
                        <span className="font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(quotation.tax.taxAmount)}
                        </span>
                      </div>
                      {quotation.tax.gstTreatment === 'intra_state' && quotation.tax.cgst > 0 && (
                        <div className="flex justify-between items-center text-[11px] text-slate-500 pl-2">
                          <span>CGST ({(quotation.tax.taxRate / 2).toFixed(1)}%) + SGST ({(quotation.tax.taxRate / 2).toFixed(1)}%)</span>
                          <span>{formatCurrency(quotation.tax.cgst)} + {formatCurrency(quotation.tax.sgst)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Final Total Investment Box */}
                <div className="bg-slate-900 text-white rounded-lg p-3.5 space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-medium text-slate-300">
                      Total Quotation Value
                    </span>
                    <span className="text-xl font-bold tracking-tight tabular-nums">
                      {formatCurrency(quotation.finalAmount)}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Inclusive of specified line items, services, and taxes.
                  </p>
                </div>

                {/* Retainer & Remaining Balance */}
                <div className="pt-2 border-t border-slate-200/80 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-slate-700">Advance Deposit Due:</span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {formatCurrency(quotation.advanceAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Balance Remaining:</span>
                    <span className="font-semibold text-slate-700 tabular-nums">
                      {formatCurrency(quotation.remainingAmount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Signatures & Execution Section */}
          <div className="pt-8 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-8 text-xs">
            <div className="border border-dashed border-slate-300 rounded-lg p-4 space-y-3 bg-slate-50/30">
              <p className="font-semibold text-slate-800">Client Acceptance</p>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Accepted by {toTitleCase(quotation.eventSnapshot?.clientName || 'Client')} in accordance with the specified deliverables and commercial milestones.
              </p>
              <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-slate-500">
                <span>Signature / Confirmation</span>
                <span>{quotation.status === 'accepted' ? 'Digitally Accepted' : 'Pending'}</span>
              </div>
            </div>

            <div className="border border-dashed border-slate-300 rounded-lg p-4 space-y-3 bg-slate-50/30">
              <p className="font-semibold text-slate-800">Evento Event Operations</p>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Issued by authorized production management for Evento. Confirmation is subject to milestone retainer payment.
              </p>
              <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-slate-500">
                <span>Authorized Signatory</span>
                <span>Evento Management</span>
              </div>
            </div>
          </div>

          {/* Footer Note */}
          <div className="pt-4 text-center text-[11px] text-slate-400 border-t border-slate-100">
            <p>
              Thank you for trusting Evento with your event. For questions, adjustments, or concierge assistance, reach our team at concierge@evento.com.
            </p>
          </div>
        </div>
      </div>

      {/* Decision Action Bar (Only shown for reviewable quotations) */}
      {isReviewable() && (
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-gray-200 shadow-sm print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky bottom-4 z-20">
          <div>
            <p className="font-bold text-sm text-gray-900">Make Your Decision</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Choose an action below to proceed with your event planning.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Reject (Danger) */}
            <button
              onClick={() => {
                setActionError('');
                setShowRejectModal(true);
              }}
              className="px-4 py-2.5 border border-red-200 text-red-700 hover:bg-red-50 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <XCircle className="w-4 h-4 text-red-500" />
              Reject Quotation
            </button>

            {/* Request Changes (Secondary) */}
            <button
              onClick={() => {
                setActionError('');
                setShowChangesModal(true);
              }}
              className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-xs"
            >
              <FileEdit className="w-4 h-4 text-indigo-600" />
              Request Changes
            </button>

            {/* Accept (Primary) */}
            <button
              onClick={() => {
                setActionError('');
                setShowAcceptModal(true);
              }}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Accept Quotation
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. ACCEPT CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {showAcceptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-emerald-700">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Accept this Quotation?</h3>
                <p className="text-xs text-gray-500">Quotation {quotation.quotationNumber} (Rev {quotation.revision})</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
              You are confirming that you agree to the quotation details, pricing, services, and terms for{' '}
              <span className="font-semibold text-gray-900">{quotation.eventSnapshot?.title || 'your event'}</span>.
            </p>

            <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-1.5 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Final Quotation Amount:</span>
                <span className="font-bold text-gray-900">{formatCurrency(quotation.finalAmount)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold pt-1 border-t border-gray-200">
                <span>Required Advance Amount:</span>
                <span className="font-bold text-emerald-700 text-sm">{formatCurrency(quotation.advanceAmount)}</span>
              </div>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-[11px] text-blue-800 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                <strong>Next Step:</strong> Accepting this quotation transitions your event to{' '}
                <strong>Awaiting Payment</strong>. Your event will be officially confirmed after the required advance payment is verified.
              </span>
            </div>

            {actionError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {actionError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowAcceptModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={isSubmitting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Accepting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Confirm & Accept Quotation
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. REQUEST CHANGES MODAL */}
      {/* ========================================================================= */}
      {showChangesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-indigo-700">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <FileEdit className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Request Changes</h3>
                <p className="text-xs text-gray-500">Quotation {quotation.quotationNumber} (Rev {quotation.revision})</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
              Describe the adjustments you would like us to make. Our planning team will review your requests and prepare an updated quotation revision.
            </p>

            <form onSubmit={handleRequestChanges} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Requested Changes / Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={changeNotes}
                  onChange={(e) => setChangeNotes(e.target.value)}
                  placeholder="Please describe the changes you would like us to make (e.g. adjust guest count, customize menu items, alter decoration details, or modify pricing)..."
                  className="w-full text-xs sm:text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-gray-400"
                  required
                />
              </div>

              {actionError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                  {actionError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangesModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !changeNotes.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <FileEdit className="w-4 h-4" />
                      Submit Change Request
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. REJECT CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Reject Quotation</h3>
                <p className="text-xs text-gray-500">Quotation {quotation.quotationNumber} (Rev {quotation.revision})</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
              Are you sure you want to reject this quotation? If you only need adjustments, you can choose{' '}
              <strong className="text-gray-800">Request Changes</strong> instead.
            </p>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Rejection Reason (Optional)
              </label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Let us know why you are rejecting this quotation..."
                className="w-full text-xs sm:text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 placeholder:text-gray-400"
              />
            </div>

            {actionError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {actionError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isSubmitting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Rejecting...
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    Confirm Rejection
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
