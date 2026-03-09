#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json
import os
from ultralytics import YOLO
import cv2
import numpy as np

def photo_to_3d(image_path, output_name):
    """
    YOLO сегментация -> 3D примитив
    """
    print(f"📸 Обработка: {image_path}")
    
    # Загружаем YOLO
    model = YOLO('yolov8n-seg.pt')
    
    # Детекция
    results = model(image_path)
    
    if results[0].masks is None:
        print("❌ Объект не найден")
        return None
    
    # Берем первую маску
    mask = results[0].masks.data[0].cpu().numpy()
    img = cv2.imread(image_path)
    h, w = img.shape[:2]
    
    # Ресайз маски
    mask = cv2.resize(mask, (w, h))
    mask_uint8 = (mask * 255).astype(np.uint8)
    
    # Контур
    contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contour = max(contours, key=cv2.contourArea)
    
    # Нормализуем координаты
    points = contour.reshape(-1, 2)
    points_norm = []
    for pt in points:
        x = (pt[0] - w/2) / (w/2)
        y = -(pt[1] - h/2) / (h/2)
        points_norm.append([x, y])
    
    # Упрощаем
    if len(points_norm) > 100:
        step = len(points_norm) // 100
        points_norm = points_norm[::step]
    
    # Создаем 3D примитив (экструзия)
    depth = 0.3
    vertices = []
    n = len(points_norm)
    
    for pt in points_norm:
        vertices.append([pt[0], pt[1], depth])
    for pt in points_norm:
        vertices.append([pt[0], pt[1], -depth])
    
    # Грани
    faces = []
    for i in range(1, n-1):
        faces.append([0, i, i+1])
    for i in range(1, n-1):
        faces.append([n, n+i, n+i+1])
    for i in range(n):
        next_i = (i + 1) % n
        faces.append([i, next_i, n + i])
        faces.append([next_i, n + next_i, n + i])
    
    # Сохраняем JSON
    output_json = f"{output_name}.json"
    with open(output_json, 'w') as f:
        json.dump({
            "vertices": vertices,
            "faces": faces
        }, f)
    
    print(f"✅ JSON сохранен: {output_json}")
    print(output_json)  # Возвращаем путь

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("❌ Нужно указать путь к фото и имя выходного файла")
        sys.exit(1)
    
    photo_to_3d(sys.argv[1], sys.argv[2])