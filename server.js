import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Состояние объектов в лаборатории (в памяти)
let labObjects = []; // { id, position }

app.get("/", (req, res) => {
  res.send("MIRROR backend is running 🚀");
});

app.post("/chat", async (req, res) => {
  try {
    const { messages, labMode } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    // Последнее сообщение пользователя
    const userText = messages[messages.length - 1].content.toLowerCase();

    let commands = [];

    // 🔹 Если мы в лаборатории, сервер может создавать/редактировать объекты
    if (labMode) {
      // Создать объект
      if (userText.includes("создай объект")) {
        const pos = [
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5,
        ];
        const newObj = { id: Date.now(), position: pos };
        labObjects.push(newObj);
        commands.push({ type: "create", object: newObj });
      }

      // Пример редактирования первого объекта
      if (userText.includes("двигай объект") && labObjects.length > 0) {
        const obj = labObjects[0]; // можно по id искать
        const newPos = [
          obj.position[0] + (Math.random() - 0.5),
          obj.position[1] + (Math.random() - 0.5),
          obj.position[2] + (Math.random() - 0.5),
        ];
        obj.position = newPos;
        commands.push({ type: "update", object: obj });
      }
    }

    // 🔹 Отправка на DeepSeek для генерации текста/ответа
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

    const dsContent = response.data.choices[0].message.content || "Готово.";

    res.json({
      content: dsContent,
      commands,
    });
  } catch (error) {
    console.error("DeepSeek error:", error.response?.data || error.message);
    res.status(500).json({
      content: "Ошибка сервера: не удалось обработать команду",
      commands: [],
    });
  }
});

app.listen(PORT, () => {
  console.log(`MIRROR backend running on port ${PORT}`);
});