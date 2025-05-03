// 简单的内存任务调度器
// 注意：这是一个内存中的调度器，服务器重启后会丢失所有任务
// 生产环境应使用持久化存储和专业的调度系统

import { scheduleJob, cancelJob } from 'node-schedule';
import fs from 'fs';
import path from 'path';
import { createBeijingDate, toBeijingISOString, parseBeijingISOString, formatLocalDateTime } from '../../utils/dateUtils';

// 存储所有活跃的任务
const activeJobs = new Map();

// 任务持久化文件路径
const TASKS_FILE_PATH = path.join(process.cwd(), 'src/app/data/scheduled_tasks.json');

// 保存任务到文件
function saveTasksToFile() {
  try {
    const tasks = Array.from(activeJobs.entries()).map(([id, job]) => ({
      id,
      phpSessionId: job.phpSessionId,
      scheduledTime: toBeijingISOString(job.scheduledTime),
      date: job.date,
      slots: job.slots
    }));
    
    fs.writeFileSync(TASKS_FILE_PATH, JSON.stringify(tasks, null, 2));
    console.log('任务数据已保存到文件');
  } catch (error) {
    console.error('保存任务数据失败:', error);
  }
}

// 从文件加载任务
function loadTasksFromFile() {
  try {
    if (!fs.existsSync(TASKS_FILE_PATH)) {
      fs.writeFileSync(TASKS_FILE_PATH, JSON.stringify([], null, 2));
      return;
    }
    
    const data = fs.readFileSync(TASKS_FILE_PATH, 'utf8');
    const tasks = JSON.parse(data);
    
    tasks.forEach(task => {
      const scheduledDate = parseBeijingISOString(task.scheduledTime);
      const now = createBeijingDate();
      
      // 只恢复未过期的任务
      if (scheduledDate > now) {
        scheduleReservationTask(
          task.phpSessionId,
          task.scheduledTime,
          task.date,
          task.slots,
          task.id // 保持原有任务ID
        );
      } else {
        console.log(`跳过已过期任务 [${task.id}]`);
      }
    });
    
    console.log(`从文件恢复了 ${activeJobs.size} 个任务`);
  } catch (error) {
    console.error('加载任务数据失败:', error);
  }
}

// 执行预约的函数
async function executeReservation(jobId, phpSessionId, date, slots) {
  console.log(`执行预约任务 [${jobId}]: ${date}, 时间段: ${slots.join(',')}`);
  
  try {
    // 调用预约API
    const reserveResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phpSessionId,
        date,
        slots
      })
    });
    
    const result = await reserveResponse.json();
    
    // 更新会话状态
    await updateSessionAfterReservation(jobId, phpSessionId, result);
    
    return result;
  } catch (error) {
    console.error(`预约任务执行失败 [${jobId}]:`, error);
    
    // 更新会话状态为失败
    await updateSessionWithError(jobId, phpSessionId, error.message || '自动预约失败');
    
    throw error;
  } finally {
    // 无论成功失败都从活跃任务中移除
    activeJobs.delete(jobId);
    // 更新持久化存储
    saveTasksToFile();
  }
}

// 更新会话状态（成功）
async function updateSessionAfterReservation(jobId, phpSessionId, result) {
  try {
    // 如果预约成功，更新会话状态为已预约
    if (result.success) {
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/sessions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: phpSessionId,
          reserveStatus: 'reserved',
          reserveInfo: result.info || '预约成功',
          scheduledJobId: null // 清除任务ID
        })
      });
      console.log(`会话状态已更新为已预约 [${jobId}]`);
    } else {
      // 预约失败但请求成功
      await updateSessionWithError(jobId, phpSessionId, result.message || '预约失败');
    }
  } catch (error) {
    console.error(`更新会话状态失败 [${jobId}]:`, error);
  }
}

// 更新会话状态（失败）
async function updateSessionWithError(jobId, phpSessionId, errorMessage) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/sessions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: phpSessionId,
        reserveStatus: null, // 重置预约状态
        reserveInfo: `自动预约失败: ${errorMessage}`,
        scheduledJobId: null // 清除任务ID
      })
    });
    console.log(`会话状态已更新为预约失败 [${jobId}]: ${errorMessage}`);
  } catch (error) {
    console.error(`更新会话失败状态出错 [${jobId}]:`, error);
  }
}

