#!/usr/bin/env python3
"""
生成测试图像用于 Agentic Visual Search 自测

Sprint: S5-A6
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_small_text_image():
    """生成包含小字的图像（模拟错误码）"""
    img = Image.new('RGB', (1920, 1080), color='#1a1a2e')
    draw = ImageDraw.Draw(img)

    # 背景内容（大文字）
    try:
        large_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 48)
        small_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 12)
    except:
        large_font = ImageFont.load_default()
        small_font = ImageFont.load_default()

    # 主要区域（大文字）
    draw.text((100, 100), "Application Dashboard", fill='#eee', font=large_font)
    draw.text((100, 200), "Status: Running", fill='#4ecdc4', font=large_font)

    # 右下角小字（难以阅读的错误码）
    draw.rectangle([1600, 900, 1900, 1050], fill='#16213e', outline='#4ecdc4')
    draw.text((1620, 920), "Error Details:", fill='#ff6b6b', font=small_font)
    draw.text((1620, 950), "Code: ECONNREFUSED", fill='#eee', font=small_font)
    draw.text((1620, 980), "Port: 8080", fill='#eee', font=small_font)
    draw.text((1620, 1010), "Time: 2024-01-15 14:32:07", fill='#aaa', font=small_font)

    return img

def create_dense_ui_image():
    """生成密集UI图像（模拟复杂控制面板）"""
    img = Image.new('RGB', (1200, 800), color='#f5f5f5')
    draw = ImageDraw.Draw(img)

    # 工具栏
    colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f7dc6f', '#bb8fce']
    for i in range(15):
        x = 20 + (i % 10) * 110
        y = 20 + (i // 10) * 50
        draw.rectangle([x, y, x+100, y+40], fill=colors[i % len(colors)])
        draw.text((x+10, y+12), f"Btn{i+1}", fill='white')

    # 侧边栏
    for i in range(20):
        y = 150 + i * 30
        draw.rectangle([20, y, 150, y+25], fill='#ddd', outline='#999')
        draw.text((30, y+5), f"Menu Item {i+1}", fill='#333')

    # 主内容区 - 网格
    for row in range(4):
        for col in range(5):
            x = 180 + col * 200
            y = 150 + row * 150
            draw.rectangle([x, y, x+180, y+130], fill='white', outline='#ccc')
            draw.rectangle([x, y, x+180, y+30], fill='#4a5568')
            draw.text((x+10, y+8), f"Card {row*5+col+1}", fill='white')

    return img

def create_grid_data_image():
    """生成表格数据图像"""
    img = Image.new('RGB', (800, 600), color='white')
    draw = ImageDraw.Draw(img)

    # 表格
    headers = ['ID', 'Name', 'Status', 'Score']
    data = [
        ['001', 'Item A', 'Active', '95'],
        ['002', 'Item B', 'Pending', '82'],
        ['003', 'Item C', 'Failed', '45'],
        ['004', 'Item D', 'Active', '91'],
    ]

    cell_w, cell_h = 180, 50
    start_x, start_y = 50, 50

    # 表头
    for i, h in enumerate(headers):
        x = start_x + i * cell_w
        draw.rectangle([x, start_y, x+cell_w, start_y+cell_h], fill='#4a5568')
        draw.text((x+10, start_y+15), h, fill='white')

    # 数据
    for row_idx, row in enumerate(data):
        for col_idx, cell in enumerate(row):
            x = start_x + col_idx * cell_w
            y = start_y + (row_idx + 1) * cell_h
            bg_color = '#f7fafc' if row_idx % 2 == 0 else 'white'
            draw.rectangle([x, y, x+cell_w, y+cell_h], fill=bg_color, outline='#e2e8f0')
            draw.text((x+10, y+15), cell, fill='#2d3748')

    return img

def create_chart_image():
    """生成简单图表图像"""
    img = Image.new('RGB', (600, 400), color='white')
    draw = ImageDraw.Draw(img)

    # 柱状图数据
    data = [120, 200, 150, 80, 250, 180]
    labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
    colors_bars = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f7dc6f', '#bb8fce', '#85c1e2']

    max_h = 300
    bar_w = 60
    gap = 20
    start_x = 50
    base_y = 350

    for i, (val, label, color) in enumerate(zip(data, labels, colors_bars)):
        x = start_x + i * (bar_w + gap)
        h = (val / max(data)) * max_h
        draw.rectangle([x, base_y - h, x + bar_w, base_y], fill=color)
        draw.text((x + 15, base_y + 10), label, fill='#333')
        draw.text((x + 10, base_y - h - 20), str(val), fill='#333')

    # 标题
    draw.text((200, 20), "Monthly Sales Chart", fill='#333')

    return img

def create_corner_element_image():
    """生成角落元素图像（测试精确定位）"""
    img = Image.new('RGB', (1600, 900), color='#2d3748')
    draw = ImageDraw.Draw(img)

    # 中央内容
    draw.rectangle([400, 200, 1200, 700], fill='#4a5568')
    draw.text((700, 400), "Main Content Area", fill='white')

    # 四个角落的小元素
    corners = [
        (20, 20, 'top-left'),
        (1500, 20, 'top-right'),
        (20, 840, 'bottom-left'),
        (1420, 840, 'bottom-right'),
    ]

    for x, y, name in corners:
        draw.rectangle([x, y, x+160, y+40], fill='#e53e3e')
        draw.text((x+10, y+12), name, fill='white')

    return img

def main():
    """生成所有测试图像"""
    output_dir = os.path.dirname(os.path.abspath(__file__))

    images = {
        'small_text.png': create_small_text_image,
        'dense_ui.png': create_dense_ui_image,
        'grid_data.png': create_grid_data_image,
        'chart.png': create_chart_image,
        'corner_elements.png': create_corner_element_image,
    }

    for filename, func in images.items():
        img = func()
        path = os.path.join(output_dir, filename)
        img.save(path, 'PNG')
        print(f"✓ Generated: {path}")

    print(f"\n共生成 {len(images)} 个测试图像")

if __name__ == '__main__':
    main()
