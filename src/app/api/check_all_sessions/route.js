import { NextResponse } from 'next/server';
import { checkAllSessions } from '../services/schedulerService';

export async function POST() {
  try {
    // 调用调度器服务中的会话检查函数
    await checkAllSessions();
    
    return NextResponse.json({
      success: true,
      message: '所有会话检查已开始'
    });
  } catch (error) {
    console.error('触发会话检查失败:', error);
    return NextResponse.json({
      success: false,
      message: '触发会话检查失败'
    }, { status: 500 });
  }
} 