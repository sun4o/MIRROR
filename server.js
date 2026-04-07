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
import { createServer } from 'http';
import { Server } from 'socket.io';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Создаём HTTP сервер и WebSocket
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://mirror-production-1717.up.railway.app',
      'file://',
      'null'
    ],
    credentials: true
  }
});

// Хранилище комнат
const rooms = new Map();

// WebSocket обработчики
io.on('connection', (socket) => {
  console.log('🔌 Клиент подключен:', socket.id);
  
  // Ведущий создаёт/подключается к комнате
  socket.on('presenter-join', (roomId) => {
    console.log(`🎙️ Ведущий подключается к комнате ${roomId}`);
    
    let room = rooms.get(roomId);
    if (!room) {
      room = { presenter: socket.id, viewers: [], content: null };
      rooms.set(roomId, room);
    } else {
      room.presenter = socket.id;
    }
  
  socket.join(roomId);
  console.log(`✅ Ведущий в комнате ${roomId}, его rooms:`, Array.from(socket.rooms));
  socket.emit('room-joined', { roomId, role: 'presenter' });
});

  // Зритель подключается к комнате
  socket.on('viewer-join', (roomId) => {
    console.log(`👥 Зритель подключается к комнате ${roomId}`);
    
    const room = rooms.get(roomId);
    if (!room || !room.presenter) {
      socket.emit('room-error', 'Комната не найдена или нет ведущего');
      console.log(`❌ Комната ${roomId} не найдена`);
      return;
    }
    
    room.viewers.push(socket.id);
    socket.join(roomId);
    console.log(`✅ Зритель в комнате ${roomId}, его rooms:`, Array.from(socket.rooms));
    socket.emit('room-joined', { roomId, role: 'viewer' });
    
    if (room.content) {
      console.log(`📤 Отправка сохранённого контента новому зрителю в комнату ${roomId}`);
      socket.emit('content-update', room.content);
    }
    
    io.to(roomId).emit('viewer-count', room.viewers.length);
  });

  // Обновление контента (слайды)
  socket.on('content-update', (data) => {
    // Получаем комнату, в которой находится сокет (кроме его собственного ID)
    const roomIds = Array.from(socket.rooms).filter(r => r !== socket.id);
    console.log(`📺 content-update от ${socket.id}, комнаты:`, roomIds);
    
    roomIds.forEach(roomId => {
      const room = rooms.get(roomId);
      if (room && room.presenter === socket.id) {
        room.content = data;
        console.log(`📺 Рассылка слайда в комнату ${roomId}, зрителей: ${room.viewers.length}`);
        socket.to(roomId).emit('content-update', data);
      }
    });
  });

  // 3D объект
  socket.on('3d-object-update', (data) => {
    const roomIds = Array.from(socket.rooms).filter(r => r !== socket.id);
    console.log(`🎮 3d-object-update от ${socket.id}, комнаты:`, roomIds);
    
    roomIds.forEach(roomId => {
      const room = rooms.get(roomId);
      if (room && room.presenter === socket.id) {
        console.log(`🎮 Рассылка 3D объекта в комнату ${roomId}`);
        socket.to(roomId).emit('3d-object-update', data);
      }
    });
  });

  // Отключение
  socket.on('disconnect', () => {
    rooms.forEach((room, roomId) => {
      if (room.viewers.includes(socket.id)) {
        room.viewers = room.viewers.filter(id => id !== socket.id);
        io.to(roomId).emit('viewer-count', room.viewers.length);
        console.log(`👋 Зритель отключился из комнаты ${roomId}, осталось: ${room.viewers.length}`);
      }
      if (room.presenter === socket.id) {
        room.presenter = null;
        console.log(`🎙️ Ведущий отключился из комнаты ${roomId}`);
      }
    });
  });
});

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

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://mirror-production-1717.up.railway.app',
    'file://',
    'null'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());

