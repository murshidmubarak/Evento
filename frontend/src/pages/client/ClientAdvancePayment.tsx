import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Receipt,
  Clock,
  Sparkles,
  ArrowRight,
  FileText,
  Lock,
  Calendar,
  Copy,
  Check,
  Mail,
  ChevronRight,
  AlertTriangle,
  Layers,
  ShieldCheck,
  Info,
} from 'lucide-react';
import {
  getAdvanceSummary,
  createPaymentOrder,
  verifyPayment,
  previewPaymentAllocation,
} from '../../features/payments/paymentsApi';
import type {
  AdvancePaymentSummary,
  InstallmentPaymentSummary,
  VerifyPaymentResponse,
  PaymentAllocationPreview,
} from '../../features/payments/payment.types';
import { formatCurrency, formatDate } from '../../utils/formatters';

const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export const ClientAdvancePayment = () => {
  const { id } = useParams<{ id: string }>();

  const [summary, setSummary] = useState<AdvancePaymentSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Selected Installment for payment
  const [selectedInstallmentIndex, setSelectedInstallmentIndex] = useState<number>(0);

  // 3 distinct payment options
  // Option A: 'current_installment'
  // Option B: 'custom'
  // Option C: 'full_balance'
  const [paymentOption, setPaymentOption] = useState<'current_installment' | 'custom' | 'full_balance'>('current_installment');
  const [customAmountStr, setCustomAmountStr] = useState<string>('');
  const [amountError, setAmountError] = useState<string>('');
  const [isInitiating, setIsInitiating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Allocation Preview state
  const [allocationPreview, setAllocationPreview] = useState<PaymentAllocationPreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Verification result modal / banner
  const [verificationResult, setVerificationResult] = useState<VerifyPaymentResponse | null>(null);
  const [verificationError, setVerificationError] = useState<string>('');

  const fetchSummary = useCallback(async () => {
    if (!id) return;
    try {
      setError('');
      const data = await getAdvanceSummary(id);
      setSummary(data);

      // Auto-select eligible installment if advance is fully paid
      if (data.isAdvanceFullyPaid && data.installments && data.installments.length > 1) {
        const firstUnpaidSubsequent = data.installments.findIndex(
          (inst, idx) => idx > 0 && inst.outstandingAmount > 0
        );
        if (firstUnpaidSubsequent > 0) {
          setSelectedInstallmentIndex(firstUnpaidSubsequent);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load payment details.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Resolve current active installment
  const currentInstallment: InstallmentPaymentSummary | null =
    summary?.installments?.[selectedInstallmentIndex] ||
    (summary?.installments?.[0] ?? null);

  const installmentOutstanding =
    selectedInstallmentIndex === 0
      ? (summary?.outstandingAdvance ?? currentInstallment?.outstandingAmount ?? 0)
      : (currentInstallment ? currentInstallment.outstandingAmount : (summary?.outstandingAdvance || 0));
  const totalQuotationOutstanding = summary?.totalOutstandingAmount ?? 0;
  const isQuotationFullyPaid = summary?.isQuotationFullyPaid ?? (totalQuotationOutstanding <= 0 && (summary?.totalPaidAmount ?? 0) > 0);
  const isScheduleConsistent = summary?.isScheduleConsistent !== false;

  const parsedCustomAmount = Number(customAmountStr) || 0;

  // Selected Payable Amount
  const selectedPayableAmount = useMemo(() => {
    if (paymentOption === 'full_balance') {
      return totalQuotationOutstanding;
    }
    if (paymentOption === 'custom') {
      return parsedCustomAmount;
    }
    return installmentOutstanding;
  }, [paymentOption, totalQuotationOutstanding, parsedCustomAmount, installmentOutstanding]);

  // Live Allocation Preview Fetcher
  const fetchAllocationPreview = useCallback(
    async (amount: number, option: 'current_installment' | 'custom' | 'full_balance') => {
      if (!id || !summary || !isScheduleConsistent) return;
      if (amount <= 0 || amount > totalQuotationOutstanding) {
        setAllocationPreview(null);
        return;
      }
      try {
        setIsPreviewLoading(true);
        const preview = await previewPaymentAllocation(id, amount, {
          paymentOption: option,
          isFullPayment: option === 'full_balance',
          installmentIndex: currentInstallment?.installmentIndex ?? 0,
        });
        setAllocationPreview(preview);
      } catch (err) {
        setAllocationPreview(null);
      } finally {
        setIsPreviewLoading(false);
      }
    },
    [id, summary, isScheduleConsistent, totalQuotationOutstanding, currentInstallment]
  );

  // Trigger allocation preview whenever option or amount changes
  useEffect(() => {
    if (paymentOption === 'full_balance' && totalQuotationOutstanding > 0) {
      fetchAllocationPreview(totalQuotationOutstanding, 'full_balance');
    } else if (paymentOption === 'custom' && parsedCustomAmount > 0 && parsedCustomAmount <= totalQuotationOutstanding) {
      const timer = setTimeout(() => {
        fetchAllocationPreview(parsedCustomAmount, 'custom');
      }, 300);
      return () => clearTimeout(timer);
    } else if (paymentOption === 'current_installment' && installmentOutstanding > 0) {
      fetchAllocationPreview(installmentOutstanding, 'current_installment');
    } else {
      setAllocationPreview(null);
    }
  }, [paymentOption, parsedCustomAmount, totalQuotationOutstanding, installmentOutstanding, fetchAllocationPreview]);

  const handleCustomAmountChange = (val: string) => {
    setCustomAmountStr(val);
    setAmountError('');
    const num = Number(val);
    if (!val) {
      setAmountError('Please enter an amount.');
    } else if (isNaN(num) || num <= 0) {
      setAmountError('Payment amount must be greater than zero.');
    } else if (num > totalQuotationOutstanding) {
      setAmountError(`Payment amount cannot exceed the total balance of ${formatCurrency(totalQuotationOutstanding)}.`);
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleInitiatePayment = async () => {
    if (!summary || !id || !currentInstallment || isInitiating || isVerifying) return;

    if (paymentOption === 'custom') {
      if (parsedCustomAmount <= 0) {
        setAmountError('Please enter a valid payment amount.');
        return;
      }
      if (parsedCustomAmount > totalQuotationOutstanding) {
        setAmountError(`Payment amount cannot exceed total outstanding balance of ${formatCurrency(totalQuotationOutstanding)}.`);
        return;
      }
    }

    try {
      setIsInitiating(true);
      setVerificationError('');
      setAmountError('');

      // Load Razorpay Checkout SDK
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setVerificationError('Razorpay payment gateway failed to load. Please check your internet connection.');
        setIsInitiating(false);
        return;
      }

      // Create Order via Backend (authoritative calculation)
      const orderData = await createPaymentOrder(
        id,
        selectedPayableAmount,
        currentInstallment.installmentIndex,
        {
          paymentOption,
          customAmount: paymentOption === 'custom' ? parsedCustomAmount : undefined,
          isFullPayment: paymentOption === 'full_balance',
          allowExcess: paymentOption === 'custom' || paymentOption === 'full_balance',
        }
      );

      // Launch Razorpay Checkout Modal
      const options = {
        key: orderData.keyId,
        amount: Math.round(orderData.amount * 100),
        currency: orderData.currency || 'INR',
        name: 'Evento Luxury Experiences',
        description: paymentOption === 'full_balance'
          ? `Full Settlement for Quotation ${summary.quotationNumber || 'Event'}`
          : `Payment for ${currentInstallment.title} • ${summary.quotationNumber || 'Event'}`,
        order_id: orderData.razorpayOrderId,
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            setIsVerifying(true);
            const verified = await verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setVerificationResult(verified);
            await fetchSummary();
          } catch (verifyErr: any) {
            setVerificationError(
              verifyErr.response?.data?.message || 'Payment verification failed. Please contact support.'
            );
          } finally {
            setIsVerifying(false);
          }
        },
        modal: {
          ondismiss: () => {
            setIsInitiating(false);
          },
        },
        theme: {
          color: '#0f172a',
        },
      };

      const rzpInstance = new (window as any).Razorpay(options);
      rzpInstance.on('payment.failed', (failResponse: any) => {
        setVerificationError(failResponse.error?.description || 'Payment was declined or cancelled.');
        setIsInitiating(false);
      });
      rzpInstance.open();
    } catch (err: any) {
      setVerificationError(err.response?.data?.message || 'Failed to initiate payment. Please try again.');
    } finally {
      setIsInitiating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin" />
        </div>
        <p className="text-sm font-medium text-slate-500 tracking-tight">Retrieving verified payment schedule...</p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="max-w-lg mx-auto my-16 bg-white p-8 rounded-2xl border border-slate-200 shadow-xs text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Payment Information Unavailable</h2>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">{error || 'Could not find payment schedule for this event.'}</p>
        </div>
        <div className="pt-2">
          <Link
            to={`/client/events/${id}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-all shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Event</span>
          </Link>
        </div>
      </div>
    );
  }

  const isConfirmed = summary.eventStatus === 'confirmed';
  const isAdvanceFullyPaid = summary.isAdvanceFullyPaid;
  const totalQuotation = summary.totalQuotationAmount || 0;
  const totalPaid = summary.totalPaidAmount ?? summary.advancePaidAmount ?? 0;
  const percentSettled = totalQuotation > 0 ? Math.min(100, Math.round((totalPaid / totalQuotation) * 100)) : 0;

  const formatExpiryDisplay = (dateStr?: string | Date) => {
    if (!dateStr) return 'the specified date';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24 text-slate-900 animate-in fade-in duration-300">
      
      {/* ─── Breadcrumb & Navigation Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div className="flex items-center gap-3">
          <Link
            to={`/client/events/${id}`}
            aria-label="Back to event details"
            className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span>Event #{summary.eventId.slice(-6)}</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-700 font-mono text-[11px] font-semibold">{summary.quotationNumber}</span>
              <span className="text-slate-400 text-[11px]">(Rev {summary.quotationRevision})</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5 mt-0.5">
              <span>{summary.eventTitle}</span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                  isConfirmed
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                    : 'bg-amber-50 text-amber-700 border-amber-200/80'
                }`}
              >
                {isConfirmed ? 'Confirmed' : 'Awaiting Advance'}
              </span>
            </h1>
          </div>
        </div>

        {summary.quotationId && (
          <Link
            to={`/client/quotations/${summary.quotationId}`}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors self-start sm:self-auto"
          >
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>View Quotation</span>
          </Link>
        )}
      </div>

      {/* ─── Schedule Inconsistency Warning ─── */}
      {!isScheduleConsistent && (
        <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex items-start gap-3 shadow-2xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 space-y-1">
            <h4 className="font-semibold text-amber-950">Installment Schedule Under Reconciliation</h4>
            <p className="text-amber-800 leading-relaxed">
              {summary.scheduleMismatchMessage ||
                'The sum of scheduled installment amounts does not reconcile with the final quotation amount.'}
            </p>
            <p className="text-amber-700 font-medium">
              Flexible excess payments and full settlement are paused. Please pay the designated milestone or reach out to your event manager.
            </p>
          </div>
        </div>
      )}

      {/* ─── Payment Success / Verification Receipt Banner ─── */}
      {verificationResult && (
        <div
          className={`p-5 rounded-2xl border ${
            verificationResult.isQuotationFullyPaid || verificationResult.isFullPayment
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : 'bg-slate-900 border-slate-800 text-white'
          } shadow-sm animate-in zoom-in-95 duration-200 space-y-4`}
        >
          <div className="flex items-start gap-3.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                verificationResult.isQuotationFullyPaid || verificationResult.isFullPayment
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-500 text-white'
              }`}
            >
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-semibold tracking-tight">
                  {verificationResult.isQuotationFullyPaid || verificationResult.isFullPayment
                    ? 'Payment Settled — Quotation Complete'
                    : verificationResult.paymentType === 'installment'
                    ? verificationResult.isFullyPaid
                      ? 'Installment Fully Settled'
                      : 'Partial Payment Verified'
                    : verificationResult.isFullyPaid
                    ? 'Advance Received — Event Confirmed'
                    : 'Partial Advance Payment Verified'}
                </h3>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    verificationResult.isQuotationFullyPaid || verificationResult.isFullPayment
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-white/10 text-emerald-300 border border-white/10'
                  }`}
                >
                  Verified
                </span>
              </div>
              <p
                className={`text-xs leading-relaxed ${
                  verificationResult.isQuotationFullyPaid || verificationResult.isFullPayment
                    ? 'text-emerald-800'
                    : 'text-slate-300'
                }`}
              >
                Received payment of <strong className="font-semibold">{formatCurrency(verificationResult.amountPaid)}</strong>.
                {verificationResult.isQuotationFullyPaid || verificationResult.isFullPayment ? (
                  <> All installments are settled in full. Total outstanding balance is now ₹0.</>
                ) : verificationResult.paymentType === 'installment' ? (
                  <> Total paid towards this milestone is now {formatCurrency(verificationResult.totalPaidForInstallment || 0)}. Remaining: {formatCurrency(verificationResult.outstandingAmount || 0)}.</>
                ) : (
                  <> Total advance paid is now {formatCurrency(verificationResult.totalAdvancePaid || 0)}. Outstanding advance: {formatCurrency(verificationResult.outstandingAdvance || 0)}.</>
                )}
              </p>
            </div>
          </div>

          {/* Multi-installment attribution breakdown */}
          {(verificationResult.isQuotationFullyPaid || (verificationResult.allocations && verificationResult.allocations.length > 1)) && (
            <div className="bg-white/95 rounded-xl p-3.5 border border-slate-200/80 text-slate-800 text-xs space-y-2.5">
              <div className="flex items-center justify-between font-medium text-slate-500 text-[11px] pb-1 border-b border-slate-100">
                <span>Multi-Milestone Distribution</span>
                <span className="font-mono text-slate-400">Ref: {verificationResult.quotationNumber || summary.quotationNumber}</span>
              </div>
              {verificationResult.allocations && (
                <div className="space-y-1">
                  {verificationResult.allocations.map((alloc, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1 px-2 rounded bg-slate-50 text-[11px]">
                      <span className="text-slate-700 font-medium">{alloc.installmentTitle}</span>
                      <span className="font-semibold text-slate-900">{formatCurrency(alloc.allocatedAmount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Verification Error Notice ─── */}
      {verificationError && (
        <div className="p-4 bg-rose-50 border border-rose-200/80 rounded-2xl text-rose-900 text-xs flex items-start gap-3 shadow-2xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-rose-950">Payment Verification Issue</p>
            <p className="text-rose-700">{verificationError}</p>
          </div>
        </div>
      )}

      {/* ─── Executive Financial Health Strip ─── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 divide-y sm:divide-y-0 divide-slate-100">
          {/* Total Value */}
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-slate-500">Total Contract Value</span>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              {formatCurrency(summary.totalQuotationAmount)}
            </div>
            <p className="text-[11px] text-slate-400">Agreed event scope</p>
          </div>

          {/* Paid to Date */}
          <div className="space-y-1 pt-3 sm:pt-0">
            <span className="text-[11px] font-medium text-slate-500">Verified Paid</span>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-700">
              {formatCurrency(totalPaid)}
            </div>
            <p className="text-[11px] text-emerald-600 font-medium">
              {percentSettled}% of quotation settled
            </p>
          </div>

          {/* Required Advance */}
          <div className="space-y-1 pt-3 sm:pt-0">
            <span className="text-[11px] font-medium text-slate-500">Booking Advance</span>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              {formatCurrency(summary.requiredAdvance)}
            </div>
            <p className="text-[11px] text-slate-500">
              {isAdvanceFullyPaid ? (
                <span className="text-emerald-700 font-medium flex items-center gap-1">
                  <Check className="w-3 h-3" /> Fully verified
                </span>
              ) : (
                `Due: ${formatCurrency(summary.outstandingAdvance)}`
              )}
            </p>
          </div>

          {/* Outstanding Balance */}
          <div className="space-y-1 pt-3 sm:pt-0">
            <span className="text-[11px] font-medium text-slate-500">Remaining Balance</span>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              {formatCurrency(totalQuotationOutstanding)}
            </div>
            <p className="text-[11px] text-slate-400">
              {isQuotationFullyPaid ? 'Quotation fully settled' : 'Payable in milestones'}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="pt-2 border-t border-slate-100 flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-900 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${percentSettled}%` }}
            />
          </div>
          <span className="text-[11px] font-medium text-slate-500 shrink-0 tabular-nums">
            {percentSettled}% Complete
          </span>
        </div>
      </div>

      {/* ─── Milestone Payment Schedule Section ─── */}
      {summary.installments && summary.installments.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Milestone Payment Roadmap</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Select an installment below to make a payment or review milestone status
              </p>
            </div>
            <span className="text-xs font-medium text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60">
              {summary.installments.filter((i) => i.baseStatus === 'Paid').length} of {summary.installments.length} Completed
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {summary.installments.map((inst, idx) => {
              const isSelected = selectedInstallmentIndex === idx;
              const isAdv = idx === 0;
              const isLocked = !isAdv && !isAdvanceFullyPaid;
              const isPaid = inst.baseStatus === 'Paid';

              return (
                <div
                  key={inst.installmentId || idx}
                  onClick={() => {
                    setSelectedInstallmentIndex(idx);
                    setPaymentOption('current_installment');
                    setCustomAmountStr('');
                    setAmountError('');
                    setVerificationError('');
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedInstallmentIndex(idx);
                      setPaymentOption('current_installment');
                    }
                  }}
                  className={`p-4 sm:p-5 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isSelected
                      ? 'bg-slate-50/90 ring-1 ring-slate-900/10'
                      : 'hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    {/* Index Indicator */}
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-semibold ${
                        isPaid
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                          : isSelected
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isPaid ? <Check className="w-4 h-4 stroke-[2.5]" /> : idx + 1}
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {inst.title}
                        </span>
                        {isAdv && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200/60">
                            Required Advance
                          </span>
                        )}

                        {/* Status Pills */}
                        {isPaid ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                            Paid
                          </span>
                        ) : inst.isExpired ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200/60">
                            Link Expired
                          </span>
                        ) : inst.isOverdue ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200/60">
                            Overdue
                          </span>
                        ) : inst.verifiedPaidAmount > 0 ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                            Partially Paid
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200/60">
                            Pending
                          </span>
                        )}

                        {isLocked && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200/60 flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Advance Locked
                          </span>
                        )}
                      </div>

                      {/* Dates */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        {inst.dueDate && (
                          <span className="flex items-center gap-1 text-[11px]">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            Due: {formatDate(inst.dueDate)}
                          </span>
                        )}
                        {inst.expiryDate && (
                          <span className={`flex items-center gap-1 text-[11px] ${inst.isExpired ? 'text-rose-600 font-medium' : ''}`}>
                            <Clock className="w-3 h-3 text-slate-400" />
                            Expiry: {formatDate(inst.expiryDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Financial Breakdown for this milestone */}
                  <div className="flex items-center justify-between sm:justify-end gap-6 sm:gap-8 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 text-right shrink-0">
                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 block">Scheduled</span>
                      <span className="text-xs sm:text-sm font-semibold text-slate-900 tabular-nums">
                        {formatCurrency(inst.scheduledAmount)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 block">Verified Paid</span>
                      <span className="text-xs sm:text-sm font-semibold text-emerald-700 tabular-nums">
                        {formatCurrency(inst.verifiedPaidAmount)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 block">Outstanding</span>
                      <span className="text-xs sm:text-sm font-semibold text-slate-900 tabular-nums">
                        {formatCurrency(inst.outstandingAmount)}
                      </span>
                    </div>

                    <div className="hidden sm:flex items-center text-slate-400 pl-2">
                      <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isSelected ? 'translate-x-0.5 text-slate-900' : ''}`} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Main Payment & Checkout Section ─── */}
      {currentInstallment && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Payment Options & Interactive Checkout (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider block">
                    Installment {selectedInstallmentIndex + 1} of {summary.installments?.length || 1}
                  </span>
                  <h3 className="text-base font-semibold text-slate-900 tracking-tight mt-0.5">
                    {currentInstallment.title}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200/60">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
                  <span>256-Bit Encrypted</span>
                </div>
              </div>

              <div className="p-5 sm:p-6 space-y-6">
                
                {/* Notice: Expired Link */}
                {currentInstallment.isExpired && currentInstallment.outstandingAmount > 0 && (
                  <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200/80 space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="text-xs space-y-1">
                        <h4 className="font-semibold text-rose-950">Payment Window Expired</h4>
                        <p className="text-rose-700 leading-relaxed">
                          This payment link expired on {formatExpiryDisplay(currentInstallment.expiryDate)}. Please contact the administration team to generate an updated payment link.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium shadow-2xs transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>Contact Event Manager</span>
                    </button>
                  </div>
                )}

                {/* Notice: Advance Required Before Paying Subsequent */}
                {selectedInstallmentIndex > 0 && !isAdvanceFullyPaid && (
                  <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-3 text-amber-900 text-xs">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="font-semibold text-amber-950">Advance Payment Required First</h4>
                        <p className="text-amber-800 leading-relaxed">
                          To activate and confirm your event, the booking advance of{' '}
                          <strong className="font-semibold">{formatCurrency(summary.requiredAdvance)}</strong> must be settled first.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedInstallmentIndex(0);
                        setPaymentOption('current_installment');
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-all shadow-2xs"
                    >
                      <span>Pay Booking Advance</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Notice: Quotation Fully Settled */}
                {isQuotationFullyPaid ? (
                  <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/80 text-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Quotation Fully Settled
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                      All scheduled installments totaling {formatCurrency(summary.totalQuotationAmount)} have been verified. No balance remains due.
                    </p>
                  </div>
                ) : !currentInstallment.isExpired && (selectedInstallmentIndex === 0 || isAdvanceFullyPaid) ? (
                  
                  /* ─── 3 Client Payment Choices ─── */
                  <div className="space-y-5">
                    <div>
                      <label className="text-xs font-semibold text-slate-900 block mb-2">
                        Select Payment Method
                      </label>

                      <div className="space-y-2.5">
                        
                        {/* Option A: Milestone Balance */}
                        <div
                          onClick={() => {
                            setPaymentOption('current_installment');
                            setAmountError('');
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setPaymentOption('current_installment');
                            }
                          }}
                          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                            paymentOption === 'current_installment'
                              ? 'border-slate-900 bg-slate-50/80 ring-1 ring-slate-900'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                  paymentOption === 'current_installment'
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : 'border-slate-300'
                                }`}
                              >
                                {paymentOption === 'current_installment' && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="text-xs font-semibold text-slate-900 block truncate">
                                  Current Milestone Due
                                </span>
                                <span className="text-[11px] text-slate-500 block truncate">
                                  {currentInstallment.title}
                                </span>
                              </div>
                            </div>
                            <span className="text-sm font-bold text-slate-900 shrink-0 tabular-nums">
                              {formatCurrency(installmentOutstanding)}
                            </span>
                          </div>
                        </div>

                        {/* Option B: Custom Amount */}
                        <div
                          onClick={() => {
                            setPaymentOption('custom');
                            setAmountError('');
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setPaymentOption('custom');
                            }
                          }}
                          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                            paymentOption === 'custom'
                              ? 'border-slate-900 bg-slate-50/80 ring-1 ring-slate-900'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                  paymentOption === 'custom'
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : 'border-slate-300'
                                }`}
                              >
                                {paymentOption === 'custom' && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="text-xs font-semibold text-slate-900 block truncate">
                                  Custom Payment
                                </span>
                                <span className="text-[11px] text-slate-500 block truncate">
                                  Allocate any flexible amount in schedule sequence
                                </span>
                              </div>
                            </div>
                            <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60 shrink-0">
                              Flexible
                            </span>
                          </div>

                          {/* Custom input box */}
                          {paymentOption === 'custom' && (
                            <div
                              className="mt-3.5 pt-3 border-t border-slate-200/80 space-y-2 animate-in fade-in duration-150"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-between text-[11px]">
                                <label htmlFor="custom-amount-input" className="font-medium text-slate-700">
                                  Enter Amount (₹)
                                </label>
                                <span className="text-slate-400">
                                  Max: {formatCurrency(totalQuotationOutstanding)}
                                </span>
                              </div>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">
                                  ₹
                                </span>
                                <input
                                  id="custom-amount-input"
                                  type="number"
                                  min="1"
                                  max={totalQuotationOutstanding}
                                  placeholder="0"
                                  value={customAmountStr}
                                  onChange={(e) => handleCustomAmountChange(e.target.value)}
                                  className="w-full pl-7 pr-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900 focus:border-slate-900"
                                />
                              </div>

                              {amountError && (
                                <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  <span>{amountError}</span>
                                </p>
                              )}

                              {parsedCustomAmount > installmentOutstanding && parsedCustomAmount <= totalQuotationOutstanding && (
                                <p className="text-[11px] text-slate-600 flex items-center gap-1.5 bg-slate-100/70 p-2 rounded-md">
                                  <Info className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                                  <span>
                                    {formatCurrency(installmentOutstanding)} settles this installment; remaining {formatCurrency(parsedCustomAmount - installmentOutstanding)} rolls over to the next installment.
                                  </span>
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Option C: Pay Full Remaining Balance */}
                        {totalQuotationOutstanding > 0 && isScheduleConsistent && (
                          <div
                            onClick={() => {
                              setPaymentOption('full_balance');
                              setAmountError('');
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setPaymentOption('full_balance');
                              }
                            }}
                            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                              paymentOption === 'full_balance'
                                ? 'border-slate-900 bg-slate-50/80 ring-1 ring-slate-900'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                    paymentOption === 'full_balance'
                                      ? 'border-slate-900 bg-slate-900 text-white'
                                      : 'border-slate-300'
                                  }`}
                                >
                                  {paymentOption === 'full_balance' && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <span className="text-xs font-semibold text-slate-900 block truncate">
                                    Full Quotation Settlement
                                  </span>
                                  <span className="text-[11px] text-slate-500 block truncate">
                                    Settle all remaining milestones in one transaction
                                  </span>
                                </div>
                              </div>
                              <span className="text-sm font-bold text-slate-900 shrink-0 tabular-nums">
                                {formatCurrency(totalQuotationOutstanding)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ─── Frontend Allocation Preview Ledger ─── */}
                    {allocationPreview && allocationPreview.allocations.length > 0 && (
                      <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-2.5 text-xs animate-in fade-in duration-150">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900 flex items-center gap-1.5 text-xs">
                            <Layers className="w-3.5 h-3.5 text-slate-600" />
                            <span>Payment Distribution Preview</span>
                            {isPreviewLoading && <Loader2 className="w-3 h-3 text-slate-600 animate-spin" />}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                            Total: {formatCurrency(allocationPreview.targetAmount)}
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-[11px]">
                            <thead>
                              <tr className="border-b border-slate-200/60 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                <th className="pb-1.5">Installment</th>
                                <th className="pb-1.5 text-right">Scheduled</th>
                                <th className="pb-1.5 text-right">Credit</th>
                                <th className="pb-1.5 text-right">Balance</th>
                                <th className="pb-1.5 text-right">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {allocationPreview.resultingBalances.map((rb, idx) => (
                                <tr key={idx} className="hover:bg-white/80 transition-colors">
                                  <td className="py-1.5 text-slate-800 font-medium truncate max-w-[120px]">{rb.title}</td>
                                  <td className="py-1.5 text-right text-slate-500 tabular-nums">{formatCurrency(rb.scheduledAmount)}</td>
                                  <td className="py-1.5 text-right font-semibold text-slate-900 tabular-nums">
                                    {formatCurrency(rb.allocatedAmount)}
                                  </td>
                                  <td className="py-1.5 text-right text-slate-600 tabular-nums">
                                    {formatCurrency(rb.resultingOutstanding)}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-medium uppercase ${
                                        rb.resultingStatus === 'Paid'
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : rb.resultingStatus === 'Partially Paid'
                                          ? 'bg-blue-50 text-blue-700'
                                          : 'bg-slate-100 text-slate-600'
                                      }`}
                                    >
                                      {rb.resultingStatus}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* ─── Payable Summary & Razorpay Primary CTA ─── */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-baseline justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                        <div>
                          <span className="text-[11px] font-medium text-slate-500 block">Total Payable Now</span>
                          <span className="text-[11px] text-slate-400">
                            {paymentOption === 'full_balance'
                              ? 'Full settlement across quotation'
                              : paymentOption === 'custom'
                              ? 'Custom allocation'
                              : 'Current milestone outstanding'}
                          </span>
                        </div>
                        <div className="text-xl font-bold text-slate-900 tabular-nums">
                          {formatCurrency(selectedPayableAmount)}
                        </div>
                      </div>

                      <button
                        type="button"
                        id="btn-pay-razorpay"
                        onClick={handleInitiatePayment}
                        disabled={
                          isInitiating ||
                          isVerifying ||
                          selectedPayableAmount <= 0 ||
                          selectedPayableAmount > totalQuotationOutstanding ||
                          !!amountError ||
                          (!isScheduleConsistent && paymentOption !== 'current_installment')
                        }
                        className="w-full py-3.5 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {isInitiating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Opening Razorpay Gateway...</span>
                          </>
                        ) : isVerifying ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Confirming Signature...</span>
                          </>
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4" />
                            <span>Pay {formatCurrency(selectedPayableAmount)} via Razorpay</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center justify-center gap-4 text-[10px] text-slate-400 pt-1">
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                          <span>Bank-grade 256-bit SSL</span>
                        </span>
                        <span>•</span>
                        <span>Verified Razorpay Integration</span>
                        <span>•</span>
                        <span>Instant Digital Receipt</span>
                      </div>
                    </div>

                    {/* ─── Direct Shareable Payment Link ─── */}
                    {currentInstallment.currentPaymentLink && !currentInstallment.isExpired && (
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700 flex items-center gap-1 text-[11px]">
                            <Sparkles className="w-3 h-3 text-slate-500" />
                            Direct Payment Link
                          </span>
                          {currentInstallment.currentPaymentLink.expiresAt && (
                            <span className="text-[10px] text-slate-400">
                              Expires: {formatDate(currentInstallment.currentPaymentLink.expiresAt)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={currentInstallment.currentPaymentLink.shortUrl}
                            className="w-full text-xs font-mono bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() => handleCopyLink(currentInstallment.currentPaymentLink!.shortUrl)}
                            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1.5 shrink-0 transition-colors shadow-2xs"
                          >
                            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right Column: Particulars & Transaction History (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            
            {/* Installment Particulars Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                  Milestone Specification
                </h3>
              </div>
              <div className="p-5 space-y-3 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Milestone</span>
                  <span className="font-medium text-slate-900">{currentInstallment.title}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Scheduled Target</span>
                  <span className="font-medium text-slate-900 tabular-nums">
                    {formatCurrency(currentInstallment.scheduledAmount)}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Verified Paid</span>
                  <span className="font-medium text-emerald-700 tabular-nums">
                    {formatCurrency(currentInstallment.verifiedPaidAmount)}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Remaining Balance</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(currentInstallment.outstandingAmount)}
                  </span>
                </div>

                {currentInstallment.dueDate && (
                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Due Date</span>
                    <span className="text-slate-700">{formatDate(currentInstallment.dueDate)}</span>
                  </div>
                )}

                {currentInstallment.expiryDate && (
                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Window Expiry</span>
                    <span className={currentInstallment.isExpired ? 'text-rose-600 font-medium' : 'text-slate-700'}>
                      {formatDate(currentInstallment.expiryDate)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500">Status</span>
                  <span className="font-medium uppercase text-[10px] tracking-wider text-slate-700">
                    {currentInstallment.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Verified Transaction History */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-slate-400" />
                  <span>Verified Payments</span>
                </h3>
                <span className="text-[11px] text-slate-400">
                  {summary.payments?.length || 0} Recorded
                </span>
              </div>

              <div className="p-4 sm:p-5">
                {summary.payments && summary.payments.length > 0 ? (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {summary.payments.map((p) => (
                      <div
                        key={p.id}
                        className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-slate-900 tabular-nums">
                              {formatCurrency(p.amount)}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                              Captured
                            </span>
                            {p.isFullPayment && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase bg-slate-200 text-slate-800">
                                Full Settlement
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {formatDate(p.createdAt)}
                          </span>
                        </div>

                        <p className="text-[10px] font-mono text-slate-400 truncate">
                          {p.razorpayPaymentId || p.receiptReference}
                        </p>

                        {/* Attribution Breakdown */}
                        {p.allocations && p.allocations.length > 0 && (
                          <div className="pt-1.5 border-t border-slate-200/60 flex flex-wrap gap-1">
                            {p.allocations.map((a, aIdx) => (
                              <span
                                key={aIdx}
                                className="px-1.5 py-0.5 rounded bg-white text-slate-600 text-[10px] border border-slate-200/60"
                              >
                                {a.installmentTitle}: {formatCurrency(a.allocatedAmount)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    No verified transactions recorded yet.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
