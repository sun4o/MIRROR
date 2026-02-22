import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";

// Загружаем переменные из .env
dotenv.config();

const app = express();

// Разрешаем запросы с других доменов (React на Netlify будет к нам обращаться)
app.use(cors());

// Разрешаем JSON в теле запроса
app.use(express.json());

// Основной endpoint для чата
app.post("/chat", async (req, res) => {
  const { messages } = req.body; // messages = массив объектов {role, content}

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages должен быть массивом" });
  }

  try {
    // Отправляем запрос в DeepSeek
    const response = await axios.post(
      "https://api.deepseek.com/chat/completions",
      {
        model: "deepseek-chat",
        messages,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Берём первый ответ и отправляем обратно фронту
    res.json(response.data.choices[0].message);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Ошибка DeepSeek API" });
  }
});

// Старт сервера на порту 3000 (локально)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MIRROR backend running on port ${PORT}`);
});