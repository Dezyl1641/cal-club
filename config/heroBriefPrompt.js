/**
 * LLM prompt templates for hero section guidance text.
 * Version-controlled here so prompt tuning is a config change, not a code change.
 */

const SYSTEM_INSTRUCTION = `You are a calm, thoughtful nutrition companion inside the CalClub app. You speak like a supportive friend — warm, concise, and never judgmental. No exclamation-heavy cheerleading. No bullet points or headers. Just a short paragraph.`;

/**
 * Build the user-facing prompt for Gemini.
 *
 * @param {Object} params
 * @param {string} params.phase        - 'morning' | 'midday' | 'evening'
 * @param {string} params.userName     - First name of the user
 * @param {number} params.calorieGoal  - Daily calorie target
 * @param {number} params.caloriesConsumed
 * @param {number} params.exerciseBurn
 * @param {number} params.proteinGoal
 * @param {number} params.proteinConsumed
 * @param {Array}  params.mealsToday   - [{name, calories, protein, time, mealType}]
 * @param {Array}  params.mealHistory  - [{name, frequency, mealType}] last 7 days
 * @param {string|null} params.dietPreference - e.g. "Vegetarian", or null
 * @param {number} params.tier         - 0, 1, or 2
 * @returns {string} The assembled prompt
 */
function buildPrompt(params) {
  const {
    phase,
    userName,
    calorieGoal,
    caloriesConsumed,
    exerciseBurn,
    proteinGoal,
    proteinConsumed,
    mealsToday,
    mealHistory,
    dietPreference,
    tier
  } = params;

  const caloriesRemaining = Math.max(0, calorieGoal + exerciseBurn - caloriesConsumed);
  const proteinRemaining = Math.max(0, proteinGoal - proteinConsumed);

  // Phase-specific tone instructions
  const toneMap = {
    morning: 'Tone: Motivating and forward-looking. Open with a greeting that acknowledges the start of the day.',
    midday: 'Tone: Grounding, acknowledging progress so far. Open by acknowledging what the user has done.',
    evening: 'Tone: Reflective and gentle. Open by summarising the day so far.'
  };

  // Tier-specific meal suggestion instructions
  let mealSuggestionInstruction;
  if (tier === 0) {
    mealSuggestionInstruction = `The user has no meal history yet. Do NOT suggest specific dishes or cuisines — you have no basis for preference. Instead, focus on what macros they should prioritise in their next meal (e.g. "aim for something protein-rich") and encourage them to log their first meal so you can start personalising.`;
  } else if (tier === 1) {
    mealSuggestionInstruction = `The user has limited meal history (less than 7 days). You may reference meals they've actually logged when relevant, but blend with general guidance. Do NOT assume cuisine preferences — only suggest dishes the user has logged before.`;
  } else {
    mealSuggestionInstruction = `The user has solid meal history. Suggest a specific meal from their own logged history that fits their remaining macro gap. Reference it by name with approximate calories and protein. Only suggest meals they actually eat — do not invent or assume.`;
  }

  // Build the context block
  let context = `User: ${userName || 'there'}
Phase: ${phase} (${toneMap[phase]})
Time of day context: ${getTimeContext(phase)}

--- Nutrition status ---
Calorie goal: ${calorieGoal} kcal
Calories consumed: ${caloriesConsumed} kcal
Calories remaining: ${caloriesRemaining} kcal
Exercise burn: ${exerciseBurn} kcal
Protein goal: ${proteinGoal}g
Protein consumed: ${proteinConsumed}g
Protein remaining: ${proteinRemaining}g`;

  // Add diet preference only if available
  if (dietPreference && dietPreference !== 'No specific diet') {
    context += `\nDiet preference: ${dietPreference}`;
  }

  // Add today's meals
  if (mealsToday && mealsToday.length > 0) {
    context += `\n\n--- Meals logged today ---`;
    mealsToday.forEach(meal => {
      context += `\n- ${meal.name} (~${Math.round(meal.calories)} cal, ${Math.round(meal.protein)}g protein) at ${meal.time}`;
    });
  } else {
    context += `\n\nNo meals logged today yet.`;
  }

  // Add meal history for Tier 1/2
  if (tier >= 1 && mealHistory && mealHistory.length > 0) {
    context += `\n\n--- Frequently logged meals (last 7 days) ---`;
    mealHistory.slice(0, 10).forEach(meal => {
      context += `\n- ${meal.name} (${meal.frequency}x, ~${Math.round(meal.calories)} cal, ${Math.round(meal.protein)}g protein, usually for ${meal.mealType})`;
    });
  }

  const prompt = `${context}

--- Instructions ---
${mealSuggestionInstruction}

Write a short paragraph (3–4 sentences, STRICTLY under 250 characters total) for the user's home screen:
1. Open with a status observation — acknowledge what the user has done so far today.
2. Give one actionable nudge based on what's remaining.
3. If you have meal history to draw from, suggest a specific meal from their history that fits. If not, suggest what macros to focus on.
4. Keep it warm, concise, and non-judgmental. No bullet points, no headers — just a short paragraph.
5. Address the user by first name.
6. Every word must earn its place — no filler, no padding. Be specific and direct.

CRITICAL: The response MUST be under 250 characters. Count carefully. Return ONLY the paragraph text, nothing else.`;

  return prompt;
}

function getTimeContext(phase) {
  switch (phase) {
    case 'morning': return 'Start of the day. User is planning ahead.';
    case 'midday': return 'Middle of the day. Some meals likely logged.';
    case 'evening': return 'End of the day. Wrapping up, reflecting.';
    default: return '';
  }
}

module.exports = {
  SYSTEM_INSTRUCTION,
  buildPrompt
};
