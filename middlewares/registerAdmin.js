const jwt = require('jsonwebtoken');
const Admin = require('../models/admin');
const Subscription = require('../models/subscription');

const sendEmail = require('../routes/mailer'); // ✅ Correct

const registerAdmin = async (req, res) => {
  console.log('register admin called');
  try {
    const {
      clientname,
      email,
      password,
      companyname,
      companyurl,
      country,
      region,
      telephone,
      plan,
    } = req.body;

    if (
      !clientname ||
      !email ||
      !password ||
      !companyname ||
      !companyurl ||
      !country ||
      !region ||
      !telephone
    ) {
      return res
        .status(400)
        .json({ code: 400, message: 'All fields are required' });
    }

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res
        .status(409)
        .json({ code: 400, message: 'Admin already exists with email' });
    }
    const existingComapny = await Admin.findOne({ companyname: companyname });

    if (existingComapny) {
      return res
        .status(409)
        .json({ code: 400, message: 'This company name is already in Use' });
    }

    const otp = generateOTP();
    const newAdmin = new Admin({
      clientname,
      email,
      password,
      companyname,
      companyurl,
      country,
      region,
      telephone,
      verification: false,
      otp: otp,
      plan: plan,
    });

    await newAdmin.save();

    const data = {
      userId: newAdmin?._id,
      planName: plan,
      price: plan == 'Business Plan' ? 50 : 0,
      link: `${process.env.FRONTEND_URL}/chat-assistant?company=${companyname
        .toLowerCase()
        .replace(/\s+/g, '')}`,
      features:
        plan == 'Business Plan'
          ? [
              'Admin dashboard with analytics',
              '50GB storage',
              'Unlimited user access',
              'Personalized AI responses',
              '95% AI accuracy',
              'Feedback support & analysis',
            ]
          : [
              'Basic admin dashboard (limited time)',
              'Upload 5 files max',
              'Trial of user-facing assistant',
            ],

      isActive: true,
    };

    if (plan == 'Business Plan') {
      data.useDataStore = 0;
      data.maxDataStore = 50;
    } else {
      data.maxFile = 0;
    }

    const alreadySubscribe = await Subscription.findOne({
      userId: newAdmin?._id,
    });
    if (alreadySubscribe) {
      const subscriptionData = new Subscription.findOneAndUpdate(
        {
          userId: newAdmin?._id,
        },
        data
      );
    } else {
      const subscriptionData = new Subscription(data);
      await subscriptionData.save();
    }

    await sendEmail(
      email,
      'User Verification Email',
      `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #4CAF50;">Verify Your Email</h2>
      <p>Hello,</p>
      <p>Thank you for registering. Please use the verification code below:</p>
      <div style="font-size: 24px; font-weight: bold; background: #f1f1f1; padding: 10px; width: fit-content;">
        ${otp}
      </div>
      <p>If you did not request this, please ignore this email.</p>
      <br />
      <p>Best regards,<br/>Your Team</p>
    </div>
  `
    );

    res.status(201).json({
      message: 'Admin registered successfully',
      admin: {
        id: newAdmin._id,
        clientname: newAdmin.clientname,
        email: newAdmin.email,
        companyName: newAdmin.companyname,
        companyUrl: newAdmin.companyurl,
        country: newAdmin.country,
        region: newAdmin.region,
        telephone: newAdmin.telephone,
        role: newAdmin.role,
        createdAt: newAdmin.createdAt,
      },
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ code: 400, message: messages.join(', ') });
    }

    console.error('Error in registerAdmin:', error);
    res.status(500).json({ code: 400, message: error.message });
  }
};
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email and OTP are required' });
  }

  try {
    const user = await Admin.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    if (user.verification) {
      return res.status(400).json({ message: 'Admin already verified' });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    user.verification = true;
    user.otp = null; // Optional: remove the OTP once verified

    await sendEmail(
      email,
      'Account Verified – Your Credentials',
      `
  <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
    <h2 style="color: #4CAF50;">🎉 Account Successfully Verified!</h2>
    <p>Hello,</p>
    <p>Thank you for verifying your account. Your registration is now complete.</p>
    <p>Here are your login credentials:</p>

    <div style="margin: 20px 0; padding: 15px; background: #f9f9f9; border-left: 4px solid #4CAF50;">
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Password:</strong> ********</p>
    </div>

    <p>Please keep this information secure and do not share it with anyone.</p>
    <br/>
    <p>Best regards,<br/>Your Team</p>
  </div>
  `
    );

    await user.save();

    return res.status(200).json({ message: 'OTP verified successfully' });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const findAdmin = async (req, res) => {
  const { companyName } = req.query;

  if (!companyName) {
    return res.status(400).json({ message: 'Company Name is required' });
  }

  try {
    const normalize = (str) => (str || '').replace(/\s+/g, '').toLowerCase();

    const inputCompany = normalize(companyName);

    const admins = await Admin.find(); // fetch all admins

    const user = admins.find(
      (admin) =>
        admin.companyname && normalize(admin.companyname) === inputCompany
    );

    if (!user) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    return res
      .status(200)
      .json({ data: user, message: 'Admin found successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { registerAdmin, verifyOTP, findAdmin };
