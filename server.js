import fs from 'fs';
import path from 'path';

// ============= НОВЫЙ ЭНДПОИНТ ДЛЯ ГЕНЕРАЦИИ КОДА =============
app.post('/generate-code', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    console.log(`🤖 DeepSeek генерирует код для: "${prompt}"`);

    // Запрос к DeepSeek
    const response = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { 
            role: 'system', 
            content: `ТЫ — ГЕНЕРАТОР 3D ОБЪЕКТОВ. Создай ПОЛНОЦЕННЫЙ JavaScript файл.

ТРЕБОВАНИЯ:
1. Файл должен экспортировать функцию create_${prompt.replace(/\s+/g, '_')}(THREE)
2. Используй текстуры (Canvas или dataURI)
3. Добавь анимацию (функция update)
4. Добавь физику (гравитация, столкновения)
5. Минимум 5-10 частей
6. Подробные комментарии

ВЕРНИ ТОЛЬКО КОД, БЕЗ ПОЯСНЕНИЙ.` 
          },
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

    const code = response.data.choices[0].message.content;
    
    // Создаём имя файла
    const filename = `${prompt.replace(/\s+/g, '_')}_${Date.now()}.js`;
    const filePath = path.join('./generated', filename);
    
    // Сохраняем файл
    fs.writeFileSync(filePath, code);
    
    console.log(`✅ Файл сохранён: ${filename}`);

    res.json({ 
      success: true, 
      filename,
      code,
      message: `Файл ${filename} создан и сохранён на сервере`
    });

  } catch (error) {
    console.error("❌ Ошибка:", error);
    res.status(500).json({ error: error.message });
  }
});