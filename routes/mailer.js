require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
        user: 'pat.hudson82@ethereal.email',
        pass: 'ej3BbSgqYQH4xHxnQy'
    }
});

const sendEmail = async (to, subject, text) => {
  try {
    await transporter.sendMail({
      from: 'pat.hudson82@ethereal.email',
      to,
      subject,
      text,
    });
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

module.exports = sendEmail;
