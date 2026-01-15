/**
 * Utility functions for date/time handling in IST timezone
 */

/**
 * Get current date/time in IST (Indian Standard Time, UTC+5:30)
 * Returns a Date object that represents the current IST time
 * 
 * Note: JavaScript Date objects are always stored as UTC internally.
 * This function creates a Date that represents the current IST moment.
 * When this date is stored in MongoDB (as UTC) and later displayed in IST,
 * it will show the correct IST time.
 * 
 * Example: If current IST time is 2:00 PM IST, this returns a Date object
 * that stores 8:30 AM UTC (which is 2:00 PM IST).
 */
function getCurrentDateInIST() {
  const now = new Date();
  
  // Get current time components in IST timezone
  const istFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = istFormatter.formatToParts(now);
  const year = parseInt(parts.find(p => p.type === 'year').value);
  const month = parseInt(parts.find(p => p.type === 'month').value) - 1; // Month is 0-indexed
  const day = parseInt(parts.find(p => p.type === 'day').value);
  const hour = parseInt(parts.find(p => p.type === 'hour').value);
  const minute = parseInt(parts.find(p => p.type === 'minute').value);
  const second = parseInt(parts.find(p => p.type === 'second').value);
  
  // Create a UTC Date object from IST components
  // IST is UTC+5:30, so to convert IST to UTC, we subtract 5:30 hours
  // We create the date as if the IST components were UTC, then subtract the offset
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000; // 5 hours 30 minutes in milliseconds
  const utcDate = new Date(Date.UTC(year, month, day, hour, minute, second));
  
  // Subtract IST offset to get the UTC time that corresponds to this IST time
  return new Date(utcDate.getTime() - istOffsetMs);
}

/**
 * Convert a date string or Date object to IST timezone
 * If no date provided, returns current IST time
 */
function toIST(date = null) {
  if (!date) {
    return getCurrentDateInIST();
  }
  
  if (typeof date === 'string') {
    date = new Date(date);
  }
  
  // Get IST representation of the provided date
  const istString = date.toLocaleString('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const [datePart, timePart] = istString.split(', ');
  const [month, day, year] = datePart.split('/').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
  
  const istDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  
  return new Date(istDate.getTime() - istOffsetMs);
}

module.exports = {
  getCurrentDateInIST,
  toIST
};
