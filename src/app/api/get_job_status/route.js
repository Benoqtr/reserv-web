import { NextResponse } from 'next/server';
import { getJobStatus } from '../services/schedulerService';

export async function POST(request) {
  try {
    const { scheduledJobId } = await request.json();

    // 输入验证
    if (!scheduledJobId) {
      return NextResponse.json({ 
        success: false, 
        message: '请求参数无效',
        info: '请求参数无效 (需要 scheduledJobId)'
      }, { status: 400 });
    }

    // 获取任务状态
    const jobStatus = getJobStatus(scheduledJobId);

    if (!jobStatus) {
      return NextResponse.json({ 
        success: false, 
        message: '未找到任务',
        info: '未找到任务，可能已完成或已取消'
      }, { status: 404 });
    }

    // 返回任务状态
    return NextResponse.json({
      success: true,
      status: 'waiting',
      info: `等待预约：${jobStatus.date} | 预约将在 ${jobStatus.formattedCountdown} 后自动进行`,
      ...jobStatus
    });

  } catch (error) {
    console.error('获取任务状态错误:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || '服务器内部错误',
      info: error.message || '服务器内部错误',
      status: 500 
    }, { status: 500 });
  }
} 