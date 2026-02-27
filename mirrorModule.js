// mirrorModule.js
import axios from "axios";

// Хранилище объектов (в памяти)
let labObjects = [];

// Системный промпт для DeepSeek
const SYSTEM_PROMPT = `
Ты — MIRROR, AI-ассистент для 3D лаборатории.
Твоя задача — помогать пользователю и управлять 3D объектами.

ПРАВИЛА:
1. Отвечай дружелюбно и по делу
2. Если пользователь просит создать/изменить/удалить объект — добавь команду
3. Если просто болтает — отвечай без команд
4. Координаты объектов всегда в формате [x, y, z] в диапазоне [-3, 3]

ФОРМАТ ОТВЕТА (всегда JSON):
{
  "reply": "текст для пользователя",
  "commands": [
    { 
      "type": "create" | "update" | "delete",
      "params": {
        // Для create: цвет, размер, позиция (опционально)
        // Для update: id, новые параметры
        // Для delete: id
      }
    }
  ]
}

Примеры:
1. Просто болтовня: { "reply": "Привет! Как дела?", "commands": [] }
2. Создать объект: { "reply": "Создаю красный куб", "commands": [{ "type": "create", "params": { "color": "red", "shape": "cube" } }] }
3. Передвинуть: { "reply": "Перемещаю объект", "commands": [{ "type": "update", "params": { "id": 123, "position": [1, 2, 3] } }] }

Запомни: ТОЛЬКО JSON, никакого другого текста!
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
          results.push({ type: 'create', ...newObj });
          break;
          
        case 'update':
          const objToUpdate = labObjects.find(o => o.id === cmd.params.id);
          if (objToUpdate) {
            Object.assign(objToUpdate, cmd.params);
            results.push({ type: 'update', ...objToUpdate });
          }
          break;
          
        case 'delete':
          const index = labObjects.findIndex(o => o.id === cmd.params.id);
          if (index !== -1) {
            const deleted = labObjects[index];
            labObjects.splice(index, 1);
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
    // Добавляем системный промпт к сообщениям
    const messagesWithSystem = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages
    ];

    // Отправляем запрос к DeepSeek
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

    // Получаем ответ AI
    const aiMessage = response.data.choices[0].message.content;
    console.log("🤖 Raw AI response:", aiMessage);

    // Парсим JSON из ответа
    let parsed;
    try {
      // Ищем JSON в ответе (на случай если AI добавит лишний текст)
      const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiMessage);
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      // Fallback: возвращаем текст как есть
      return {
        reply: aiMessage,
        commands: []
      };
    }

    // Выполняем команды только в режиме лаборатории
    const executedCommands = labMode ? executeCommands(parsed.commands || []) : [];

    // Возвращаем результат
    return {
      reply: parsed.reply || "Готово!",
      commands: executedCommands,
      objects: labObjects // Отправляем текущее состояние всех объектов
    };

  } catch (error) {
    console.error("Mirror module error:", error.response?.data || error.message);
    throw error;
  }
}

// Функция для получения всех объектов (можно добавить эндпоинт)
export function getObjects() {
  return labObjects;
}

// Функция для очистки (для тестов)
export function clearObjects() {
  labObjects = [];
}