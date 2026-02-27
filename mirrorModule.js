// mirrorModule.js
import axios from "axios";

// Хранилище объектов (в памяти)
let labObjects = [];

// Системный промпт для DeepSeek - РАСШИРЕННАЯ ВЕРСИЯ
const SYSTEM_PROMPT = `
Ты — MIRROR, AI-ассистент для 3D лаборатории с ПОЛНОЙ СВОБОДОЙ генерации.

🎨 ТВОРЧЕСКИЕ ВОЗМОЖНОСТИ:
Ты можешь создавать ЛЮБЫЕ объекты, которые пользователь попросит:
- Животные (кот, собака, дракон, птица)
- Растения (дерево, цветок, кактус)
- Предметы (меч, машина, дом, чашка)
- Абстракции (спираль, волна, кристалл)
- Фантастика (инопланетянин, НЛО, портал)
- Еда (банан, пицца, бургер, мороженое)
- Люди (человек, робот, скелет)
- Геометрия (любые комбинации)

📐 ПАРАМЕТРЫ ОБЪЕКТА (строго этот формат):
{
  "reply": "текст для пользователя",
  "commands": [
    { 
      "type": "create" | "update" | "delete",
      "params": {
        "shape": "compound",  // compound - для сложных объектов, или базовые: sphere/cube/cylinder/cone/torus
        "color": "#RRGGBB",   // любой цвет
        "size": 0.5,          // от 0.1 до 2
        "position": [x, y, z], // опционально
        "parts": [            // для сложных объектов - составные части
          {
            "shape": "sphere",
            "color": "#FF0000",
            "scale": [0.3, 0.3, 0.3],
            "position": [0, 0.5, 0],
            "rotation": [0, 0, 0]
          }
        ],
        "animation": {        // опционально
          "type": "rotate" | "bounce" | "pulse" | "none",
          "speed": 1
        }
      }
    }
  ]
}

ПРИМЕРЫ:

1. Банан:
{
  "reply": "Создаю реалистичный банан",
  "commands": [{
    "type": "create",
    "params": {
      "shape": "compound",
      "color": "#FFE135",
      "size": 0.8,
      "parts": [
        { "shape": "torus", "scale": [0.5, 0.2, 0.2], "rotation": [0, 0, 0.5], "color": "#FFE135" },
        { "shape": "sphere", "scale": [0.2, 0.3, 0.2], "position": [0.4, 0, 0], "color": "#FFE135" },
        { "shape": "cylinder", "scale": [0.1, 0.2, 0.1], "position": [-0.4, 0, 0], "color": "#8B4513" }
      ],
      "animation": { "type": "rotate", "speed": 0.3 }
    }
  }]
}

2. Дом:
{
  "reply": "Строю уютный домик",
  "commands": [{
    "type": "create",
    "params": {
      "shape": "compound",
      "color": "#8B4513",
      "size": 1,
      "parts": [
        { "shape": "cube", "scale": [0.8, 0.6, 0.8], "color": "#A0522D", "position": [0, 0, 0] },
        { "shape": "cone", "scale": [0.6, 0.4, 0.6], "color": "#B22222", "position": [0, 0.5, 0] },
        { "shape": "cube", "scale": [0.2, 0.3, 0.1], "color": "#8B4513", "position": [0, -0.2, 0.4] }
      ]
    }
  }]
}

3. Дракон:
{
  "reply": "Призываю дракона! 🐉",
  "commands": [{
    "type": "create",
    "params": {
      "shape": "compound",
      "color": "#DC143C",
      "size": 1.2,
      "parts": [
        { "shape": "sphere", "scale": [0.4, 0.3, 0.4], "position": [0, 0, 0], "color": "#DC143C" },
        { "shape": "cone", "scale": [0.2, 0.3, 0.2], "position": [0.3, 0.1, 0], "color": "#DC143C" },
        { "shape": "cone", "scale": [0.2, 0.3, 0.2], "position": [-0.3, 0.1, 0], "color": "#DC143C" },
        { "shape": "cylinder", "scale": [0.1, 0.5, 0.1], "position": [0, -0.3, 0.2], "color": "#DC143C" },
        { "shape": "cylinder", "scale": [0.1, 0.5, 0.1], "position": [0, -0.3, -0.2], "color": "#DC143C" },
        { "shape": "cone", "scale": [0.3, 0.4, 0.2], "position": [0, 0.4, 0.2], "color": "#DC143C" }
      ],
      "animation": { "type": "rotate", "speed": 0.5 }
    }
  }]
}

4. Машина:
{
  "reply": "Создаю спортивную машину",
  "commands": [{
    "type": "create",
    "params": {
      "shape": "compound",
      "color": "#FF4500",
      "size": 1,
      "parts": [
        { "shape": "cube", "scale": [0.8, 0.2, 0.4], "position": [0, 0, 0], "color": "#FF4500" },
        { "shape": "cube", "scale": [0.3, 0.15, 0.2], "position": [0.2, 0.15, 0], "color": "#87CEEB" },
        { "shape": "cylinder", "scale": [0.15, 0.1, 0.15], "position": [-0.3, -0.15, 0.2], "color": "#333333" },
        { "shape": "cylinder", "scale": [0.15, 0.1, 0.15], "position": [0.3, -0.15, 0.2], "color": "#333333" },
        { "shape": "cylinder", "scale": [0.15, 0.1, 0.15], "position": [-0.3, -0.15, -0.2], "color": "#333333" },
        { "shape": "cylinder", "scale": [0.15, 0.1, 0.15], "position": [0.3, -0.15, -0.2], "color": "#333333" }
      ]
    }
  }]
}

5. Цветок:
{
  "reply": "Создаю красивый цветок",
  "commands": [{
    "type": "create",
    "params": {
      "shape": "compound",
      "color": "#FF69B4",
      "size": 0.7,
      "parts": [
        { "shape": "cylinder", "scale": [0.1, 0.5, 0.1], "position": [0, -0.2, 0], "color": "#228B22" },
        { "shape": "sphere", "scale": [0.2, 0.2, 0.2], "position": [0, 0.15, 0], "color": "#FFD700" },
        { "shape": "cone", "scale": [0.2, 0.1, 0.1], "position": [0.2, 0.1, 0], "color": "#FF69B4" },
        { "shape": "cone", "scale": [0.2, 0.1, 0.1], "position": [-0.2, 0.1, 0], "color": "#FF69B4" },
        { "shape": "cone", "scale": [0.2, 0.1, 0.1], "position": [0, 0.1, 0.2], "color": "#FF69B4" },
        { "shape": "cone", "scale": [0.2, 0.1, 0.1], "position": [0, 0.1, -0.2], "color": "#FF69B4" }
      ]
    }
  }]
}

ВАЖНО: Ты НЕ ОГРАНИЧЕН ничем! Любая форма, любой объект.
Используй свою фантазию на 100%!
`;

