const { updateUser } = require('../models/user');
const parseBody = require('../utils/parseBody');

function updateUserProfile(req, res) {
  parseBody(req, async (err, updateData) => {
    if (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
      return;
    }

    // Only allow updating specific fields for security
    const allowedFields = ['name', 'email', 'goals'];
    const filteredData = {};
    
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    }

    // Validate goals if provided
    if (filteredData.goals) {
      const validationErrors = validateGoals(filteredData.goals);
      if (validationErrors.length > 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid goals data', details: validationErrors }));
        return;
      }
    }

    // Validate email if provided
    if (filteredData.email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(filteredData.email)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid email format' }));
        return;
      }
    }

    try {
      const updatedUser = await updateUser(req.user.userId, filteredData);
      if (!updatedUser) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'User not found' }));
        return;
      }

      // Return only safe fields (exclude sensitive data)
      const safeUserData = {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        goals: updatedUser.goals,
        isActive: updatedUser.isActive,
        lastLoginAt: updatedUser.lastLoginAt,
        updatedAt: updatedUser.updatedAt
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(safeUserData));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to update user', details: error.message }));
    }
  });
}

async function deleteUser(req, res) {
  parseBody(req, async (err, data) => {
    if (err || !data.phone) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Phone number is required' }));
      return;
    }

    try {
      const { deactivateUserByPhone } = require('../models/user');
      const result = await deactivateUserByPhone(data.phone);
      
      if (!result) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'User not found or already deactivated' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        message: 'User deactivated successfully',
        phone: data.phone,
        isActive: false
      }));
    } catch (error) {
      console.error('Error deactivating user:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to deactivate user', details: error.message }));
    }
  });
}

function validateGoals(goals) {
  const errors = [];
  
  if (goals.dailyCalories !== undefined) {
    if (typeof goals.dailyCalories !== 'number' || goals.dailyCalories < 0 || goals.dailyCalories > 10000) {
      errors.push('dailyCalories must be a number between 0 and 10,000');
    }
  }
  
  if (goals.dailyProtein !== undefined) {
    if (typeof goals.dailyProtein !== 'number' || goals.dailyProtein < 0 || goals.dailyProtein > 1000) {
      errors.push('dailyProtein must be a number between 0 and 1,000');
    }
  }
  
  if (goals.dailyCarbs !== undefined) {
    if (typeof goals.dailyCarbs !== 'number' || goals.dailyCarbs < 0 || goals.dailyCarbs > 2000) {
      errors.push('dailyCarbs must be a number between 0 and 2,000');
    }
  }
  
  if (goals.dailyFats !== undefined) {
    if (typeof goals.dailyFats !== 'number' || goals.dailyFats < 0 || goals.dailyFats > 500) {
      errors.push('dailyFats must be a number between 0 and 500');
    }
  }
  
  return errors;
}

module.exports = { 
  updateUserProfile,
  deleteUser
}; 