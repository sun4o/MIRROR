// server.js - ПОЛНЫЙ ФАЙЛ
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Создаём папку generated если её нет
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const generatedDir = path.join(__dirname, 'generated');
if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir);
}

app.use(cors());
app.use(express.json());

// Раздаём статические файлы из папки generated
app.use('/generated', express.static(generatedDir));

// Проверка сервера
app.get("/", (req, res) => {
  res.send("MIRROR backend is running 🚀");
});

// ============= СТАРЫЙ ЭНДПОИНТ ДЛЯ ЧАТА =============
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

// ============= НОВЫЙ ЭНДПОИНТ ДЛЯ ГЕНЕРАЦИИ КОДА =============
app.post('/generate-code', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    console.log(`🤖 DeepSeek генерирует код для: "${prompt}"`);

    const systemPrompt = `ТЫ — ГЕНЕРАТОР 3D ОБЪЕКТОВ.

Создай функцию с именем create_${prompt.replace(/\s+/g, '_')}(THREE), которая:
1. Возвращает THREE.Group
2. Содержит минимум 5 частей
3. Использует разные цвета

ВЕРНИ ТОЛЬКО КОД, БЕЗ ПОЯСНЕНИЙ.

ПРИМЕР:
function create_машина(THREE) {
  const group = new THREE.Group();
  
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.3, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xff0000 })
  );
  body.position.set(0, 0.2, 0);
  group.add(body);
  
  const wheel1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );
  wheel1.position.set(-0.3, 0.05, 0.25);
  wheel1.rotation.z = Math.PI/2;
  group.add(wheel1);
  
  return group;
}`;

    const response = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Создай 3D объект: ${prompt} с текстурами, анимацией и физикой` }
        ],
        temperature: 0.7,
        max_tokens: 4000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
      }
    );

    let code = response.data.choices[0].message.content;
    
    // Очищаем код от возможных markdown
    code = code.replace(/```javascript/g, '').replace(/```/g, '').trim();
    
    // Создаём имя файла
    const filename = `${prompt.replace(/\s+/g, '_')}_${Date.now()}.js`;
    const filePath = path.join(generatedDir, filename);
    
    // Сохраняем файл
    fs.writeFileSync(filePath, code);
    
    console.log(`✅ Файл сохранён: ${filename}`);
    console.log(`📁 Путь: ${filePath}`);

    res.json({ 
      success: true, 
      filename,
      code: code.substring(0, 500) + '...', // Отправляем только начало
      message: `Файл ${filename} создан и сохранён на сервере`
    });

  } catch (error) {
    console.error("❌ Ошибка:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============= ПОЛУЧИТЬ СПИСОК СГЕНЕРИРОВАННЫХ ФАЙЛОВ =============
app.get('/generated-files', (req, res) => {
  try {
    const files = fs.readdirSync(generatedDir)
      .filter(file => file.endsWith('.js'))
      .map(file => ({
        name: file,
        path: `/generated/${file}`,
        size: fs.statSync(path.join(generatedDir, file)).size
      }));
    
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 MIRROR backend running on port ${PORT}`);
  console.log(`📁 Generated files will be saved to: ${generatedDir}`);
});