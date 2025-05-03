import { NextResponse } from 'next/server';
import { scheduleReservationTask } from '../services/schedulerService';
import { createBeijingDate, toBeijingISOString, formatLocalDateTime } from '../../utils/dateUtils';

// 计算预约时间
function calculateReservationTime(targetDate) {
  // 将目标日期转换为前一天的上午10点
  const reservationDate = new Date(targetDate);
  reservationDate.setDate(reservationDate.getDate() - 1);
  reservationDate.setHours(10, 0, 0, 0);
  return reservationDate;
}

export async function POST(request) {
  try {
    const { phpSessionId, date: rawDate, slots: rawSlots } = await request.json();

    console.log('延迟预约请求参数:', { phpSessionId: '***隐藏***', date: rawDate, slots: rawSlots });

    // 输入验证
    if (!phpSessionId || !rawDate || !rawSlots || !Array.isArray(rawSlots) || rawSlots.length === 0 || rawSlots.length > 2) {
      return NextResponse.json({ 
        success: false, 
        message: '请求参数无效',
        info: '请求参数无效 (需要 phpSessionId, date, slots[1或2项])'
      }, { status: 400 });
    }

    // 格式化日期
    let formattedDate = String(rawDate);
    if (formattedDate.includes('-')) formattedDate = formattedDate.replace(/-/g, '');
    if (!/^\d{8}$/.test(formattedDate)) {
      return NextResponse.json({ 
        success: false, 
        message: '日期格式无效',
        info: '日期格式无效 (应为 YYYY-MM-DD 或 YYYYMMDD)' 
      }, { status: 400 });
    }

    // 计算预约时间
    const targetDate = new Date(
      formattedDate.substring(0, 4),
      parseInt(formattedDate.substring(4, 6)) - 1,
      formattedDate.substring(6, 8)
    );
    
    console.log('解析的目标日期:', toBeijingISOString(targetDate));
    
    const reservationTime = calculateReservationTime(targetDate);
    console.log('计算的预约时间:', toBeijingISOString(reservationTime));
    
    const now = createBeijingDate();
    const timeUntilReservation = reservationTime.getTime() - now.getTime();
    console.log('距离预约时间(毫秒):', timeUntilReservation);
    console.log('北京当前时间:', formatLocalDateTime(now));
    console.log('北京预约时间:', formatLocalDateTime(reservationTime));

    // 构建时间段显示
    const timeSlots = rawSlots.map(slotId => {
      const timeId = String(slotId).slice(-2);
      const slotMap = {
        "01": "08:00-09:00", "02": "09:00-10:00", "03": "10:00-11:00",
        "04": "11:00-12:00", "05": "11:30-12:30", "06": "12:00-13:00",
        "07": "13:00-14:00", "08": "14:00-15:00", "09": "15:00-16:00",
        "10": "16:00-17:00", "11": "17:00-18:00", "12": "18:00-19:00",
        "13": "19:00-20:00", "14": "20:00-21:00", "15": "21:00-22:00"
      };
      return slotMap[timeId] || `未知时段(${slotId})`;
    }).join(', ');

    // 计算倒计时显示
    const days = Math.floor(timeUntilReservation / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeUntilReservation % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeUntilReservation % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeUntilReservation % (1000 * 60)) / 1000);

    // 使用调度服务安排任务
    const jobId = scheduleReservationTask(
      phpSessionId,
      toBeijingISOString(reservationTime),
      rawDate,
      rawSlots
    );
    
    console.log('创建的调度任务ID:', jobId);

    const response = {
      success: true,
      status: 'waiting',
      info: `等待预约：${rawDate} ${timeSlots}\n预约将在 ${days}天${hours}小时${minutes}分钟${seconds}秒 后自动进行`,
      scheduledTime: toBeijingISOString(reservationTime),
      targetDate: rawDate,
      timeSlots: rawSlots,
      scheduledJobId: jobId
    };
    
    console.log('延迟预约响应:', {
      ...response,
      scheduledTimeMs: reservationTime.getTime(),
      currentTimeMs: now.getTime()
    });

    return NextResponse.json(response);

  } catch (error) {
    console.error('延迟预约API错误:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || '服务器内部错误',
      info: error.message || '服务器内部错误',
      status: 500 
    }, { status: 500 });
  }
} 