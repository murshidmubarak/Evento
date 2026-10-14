import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Calendar,
  FileText,
  Clock,
  RefreshCw,
  Check,
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
    <div className="max-w-xl mx-auto py-12 px-4 sm:px-6 space-y-6 text-slate-900 animate-in fade-in duration-300">
      
      {/* ─── Loading Reconciliation State ─── */}
      {isLoading && (
        <div className="bg-white rounded-2xl p-10 border border-slate-200/80 shadow-xs text-center space-y-5">
          <div className="relative w-12 h-12 mx-auto">
            <div className="w-12 h-12 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
              Verifying Payment with Gateway
            </h2>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Synchronizing transaction status from Razorpay into your event schedule.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 py-1.5 px-3 rounded-full border border-slate-200/60">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
            <span>256-Bit SSL Verification</span>
          </div>
        </div>
      )}

      {/* ─── Error Notice ─── */}
      {!isLoading && error && (
        <div className="bg-white rounded-2xl p-8 border border-slate-200/80 shadow-xs text-center space-y-5">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">
              Payment Synchronization Notice
            </h2>
            <p className="text-xs text-rose-700 max-w-sm mx-auto leading-relaxed">
              {error}
            </p>
            {statusParam && (
              <p className="text-[11px] text-slate-400 font-mono">
                Status: {statusParam}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              id="btn-retry-reconciliation"
              type="button"
              onClick={performReconciliation}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Synchronization</span>
            </button>
            <Link
              id="btn-return-my-events"
              to="/client/events"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
            >
              <span>Back to My Events</span>
            </Link>
          </div>
        </div>
      )}

      {/* ─── Verified Success State ─── */}
      {!isLoading && result && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden space-y-0">
          
          {/* Header Banner */}
          <div className="p-6 text-center space-y-3 border-b border-slate-100 bg-slate-50/50">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center justify-center mx-auto shadow-2xs">
              <Check className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 block">
                Payment Verified
              </span>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 mt-0.5">
                Transaction Received Successfully
              </h1>
            </div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Your payment has been recorded and your installment schedule is now up to date.
            </p>
          </div>

          {/* Details Content */}
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                  Amount Captured
                </span>
                <span className="text-xl font-bold text-slate-900 block tabular-nums">
                  {formatCurrency(result.amountPaid)}
                </span>
                <span className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Captured in full
                </span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
                  Event Status
                </span>
                <div className="pt-0.5">
                  {result.eventStatus === 'confirmed' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-md border border-emerald-200/60">
                      Confirmed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-semibold rounded-md border border-amber-200/60">
                      <Clock className="w-3 h-3" /> Awaiting Payment
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 pt-0.5">
                  {result.eventStatus === 'confirmed'
                    ? 'Advance requirement fulfilled'
                    : 'Balance pending confirmation'}
                </p>
              </div>
            </div>

            {/* Financial Ledger Specification */}
            <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden text-xs">
              {result.quotationNumber && (
                <div className="px-4 py-2.5 flex items-center justify-between bg-white">
                  <span className="text-slate-500 flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-slate-400" /> Quotation
                  </span>
                  <span className="font-semibold text-slate-800 font-mono text-[11px]">
                    {result.quotationNumber} (Rev {result.quotationRevision})
                  </span>
                </div>
              )}

              {result.installmentStatus && (
                <div className="px-4 py-2.5 flex items-center justify-between bg-white">
                  <span className="text-slate-500">Milestone Status</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                    result.installmentStatus === 'Paid'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-blue-50 text-blue-700'
                  }`}>
                    {result.installmentStatus}
                  </span>
                </div>
              )}

              {result.totalOutstandingAmount !== undefined && (
                <div className="px-4 py-2.5 flex items-center justify-between bg-white">
                  <span className="text-slate-500">Remaining Balance</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(result.totalOutstandingAmount)}
                  </span>
                </div>
              )}

              {result.outstandingAdvance !== undefined && result.outstandingAdvance > 0 && (
                <div className="px-4 py-2.5 flex items-center justify-between bg-amber-50/50">
                  <span className="text-amber-800 font-medium">Remaining Advance</span>
                  <span className="font-semibold text-amber-800 tabular-nums">
                    {formatCurrency(result.outstandingAdvance)}
                  </span>
                </div>
              )}
            </div>

            {/* Navigation Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
              {result.eventId && (
                <Link
                  id="btn-return-event-details"
                  to={`/client/events/${result.eventId}`}
                  className="w-full sm:flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all shadow-xs"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Go to Event Details</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}

              {result.eventId && result.totalOutstandingAmount && result.totalOutstandingAmount > 0 && (
                <Link
                  id="btn-return-payment-schedule"
                  to={`/client/events/${result.eventId}/payment`}
                  className="w-full sm:flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-colors shadow-2xs"
                >
                  <span>Review Milestone Schedule</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
