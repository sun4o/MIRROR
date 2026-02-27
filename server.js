import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import { processMessage } from "./mirrorModule.js";

dotenv.config();

const app = express();

// Railway требует использовать process.env.PORT
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Проверка, что сервер жив
app.get("/", (req, res) => {
  res.send("MIRROR backend is running 🚀");
});

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    console.log("Incoming messages:", messages);

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    const response = await axios.post(
      "https://api.deepseek.com/chat/completions",
      { model: "deepseek-chat", messages },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
      }
    );

    console.log("DeepSeek response:", response.data);
    res.json(response.data.choices[0].message);
  } catch (error) {
    console.error("DeepSeek error:", error.response?.data || error.message);
    res.status(500).json({ error: "DeepSeek request failed", details: error.response?.data });
  }
});

app.listen(PORT, () => {
  console.log(`MIRROR backend running on port ${PORT}`);
});

app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages))
      return res.status(400).json({ error: "Messages array is required" });

    // Берем последний user-сообщение
    const userMessage = messages[messages.length - 1];

    const botResponse = await processMessage(userMessage);

    res.json(botResponse);
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Server failed", details: error.message });
  }
});