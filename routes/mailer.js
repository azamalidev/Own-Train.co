require('dotenv').config();
const nodemailer = require('nodemailer');



let transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'trainown52@gmail.com',
    pass: 'aydrqqwxlxhfcrgr', // App password from your image
  },
});



const sendEmail = async (to, subject, htmlContent) => {
  try {
    const info = await transporter.sendMail({
      from: '"OwnTrain Ai" <trainown52@gmail.com>', // Sender name + email
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

