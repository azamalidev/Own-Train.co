// routes/paypal.js
const express = require('express');
const router = express.Router();
const { client } = require('../utils/paypalClient');
const paypal = require('@paypal/checkout-server-sdk');

router.post('/create-order', async (req, res) => {
  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer('return=representation');
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: 'USD',
          value: req.body?.amount
        },
      },
    ],
  });

  try {
    const order = await client().execute(request);
    res.status(200).json({ id: order.result.id });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.post('/capture-order', async (req, res) => {
  const { orderID } = req.body;
  const request = new paypal.orders.OrdersCaptureRequest(orderID);

  try {
    const capture = await client().execute(request);
    res.json({ capture });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

module.exports = router;
