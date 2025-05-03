import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// 简单的调试API，用于查看会话数据
export async function GET() {
  try {
    // 会话数据位置
    const dataFile = path.join(process.cwd(), 'src', 'app', 'data', 'sessions.json');
    
    // 检查文件是否存在
    if (!fs.existsSync(dataFile)) {
      return NextResponse.json({
        success: false,
        message: '会话数据文件不存在',
        checkedPath: dataFile
      });
    }
    
    // 读取会话数据
    const rawData = fs.readFileSync(dataFile, 'utf8');
    const sessions = JSON.parse(rawData);
    
    return NextResponse.json({
      success: true,
      sessions,
      timestamp: new Date().toISOString(),
      currentTime: new Date().getTime()
    });
  } catch (error) {
    console.error('调试API错误:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
} 