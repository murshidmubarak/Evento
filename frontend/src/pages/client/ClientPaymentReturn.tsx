import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Calendar,
  FileText,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { reconcilePaymentLink } from '../../features/payments/paymentsApi';
import type { VerifyPaymentResponse } from '../../features/payments/payment.types';
import { formatCurrency } from '../../utils/formatters';

export const ClientPaymentReturn: React.FC = () => {
  const [searchParams] = useSearchParams();
  const paymentLinkId = searchParams.get('razorpay_payment_link_id');
  const paymentId = searchParams.get('razorpay_payment_id');
  const statusParam = searchParams.get('razorpay_payment_link_status');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [result, setResult] = useState<VerifyPaymentResponse | null>(null);

  const performReconciliation = useCallback(async () => {
    if (!paymentLinkId) {
      setError('No Payment Link ID was found in the return URL parameters.');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      const data = await reconcilePaymentLink({
        paymentLinkId,
        paymentId: paymentId || undefined,
      });
      setResult(data);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        'We were unable to synchronize this payment. Please check your event details or contact support.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [paymentLinkId, paymentId]);

  useEffect(() => {
    performReconciliation();
  }, [performReconciliation]);

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 sm:px-6 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Loading Reconciliation State */}
      {isLoading && (
        <div className="bg-white rounded-3xl p-10 border border-gray-200 shadow-sm text-center space-y-6">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-100 animate-pulse"></div>
            <Loader2 className="w-16 h-16 animate-spin text-indigo-600 relative z-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-gray-900 tracking-tight">
              Verifying Payment with Gateway
            </h2>
            <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
              We are synchronizing your transaction details from Razorpay into EventOps ERP. This ensures your installment balances and event state are 100% up to date.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 py-2 px-4 rounded-full border border-emerald-200 w-fit mx-auto">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Secure 256-Bit Cryptographic Synchronization</span>
          </div>
        </div>
      )}

      {/* Error or Pending Failure State */}
      {!isLoading && error && (
        <div className="bg-white rounded-3xl p-10 border border-rose-200 shadow-sm text-center space-y-6 animate-in zoom-in-95">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-gray-900 tracking-tight">
              Payment Synchronization Notice
            </h2>
            <p className="text-sm text-rose-700 max-w-md mx-auto leading-relaxed font-medium">
              {error}
            </p>
            {statusParam && (
              <p className="text-xs text-gray-400">
                Gateway reported link status: <span className="font-mono uppercase font-bold text-gray-600">{statusParam}</span>
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              id="btn-retry-reconciliation"
              type="button"
              onClick={performReconciliation}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Synchronization</span>
            </button>
            <Link
              id="btn-return-my-events"
              to="/client/events"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors"
            >
              <span>Back to My Events</span>
            </Link>
          </div>
        </div>
      )}

      {/* Verified Success State */}
      {!isLoading && result && (
        <div className="bg-white rounded-3xl overflow-hidden border border-gray-200 shadow-sm animate-in zoom-in-95 space-y-6">
          {/* Header Banner */}
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-8 text-white text-center space-y-3 relative">
            <div className="w-16 h-16 rounded-2xl bg-white text-emerald-600 flex items-center justify-center mx-auto shadow-md ring-4 ring-white/30">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-100 block">
                Transaction Verified & Synced
              </span>
              <h1 className="text-2xl font-black tracking-tight mt-1">
                Payment Received Successfully!
              </h1>
            </div>
            <p className="text-xs text-emerald-100 max-w-md mx-auto">
              Your payment has been authoritatively verified by the backend. All installment records and financial balances in EventOps have been updated.
            </p>
          </div>

          {/* Details Grid */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-1">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                  Amount Verified
                </span>
                <span className="text-2xl font-black text-gray-900 block">
                  {formatCurrency(result.amountPaid)}
                </span>
                <span className="text-[10px] text-emerald-600 font-bold uppercase flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> 100% Captured
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-1">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                  Event Status
                </span>
                <div className="pt-0.5">
                  {result.eventStatus === 'confirmed' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-black uppercase rounded-lg border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 text-xs font-black uppercase rounded-lg border border-amber-200">
                      <Clock className="w-3.5 h-3.5" /> Awaiting Payment
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 pt-1">
                  {result.eventStatus === 'confirmed'
                    ? 'Advance requirement fulfilled; event is fully confirmed!'
                    : 'Additional balance required before full event confirmation.'}
                </p>
              </div>
            </div>

            {/* Financial Particulars List */}
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl overflow-hidden text-xs">
              {result.quotationNumber && (
                <div className="p-3.5 flex items-center justify-between bg-white">
                  <span className="text-gray-500 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" /> Quotation
                  </span>
                  <span className="font-bold text-gray-900 font-mono">
                    {result.quotationNumber} (Rev {result.quotationRevision})
                  </span>
                </div>
              )}

              {result.installmentStatus && (
                <div className="p-3.5 flex items-center justify-between bg-white">
                  <span className="text-gray-500">Installment Status</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                    result.installmentStatus === 'Paid'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {result.installmentStatus}
                  </span>
                </div>
              )}

              {result.totalOutstandingAmount !== undefined && (
                <div className="p-3.5 flex items-center justify-between bg-white">
                  <span className="text-gray-500">Remaining Quotation Outstanding</span>
                  <span className="font-black text-gray-900">
                    {formatCurrency(result.totalOutstandingAmount)}
                  </span>
                </div>
              )}

              {result.outstandingAdvance !== undefined && result.outstandingAdvance > 0 && (
                <div className="p-3.5 flex items-center justify-between bg-amber-50/50">
                  <span className="text-amber-800 font-semibold">Remaining Advance Required</span>
                  <span className="font-black text-amber-800">
                    {formatCurrency(result.outstandingAdvance)}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              {result.eventId && (
                <Link
                  id="btn-return-event-details"
                  to={`/client/events/${result.eventId}`}
                  className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 py-3 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                >
                  <Calendar className="w-4 h-4" />
                  <span>View Event Details</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}

              {result.eventId && result.totalOutstandingAmount && result.totalOutstandingAmount > 0 && (
                <Link
                  id="btn-return-payment-schedule"
                  to={`/client/events/${result.eventId}/payment`}
                  className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 py-3 px-5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold transition-colors shadow-xs"
                >
                  <span>Review Payment Schedule</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
