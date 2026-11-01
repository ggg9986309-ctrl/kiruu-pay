
const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Payment provider is not configured");
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

app.get("/api/health", (req, res) => {
  res.json({
    app: "KIRUU PAY",
    server: "online",
    payments: "not_configured"
  });
});

// Create a payment order
app.post("/api/create-order", async (req, res) => {
  try {
    const amount = Number(req.body.amount);

    if (!Number.isInteger(amount) || amount < 100 || amount > 100000) {
      return res.status(400).json({
        error: "Amount must be between ₹1 and ₹1,000"
      });
    }

    const razorpay = getRazorpay();

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "kiruu_" + crypto.randomUUID()
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error("Order creation failed:", error.message);
    res.status(503).json({
      error: "Payment service is not configured or unavailable"
    });
  }
});

// Verify Razorpay payment signature
app.post("/api/verify-payment", (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    if (!razorpay_order_id ||
        !razorpay_payment_id ||
        !razorpay_signature) {
      return res.status(400).json({
        verified: false,
        error: "Missing payment details"
      });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;

    if (!secret) {
      return res.status(503).json({
        verified: false,
        error: "Payment service is not configured"
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    const received = Buffer.from(razorpay_signature, "hex");
    const expected = Buffer.from(expectedSignature, "hex");

    const verified =
      received.length === expected.length &&
      crypto.timingSafeEqual(received, expected);

    res.status(verified ? 200 : 400).json({
      verified
    });

  } catch (error) {
    res.status(400).json({
      verified: false,
      error: "Verification failed"
    });
  }
});

app.listen(PORT, () => {
  console.log("KIRUU PAY server running on port " + PORT);
});
