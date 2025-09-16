// MongoDB script to insert onboarding questions
// Run this directly in MongoDB shell or MongoDB Compass

db.questions.insertMany([
  {
    text: "Welcome to Cal Club!",
    subtext: "Watch how easy it is to track your meals and reach your goals",
    type: "NO_INPUT",
    options: [],
    sequence: 1,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "What's your gender?",
    subtext: "This helps us calculate your personalized calorie needs",
    type: "SELECT",
    options: ["Male", "Female", "Other", "Prefer not to say"],
    sequence: 2,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "How often do you work out?",
    subtext: "This affects your daily calorie requirements",
    type: "SELECT",
    options: ["Never", "1-2 times per week", "3-4 times per week", "5-6 times per week", "Daily", "More than once a day"],
    sequence: 3,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "Where did you hear about us?",
    subtext: "Help us understand how you found Cal Club",
    type: "SELECT",
    options: ["Social Media", "Friend/Family", "App Store", "Google Search", "Advertisement", "Other"],
    sequence: 4,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "Have you tried other calorie tracking apps?",
    subtext: "We're curious about your experience with nutrition apps",
    type: "SELECT",
    options: ["Yes, I've tried several", "Yes, I've tried one or two", "No, this is my first time", "I've tried but gave up quickly"],
    sequence: 5,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "See the difference Cal Club makes",
    subtext: "Our users see consistent results over 6 months",
    type: "NO_INPUT",
    options: [],
    sequence: 6,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "What's your height (cm)?",
    subtext: "We use this to calculate your BMI and calorie needs",
    type: "NUMBER",
    options: [],
    sequence: 7,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "What's your current weight (kg)?",
    subtext: "We use this to calculate your BMI and calorie needs",
    type: "NUMBER",
    options: [],
    sequence: 8,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "What's your date of birth?",
    subtext: "This helps us personalize your recommendations",
    type: "DATE",
    options: [],
    sequence: 9,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "What's your primary goal?",
    subtext: "Choose the goal that best describes what you want to achieve",
    type: "SELECT",
    options: ["Maintain my current weight", "Gain weight", "Lose weight"],
    sequence: 10,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "What's your target weight (kg)?",
    subtext: "Set a realistic goal that you can achieve",
    type: "NUMBER",
    options: [],
    sequence: 11,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "You're on the right track!",
    subtext: "With Cal Club, you'll reach your goal weight and maintain it long-term",
    type: "NO_INPUT",
    options: [],
    sequence: 12,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "How much weight do you want to change per week?",
    subtext: "A sustainable pace leads to lasting results",
    type: "SELECT",
    options: ["0.1 kg", "0.2 kg", "0.5 kg", "0.7 kg", "0.9 kg"],
    sequence: 13,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "Gain twice as much with Cal Club",
    subtext: "Our users see 2x better results compared to tracking on their own",
    type: "NO_INPUT",
    options: [],
    sequence: 14,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "What's stopping you from reaching your goals?",
    subtext: "Understanding your challenges helps us support you better",
    type: "MULTISELECT",
    options: ["Lack of time", "Don't know what to eat", "Can't stick to diets", "Expensive healthy food", "Lack of motivation", "Confusing nutrition info", "Social pressure", "Other"],
    sequence: 15,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "Do you follow a specific diet?",
    subtext: "This helps us suggest meals that fit your lifestyle",
    type: "SELECT",
    options: ["No specific diet", "Vegetarian", "Vegan", "Keto", "Paleo", "Mediterranean", "Low-carb", "Intermittent Fasting", "Other"],
    sequence: 16,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "What would you like to accomplish?",
    subtext: "Tell us about your biggest motivation",
    type: "TEXTAREA",
    options: [],
    sequence: 17,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "You're ready to succeed!",
    subtext: "With your goals set, you're on the path to achieving them with Cal Club",
    type: "NO_INPUT",
    options: [],
    sequence: 18,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "Thank you for trusting us!",
    subtext: "We're excited to be part of your health journey",
    type: "NO_INPUT",
    options: [],
    sequence: 19,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "Connect Apple Health",
    subtext: "Sync your activity data for more accurate calorie tracking",
    type: "APPLE_HEALTH",
    options: [],
    sequence: 20,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "How Apple Health sync works",
    subtext: "We'll automatically add your burned calories to your daily budget",
    type: "NO_INPUT",
    options: [],
    sequence: 21,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "Rollover extra calories",
    subtext: "Unused calories from today can be used tomorrow - no waste!",
    type: "NO_INPUT",
    options: [],
    sequence: 22,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "Rate Cal Club",
    subtext: "See what other users are saying about their success",
    type: "RATING",
    options: [],
    sequence: 23,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "Have a referral code?",
    subtext: "Enter a friend's code to get special benefits",
    type: "TEXT",
    options: [],
    sequence: 24,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    text: "All done!",
    subtext: "Time to generate your custom nutrition plan",
    type: "NO_INPUT",
    options: [],
    sequence: 25,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

print("Successfully inserted 25 onboarding questions!");

