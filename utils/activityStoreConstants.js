/** Enum of valid activity store categories. */
const CATEGORY = Object.freeze({
  SUMMARY:  'SUMMARY',
  EXERCISE: 'EXERCISE',
});

/** Enum of valid activity types. */
const ACTIVITY_TYPE = Object.freeze({
  STEPS:    'STEPS',
  CALORIES: 'CALORIES',
  DISTANCE: 'DISTANCE',
  EXERCISE: 'EXERCISE',
});

module.exports = { CATEGORY, ACTIVITY_TYPE };
