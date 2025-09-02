const jwt = require('jsonwebtoken');
const {
  findUserByPhone,
  createUser,
  storeOtp,
  fetchOtp,
  deleteOtp,
  storeAuthToken
} = require('../models/user');
const parseBody = require('../utils/parseBody');

const JWT_SECRET = process.env.JWT_SECRET;

class AuthService {
  static generateOtp(phone) {
    // Extract last 6 digits from phone number
    const cleanPhone = phone.replace(/\D/g, ''); // Remove all non-digits
    return cleanPhone.slice(-6); // Get last 6 digits
  }



  static async requestOtp(phone) {
    const otp = this.generateOtp(phone);
    
    // Check if user exists to link OTP
    let user = await findUserByPhone(phone);
    const userId = user ? user._id : null;
    
    // Store OTP
    await storeOtp(phone, otp, userId);
    
    return { message: 'OTP generated and stored', phone, otp };
  }

  static async verifyOtp(phone, otp) {
    const storedOtp = await fetchOtp(phone);
    
    if (!storedOtp || storedOtp !== otp) {
      throw new Error('Invalid OTP');
    }

    // Check if user exists and is active
    let user = await findUserByPhone(phone);
    
    // If user doesn't exist, create a new one
    if (!user) {
      user = await createUser({ phone });
    } else {
      // If user exists but is inactive, reactivate them
      if (!user.isActive) {
        const { updateUser } = require('../models/user');
        user = await updateUser(user._id, { isActive: true });
      }
    }

    // Delete OTP after successful verification
    await deleteOtp(phone);

    // Generate and store auth token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '14d' });
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
    await storeAuthToken(user._id, token, expiresAt);

    return { message: 'OTP verified successfully', token };
  }
}

module.exports = AuthService; 