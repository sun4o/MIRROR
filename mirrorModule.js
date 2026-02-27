// mirrorModule.js
import fs from "fs";

// Структура для хранения объектов в памяти (или можно подключить базу)
let labObjects = [];

// Системный промпт, чтобы бот понимал, что он MIRROR
const SYSTEM_PROMPT = `
Ты — MIRROR, лабораторный AI-ассистент. 
Твоя задача:
1) Отвечать на запросы пользователя голосом и текстом.
2) Создавать новые объекты в лаборатории только по явной команде "создай объект".
3) Изменять существующие объекты только в лаборатории и только по команде пользователя.
4) Всегда возвращать фронту JSON:
   {
      "reply": "текст для пользователя",
      "commands": [
         { "type": "create", "id": 123, "position": [x,y,z] },
         { "type": "update", "id": 456, "position": [x,y,z] }
      ]
   }
`;

function randomPosition(radius = 2.5) {
  const angle1 = Math.random() * Math.PI * 2;
  const angle2 = Math.random() * Math.PI;
  const x = Math.sin(angle2) * Math.cos(angle1) * radius;
  const y = Math.sin(angle2) * Math.sin(angle1) * radius;
  const z = Math.cos(angle2) * radius;
  return [x, y, z];
}

export async function processMessage(userMessage) {
  try {
    // 🔹 Определяем команды
    const lower = userMessage.content.toLowerCase();
    const commands = [];

    if (lower.includes("создай объект") || lower.includes("create object")) {
      const newObj = { id: Date.now(), position: randomPosition() };
      labObjects.push(newObj);
      commands.push({ type: "create", ...newObj });
    }

    // Можно добавить редактирование объектов
    if (lower.includes("изменить объект") || lower.includes("update object")) {
      // Пример: меняем позицию последнего объекта
      if (labObjects.length > 0) {
        const obj = labObjects[labObjects.length - 1];
        obj.position = randomPosition();
        commands.push({ type: "update", ...obj });
      }
    }

    // 🔹 Формируем текстовый ответ
    let replyText = "Команды выполнены.";
    if (commands.length === 0) replyText = "Принято. Никаких изменений не требуется.";

    return { reply: replyText, commands };
  } catch (err) {
    console.error("Mirror module error:", err);
    return { reply: "Ошибка MIRROR: не удалось обработать команду.", commands: [] };
  }
}