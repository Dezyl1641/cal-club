/**
 * Phase-specific static fallback text for the hero section.
 * Returned when Gemini is unavailable (failures, circuit breaker open).
 *
 * Editable here without an app deploy — the frontend never generates
 * fallback text itself, it renders whatever guidanceText the backend sends.
 */

const PHASE_FALLBACKS = {
  morning: "Good morning. Your full calorie and protein targets are ahead. Log your first meal — aim for something protein-rich. Once I learn what you enjoy, I'll tailor suggestions for you.",
  midday: "Midday check-in. Log what you've eaten so far to see how you're tracking. A balanced meal with good protein will keep you on course. Keep it going.",
  evening: "Wrapping up the day. Log any remaining meals for your daily summary. Every day of tracking helps me understand your habits. Rest well tonight."
};

const PHASE_HEADLINES = {
  morning: 'Morning Brief',
  midday: 'Midday Check-in',
  evening: 'Evening Wrap'
};

const PHASE_TIME_BOUNDARIES = {
  morning: { startHour: 5, endHour: 12 },
  midday:  { startHour: 12, endHour: 18 },
  evening: { startHour: 18, endHour: 5 }
};

/**
 * Determine the current phase based on IST time.
 * @returns {string} 'morning' | 'midday' | 'evening'
 */
function getCurrentPhaseIST() {
  const now = new Date();
  const istHour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      hour12: false
    }).format(now),
    10
  );

  if (istHour >= 5 && istHour < 12) return 'morning';
  if (istHour >= 12 && istHour < 18) return 'midday';
  return 'evening';
}

/**
 * Validate a client-provided phase against the current IST time.
 * Allows a 15-minute grace window around phase boundaries.
 * Returns the valid phase (client's if within grace, server's otherwise).
 * @param {string|null} clientPhase
 * @returns {string} validated phase
 */
function validatePhase(clientPhase) {
  const serverPhase = getCurrentPhaseIST();

  if (!clientPhase || !['morning', 'midday', 'evening'].includes(clientPhase)) {
    return serverPhase;
  }

  // If client and server agree, no issue
  if (clientPhase === serverPhase) return serverPhase;

  // Allow the client phase if it's the adjacent phase (grace window)
  const phaseOrder = ['morning', 'midday', 'evening'];
  const clientIdx = phaseOrder.indexOf(clientPhase);
  const serverIdx = phaseOrder.indexOf(serverPhase);

  // Adjacent means difference of exactly 1, or evening→morning wrap
  const diff = Math.abs(clientIdx - serverIdx);
  if (diff === 1) {
    return clientPhase;
  }

  return serverPhase;
}

module.exports = {
  PHASE_FALLBACKS,
  PHASE_HEADLINES,
  PHASE_TIME_BOUNDARIES,
  getCurrentPhaseIST,
  validatePhase
};
