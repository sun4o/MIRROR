// index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { processMessage } from "./mirrorModule.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("MIRROR backend is running 🚀");
});

// ЕДИНСТВЕННЫЙ эндпоинт /chat
app.post("/chat", async (req, res) => {
  try {
    const { messages, labMode } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    console.log("💬 Incoming message:", messages[messages.length - 1]?.content);
    console.log("🔬 Lab mode:", labMode);

    const response = await processMessage(messages, labMode);
    
    console.log("📦 Response:", response);
    res.json(response);

  } catch (error) {
    console.error("❌ Server error:", error);
    res.status(500).json({ 
      error: "Server failed", 
      details: error.message,
      reply: "Извините, произошла ошибка. Попробуйте еще раз.",
      commands: []
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 MIRROR backend running on port ${PORT}`);
});