// Sample onboarding questions for the iCal app
// Run this script to populate the questions collection with sample data

const mongoose = require('mongoose');
const Question = require('./models/schemas/Question');
const db = require('./config/db');

const sampleQuestions = [
  {
    text: "What's your primary fitness goal?",
    subtext: "This helps us personalize your nutrition recommendations",
    type: "radio",
    options: ["Weight Loss", "Weight Gain", "Muscle Building", "General Health", "Athletic Performance"],
    sequence: 1,
    isActive: true
  },
  {
    text: "How would you describe your current activity level?",
    subtext: "This affects your daily calorie needs",
    type: "radio",
    options: ["Sedentary (little to no exercise)", "Lightly Active (light exercise 1-3 days/week)", "Moderately Active (moderate exercise 3-5 days/week)", "Very Active (hard exercise 6-7 days/week)", "Extremely Active (very hard exercise, physical job)"],
    sequence: 2,
    isActive: true
  },
  {
    text: "What's your current weight? (in kg)",
    subtext: "We use this to calculate your BMI and calorie requirements",
    type: "number",
    options: [],
    sequence: 3,
    isActive: true
  },
  {
    text: "What's your height? (in cm)",
    type: "number",
    options: [],
    sequence: 4,
    isActive: true
  },
  {
    text: "What's your age?",
    type: "number",
    options: [],
    sequence: 5,
    isActive: true
  },
  {
    text: "What's your gender?",
    type: "radio",
    options: ["Male", "Female", "Other", "Prefer not to say"],
    sequence: 6,
    isActive: true
  },
  {
    text: "How many meals do you typically eat per day?",
    type: "radio",
    options: ["1-2 meals", "3 meals", "4-5 meals", "6+ meals", "Irregular eating pattern"],
    sequence: 7,
    isActive: true
  },
  {
    text: "Do you have any dietary restrictions or preferences?",
    subtext: "Select all that apply - this helps us suggest appropriate meals",
    type: "multiselect",
    options: ["Vegetarian", "Vegan", "Gluten-Free", "Dairy-Free", "Keto", "Paleo", "Mediterranean", "Low-Carb", "High-Protein", "None"],
    sequence: 8,
    isActive: true
  },
  {
    text: "What's your target daily calorie intake?",
    type: "number",
    options: [],
    sequence: 9,
    isActive: true
  },
  {
    text: "How often do you cook at home?",
    type: "radio",
    options: ["Never", "Rarely (1-2 times/week)", "Sometimes (3-4 times/week)", "Often (5-6 times/week)", "Always (7+ times/week)"],
    sequence: 10,
    isActive: true
  },
  {
    text: "What's your biggest challenge with nutrition tracking?",
    type: "radio",
    options: ["Remembering to log meals", "Estimating portion sizes", "Finding nutritional information", "Time constraints", "Motivation", "None"],
    sequence: 11,
    isActive: true
  },
  {
    text: "How would you like to receive nutrition insights?",
    type: "multiselect",
    options: ["Daily summaries", "Weekly reports", "Goal progress updates", "Meal suggestions", "Nutrition tips", "All of the above"],
    sequence: 12,
    isActive: true
  },
  {
    text: "What's your experience level with nutrition tracking?",
    type: "radio",
    options: ["Complete beginner", "Some experience", "Experienced", "Very experienced"],
    sequence: 13,
    isActive: true
  },
  {
    text: "Do you have any food allergies?",
    type: "multiselect",
    options: ["Nuts", "Dairy", "Gluten", "Shellfish", "Eggs", "Soy", "None"],
    sequence: 14,
    isActive: true
  },
  {
    text: "What's your preferred way to track meals?",
    type: "radio",
    options: ["Photo-based logging", "Manual entry", "Barcode scanning", "Voice notes", "Combination of methods"],
    sequence: 15,
    isActive: true
  }
];

async function seedQuestions() {
  try {
    // Connect to database
    await db.connect();
    
    // Clear existing questions (optional - remove this if you want to keep existing data)
    // await Question.deleteMany({});
    
    // Insert sample questions
    const insertedQuestions = await Question.insertMany(sampleQuestions);
    
    console.log(`Successfully inserted ${insertedQuestions.length} questions`);
    console.log('Sample questions created:');
    insertedQuestions.forEach(q => {
      console.log(`${q.sequence}. ${q.text} (${q.type})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding questions:', error);
    process.exit(1);
  }
}

// Run the seeding function
if (require.main === module) {
  seedQuestions();
}

module.exports = { sampleQuestions, seedQuestions };
