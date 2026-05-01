require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const admin = require("firebase-admin");
const PDFDocument = require("pdfkit");
const fs = require("fs");

// ================= FIRESTORE =================
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const ordersRef = db.collection("orders");

// ================= EXPRESS =================
const app = express();
app.use(express.json());

// health check
app.get("/", (req, res) => {
  res.send("🚀 Prime Print API running");
});

// ================= QUOTE =================
function calculateQuote({ pages, size, color, quantity }) {
  let price = color === "color" ? 0.8 : 0.3;
  if (size === "A3") price *= 1.5;
  return Math.ceil(pages * price * quantity);
}

// ================= PAYSTACK =================
async function initializePayment(email, amount, orderId) {
  const res = await axios.post(
    "https://api.paystack.co/transaction/initialize",
    {
      email,
      amount: amount * 100,
      callback_url: `${process.env.BASE_URL}/verify?orderId=${orderId}`
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`
      }
    }
  );

  return res.data.data.authorization_url;
}

// ================= TELEGRAM =================
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

console.log("🤖 Bot started...");

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
`👋 Welcome to Prime Print Digital

1️⃣ Place Order
2️⃣ Get Quote
3️⃣ Track Order`);
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // ORDER
  if (text === "1️⃣ Place Order") {
    bot.sendMessage(chatId, "📦 Describe your print:");

    bot.once("message", async (msg2) => {
      const orderId = Date.now().toString();

      await ordersRef.doc(orderId).set({
        orderId,
        userId: chatId,
        details: msg2.text,
        amount: 50,
        status: "pending",
        paymentStatus: "unpaid"
      });

      const link = await initializePayment(
        "customer@email.com",
        50,
        orderId
      );

      bot.sendMessage(chatId,
`✅ Order Created
ID: ${orderId}
Amount: GHS 50

💳 Pay here:
${link}`);
    });
  }

  // QUOTE
  if (text === "2️⃣ Get Quote") {
    bot.sendMessage(chatId, "Send: 10,A4,color,2");

    bot.once("message", (msg2) => {
      const [p, s, c, q] = msg2.text.split(",");

      const price = calculateQuote({
        pages: Number(p),
        size: s,
        color: c,
        quantity: Number(q)
      });

      bot.sendMessage(chatId, `💰 Price: GHS ${price}`);
    });
  }

  // TRACK
  if (text === "3️⃣ Track Order") {
    bot.sendMessage(chatId, "Send Order ID:");

    bot.once("message", async (msg2) => {
      const doc = await ordersRef.doc(msg2.text).get();

      if (!doc.exists) {
        return bot.sendMessage(chatId, "❌ Order not found");
      }

      const order = doc.data();

      bot.sendMessage(chatId,
`📦 Status: ${order.status}
💳 Payment: ${order.paymentStatus}`);
    });
  }
});

// ================= VERIFY =================
app.get("/verify", async (req, res) => {
  const { reference, orderId } = req.query;

  try {
    const verify = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`
        }
      }
    );

    if (verify.data.data.status === "success") {
      await ordersRef.doc(orderId).update({
        paymentStatus: "paid",
        status: "processing",
        reference
      });

      res.send("✅ Payment successful");
    } else {
      res.send("❌ Payment failed");
    }

  } catch (err) {
    res.send("Error verifying payment");
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});