function randomPosition(radius = 2.5) {
  const angle1 = Math.random() * Math.PI * 2;
  const angle2 = Math.random() * Math.PI;
  const x = Math.sin(angle2) * Math.cos(angle1) * radius;
  const y = Math.sin(angle2) * Math.sin(angle1) * radius;
  const z = Math.cos(angle2) * radius;
  return [x, y, z];
}

// Выполнение команд над объектами
function executeCommands(commands) {
  const results = [];
  
  commands.forEach(cmd => {
    try {
      switch (cmd.type) {
        case 'create':
          const newObj = {
            id: Date.now() + Math.random(),
            position: cmd.params.position || randomPosition(),
            ...cmd.params
          };
          labObjects.push(newObj);
          console.log(`✅ Создан объект с ID: ${newObj.id}, форма: ${newObj.shape}`);
          results.push({ type: 'create', ...newObj });
          break;
          
        case 'update':
          const objToUpdate = labObjects.find(o => o.id === cmd.params.id);
          if (objToUpdate) {
            Object.assign(objToUpdate, cmd.params);
            console.log(`✅ Обновлен объект ID: ${cmd.params.id}`);
            results.push({ type: 'update', ...objToUpdate });
          } else {
            console.log(`❌ Объект с ID ${cmd.params.id} не найден!`);
          }
          break;
          
        case 'delete':
          const index = labObjects.findIndex(o => o.id === cmd.params.id);
          if (index !== -1) {
            labObjects.splice(index, 1);
            console.log(`✅ Удален объект ID: ${cmd.params.id}`);
            results.push({ type: 'delete', id: cmd.params.id });
          }
          break;
      }
    } catch (e) {
      console.error('Command execution error:', e);
    }
  });
  
  return results;
}