// 自动检查所有PHP会话有效性的函数
export async function checkAllSessions() {
  console.log('执行所有会话有效性检查');
  
  try {
    // 读取会话列表
    const sessionsResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/sessions`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!sessionsResponse.ok) {
      throw new Error(`获取会话列表失败: ${sessionsResponse.status}`);
    }
    
    const sessions = await sessionsResponse.json();
    console.log(`共找到 ${sessions.length} 个会话需要检查`);
    
    // 为每个会话执行检查
    for (const session of sessions) {
      try {
        console.log(`检查会话: ${session.id} (${session.description || '无描述'})`);
        
        const checkResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/check_php_session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phpSessionId: session.id })
        });
        
        if (!checkResponse.ok) {
          console.error(`检查会话 ${session.id} 请求失败: ${checkResponse.status}`);
          continue;
        }
        
        const checkResult = await checkResponse.json();
        
        // 更新会话状态
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/sessions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: session.id,
            isValid: checkResult.success
          })
        });
        
        console.log(`会话 ${session.id} 状态: ${checkResult.success ? '有效' : '无效'} (${checkResult.message || '无消息'})`);
      } catch (sessionError) {
        console.error(`检查会话 ${session.id} 时出错:`, sessionError);
      }
    }
    
    console.log('所有会话检查完成');
  } catch (error) {
    console.error('检查所有会话失败:', error);
  }
}

// 调度新任务
export function scheduleReservationTask(phpSessionId, scheduledTime, date, slots, existingJobId = null) {
  // 生成唯一任务ID或使用现有ID
  const jobId = existingJobId || `reserve_${phpSessionId}_${Date.now()}`;
  
  // 解析调度时间
  const scheduledDate = parseBeijingISOString(scheduledTime);
  
  console.log(`调度新预约任务 [${jobId}]: ${formatLocalDateTime(scheduledDate)}, 场地日期: ${date}`);
  
  // 创建调度任务
  const job = scheduleJob(jobId, scheduledDate, () => {
    executeReservation(jobId, phpSessionId, date, slots)
      .then(result => {
        console.log(`预约任务完成 [${jobId}]:`, result.success ? '成功' : '失败');
      })
      .catch(error => {
        console.error(`预约任务异常 [${jobId}]:`, error);
      });
  });
  
  // 存储任务信息
  activeJobs.set(jobId, {
    id: jobId,
    phpSessionId,
    scheduledTime: scheduledDate,
    date,
    slots,
    job
  });
  
  // 保存到文件
  saveTasksToFile();
  
  return jobId;
}

// 取消任务
export function cancelReservationTask(jobId) {
  if (!activeJobs.has(jobId)) {
    console.warn(`取消预约任务失败: 未找到任务 [${jobId}]`);
    return false;
  }
  
  const job = activeJobs.get(jobId);
  
  // 取消调度任务
  cancelJob(job.job);
  
  // 从活跃任务中移除
  activeJobs.delete(jobId);
  
  // 更新持久化存储
  saveTasksToFile();
  
  console.log(`预约任务已取消 [${jobId}]`);
  return true;
}

// 获取所有活跃任务
export function getAllActiveJobs() {
  return Array.from(activeJobs.values()).map(job => ({
    id: job.id,
    phpSessionId: job.phpSessionId,
    scheduledTime: job.scheduledTime,
    date: job.date,
    slots: job.slots
  }));
}

// 获取特定会话ID的任务
export function getSessionJobs(phpSessionId) {
  return Array.from(activeJobs.values())
    .filter(job => job.phpSessionId === phpSessionId)
    .map(job => ({
      id: job.id,
      scheduledTime: job.scheduledTime,
      date: job.date,
      slots: job.slots
    }));
}

// 获取任务的剩余时间（毫秒）
export function getTimeUntilExecution(jobId) {
  if (!activeJobs.has(jobId)) {
    return -1;
  }
  
  const job = activeJobs.get(jobId);
  const now = createBeijingDate();
  return Math.max(0, job.scheduledTime.getTime() - now.getTime());
}

// 获取任务状态详情（用于前端显示）
export function getJobStatus(jobId) {
  if (!activeJobs.has(jobId)) {
    return null;
  }
  
  const job = activeJobs.get(jobId);
  const now = createBeijingDate();
  const timeUntilExecution = Math.max(0, job.scheduledTime.getTime() - now.getTime());
  
  const days = Math.floor(timeUntilExecution / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeUntilExecution % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeUntilExecution % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeUntilExecution % (1000 * 60)) / 1000);
  
  return {
    id: job.id,
    timeRemaining: {
      total: timeUntilExecution,
      days,
      hours,
      minutes,
      seconds
    },
    formattedCountdown: `${days}天${hours}小时${minutes}分钟${seconds}秒`,
    scheduledTime: toBeijingISOString(job.scheduledTime),
    date: job.date,
    slots: job.slots
  };
}

// 创建定时任务：每20分钟检查所有会话状态
export function setupSessionCheckSchedule() {
  const jobId = 'check_all_sessions_periodic';
  
  // 使用 '*/20 * * * *' cron表达式，表示每小时的0, 20, 40分钟执行
  const job = scheduleJob(jobId, '*/20 * * * *', () => {
    console.log(`执行定时会话检查 [${jobId}]: ${formatLocalDateTime()}`);
    checkAllSessions()
      .then(() => {
        console.log(`定时会话检查完成 [${jobId}]`);
      })
      .catch(error => {
        console.error(`定时会话检查失败 [${jobId}]:`, error);
      });
  });
  
  console.log(`已设置每20分钟自动检查所有会话 [${jobId}]`);
  return jobId;
}

// 服务初始化时加载持久化的任务
try {
  loadTasksFromFile();
  // 初始化会话检查定时任务
  setupSessionCheckSchedule();
} catch (error) {
  console.error('初始化任务加载失败:', error);
} 