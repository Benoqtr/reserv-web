import { NextResponse } from 'next/server';
import { cancelReservationTask } from '../services/schedulerService';
import fs from 'fs';
import path from 'path';

// 获取会话数据
function getSessionData(sessionId) {
  try {
    const sessionsFilePath = path.join(process.cwd(), 'src/app/data/sessions.json');
    const sessionsData = JSON.parse(fs.readFileSync(sessionsFilePath, 'utf8'));
    return sessionsData.find(session => session.id === sessionId);
  } catch (error) {
    console.error('读取会话数据失败:', error);
    return null;
  }
}

// 清除会话中的调度任务信息
async function clearSessionScheduledTask(phpSessionId) {
  try {
    await fetch(`http://localhost:3000/api/sessions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: phpSessionId,
        reserveStatus: null,
        reserveInfo: null,
        scheduledJobId: null,
        scheduledTime: null
      })
    });
    return true;
  } catch (error) {
    console.error('清除会话调度任务失败:', error);
    return false;
  }
}

export async function POST(request) {
  try {
    const { phpSessionId, scheduledJobId } = await request.json();

    // 输入验证
    if (!phpSessionId || !scheduledJobId) {
      return NextResponse.json({ 
        success: false, 
        message: '请求参数无效',
        info: '请求参数无效 (需要 phpSessionId, scheduledJobId)'
      }, { status: 400 });
    }

    // 获取会话数据
    const sessionData = getSessionData(phpSessionId);
    
    // 取消调度任务
    const cancelled = cancelReservationTask(scheduledJobId);

    if (!cancelled) {
      // 即使任务不存在，如果会话中存在这个调度任务ID，也清除它
      if (sessionData && sessionData.scheduledJobId === scheduledJobId) {
        console.log(`任务不存在但会话中有记录，清除会话中的任务信息: [${scheduledJobId}]`);
        await clearSessionScheduledTask(phpSessionId);
        
        return NextResponse.json({
          success: true,
          info: '预约已取消 (任务已不存在，已清理会话数据)'
        });
      }
      
      return NextResponse.json({ 
        success: false, 
        message: '取消预约失败：未找到调度任务',
        info: '取消预约失败：未找到调度任务'
      }, { status: 404 });
    }

    // 更新会话状态
    await clearSessionScheduledTask(phpSessionId);

    return NextResponse.json({
      success: true,
      info: '预约已取消'
    });

  } catch (error) {
    console.error('取消延迟预约错误:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || '服务器内部错误',
      info: error.message || '服务器内部错误',
      status: 500 
    }, { status: 500 });
  }
} 