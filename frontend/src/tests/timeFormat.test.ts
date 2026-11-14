import { describe, it, expect } from 'vitest';
import { formatTimeTo12Hour, formatTimeTo24Hour } from '../utils/formatters';

describe('formatTimeTo12Hour Utility', () => {
  it('formats standard 24-hour morning time strings into 12-hour AM format', () => {
    expect(formatTimeTo12Hour('08:00')).toBe('08:00 AM');
    expect(formatTimeTo12Hour('09:30')).toBe('09:30 AM');
    expect(formatTimeTo12Hour('11:45')).toBe('11:45 AM');
  });

  it('formats single-digit hour strings with leading zero in 12-hour AM format', () => {
    expect(formatTimeTo12Hour('8:00')).toBe('08:00 AM');
    expect(formatTimeTo12Hour('9:15')).toBe('09:15 AM');
  });

  it('formats noon correctly as 12:00 PM', () => {
    expect(formatTimeTo12Hour('12:00')).toBe('12:00 PM');
    expect(formatTimeTo12Hour('12:30')).toBe('12:30 PM');
  });

  it('formats afternoon and evening train times into 12-hour PM format', () => {
    expect(formatTimeTo12Hour('13:00')).toBe('01:00 PM');
    expect(formatTimeTo12Hour('16:00')).toBe('04:00 PM');
    expect(formatTimeTo12Hour('17:30')).toBe('05:30 PM');
    expect(formatTimeTo12Hour('20:15')).toBe('08:15 PM');
    expect(formatTimeTo12Hour('23:59')).toBe('11:59 PM');
  });

  it('formats midnight correctly as 12:00 AM', () => {
    expect(formatTimeTo12Hour('00:00')).toBe('12:00 AM');
    expect(formatTimeTo12Hour('00:30')).toBe('12:30 AM');
  });

  it('formats ISO timestamps to Asia/Kolkata 12-hour AM/PM', () => {
    // 08:30 UTC = 14:00 (02:00 PM) IST
    expect(formatTimeTo12Hour('2026-11-14T08:30:00.000Z')).toBe('02:00 PM');
    // 04:30 UTC = 10:00 (10:00 AM) IST
    expect(formatTimeTo12Hour('2026-11-14T04:30:00.000Z')).toBe('10:00 AM');
  });

  it('formats JavaScript Date objects to Asia/Kolkata 12-hour AM/PM', () => {
    const d = new Date('2026-11-14T08:30:00.000Z');
    expect(formatTimeTo12Hour(d)).toBe('02:00 PM');
  });

  it('normalizes already formatted 12-hour AM/PM strings', () => {
    expect(formatTimeTo12Hour('08:00 AM')).toBe('08:00 AM');
    expect(formatTimeTo12Hour('8:00 am')).toBe('08:00 AM');
    expect(formatTimeTo12Hour('05:30 pm')).toBe('05:30 PM');
  });

  it('handles null, undefined, empty and dash fallback strings gracefully', () => {
    expect(formatTimeTo12Hour(null)).toBe('—');
    expect(formatTimeTo12Hour(undefined)).toBe('—');
    expect(formatTimeTo12Hour('')).toBe('—');
    expect(formatTimeTo12Hour('   ')).toBe('—');
    expect(formatTimeTo12Hour('—')).toBe('—');
    expect(formatTimeTo12Hour('N/A')).toBe('—');
    expect(formatTimeTo12Hour('-')).toBe('—');
  });
});

describe('formatTimeTo24Hour Utility', () => {
  it('converts 12-hour AM/PM strings to 24-hour HH:mm', () => {
    expect(formatTimeTo24Hour('08:00 AM')).toBe('08:00');
    expect(formatTimeTo24Hour('05:30 PM')).toBe('17:30');
    expect(formatTimeTo24Hour('12:00 PM')).toBe('12:00');
    expect(formatTimeTo24Hour('12:00 AM')).toBe('00:00');
    expect(formatTimeTo24Hour('8:15 am')).toBe('08:15');
    expect(formatTimeTo24Hour('11:59 pm')).toBe('23:59');
  });

  it('normalizes 24-hour time strings', () => {
    expect(formatTimeTo24Hour('17:30')).toBe('17:30');
    expect(formatTimeTo24Hour('8:00')).toBe('08:00');
    expect(formatTimeTo24Hour('00:00')).toBe('00:00');
  });

  it('converts ISO timestamp or Date object to Asia/Kolkata 24-hour string', () => {
    expect(formatTimeTo24Hour('2026-11-14T10:00:00.000Z')).toBe('15:30');
    const d = new Date('2026-11-14T08:30:00.000Z');
    expect(formatTimeTo24Hour(d)).toBe('14:00');
  });

  it('handles null, undefined and empty strings', () => {
    expect(formatTimeTo24Hour(null)).toBe('');
    expect(formatTimeTo24Hour(undefined)).toBe('');
    expect(formatTimeTo24Hour('')).toBe('');
    expect(formatTimeTo24Hour('—')).toBe('');
  });
});

