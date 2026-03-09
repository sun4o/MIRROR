import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { Client, handle_file } from '@gradio/client';
import { PythonShell } from 'python-shell';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Создаём папки если их нет
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const generatedDir = path.join(__dirname, 'generated');
const uploadsDir = path.join(__dirname, 'uploads');
const pythonDir = path.join(__dirname, 'python');

if (!fs.existsSync(generatedDir)) {
  fs.mkdirSync(generatedDir);
}
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
if (!fs.existsSync(pythonDir)) {
  fs.mkdirSync(pythonDir);
}

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir)
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());

// Раздаём статические файлы
app.use('/generated', express.static(generatedDir));
app.use('/uploads', express.static(uploadsDir));

// ============= TRIPOSR URL =============
const TRIPOSR_URL = 'https://189d616e3137164fbd.gradio.live/'; // Локальный TripoSR

// Проверка сервера
app.get("/", (req, res) => {
  res.send("MIRROR backend is running 🚀");
});

// ============= ЧАТ С DEEPSEEK =============
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

// ============= ГЕНЕРАЦИЯ КОДА ЧЕРЕЗ DEEPSEEK =============
app.post('/generate-code', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    console.log(`🤖 DeepSeek генерирует код для: "${prompt}"`);

    const systemPrompt = `ТЫ — ГЕНЕРАТОР 3D ОБЪЕКТОВ.

ВАЖНО: ИСПОЛЬЗУЙ ТОЛЬКО АНГЛИЙСКИЕ НАЗВАНИЯ!

Создай функцию с именем createCar(THREE) или createSword(THREE) или createDragon(THREE) в зависимости от запроса.

НЕ ИСПОЛЬЗУЙ РУССКИЕ БУКВЫ В ИМЕНАХ ФУНКЦИЙ!

ВЕРНИ ТОЛЬКО КОД, БЕЗ ПОЯСНЕНИЙ.

Запрос пользователя: ${prompt}`;

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
      code: code.substring(0, 500) + '...',
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

// ============= ГЕНЕРАЦИЯ 3D ИЗ ИЗОБРАЖЕНИЯ ЧЕРЕЗ GRADIO CLIENT =============
app.post('/generate-from-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Image file is required" });
    }

    console.log(`📸 Получено изображение: ${req.file.originalname}`);
    
    // Подключаемся к TripoSR
    const client = await Client.connect(TRIPOSR_URL);
    
    // Шаг 1: Проверяем изображение
    console.log("🔄 Проверка изображения...");
    await client.predict("/check_input_image", {
      input_image: handle_file(req.file.path)
    });
    
    // Шаг 2: Препроцессинг
    console.log("🔄 Препроцессинг...");
    const preprocessResult = await client.predict("/preprocess", {
      input_image: handle_file(req.file.path),
      do_remove_background: true,
      foreground_ratio: 0.85
    });
    
    // Шаг 3: Генерация 3D модели
    console.log("🔄 Генерация 3D модели...");
    const generateResult = await client.predict("/generate", {
      image: preprocessResult.data,
      mc_resolution: 256
    });
    
    // generateResult.data[0] - OBJ файл
    const modelData = generateResult.data[0];
    const modelPath = path.join(generatedDir, `model_${Date.now()}.obj`);
    
    // Сохраняем модель
    if (modelData.url) {
      const response = await axios.get(modelData.url, { responseType: 'arraybuffer' });
      fs.writeFileSync(modelPath, response.data);
    } else if (modelData.path) {
      fs.copyFileSync(modelData.path, modelPath);
    } else {
      // Если пришёл сам файл
      fs.writeFileSync(modelPath, modelData);
    }
    
    // Удаляем временный файл
    fs.unlinkSync(req.file.path);
    
    console.log(`✅ 3D модель сохранена: ${path.basename(modelPath)}`);
    
    res.json({ 
      success: true, 
      modelUrl: `/generated/${path.basename(modelPath)}`,
      message: "3D модель успешно создана"
    });

  } catch (error) {
    console.error("❌ Ошибка TripoSR:", error);
    
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    
    res.status(500).json({ 
      success: false, 
      error: "Ошибка при генерации 3D модели",
      details: error.message 
    });
  }
});

