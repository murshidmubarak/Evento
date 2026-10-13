import crypto from 'node:crypto';

/**
 * Cryptographically verifies that an incoming Razorpay webhook payload
 * matches the X-Razorpay-Signature header using HMAC-SHA256 and constant-time comparison.
 *
 * @param rawBody - Raw Buffer or string of the unparsed HTTP request body
 * @param signature - Signature provided in the X-Razorpay-Signature header
 * @param secret - Configured dedicated Razorpay webhook secret
 * @returns boolean indicating whether the signature is authentic and unaltered
 */
export const verifyRazorpayWebhookSignature = (
  rawBody: Buffer | string | undefined,
  signature: string | undefined,
  secret: string | undefined
): boolean => {
  if (!signature || !secret || !rawBody) {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const sigBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
};