// Раздаём статические файлы
app.use('/generated', express.static(generatedDir));
app.use('/uploads', express.static(uploadsDir));

// ============= TRIPOSR URL =============
const TRIPOSR_URL = 'https://189d616e3137164fbd.gradio.live/';

// ============= API ЭНДПОИНТЫ =============

// Проверка сервера
app.get("/", (req, res) => {
  res.send("MIRROR backend is running 🚀");
});

// ============= КОМНАТЫ =============
app.get('/rooms', (req, res) => {
  const roomsList = Array.from(rooms.values()).map(r => ({
    id: r.id,
    viewers: r.viewers.length,
    hasPresenter: !!r.presenter,
    createdAt: r.createdAt
  }));
  res.json({ rooms: roomsList });
});

app.get('/room/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  res.json({
    id: room.id,
    viewers: room.viewers.length,
    hasPresenter: !!room.presenter,
    content: room.content,
    createdAt: room.createdAt
  });
});

app.post('/create-room', (req, res) => {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const room = {
    id: roomId,
    presenter: null,
    viewers: [],
    content: null,
    createdAt: new Date()
  };
  rooms.set(roomId, room);
  
  res.json({ 
    roomId, 
    qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://mirror-production-1717.up.railway.app/room/${roomId}` 
  });
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

// ============= ГЕНЕРАЦИЯ КОДА =============
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
    code = code.replace(/```javascript/g, '').replace(/```/g, '').trim();
    
    const filename = `${prompt.replace(/\s+/g, '_')}_${Date.now()}.js`;
    const filePath = path.join(generatedDir, filename);
    
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

// ============= ГЕНЕРАЦИЯ 3D ИЗ ИЗОБРАЖЕНИЯ =============
app.post('/generate-from-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Image file is required" });
    }

    console.log(`📸 Получено изображение: ${req.file.originalname}`);
    
    const client = await Client.connect(TRIPOSR_URL);
    
    console.log("🔄 Проверка изображения...");
    await client.predict("/check_input_image", {
      input_image: handle_file(req.file.path)
    });
    
    console.log("🔄 Препроцессинг...");
    const preprocessResult = await client.predict("/preprocess", {
      input_image: handle_file(req.file.path),
      do_remove_background: true,
      foreground_ratio: 0.85
    });
    
    console.log("🔄 Генерация 3D модели...");
    const generateResult = await client.predict("/generate", {
      image: preprocessResult.data,
      mc_resolution: 256
    });
    
    const modelData = generateResult.data[0];
    const modelPath = path.join(generatedDir, `model_${Date.now()}.obj`);
    
    if (modelData.url) {
      const response = await axios.get(modelData.url, { responseType: 'arraybuffer' });
      fs.writeFileSync(modelPath, response.data);
    } else if (modelData.path) {
      fs.copyFileSync(modelData.path, modelPath);
    } else {
      fs.writeFileSync(modelPath, modelData);
    }
    
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

// ============= УЛУЧШЕНИЕ МОДЕЛИ =============
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

// ============= ПОЛУЧИТЬ СПИСОК ФАЙЛОВ =============
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

// ============= ПРОВЕРКА TRIPOSR =============
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

// ============= YOLO ОБРАБОТКА =============
app.post('/photo-to-3d-yolo', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Photo is required" });
    }

    console.log(`📸 YOLO обработка: ${req.file.originalname}`);
    
    const photoPath = req.file.path;
    const prompt = req.body.prompt || 'object';
    const outputName = `yolo_${Date.now()}`;
    
    const pythonScriptPath = path.join(__dirname, 'python', 'processor.py');
    if (!fs.existsSync(pythonScriptPath)) {
      return res.status(500).json({ 
        success: false, 
        error: "Python скрипт не найден",
        details: `Ожидается: ${pythonScriptPath}`
      });
    }
    
    const options = {
      mode: 'text',
      pythonPath: process.platform === 'win32' ? 'python' : 'python3',
      pythonOptions: ['-u'],
      scriptPath: path.join(__dirname, 'python'),
      args: [photoPath, outputName]
    };

    console.log(`🐍 Запускаем Python скрипт: ${pythonScriptPath}`);

    PythonShell.run('processor.py', options, async (err, results) => {
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
      
      const jsonPath = results[results.length - 1].trim();
      const fullJsonPath = path.join(__dirname, 'python', jsonPath);
      
      if (!fs.existsSync(fullJsonPath)) {
        return res.status(500).json({ 
          success: false, 
          error: "JSON файл не найден",
          details: fullJsonPath
        });
      }
      
      const primitiveData = JSON.parse(fs.readFileSync(fullJsonPath, 'utf8'));
      
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
      enhancedData = enhancedData.replace(/```json/g, '').replace(/```/g, '').trim();
      
      let enhanced;
      try {
        enhanced = JSON.parse(enhancedData);
      } catch (e) {
        enhanced = { raw: enhancedData };
      }
      
      const enhancedPath = path.join(generatedDir, `${outputName}_enhanced.json`);
      fs.writeFileSync(enhancedPath, JSON.stringify(enhanced, null, 2));
      
      const primitivePath = path.join(generatedDir, `${outputName}_primitive.json`);
      fs.writeFileSync(primitivePath, JSON.stringify(primitiveData, null, 2));
      
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

// ============= NPC ДИАЛОГ =============
app.post('/npc-talk', async (req, res) => {
  try {
    const { type, message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }
    
    console.log(`💬 NPC ${type} говорит: "${message}"`);
    
    const response = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { 
            role: 'system', 
            content: `Ты NPC в игре. Отвечай кратко (1-2 предложения), эмоционально. Тип: ${type}. Ты находишься в мире фэнтези. Общайся с игроком.` 
          },
          { 
            role: 'user', 
            content: message 
          }
        ],
        temperature: 0.8
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
      }
    );
    
    const text = response.data.choices[0].message.content;
    console.log(`🤖 NPC ответил: "${text}"`);
    
    res.json({ reply: text });
    
  } catch (error) {
    console.error("❌ NPC talk error:", error.response?.data || error.message);
    res.status(500).json({ 
      error: "NPC talk failed",
      reply: "Извини, я сейчас не могу говорить."
    });
  }
});

// ============= ГЕНЕРАЦИЯ МИРОВ ЧЕРЕЗ DEEPSEEK =============
app.post('/generate-world', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    console.log(`🌍 Генерация мира для: "${prompt}"`);

    const response = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `Ты — генератор миров для 3D игры. Верни ТОЛЬКО JSON без пояснений:
            {
              "terrain": {
                "type": "равнины|горы|лес|пустыня",
                "scale": 100,
                "height": 5
              },
              "objects": [
                {
                  "type": "tree",
                  "count": 10,
                  "distribution": "random"
                },
                {
                  "type": "rock",
                  "count": 5,
                  "distribution": "random"
                },
                {
                  "type": "house",
                  "count": 2,
                  "distribution": "random"
                }
              ],
              "weather": "ясно|дождь|туман|снег",
              "lighting": "день|вечер|ночь"
            }`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 2000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
      }
    );

    let content = response.data.choices[0].message.content;
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let worldConfig;
    try {
      worldConfig = JSON.parse(content);
    } catch (e) {
      console.error('Ошибка парсинга JSON:', e);
      worldConfig = {
        terrain: { type: "равнины", scale: 100, height: 5 },
        objects: [
          { type: "tree", count: 15, distribution: "random" },
          { type: "rock", count: 8, distribution: "random" },
          { type: "house", count: 3, distribution: "random" }
        ],
        weather: "ясно",
        lighting: "день"
      };
    }
    
    console.log(`✅ Мир сгенерирован: ${worldConfig.terrain.type}`);
    
    res.json({
      success: true,
      world: worldConfig
    });

  } catch (error) {
    console.error("❌ Ошибка генерации мира:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============= ПРЕЗЕНТЕР: ГЕНЕРАЦИЯ СЛАЙДА =============
app.post('/presenter/generate', async (req, res) => {
  try {
    const { speech, targetLanguage = 'ru' } = req.body;
    
    if (!speech) {
      return res.status(400).json({ error: "Speech text is required" });
    }

    console.log(`🎤 Генерация слайда из речи: "${speech}"`);

    const systemPrompt = `Ты — JARVIS, создаёшь слайды для презентации из речи ведущего.

ВАЖНЕЙШЕЕ ПРАВИЛО:
Слайд должен быть ТОЧНО по теме речи ведущего. Не придумывай свою тему. Что сказал ведущий — то и раскрывай.

ПРАВИЛА:
1. Используй web_search для поиска актуальных изображений и данных
2. Выделяй ключевые моменты жирным (**текст**)
3. Верни ТОЛЬКО JSON, без пояснений
4. Заголовок должен отражать суть речи
5. Контент должен быть строго по теме речи

Структура ответа:
{
  "title": "Заголовок слайда (строго по теме речи)",
  "content": "Подробный текст по теме речи с **жирными** выделениями важных моментов",
  "imageUrls": ["максимум 2 ссылки на релевантные изображения"],
  "keyPoints": ["ключевой момент 1", "ключевой момент 2", "ключевой момент 3"],
  "suggestion": "Подсказка (если ведущий упустил важную деталь)",
  "visual": {
    "type": "text",
    "data": null
  },
  "translations": {
    "en": "English translation",
    "zh": "中文翻译",
    "de": "Deutsche Übersetzung",
    "fr": "Traduction française",
    "es": "Traducción española"
  }
}

Если речь содержит просьбу показать график (цифры, проценты, рост/падение) — заполни visual:
{
  "type": "chart",
  "data": {
    "labels": ["Q1", "Q2", "Q3", "Q4"],
    "values": [10, 25, 40, 35],
    "title": "Заголовок графика"
  }
}

Если речь содержит просьбу показать 3D объект (дом, машина, дерево и т.д.) — заполни visual:
{
  "type": "3d",
  "data": {
    "model": "house",
    "prompt": "деревянный дом с крышей"
  }
}

Речь ведущего: ${speech}`;

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: speech }
        ],
        temperature: 0.7,
        max_tokens: 2000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
      }
    );

    let content = response.data.choices[0].message.content;
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let slideData;
    try {
      slideData = JSON.parse(content);
    } catch (e) {
      console.error('Ошибка парсинга JSON:', e);
      slideData = {
        title: "Генерация слайда",
        content: speech,
        imageUrls: [],
        keyPoints: [],
        suggestion: null,
        visual: { type: "text", data: null },
        translations: { en: speech, zh: speech, de: speech, fr: speech, es: speech }
      };
    }
    
    console.log(`✅ Слайд сгенерирован: "${slideData.title}"`);
    
    res.json({
      success: true,
      slide: slideData
    });

  } catch (error) {
    console.error("❌ Ошибка генерации слайда:", error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      slide: {
        title: "Ошибка генерации",
        content: "Не удалось сгенерировать слайд. Попробуйте ещё раз.",
        imageUrls: [],
        keyPoints: [],
        suggestion: null,
        visual: { type: "text", data: null },
        translations: {}
      }
    });
  }
});


// Запускаем сервер (HTTP + WebSocket)
server.listen(PORT, () => {
  console.log(`🚀 MIRROR backend running on port ${PORT}`);
  console.log(`📁 Generated files will be saved to: ${generatedDir}`);
  console.log(`📁 Uploads saved to: ${uploadsDir}`);
  console.log(`📁 Python scripts in: ${pythonDir}`);
  console.log(`🖼️ TripoSR URL: ${TRIPOSR_URL}`);
  console.log(`🔌 WebSocket server is running`);
});