export async function processMessage(messages, labMode = false) {
  try {
    console.log("🔵 ===== НОВЫЙ ЗАПРОС =====");
    console.log("📨 Сообщение:", messages[messages.length - 1]?.content);
    console.log("🔬 Lab mode:", labMode);
    console.log("📦 Текущие объекты:", JSON.stringify(labObjects, null, 2));

    // Создаем контекст с текущими объектами
    const objectsContext = labObjects.length > 0 
      ? `\n\nТекущие объекты в лаборатории (используй эти ID для update/delete):\n${
          JSON.stringify(labObjects.map(o => ({
            id: o.id,
            shape: o.shape,
            color: o.color,
            position: o.position
          })), null, 2)
        }`
      : '\n\nВ лаборатории пока нет объектов. Создай первый объект по запросу пользователя.';

    // Проверка на "последний объект" в запросе
    const lastMessage = messages[messages.length - 1]?.content.toLowerCase() || '';
    if (labObjects.length > 0 && (lastMessage.includes('последний') || lastMessage.includes('этот'))) {
      const lastObj = labObjects[labObjects.length - 1];
      messages[messages.length - 1].content += ` (ID последнего объекта: ${lastObj.id})`;
      console.log(`🆔 Добавлен ID последнего объекта: ${lastObj.id}`);
    }

    const messagesWithSystem = [
      { 
        role: "system", 
        content: SYSTEM_PROMPT + objectsContext
      },
      ...messages
    ];

    console.log("🟡 Отправляю запрос в DeepSeek...");
    const response = await axios.post(
      "https://api.deepseek.com/chat/completions",
      {
        model: "deepseek-chat",
        messages: messagesWithSystem,
        temperature: 0.8, // Повысим креативность
        max_tokens: 1000
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
      }
    );

    const aiMessage = response.data.choices[0].message.content;
    console.log("🤖 Сырой ответ DeepSeek:", aiMessage);

    let parsed;
    try {
      const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiMessage);
      console.log("✅ Распарсенный JSON:", JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.error("❌ Ошибка парсинга JSON:", e);
      return {
        reply: aiMessage,
        commands: [],
        objects: labObjects
      };
    }

    console.log("🟢 Выполняю команды в режиме лаборатории:", labMode);
    const executedCommands = labMode ? executeCommands(parsed.commands || []) : [];
    console.log("✅ Выполненные команды:", JSON.stringify(executedCommands, null, 2));
    console.log("📦 Объекты после выполнения:", JSON.stringify(labObjects, null, 2));

    const result = {
      reply: parsed.reply || "Готово!",
      commands: executedCommands,
      objects: labObjects
    };
    console.log("📤 Отправляю на фронт:", JSON.stringify(result, null, 2));
    console.log("🔵 ===== КОНЕЦ ЗАПРОСА =====\n");
    
    return result;

  } catch (error) {
    console.error("❌ Mirror module error:", error.response?.data || error.message);
    throw error;
  }
}

export function getObjects() {
  return labObjects;
}

export function clearObjects() {
  labObjects = [];
}