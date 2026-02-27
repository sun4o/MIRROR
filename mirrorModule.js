// mirrorModule.js
import axios from "axios";

// Хранилище объектов (в памяти)
let labObjects = [];

// Системный промпт для DeepSeek
const SYSTEM_PROMPT = `
Ты — MIRROR, AI-ассистент для 3D лаборатории.

ВАЖНЫЕ ПРАВИЛА:
1. Всегда используй РЕАЛЬНЫЕ ID объектов, которые я тебе передаю в контексте
2. Если не знаешь ID — не предлагай update/delete
3. Для новых объектов ID не нужен — создастся автоматически
4. Координаты в формате [x, y, z] от -3 до 3

ФОРМАТ ОТВЕТА (только JSON, никакого другого текста):
{
  "reply": "текст пользователю",
  "commands": [
    { 
      "type": "create", 
      "params": { "shape": "sphere", "color": "#00ffff", "size": 0.5 }
    },
    { 
      "type": "update", 
      "params": { "id": 123456789, "color": "#ff0000" }
    },
    { 
      "type": "delete", 
      "params": { "id": 123456789 }
    }
  ]
}

Примеры:
1. Создать объект: { "reply": "Создаю красный куб", "commands": [{ "type": "create", "params": { "shape": "cube", "color": "red" } }] }
2. Обновить цвет: { "reply": "Меняю цвет на синий", "commands": [{ "type": "update", "params": { "id": 1772231404457.8867, "color": "blue" } }] }
3. Удалить объект: { "reply": "Удаляю объект", "commands": [{ "type": "delete", "params": { "id": 1772231404457.8867 } }] }
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
            position: randomPosition(),
            ...cmd.params
          };
          labObjects.push(newObj);
          console.log(`✅ Создан объект с ID: ${newObj.id}`);
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
            const deleted = labObjects[index];
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
            position: o.position,
            size: o.size
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
        temperature: 0.7,
        max_tokens: 500
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