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

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// Initialize Twilio client only if credentials are available
let twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  const twilio = require('twilio');
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

class AuthService {
  static generateOtp(phone) {
    // Extract last 6 digits from phone number
    const cleanPhone = phone.replace(/\D/g, ''); // Remove all non-digits
    return cleanPhone.slice(-6); // Get last 6 digits
  }

  static async sendOtpViaSms(phone, otp) {
    if (!twilioClient) {
      throw new Error('Twilio is not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.');
    }

    if (!TWILIO_PHONE_NUMBER) {
      throw new Error('TWILIO_PHONE_NUMBER environment variable is not set.');
    }

    try {
      const message = await twilioClient.messages.create({
        body: `Your OTP is ${otp}`,
        from: TWILIO_PHONE_NUMBER,
        to: phone
      });
      console.log(`OTP sent via Twilio. SID: ${message.sid}`);
      return message;
    } catch (error) {
      console.error('Twilio SMS error:', error.message);
      throw new Error(`Failed to send SMS via Twilio: ${error.message}`);
    }
  }

  static async requestOtp(phone) {
    const otp = this.generateOtp(phone);
    
    // Check if user exists to link OTP
    let user = await findUserByPhone(phone);
    const userId = user ? user._id : null;
    
    // Store OTP
    await storeOtp(phone, otp, userId);
    
    // Send SMS
    await this.sendOtpViaSms(phone, otp);

    return { message: 'OTP sent via sms and stored', phone, otp };
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