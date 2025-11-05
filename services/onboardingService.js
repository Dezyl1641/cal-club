const Question = require('../models/schemas/Question');
const UserQuestion = require('../models/schemas/UserQuestion');

class OnboardingService {
  static async getActiveQuestions() {
    try {
      return await Question.find({ isActive: true })
        .sort({ sequence: 1 })
        .select('_id text subtext type options sequence image');
    } catch (error) {
      throw new Error(`Failed to fetch active questions: ${error.message}`);
    }
  }

  static async saveUserAnswers(answers) {
    try {
      if (!Array.isArray(answers) || answers.length === 0) {
        throw new Error('Answers must be a non-empty array');
      }

      // Validate each answer
      for (const answer of answers) {
        if (!answer.userId || !answer.questionId || !answer.values || !Array.isArray(answer.values)) {
          throw new Error('Each answer must have userId, questionId, and values array');
        }
      }

      // Extract unique userIds and questionIds for bulk operations
      const userIds = [...new Set(answers.map(a => a.userId))];
      const questionIds = [...new Set(answers.map(a => a.questionId))];
      
      // Bulk soft delete existing answers for all user-question combinations
      if (userIds.length > 0 && questionIds.length > 0) {
        await UserQuestion.updateMany(
          { 
            userId: { $in: userIds },
            questionId: { $in: questionIds },
            deletedAt: null 
          },
          { deletedAt: new Date() }
        );
      }
      
      // Bulk create new answers
      const newAnswers = answers.map(answer => ({
        userId: answer.userId,
        questionId: answer.questionId,
        values: answer.values
      }));
      
      const savedAnswers = await UserQuestion.insertMany(newAnswers);
      const results = savedAnswers.map(answer => ({ action: 'created', answer }));

      return {
        success: true,
        message: `Successfully processed ${results.length} answers`,
        results
      };
    } catch (error) {
      throw new Error(`Failed to save user answers: ${error.message}`);
    }
  }

  static async getUserAnswers(userId) {
    try {
      return await UserQuestion.find({ userId, deletedAt: null })
        .populate('questionId', 'text subtext type options sequence')
        .sort({ 'questionId.sequence': 1 });
    } catch (error) {
      throw new Error(`Failed to fetch user answers: ${error.message}`);
    }
  }

  static async deleteAllAnswersForUser(userId) {
    try {
      return await UserQuestion.updateMany(
        { userId, deletedAt: null },
        { deletedAt: new Date() }
      );
    } catch (error) {
      throw new Error(`Failed to delete user answers: ${error.message}`);
    }
  }
}

module.exports = OnboardingService;
