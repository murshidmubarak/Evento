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

      {/* Main Quotation Document Container */}
      <div className="bg-white shadow-xl sm:rounded-md print:shadow-none print:rounded-none overflow-hidden text-[13px] font-sans text-gray-800 border border-gray-200 print:border-none relative min-h-[1056px]">
        {/* Top Dark Bar */}
        <div className="h-8 bg-[#172542] w-full flex items-center justify-between px-6 sm:px-10">
          <span className="text-white/80 text-[9px] font-medium tracking-widest uppercase">EventOps ERP</span>
          <span className="text-white/80 text-[9px] font-medium tracking-widest uppercase hidden sm:inline">
            Official Quotation Document
          </span>
        </div>

        <div className="p-6 sm:p-10 sm:px-14 sm:py-12">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-6 mb-8">
            <div className="flex flex-col gap-4">
              {/* Branding */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#172542] rounded-lg flex items-center justify-center text-white shadow-xs shrink-0">
                  <Calculator className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-[#172542] tracking-tight leading-none mb-1">EventOps</h2>
                  <p className="text-gray-400 font-medium text-[10px] tracking-widest uppercase">
                    Event Management ERP
                  </p>
                </div>
              </div>
              <div className="space-y-0.5 text-gray-500 text-[11px]">
                <p>EventOps Operations Headquarters</p>
                <p>contact@eventops.example.com</p>
                <p>+91 (800) 123-4567</p>
              </div>
            </div>

            <div className="text-left sm:text-right flex flex-col items-start sm:items-end w-full sm:w-auto">
              <h1 className="text-3xl sm:text-4xl font-black text-[#172542] tracking-wide mb-3 sm:mb-4">
                QUOTATION
              </h1>
              <div className="bg-gray-50/90 rounded-md p-3.5 w-full sm:min-w-[240px] border border-gray-100">
                <table className="w-full text-left text-[11px]">
                  <tbody>
                    <tr>
                      <td className="text-gray-500 py-1 font-medium">Quotation No:</td>
                      <td className="font-semibold text-gray-900 text-right py-1">{quotation.quotationNumber}</td>
                    </tr>
                    <tr>
                      <td className="text-gray-500 py-1 font-medium">Revision:</td>
                      <td className="font-semibold text-gray-900 text-right py-1">Rev {quotation.revision}</td>
                    </tr>
                    <tr>
                      <td className="text-gray-500 py-1 font-medium">Date Issued:</td>
                      <td className="font-semibold text-gray-900 text-right py-1">{formatDate(quotation.createdAt)}</td>
                    </tr>
                    <tr>
                      <td className="text-gray-500 py-1 font-medium">Valid Until:</td>
                      <td className="font-semibold text-gray-900 text-right py-1">{formatDate(quotation.validUntil)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="w-full h-px bg-gray-200 mb-8" />

          {/* Client & Event Info Section (Read-Only) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-12 mb-10">
            <div>
              <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Prepared For</h3>
              <p className="text-base font-bold text-gray-900 mb-1">{quotation.eventSnapshot?.clientName || 'Valued Client'}</p>
              {quotation.eventSnapshot?.location?.address ? (
                <p className="text-gray-500 text-xs leading-relaxed">{quotation.eventSnapshot.location.address}</p>
              ) : (
                <p className="text-gray-400 text-xs italic">Location specified in event brief</p>
              )}
            </div>

            <div>
              <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Event Information</h3>
              <p className="text-base font-bold text-gray-900 mb-2">{quotation.eventSnapshot?.title || 'Event'}</p>

              <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs">
                <div className="flex">
                  <span className="text-gray-400 w-14 font-medium">Type:</span>
                  <span className="font-semibold text-gray-800 capitalize">{quotation.eventSnapshot?.eventType || 'Standard'}</span>
                </div>
                <div className="flex">
                  <span className="text-gray-400 w-14 font-medium">Time:</span>
                  <span className="font-semibold text-gray-800">
                    {quotation.eventSnapshot?.startTime || 'TBD'} - {quotation.eventSnapshot?.endTime || 'TBD'}
                  </span>
                </div>
                <div className="flex">
                  <span className="text-gray-400 w-14 font-medium">Date:</span>
                  <span className="font-semibold text-gray-800">{formatDate(quotation.eventSnapshot?.date)}</span>
                </div>
                <div className="flex">
                  <span className="text-gray-400 w-14 font-medium">Guests:</span>
                  <span className="font-semibold text-gray-800">{quotation.eventSnapshot?.guestCount || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Services & Pricing Heading */}
          <h2 className="text-base font-bold text-[#172542] mb-3 uppercase tracking-wider text-[11px]">
            Services & Pricing Breakdown
          </h2>

          {/* Line Items Table */}
          <div className="mb-10 overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
            <table className="w-full text-left min-w-[540px]">
              <thead className="bg-[#172542] text-white">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest w-[55%]">Item & Description</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-center w-[12%]">Qty</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-right w-[16%]">Unit Price</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-right w-[17%]">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {quotation.items.map((item, index) => (
                  <tr key={index} className="align-top">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-gray-900 text-sm mb-0.5">{item.name}</p>
                      {item.description && (
                        <p className="text-gray-500 text-xs mb-2 leading-relaxed">{item.description}</p>
                      )}
                      {item.requirements && (
                        <p className="text-xs text-indigo-900 bg-indigo-50/60 p-2 rounded mb-2 border border-indigo-100/60">
                          <span className="font-semibold">Scope: </span>
                          {item.requirements}
                        </p>
                      )}

                      {/* Detailed Content / Nested Specs (e.g. Menu Items, Decor, Photography) */}
                      {item.detailedContent && item.detailedContent.length > 0 && (
                        <div className="bg-gray-50/80 rounded border border-gray-100 p-3 mt-2">
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Included Inclusions</p>
                          <div
                            className={`grid gap-3 ${item.detailedContent.length >= 3
                                ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3'
                                : item.detailedContent.length === 2
                                  ? 'grid-cols-1 sm:grid-cols-2'
                                  : 'grid-cols-1'
                              }`}
                          >
                            {item.detailedContent.map((section, sidx) => (
                              <div key={sidx}>
                                <p className="font-semibold text-gray-800 text-[11px] mb-1">{section.sectionName}</p>
                                <ul className="space-y-0.5 ml-3 list-[circle] text-gray-500 text-[11px] marker:text-gray-300">
                                  {section.items.map((listItem, lidx) => (
                                    <li key={lidx} className="pl-0.5">{listItem}</li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center font-medium text-gray-700 text-xs">{item.quantity}</td>
                    <td className="px-4 py-4 text-right font-medium text-gray-700 text-xs">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-4 py-4 text-right font-bold text-gray-900 text-xs">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Columns: Payment Schedule & Terms + Financial Summary */}
          <div className="flex flex-col md:flex-row justify-between items-start gap-8 md:gap-10">
            {/* Left Side: Payment Schedule & Terms */}
            <div className="flex-1 space-y-8 w-full">
              {/* Payment Schedule */}
              {quotation.paymentPlan && quotation.paymentPlan.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
                    Payment Schedule
                  </h3>
                  <div className="space-y-2.5">
                    {quotation.paymentPlan.map((plan, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-start p-3 bg-gray-50/70 rounded border border-gray-100 text-xs"
                      >
                        <div>
                          <p className="font-bold text-gray-900">{plan.title}</p>
                          {plan.dueDateDescription && (
                            <p className="text-gray-500 text-[11px] mt-0.5">{plan.dueDateDescription}</p>
                          )}
                          {plan.percentage && (
                            <span className="text-[10px] text-indigo-600 font-semibold mt-0.5 inline-block">
                              {plan.percentage}% of total
                            </span>
                          )}
                        </div>
                        <p className="font-bold text-gray-900">{formatCurrency(plan.amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Terms & Conditions */}
              {quotation.structuredTerms && quotation.structuredTerms.length > 0 ? (
                <div>
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
                    Terms & Conditions
                  </h3>
                  <ul className="list-[circle] marker:text-gray-300 space-y-1.5 ml-4 text-xs">
                    {quotation.structuredTerms.map((term, idx) => (
                      <li key={idx} className="text-gray-600 pl-0.5 leading-relaxed">
                        <span className="font-semibold text-gray-800">{term.title}: </span>
                        {term.content}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : quotation.terms ? (
                <div>
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                    Terms & Conditions
                  </h3>
                  <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{quotation.terms}</p>
                </div>
              ) : null}

              {/* Additional Notes */}
              {quotation.notes && (
                <div>
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
                    Notes
                  </h3>
                  <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{quotation.notes}</p>
                </div>
              )}
            </div>

            {/* Right Side: Financial Summary */}
            <div className="w-full md:w-[350px] shrink-0">
              <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                <div className="p-4 sm:p-5">
                  <h3 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                    Financial Summary
                  </h3>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-gray-100">
                      <tr>
                        <td className="py-2 text-gray-500 font-medium">Subtotal</td>
                        <td className="py-2 text-right font-bold text-gray-900">{formatCurrency(quotation.subtotal)}</td>
                      </tr>
                      {quotation.discount > 0 && (
                        <tr>
                          <td className="py-2 text-gray-500 font-medium">Discount</td>
                          <td className="py-2 text-right font-bold text-red-600">-{formatCurrency(quotation.discount)}</td>
                        </tr>
                      )}
                      {quotation.discount > 0 && (
                        <tr>
                          <td className="py-2 text-gray-500 font-medium">Taxable Amount</td>
                          <td className="py-2 text-right font-bold text-gray-900">{formatCurrency(quotation.taxableAmount)}</td>
                        </tr>
                      )}
                      {quotation.tax && quotation.tax.taxType !== 'none' && (
                        <>
                          <tr>
                            <td className="py-2 text-gray-500 font-medium">
                              Tax ({quotation.tax.taxType.toUpperCase()} @ {quotation.tax.taxRate}%)
                            </td>
                            <td className="py-2 text-right font-bold text-gray-900">{formatCurrency(quotation.tax.taxAmount)}</td>
                          </tr>
                          {quotation.tax.cgst > 0 && (
                            <tr>
                              <td className="py-1 text-gray-400 text-[11px] pl-3">CGST</td>
                              <td className="py-1 text-right text-gray-600 text-[11px]">{formatCurrency(quotation.tax.cgst)}</td>
                            </tr>
                          )}
                          {quotation.tax.sgst > 0 && (
                            <tr>
                              <td className="py-1 text-gray-400 text-[11px] pl-3">SGST</td>
                              <td className="py-1 text-right text-gray-600 text-[11px]">{formatCurrency(quotation.tax.sgst)}</td>
                            </tr>
                          )}
                          {quotation.tax.igst > 0 && (
                            <tr>
                              <td className="py-1 text-gray-400 text-[11px] pl-3">IGST</td>
                              <td className="py-1 text-right text-gray-600 text-[11px]">{formatCurrency(quotation.tax.igst)}</td>
                            </tr>
                          )}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Final Total Amount Box */}
                <div className="bg-[#172542] text-white p-5 m-1 rounded-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-white/80 uppercase tracking-widest">
                      Total Quotation Amount
                    </span>
                  </div>
                  <span className="text-2xl sm:text-3xl font-bold tracking-tight block">
                    {formatCurrency(quotation.finalAmount)}
                  </span>

                  {/* Advance Required Row */}
                  <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between text-xs">
                    <span className="text-white/80 font-medium">Advance Due to Confirm:</span>
                    <span className="font-bold text-emerald-400">{formatCurrency(quotation.advanceAmount)}</span>
                  </div>

                  {/* Remaining Balance Row */}
                  <div className="mt-1 flex items-center justify-between text-xs text-white/70">
                    <span>Remaining Balance:</span>
                    <span>{formatCurrency(quotation.remainingAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Authorized Signatory */}
              <div className="mt-8 text-center">
                <p className="text-gray-400 text-[10px] mb-0.5">Authorized Signatory</p>
                <p className="font-bold text-[#172542] uppercase text-[11px] tracking-wider">
                  EventOps Management
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="relative md:absolute bottom-5 w-full text-center mt-8 md:mt-0 px-4">
          <p className="text-[10px] text-gray-400">
            Thank you for choosing EventOps ERP. For any inquiries, reach us at support@eventops.example.com
          </p>
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
