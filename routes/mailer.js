require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // true for port 465, false for port 587
  auth: {
    user: 'hwtechenterprisellc@gmail.com',
    pass: 'hwkizgohhdssebjo', // App password from your image
  },
});

const sendEmail = async (to, subject, htmlContent) => {
  try {
    const info = await transporter.sendMail({
      from: '"HW Tech" <hwtechenterprisellc@gmail.com>', // Sender name + email
      to,
      subject,
      html: htmlContent,
    });

    console.log('✅ Gmail email sent:', info.messageId);
  } catch (error) {
    console.error('❌ Error sending Gmail email:', error);
    throw error;
  }
};

module.exports = sendEmail;

