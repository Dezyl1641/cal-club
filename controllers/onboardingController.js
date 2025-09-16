const OnboardingService = require('../services/onboardingService');
const parseBody = require('../utils/parseBody');

class OnboardingController {
  static async getQuestions(req, res) {
    try {
      const questions = await OnboardingService.getActiveQuestions();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: questions,
        count: questions.length
      }));
    } catch (error) {
      console.error('Error fetching questions:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        message: 'Failed to fetch questions',
        error: error.message
      }));
    }
  }

  static async saveAnswers(req, res) {
    parseBody(req, async (err, data) => {
      if (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid request body' }));
        return;
      }

      // Extract userId from JWT token (set by auth middleware)
      const userId = req.user?.userId;
      
      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: 'User ID not found in token'
        }));
        return;
      }

      const { answers } = data;
      
      if (!answers) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: 'Answers array is required'
        }));
        return;
      }

      // Add userId to each answer
      const answersWithUserId = answers.map(answer => ({
        ...answer,
        userId: userId
      }));

      try {
        const result = await OnboardingService.saveUserAnswers(answersWithUserId);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: result.message,
          data: result.results
        }));
      } catch (error) {
        console.error('Error saving answers:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: 'Failed to save answers',
          error: error.message
        }));
      }
    });
  }

  static async getUserAnswers(req, res) {
    try {
      // Extract userId from JWT token (set by auth middleware)
      const userId = req.user?.userId;
      
      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: 'User ID not found in token'
        }));
        return;
      }

      const answers = await OnboardingService.getUserAnswers(userId);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: answers,
        count: answers.length
      }));
    } catch (error) {
      console.error('Error fetching user answers:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        message: 'Failed to fetch user answers',
        error: error.message
      }));
    }
  }
}

module.exports = OnboardingController;
