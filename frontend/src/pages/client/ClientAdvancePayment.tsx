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

  // Milestone 2 Extension: 3 distinct payment choices
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
        // Fallback / keep existing or null
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
      setAmountError(`Payment amount cannot exceed the total outstanding balance of ${formatCurrency(totalQuotationOutstanding)}.`);
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
        setAmountError(`Payment amount cannot exceed the total outstanding balance of ${formatCurrency(totalQuotationOutstanding)}.`);
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

      // Create Order via Backend (authoritative amount check on server)
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
        name: 'EventOps ERP',
        description: paymentOption === 'full_balance'
          ? `Full Settlement for Quotation ${summary.quotationNumber || 'Event'}`
          : `Payment for ${currentInstallment.title} - ${summary.quotationNumber || 'Event'}`,
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
            // Refresh authoritative summary from backend
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
          color: '#4F46E5',
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
      <div className="flex flex-col items-center justify-center py-28 space-y-4">
        <Loader2 className="w-9 h-9 animate-spin text-indigo-600" />
        <p className="text-sm font-medium text-gray-500">Loading payment schedule details...</p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="max-w-2xl mx-auto my-12 bg-white p-8 rounded-2xl border border-gray-200 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Payment Unavailable</h2>
        <p className="text-sm text-gray-600 mb-6">{error || 'Could not find payment details for this event.'}</p>
        <Link
          to={`/client/events/${id}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Event Details
        </Link>
      </div>
    );
  }

  const isConfirmed = summary.eventStatus === 'confirmed';
  const isAdvanceFullyPaid = summary.isAdvanceFullyPaid;

  const formatExpiryDisplay = (dateStr?: string | Date) => {
    if (!dateStr) return 'the specified date';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-500 pb-20">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to={`/client/events/${id}`}
            className="p-2.5 border border-gray-200 bg-white hover:bg-gray-50 rounded-xl transition-colors text-gray-500 shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Event #{summary.eventId.slice(-6)}
              </span>
              <span className="text-gray-300">•</span>
              <span className="text-xs font-medium text-indigo-600 font-mono">
                {summary.quotationNumber} (Rev {summary.quotationRevision})
              </span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2.5">
              <span>{summary.eventTitle}</span>
              {isConfirmed ? (
                <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase rounded-md border border-emerald-200">
                  Confirmed
                </span>
              ) : (
                <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 text-xs font-bold uppercase rounded-md border border-amber-200">
                  Awaiting Payment
                </span>
              )}
            </h1>
          </div>
        </div>

        {summary.quotationId && (
          <Link
            to={`/client/quotations/${summary.quotationId}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-bold shadow-xs transition-colors shrink-0"
          >
            <FileText className="w-4 h-4 text-gray-400" />
            View Accepted Quotation
          </Link>
        )}
      </div>

      {/* Schedule Inconsistency Alert Banner (Section 8) */}
      {!isScheduleConsistent && (
        <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-950 flex items-start gap-3.5 shadow-xs">
          <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-extrabold text-rose-900">
              Payment Schedule Inconsistency Detected
            </h4>
            <p className="text-xs text-rose-800 leading-relaxed">
              {summary.scheduleMismatchMessage ||
                'The sum of scheduled installment amounts does not reconcile with the final quotation amount.'}
            </p>
            <p className="text-xs font-semibold text-rose-700 pt-1">
              Cross-installment excess payments and full settlement are paused to safeguard financial integrity. Please contact the Administrator to reconcile the schedule.
            </p>
          </div>
        </div>
      )}

      {/* Verification Success: Full Settlement / Partial Receipt Banner (Section 14) */}
      {verificationResult && (
        <div
          className={`p-6 rounded-2xl border ${
            verificationResult.isQuotationFullyPaid || verificationResult.isFullPayment
              ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-300 text-emerald-950'
              : verificationResult.isFullyPaid
              ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
              : 'bg-indigo-50/90 border-indigo-200 text-indigo-950'
          } shadow-sm animate-in zoom-in-95 duration-300 space-y-4`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                verificationResult.isQuotationFullyPaid || verificationResult.isFullPayment
                  ? 'bg-emerald-600 text-white ring-4 ring-emerald-100'
                  : verificationResult.isFullyPaid
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 text-white'
              }`}
            >
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-lg font-black tracking-tight">
                  {verificationResult.isQuotationFullyPaid || verificationResult.isFullPayment
                    ? 'Quotation Fully Settled & Verified!'
                    : verificationResult.paymentType === 'installment'
                    ? verificationResult.isFullyPaid
                      ? 'Installment Fully Settled!'
                      : 'Partial Installment Payment Verified!'
                    : verificationResult.isFullyPaid
                    ? 'Advance Payment Completed & Event Confirmed!'
                    : 'Partial Advance Payment Verified!'}
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-white/80 border border-emerald-200 text-emerald-800">
                  Transaction Verified
                </span>
              </div>
              <p className="text-xs leading-relaxed text-gray-700">
                Received and verified payment of <strong>{formatCurrency(verificationResult.amountPaid)}</strong>.
                {verificationResult.isQuotationFullyPaid || verificationResult.isFullPayment ? (
                  <> All payment installments have been settled in full. Total quotation outstanding balance is now <strong>₹0</strong>.</>
                ) : verificationResult.paymentType === 'installment' ? (
                  <>
                    {' '}Total paid for this installment: <strong>{formatCurrency(verificationResult.totalPaidForInstallment || 0)}</strong>.
                    Outstanding balance: <strong>{formatCurrency(verificationResult.outstandingAmount || 0)}</strong>.
                  </>
                ) : (
                  <>
                    {' '}Total advance paid: <strong>{formatCurrency(verificationResult.totalAdvancePaid || 0)}</strong>.
                    Outstanding advance: <strong>{formatCurrency(verificationResult.outstandingAdvance || 0)}</strong>.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Detailed Full Settlement Breakdown if applicable (Section 14) */}
          {(verificationResult.isQuotationFullyPaid || (verificationResult.allocations && verificationResult.allocations.length > 1)) && (
            <div className="bg-white/90 rounded-xl p-4 border border-emerald-200 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-950 border-b border-gray-100 pb-2">
                <span>Multi-Installment Allocation Receipt</span>
                <span className="font-mono text-[11px] text-gray-500">
                  Quotation: {verificationResult.quotationNumber || summary.quotationNumber} (Rev {verificationResult.quotationRevision || summary.quotationRevision})
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">Total Quotation</span>
                  <span className="font-extrabold text-gray-900">{formatCurrency(verificationResult.totalQuotationAmount || summary.totalQuotationAmount)}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">Total Paid</span>
                  <span className="font-extrabold text-emerald-700">{formatCurrency(verificationResult.totalPaidAmount || summary.totalPaidAmount)}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">Outstanding</span>
                  <span className="font-extrabold text-gray-900">{formatCurrency(verificationResult.totalOutstandingAmount ?? 0)}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">Event Status</span>
                  <span className="font-extrabold text-emerald-700 uppercase">{verificationResult.eventStatus || 'Confirmed'}</span>
                </div>
              </div>

              {verificationResult.allocations && verificationResult.allocations.length > 0 && (
                <div className="pt-2 border-t border-gray-100 space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                    Installment Attribution:
                  </span>
                  <div className="space-y-1">
                    {verificationResult.allocations.map((alloc, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-1.5 rounded bg-gray-50">
                        <span className="font-medium text-gray-700">{alloc.installmentTitle}</span>
                        <strong className="text-indigo-600 font-bold">{formatCurrency(alloc.allocatedAmount)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {verificationError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Payment Issue Encountered</p>
            <p>{verificationError}</p>
          </div>
        </div>
      )}

      {/* Authoritative Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Quotation Amount */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Total Quotation</span>
          <div className="text-2xl font-black text-gray-900">{formatCurrency(summary.totalQuotationAmount)}</div>
          <p className="text-[11px] text-gray-400">Total agreed event value</p>
        </div>

        {/* Total Paid Across All Installments */}
        <div className="bg-white p-5 rounded-2xl border border-emerald-100 bg-gradient-to-b from-white to-emerald-50/20 shadow-xs space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Total Verified Paid</span>
          <div className="text-2xl font-black text-emerald-700">{formatCurrency(summary.totalPaidAmount ?? summary.advancePaidAmount)}</div>
          <p className="text-[11px] text-emerald-600 font-medium">
            {summary.totalQuotationAmount > 0
              ? `${Math.round(((summary.totalPaidAmount ?? summary.advancePaidAmount) / summary.totalQuotationAmount) * 100)}% settled`
              : 'No payments yet'}
          </p>
        </div>

        {/* Required Advance */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Required Advance</span>
          <div className="text-2xl font-black text-indigo-600">{formatCurrency(summary.requiredAdvance)}</div>
          <p className="text-[11px] text-gray-400">
            {isAdvanceFullyPaid ? 'Fully verified (Confirmed)' : `Outstanding: ${formatCurrency(summary.outstandingAdvance)}`}
          </p>
        </div>

        {/* Total Outstanding Balance */}
        <div className="bg-white p-5 rounded-2xl border border-amber-100 bg-gradient-to-b from-white to-amber-50/20 shadow-xs space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Remaining Balance</span>
          <div className="text-2xl font-black text-amber-700">{formatCurrency(totalQuotationOutstanding)}</div>
          <p className="text-[11px] text-amber-600 font-medium">
            {isQuotationFullyPaid ? 'Quotation fully settled' : `${formatCurrency(totalQuotationOutstanding)} remaining`}
          </p>
        </div>
      </div>

      {/* Payment Schedule Overview & Installment Selector */}
      {summary.installments && summary.installments.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-gray-900">Milestone Payment Schedule</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Review installment due dates, verified payments, and select an installment to pay
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">
                {summary.installments.filter((i) => i.baseStatus === 'Paid').length} of {summary.installments.length} Paid
              </span>
              {isQuotationFullyPaid && (
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase rounded-full">
                  Fully Settled
                </span>
              )}
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {summary.installments.map((inst, idx) => {
              const isSelected = selectedInstallmentIndex === idx;
              const isAdv = idx === 0;
              const isLocked = !isAdv && !isAdvanceFullyPaid;

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
                  className={`p-5 transition-all cursor-pointer flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                    isSelected
                      ? 'bg-indigo-50/50 border-l-4 border-indigo-600'
                      : 'hover:bg-gray-50/80 border-l-4 border-transparent'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                        inst.baseStatus === 'Paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : inst.isExpired
                          ? 'bg-rose-100 text-rose-800'
                          : inst.isOverdue
                          ? 'bg-amber-100 text-amber-800'
                          : isSelected
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {inst.baseStatus === 'Paid' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                      ) : (
                        idx + 1
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-extrabold text-gray-900">{inst.title}</span>
                        {isAdv && (
                          <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded uppercase tracking-wider border border-indigo-100">
                            Required Advance
                          </span>
                        )}
                        {/* Status Badges */}
                        {inst.baseStatus === 'Paid' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Paid
                          </span>
                        ) : inst.isExpired ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
                            Link Expired
                          </span>
                        ) : inst.isOverdue ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                            Overdue
                          </span>
                        ) : inst.verifiedPaidAmount > 0 ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                            Partially Paid
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 border border-gray-200">
                            Pending
                          </span>
                        )}
                        {isLocked && (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-semibold rounded flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Advance Locked
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                        {inst.dueDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                            Due: {formatDate(inst.dueDate)}
                          </span>
                        )}
                        {inst.expiryDate && (
                          <span className={`flex items-center gap-1 ${inst.isExpired ? 'text-rose-600 font-semibold' : ''}`}>
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            Expiry: {formatDate(inst.expiryDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 sm:gap-8 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">Scheduled</span>
                      <span className="text-sm font-black text-gray-900">{formatCurrency(inst.scheduledAmount)}</span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">Verified Paid</span>
                      <span className="text-sm font-black text-emerald-700">{formatCurrency(inst.verifiedPaidAmount)}</span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-gray-400 block">Outstanding</span>
                      <span className="text-sm font-black text-amber-700">{formatCurrency(inst.outstandingAmount)}</span>
                    </div>

                    <div className="hidden sm:block text-gray-400">
                      <ChevronRight className={`w-5 h-5 transition-transform ${isSelected ? 'translate-x-1 text-indigo-600' : ''}`} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Payment Section: 3 Client Choices (Section 3), Preview (Section 11) & Checkout */}
      {currentInstallment && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Payment Form & Options (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                      Installment {selectedInstallmentIndex + 1} of {summary.installments?.length || 1}
                    </span>
                  </div>
                  <h2 className="text-lg font-extrabold text-gray-900 tracking-tight mt-0.5">
                    {currentInstallment.title}
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>256-Bit SSL Protected</span>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Expired Payment Link Notice */}
                {currentInstallment.isExpired && currentInstallment.outstandingAmount > 0 && (
                  <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 space-y-3 animate-in fade-in">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-rose-900">Payment Link Expired</h4>
                        <p className="text-xs text-rose-700 leading-relaxed font-medium">
                          This payment link expired on {formatExpiryDisplay(currentInstallment.expiryDate)}. Please contact the Admin for further assistance.
                        </p>
                      </div>
                    </div>
                    <div className="pt-1">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-lg text-xs font-bold transition-colors shadow-xs cursor-default"
                      >
                        <Mail className="w-4 h-4 text-gray-500" />
                        <span>Contact Admin</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Subsequent Installment Locked by Advance Prerequisite */}
                {selectedInstallmentIndex > 0 && !isAdvanceFullyPaid && (
                  <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 space-y-3 text-amber-900">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold">Advance Payment Required</h4>
                        <p className="text-xs text-amber-700 leading-relaxed">
                          Subsequent installments can only be paid after the required advance payment (
                          <strong>{formatCurrency(summary.requiredAdvance)}</strong>) has been fully verified and the event is confirmed.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedInstallmentIndex(0);
                        setPaymentOption('current_installment');
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                    >
                      <span>Pay Advance Milestone</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Quotation Fully Paid Notice */}
                {isQuotationFullyPaid ? (
                  <div className="p-6 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-sm">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <h3 className="text-base font-extrabold text-emerald-900">
                      Quotation Is Completely Paid!
                    </h3>
                    <p className="text-xs text-emerald-700 max-w-md mx-auto leading-relaxed">
                      All scheduled installments totaling {formatCurrency(summary.totalQuotationAmount)} have been verified and fully settled. Outstanding balance is ₹0.
                    </p>
                  </div>
                ) : !currentInstallment.isExpired && (selectedInstallmentIndex === 0 || isAdvanceFullyPaid) ? (
                  /* 3 Distinct Client Payment Choices (Section 3) */
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-gray-700">
                          Select Payment Option
                        </label>
                        <span className="text-[11px] font-semibold text-gray-400">
                          3 Available Methods
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {/* Option A: Pay Current Installment / Advance */}
                        <div
                          onClick={() => {
                            setPaymentOption('current_installment');
                            setAmountError('');
                          }}
                          className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative ${
                            paymentOption === 'current_installment'
                              ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600 text-indigo-950'
                              : 'border-gray-200 hover:border-gray-300 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                  paymentOption === 'current_installment'
                                    ? 'border-indigo-600 bg-indigo-600 text-white'
                                    : 'border-gray-300'
                                }`}
                              >
                                {paymentOption === 'current_installment' && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                                )}
                              </div>
                              <span className="text-xs font-bold text-gray-900">
                                Option A: Pay {currentInstallment.title} (Remaining Balance)
                              </span>
                            </div>
                            <span className="text-sm font-black text-gray-900">
                              {formatCurrency(installmentOutstanding)}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 pl-6">
                            {selectedInstallmentIndex === 0 && (summary.advancePaidAmount ?? 0) > 0 ? (
                              <span>
                                Advance required: {formatCurrency(summary.requiredAdvance)}, previously paid: {formatCurrency(summary.advancePaidAmount)}. Deducted payable balance: <strong className="text-gray-900">{formatCurrency(installmentOutstanding)}</strong>
                              </span>
                            ) : currentInstallment.verifiedPaidAmount > 0 ? (
                              <span>
                                Scheduled: {formatCurrency(currentInstallment.scheduledAmount)}, previously paid: {formatCurrency(currentInstallment.verifiedPaidAmount)}. Deducted payable balance: <strong className="text-gray-900">{formatCurrency(installmentOutstanding)}</strong>
                              </span>
                            ) : (
                              <span>Pay the exact outstanding balance of this milestone ({formatCurrency(installmentOutstanding)})</span>
                            )}
                          </p>
                        </div>

                        {/* Option B: Pay Custom Amount */}
                        <div
                          onClick={() => {
                            setPaymentOption('custom');
                            setAmountError('');
                          }}
                          className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative ${
                            paymentOption === 'custom'
                              ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600 text-indigo-950'
                              : 'border-gray-200 hover:border-gray-300 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                  paymentOption === 'custom'
                                    ? 'border-indigo-600 bg-indigo-600 text-white'
                                    : 'border-gray-300'
                                }`}
                              >
                                {paymentOption === 'custom' && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                                )}
                              </div>
                              <span className="text-xs font-bold text-gray-900">
                                Option B: Pay Custom Amount
                              </span>
                            </div>
                            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                              Flexible Allocation
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 pl-6">
                            Enter any custom amount. Excess beyond this installment automatically settles subsequent milestones in schedule order.
                          </p>

                          {/* Custom Amount Input Box */}
                          {paymentOption === 'custom' && (
                            <div className="mt-4 pt-3 border-t border-indigo-100 space-y-2 animate-in fade-in" onClick={(e) => e.stopPropagation()}>
                              <label className="block text-[11px] font-bold text-gray-700">
                                Enter Custom Payment Amount (₹)
                              </label>
                              <div className="relative">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">
                                  ₹
                                </span>
                                <input
                                  type="number"
                                  min="1"
                                  max={totalQuotationOutstanding}
                                  placeholder={`Max total remaining ${formatCurrency(totalQuotationOutstanding)}`}
                                  value={customAmountStr}
                                  onChange={(e) => handleCustomAmountChange(e.target.value)}
                                  className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-sm font-bold text-gray-900 bg-white"
                                />
                              </div>

                              {amountError && (
                                <p className="text-xs text-rose-600 font-semibold flex items-center gap-1">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>{amountError}</span>
                                </p>
                              )}

                              {parsedCustomAmount > installmentOutstanding && parsedCustomAmount <= totalQuotationOutstanding && (
                                <p className="text-[11px] text-indigo-700 font-medium flex items-center gap-1.5 bg-indigo-50/70 p-2 rounded-lg border border-indigo-100">
                                  <Info className="w-3.5 h-3.5 shrink-0 text-indigo-600" />
                                  <span>
                                    {formatCurrency(installmentOutstanding)} settles {currentInstallment.title}; excess of {formatCurrency(parsedCustomAmount - installmentOutstanding)} will be credited towards next installment.
                                  </span>
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Option C: Pay Full Remaining Balance (Section 3 & 6) */}
                        {totalQuotationOutstanding > 0 && isScheduleConsistent && (
                          <div
                            onClick={() => {
                              setPaymentOption('full_balance');
                              setAmountError('');
                            }}
                            className={`p-4 rounded-xl border text-left transition-all cursor-pointer relative ${
                              paymentOption === 'full_balance'
                                ? 'border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-600 text-emerald-950'
                                : 'border-gray-200 hover:border-gray-300 text-gray-700'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                    paymentOption === 'full_balance'
                                      ? 'border-emerald-600 bg-emerald-600 text-white'
                                      : 'border-gray-300'
                                  }`}
                                >
                                  {paymentOption === 'full_balance' && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                                  )}
                                </div>
                                <span className="text-xs font-bold text-gray-900">
                                  Option C: Pay Full Remaining Balance (One-Click Settlement)
                                </span>
                              </div>
                              <span className="text-sm font-black text-emerald-800">
                                {formatCurrency(totalQuotationOutstanding)}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 pl-6">
                              Settle all outstanding milestones across the entire quotation in a single transaction.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Frontend Allocation Preview Section (Section 11) */}
                    {allocationPreview && allocationPreview.allocations.length > 0 && (
                      <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-200 space-y-3 animate-in fade-in">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-gray-900 flex items-center gap-1.5">
                            <Layers className="w-4 h-4 text-indigo-600" />
                            Payment Allocation Preview
                            {isPreviewLoading && <Loader2 className="w-3 h-3 text-indigo-600 animate-spin" />}
                          </span>
                          <span className="text-[11px] text-gray-500 font-semibold">
                            Total: {formatCurrency(allocationPreview.targetAmount)}
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-gray-200 text-[10px] uppercase font-bold text-gray-400">
                                <th className="pb-2">Installment</th>
                                <th className="pb-2 text-right">Scheduled</th>
                                <th className="pb-2 text-right">Allocation</th>
                                <th className="pb-2 text-right">Resulting Out.</th>
                                <th className="pb-2 text-right">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 font-medium">
                              {allocationPreview.resultingBalances.map((rb, idx) => (
                                <tr key={idx} className="hover:bg-white/60 transition-colors">
                                  <td className="py-2 text-gray-900 font-bold">{rb.title}</td>
                                  <td className="py-2 text-right text-gray-600">{formatCurrency(rb.scheduledAmount)}</td>
                                  <td className="py-2 text-right text-indigo-600 font-extrabold">
                                    {formatCurrency(rb.allocatedAmount)}
                                  </td>
                                  <td className="py-2 text-right text-amber-700 font-bold">
                                    {formatCurrency(rb.resultingOutstanding)}
                                  </td>
                                  <td className="py-2 text-right">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        rb.resultingStatus === 'Paid'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : rb.resultingStatus === 'Partially Paid'
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-gray-100 text-gray-600'
                                      }`}
                                    >
                                      {rb.resultingStatus}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-gray-200 font-black text-gray-900 text-xs">
                                <td className="pt-2">Total Payment</td>
                                <td colSpan={2} className="pt-2 text-right text-indigo-700">
                                  {formatCurrency(allocationPreview.targetAmount)}
                                </td>
                                <td colSpan={2} className="pt-2 text-right text-emerald-700">
                                  {allocationPreview.willConfirmEvent ? 'Event Will Confirm' : ''}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Payable Summary & Razorpay Checkout Action */}
                    <div className="pt-2 space-y-4">
                      <div className="flex items-baseline justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div>
                          <span className="text-xs font-semibold text-gray-500">Payable Now:</span>
                          <p className="text-[11px] text-gray-400">
                            {paymentOption === 'full_balance'
                              ? 'Full Remaining Quotation Balance'
                              : paymentOption === 'custom'
                              ? 'Custom cross-installment payment'
                              : 'Current milestone balance'}
                          </p>
                        </div>
                        <div className="text-2xl font-black text-gray-900">
                          {formatCurrency(selectedPayableAmount)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleInitiatePayment}
                        disabled={
                          isInitiating ||
                          isVerifying ||
                          selectedPayableAmount <= 0 ||
                          selectedPayableAmount > totalQuotationOutstanding ||
                          !!amountError ||
                          (!isScheduleConsistent && paymentOption !== 'current_installment')
                        }
                        className="w-full py-3.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {isInitiating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Preparing Secure Checkout...</span>
                          </>
                        ) : isVerifying ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Verifying Payment Signature...</span>
                          </>
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4" />
                            <span>Pay {formatCurrency(selectedPayableAmount)} via Razorpay</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Direct Payment Link (if active and available) */}
                    {currentInstallment.currentPaymentLink && !currentInstallment.isExpired && (
                      <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-gray-700 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                            Direct Payment Link
                          </span>
                          {currentInstallment.currentPaymentLink.expiresAt && (
                            <span className="text-[11px] text-gray-400">
                              Expires: {formatDate(currentInstallment.currentPaymentLink.expiresAt)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={currentInstallment.currentPaymentLink.shortUrl}
                            className="w-full text-xs font-mono bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-600 focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() => handleCopyLink(currentInstallment.currentPaymentLink!.shortUrl)}
                            className="px-3 py-2 bg-white hover:bg-gray-100 border border-gray-300 rounded-lg text-xs font-bold text-gray-700 flex items-center gap-1.5 shrink-0 transition-colors"
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

          {/* Right Column: Installment Details & Financial Particulars (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Installment Summary Card */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-sm font-extrabold text-gray-900">Installment Particulars</h3>
              </div>
              <div className="p-5 space-y-4 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Installment Title:</span>
                  <span className="font-bold text-gray-900">{currentInstallment.title}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Scheduled Amount:</span>
                  <span className="font-bold text-gray-900">{formatCurrency(currentInstallment.scheduledAmount)}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-emerald-700 font-medium">Verified Amount Paid:</span>
                  <span className="font-bold text-emerald-700">{formatCurrency(currentInstallment.verifiedPaidAmount)}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-gray-100">
                  <span className="text-amber-700 font-semibold">Outstanding Balance:</span>
                  <span className="font-black text-amber-700 text-sm">
                    {formatCurrency(currentInstallment.outstandingAmount)}
                  </span>
                </div>

                {currentInstallment.dueDate && (
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Due Date:</span>
                    <span className="font-semibold text-gray-800">{formatDate(currentInstallment.dueDate)}</span>
                  </div>
                )}

                {currentInstallment.expiryDate && (
                  <div className="flex items-center justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-500">Link Expiry:</span>
                    <span className={`font-semibold ${currentInstallment.isExpired ? 'text-rose-600 font-bold' : 'text-gray-800'}`}>
                      {formatDate(currentInstallment.expiryDate)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between py-1">
                  <span className="text-gray-500">Status:</span>
                  <span className="font-bold uppercase tracking-wider text-[11px] text-gray-900">
                    {currentInstallment.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Verified Transaction History for this event */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-indigo-600" />
                  <span>Payment History</span>
                </h3>
                <span className="text-[11px] font-bold text-gray-400">
                  {summary.payments?.length || 0} Transactions
                </span>
              </div>

              <div className="p-5">
                {summary.payments && summary.payments.length > 0 ? (
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                    {summary.payments.map((p) => (
                      <div
                        key={p.id}
                        className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-gray-900">{formatCurrency(p.amount)}</span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                                Verified
                              </span>
                              {p.isFullPayment && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-indigo-100 text-indigo-800">
                                  Full Settled
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-mono text-gray-400 truncate">
                              {p.razorpayPaymentId || p.receiptReference}
                            </p>
                          </div>
                          <div className="text-right text-[10px] text-gray-400 shrink-0">
                            {formatDate(p.createdAt)}
                          </div>
                        </div>

                        {/* Attribution Breakdown Badges if Multi-Installment Allocation */}
                        {p.allocations && p.allocations.length > 0 && (
                          <div className="pt-1.5 border-t border-gray-200 flex flex-wrap gap-1">
                            {p.allocations.map((a, aIdx) => (
                              <span
                                key={aIdx}
                                className="px-1.5 py-0.5 rounded bg-white text-indigo-700 text-[10px] font-semibold border border-indigo-100"
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
                  <div className="text-center py-6 text-gray-400 text-xs">
                    No verified payments recorded yet.
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
