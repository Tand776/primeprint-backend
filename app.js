require("dotenv").config();
const { Telegraf } = require("telegraf");
const admin = require("firebase-admin");

// ===== INIT BOT =====
const bot = new Telegraf(process.env.BOT_TOKEN);

// ===== FIREBASE SETUP (for Railway) =====
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ===== USER STATE (simple memory) =====
const userState = {};

// ===== START COMMAND =====
bot.start((ctx) => {
  ctx.reply(
    "👋 Welcome to Prime Print Digital\n\nChoose an option:",
    {
      reply_markup: {
        keyboard: [
          ["🛒 Place Order"],
          ["💰 Get Quote"],
          ["📦 Track Order"],
        ],
        resize_keyboard: true,
      },
    }
  );
});

// ===== PLACE ORDER BUTTON =====
bot.hears("🛒 Place Order", (ctx) => {
  userState[ctx.from.id] = { step: "product" };
  ctx.reply("🛒 What do you want to print?\n(e.g. T-shirt, Banner)");
});

// ===== GET QUOTE =====
bot.hears("💰 Get Quote", (ctx) => {
  ctx.reply("💰 Send details:\nProduct, Quantity, Size");
});

// ===== TRACK ORDER =====
bot.hears("📦 Track Order", (ctx) => {
  ctx.reply("📦 Send your Order ID");
});

// ===== ORDER FLOW =====
bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  // Ignore commands
  if (text.startsWith("/")) return;

  const state = userState[userId];

  // ===== STEP 1: PRODUCT =====
  if (state && state.step === "product") {
    state.product = text;
    state.step = "quantity";
    return ctx.reply("📦 Enter quantity:");
  }

  // ===== STEP 2: QUANTITY =====
  if (state && state.step === "quantity") {
    state.quantity = text;
    state.step = "details";
    return ctx.reply("📝 Any extra details? (size, color, design)");
  }

  // ===== STEP 3: DETAILS + SAVE =====
  if (state && state.step === "details") {
    state.details = text;

    const order = {
      userId,
      product: state.product,
      quantity: state.quantity,
      details: state.details,
      date: new Date(),
    };

    // Save to Firestore
    const docRef = await db.collection("orders").add(order);

    // Reply to user
    ctx.reply(
      `✅ Order placed successfully!\n\n🆔 Order ID: ${docRef.id}`
    );

    // Send to admin
    bot.telegram.sendMessage(
      process.env.ADMIN_ID,
      `📥 NEW ORDER\n\nProduct: ${state.product}\nQuantity: ${state.quantity}\nDetails: ${state.details}\nUser: ${userId}`
    );

    // Clear state
    delete userState[userId];
    return;
  }

  // ===== DEFAULT =====
  ctx.reply("Please use the buttons below 👇");
});

// ===== START SERVER =====
bot.launch();
console.log("🚀 Bot is running...");

// ===== GRACEFUL STOP =====
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