// ============= УЛУЧШЕНИЕ МОДЕЛИ ЧЕРЕЗ DEEPSEEK =============
app.post('/enhance-3d', async (req, res) => {
  try {
    const { modelPath, prompt } = req.body;
    
    if (!modelPath || !prompt) {
      return res.status(400).json({ error: "Model path and prompt are required" });
    }

    console.log(`🎨 DeepSeek улучшает модель: ${modelPath} с запросом: "${prompt}"`);

    const fullPath = path.join(__dirname, modelPath);
    const existingCode = fs.readFileSync(fullPath, 'utf8');

    const response = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { 
            role: 'system', 
            content: `Ты — эксперт по 3D моделям. Улучши предоставленный код модели согласно запросу пользователя. 
            Сохрани структуру, но добавь новые детали, текстуры или анимации.
            Верни ТОЛЬКО улучшенный код, без пояснений.` 
          },
          { 
            role: 'user', 
            content: `Вот код существующей 3D модели:\n\n${existingCode}\n\nУлучши её: ${prompt}` 
          }
        ],
        temperature: 0.8,
        max_tokens: 4000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
      }
    );

    let enhancedCode = response.data.choices[0].message.content;
    enhancedCode = enhancedCode.replace(/```javascript/g, '').replace(/```/g, '').trim();

    const enhancedFilename = `enhanced_${Date.now()}.js`;
    const enhancedPath = path.join(generatedDir, enhancedFilename);
    
    fs.writeFileSync(enhancedPath, enhancedCode);

    console.log(`✅ Улучшенная модель сохранена: ${enhancedFilename}`);

    res.json({ 
      success: true, 
      modelUrl: `/generated/${enhancedFilename}`,
      originalModel: modelPath,
      message: "Модель успешно улучшена"
    });

  } catch (error) {
    console.error("❌ Ошибка улучшения:", error);
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
      .filter(file => file.endsWith('.js') || file.endsWith('.obj') || file.endsWith('.glb'))
      .map(file => {
        const stats = fs.statSync(path.join(generatedDir, file));
        return {
          name: file,
          path: `/generated/${file}`,
          size: stats.size,
          created: stats.birthtime,
          type: file.split('.').pop()
        };
      })
      .sort((a, b) => b.created - a.created);
    
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= ПОЛУЧИТЬ КОНКРЕТНЫЙ ФАЙЛ =============
app.get('/file/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(generatedDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ 
      filename, 
      content,
      type: filename.split('.').pop()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= ПРОВЕРКА TRIPOSR СТАТУСА =============
app.get('/triposr-status', async (req, res) => {
  try {
    const client = await Client.connect(TRIPOSR_URL);
    res.json({ 
      online: true, 
      url: TRIPOSR_URL
    });
  } catch (error) {
    res.json({ 
      online: false, 
      url: TRIPOSR_URL,
      error: error.message 
    });
  }
});

// ============= 3D ИЗ ФОТО ЧЕРЕЗ YOLO =============
app.post('/photo-to-3d-yolo', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Photo is required" });
    }

    console.log(`📸 YOLO обработка: ${req.file.originalname}`);
    
    const photoPath = req.file.path;
    const prompt = req.body.prompt || 'object';
    const outputName = `yolo_${Date.now()}`;
    
    // Проверяем существование Python скрипта
    const pythonScriptPath = path.join(__dirname, 'python', 'processor.py');
    if (!fs.existsSync(pythonScriptPath)) {
      return res.status(500).json({ 
        success: false, 
        error: "Python скрипт не найден",
        details: `Ожидается: ${pythonScriptPath}`
      });
    }
    
    // Опции для PythonShell
    const options = {
      mode: 'text',
      pythonPath: process.platform === 'win32' ? 'python' : 'python3',
      pythonOptions: ['-u'],
      scriptPath: path.join(__dirname, 'python'),
      args: [photoPath, outputName]
    };

    console.log(`🐍 Запускаем Python скрипт: ${pythonScriptPath}`);

    // Запускаем Python скрипт
    PythonShell.run('processor.py', options, async (err, results) => {
      // Удаляем временное фото
      try { fs.unlinkSync(photoPath); } catch (e) {}
      
      if (err) {
        console.error("❌ Python ошибка:", err);
        return res.status(500).json({ 
          success: false, 
          error: "YOLO processing failed",
          details: err.message
        });
      }
      
      if (!results || results.length === 0) {
        return res.status(500).json({ 
          success: false, 
          error: "Python скрипт ничего не вернул" 
        });
      }
      
      console.log("📤 Python результат:", results);
      
      // Результат - последняя строка вывода (путь к JSON)
      const jsonPath = results[results.length - 1].trim();
      const fullJsonPath = path.join(__dirname, 'python', jsonPath);
      
      // Проверяем существует ли файл
      if (!fs.existsSync(fullJsonPath)) {
        return res.status(500).json({ 
          success: false, 
          error: "JSON файл не найден",
          details: fullJsonPath
        });
      }
      
      // Читаем JSON с 3D примитивом
      const primitiveData = JSON.parse(fs.readFileSync(fullJsonPath, 'utf8'));
      
      // Теперь отправляем в DeepSeek для улучшения
      console.log(`🎨 Улучшаем через DeepSeek с промптом: "${prompt}"`);
      
      const deepseekResponse = await axios.post(
        'https://api.deepseek.com/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            { 
              role: 'system', 
              content: `Ты — генератор 3D объектов. У тебя есть примитивная 3D сетка объекта. 
              Улучши её согласно запросу пользователя: добавь текстуры, детали, сделай фотореалистичной.
              ВЕРНИ ТОЛЬКО УЛУЧШЕННУЮ 3D МОДЕЛЬ В ВИДЕ JSON С ПОЛЯМИ vertices, faces, colors, textures.` 
            },
            { 
              role: 'user', 
              content: `Примитивная сетка: ${JSON.stringify(primitiveData)}. 
              Сделай из этого: ${prompt}. 
              Добавь цвета, текстуры, детали. Верни JSON.` 
            }
          ],
          temperature: 0.8,
          max_tokens: 4000
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          },
        }
      );
      
      let enhancedData = deepseekResponse.data.choices[0].message.content;
      
      // Очищаем от markdown
      enhancedData = enhancedData.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // Парсим JSON
      let enhanced;
      try {
        enhanced = JSON.parse(enhancedData);
      } catch (e) {
        // Если не JSON, сохраняем как текст
        enhanced = { raw: enhancedData };
      }
      
      // Сохраняем улучшенную модель
      const enhancedPath = path.join(generatedDir, `${outputName}_enhanced.json`);
      fs.writeFileSync(enhancedPath, JSON.stringify(enhanced, null, 2));
      
      // Сохраняем примитив для отладки
      const primitivePath = path.join(generatedDir, `${outputName}_primitive.json`);
      fs.writeFileSync(primitivePath, JSON.stringify(primitiveData, null, 2));
      
      // Удаляем временный JSON из папки python
      try { fs.unlinkSync(fullJsonPath); } catch (e) {}
      
      console.log(`✅ Готово! Модель сохранена: ${enhancedPath}`);
      
      res.json({
        success: true,
        primitive: `/generated/${outputName}_primitive.json`,
        enhanced: `/generated/${outputName}_enhanced.json`,
        message: "3D модель создана и улучшена"
      });
    });

  } catch (error) {
    console.error("❌ Ошибка:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 MIRROR backend running on port ${PORT}`);
  console.log(`📁 Generated files will be saved to: ${generatedDir}`);
  console.log(`📁 Uploads saved to: ${uploadsDir}`);
  console.log(`📁 Python scripts in: ${pythonDir}`);
  console.log(`🖼️ TripoSR URL: ${TRIPOSR_URL}`);
});