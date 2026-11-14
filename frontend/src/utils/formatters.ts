export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
};

export const formatDate = (dateString?: string | Date): string => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Formats a 24-hour time string ("08:00", "17:30"), ISO Date string, or Date object
 * into 12-hour AM/PM format (e.g. "08:00 AM", "05:30 PM").
 */
export const formatTimeTo12Hour = (time?: string | Date | null): string => {
  if (!time) return '—';

  if (time instanceof Date) {
    if (isNaN(time.getTime())) return '—';
    return time.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  const str = String(time).trim();
  if (!str || str === '—' || str === 'N/A' || str === '-') return '—';

  // If already in 12-hour AM/PM format (e.g. "8:00 AM", "05:30 pm")
  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2];
    const modifier = ampmMatch[3].toUpperCase();
    const hoursFormatted = hours < 10 ? `0${hours}` : `${hours}`;
    return `${hoursFormatted}:${minutes} ${modifier}`;
  }

  // If it's an ISO timestamp or date-like string containing 'T'
  if (str.includes('T')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
  }

  // Match "HH:mm" or "HH:mm:ss" or "H:mm"
  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 becomes 12
    const hoursFormatted = hours < 10 ? `0${hours}` : `${hours}`;
    return `${hoursFormatted}:${minutes} ${ampm}`;
  }

  return str;
};

/**
 * Normalizes a 12-hour AM/PM string ("05:30 PM"), ISO Date string, or Date object
 * into HTML5 input-compatible 24-hour "HH:mm" format (e.g. "17:30").
 */
export const formatTimeTo24Hour = (time?: string | Date | null): string => {
  if (!time) return '';

  if (time instanceof Date) {
    if (isNaN(time.getTime())) return '';
    return time.toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const str = String(time).trim();
  if (!str || str === '—' || str === 'N/A' || str === '-') return '';

  // 12-hour AM/PM: e.g. "05:30 PM", "8:15 am"
  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm|AM|PM)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2];
    const modifier = ampmMatch[3].toUpperCase();
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    const hoursFormatted = hours < 10 ? `0${hours}` : `${hours}`;
    return `${hoursFormatted}:${minutes}`;
  }

  // ISO timestamp or date-like string containing 'T'
  if (str.includes('T')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-GB', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }

  // 24-hour: "HH:mm" or "HH:mm:ss" or "H:mm"
  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const hoursFormatted = hours < 10 ? `0${hours}` : `${hours}`;
    return `${hoursFormatted}:${minutes}`;
  }

  return str;
};


