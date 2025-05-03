import { useState, useEffect, useRef } from 'react';
import ReservationDialog from './ReservationDialog';
import { createBeijingDate, parseBeijingISOString, formatLocalDateTime } from '../utils/dateUtils';

export default function SessionManager() {
  const [sessions, setSessions] = useState([]);
  const [newSessionId, setNewSessionId] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  // 用于存储客户端的倒计时信息
  const [countdowns, setCountdowns] = useState({});
  // 用于避免跨渲染的内存泄漏
  const countdownTimersRef = useRef({});

  // 加载会话列表
  const loadSessions = async (forceSyncCountdowns = false) => {
    try {
      const response = await fetch('/api/sessions');
      if (!response.ok) throw new Error('加载会话列表失败');
      const data = await response.json();
      setSessions(data);
      
      // 初始化倒计时信息
      initializeCountdowns(data, forceSyncCountdowns);
    } catch (error) {
      console.error('加载会话列表失败:', error);
      setError('加载会话列表失败');
    }
  };

  // 初始化倒计时
  const initializeCountdowns = (sessions, forceSyncCountdowns = false) => {
    // 找出所有等待预约的会话，不要求必须有scheduledTime
    const waitingSessions = sessions.filter(
      session => session.reserveStatus === 'waiting'
    );
    
    console.log('等待预约的会话:', waitingSessions);
    
    // 清除之前的所有计时器
    Object.values(countdownTimersRef.current).forEach(timer => clearInterval(timer));
    countdownTimersRef.current = {};
    
    // 为每个等待中的会话创建倒计时
    const newCountdowns = {};
    waitingSessions.forEach(session => {
      let targetTime;
      
      // 尝试从预约信息中提取倒计时信息（用于兼容旧数据）
      if (!session.scheduledTime && session.reserveInfo) {
        console.log(`会话 ${session.id} 没有scheduledTime，尝试从预约信息中提取`);
        try {
          // 从预约信息中提取日期
          const dateMatch = session.reserveInfo.match(/等待预约：(\d{4}-\d{2}-\d{2})/);
          if (dateMatch) {
            const dateStr = dateMatch[1];
            // 计算预约时间（前一天上午10点）
            const targetDate = new Date(dateStr);
            const reservationTime = new Date(targetDate);
            reservationTime.setDate(reservationTime.getDate() - 1);
            reservationTime.setHours(10, 0, 0, 0);
            
            // 计算目标时间戳
            targetTime = reservationTime.getTime();
            
            // 手动设置scheduledTime
            session.scheduledTime = reservationTime.toISOString();
            console.log(`从预约信息中提取的计划时间:`, session.scheduledTime);
            
            // 保存到服务器
            fetch('/api/sessions', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: session.id,
                scheduledTime: session.scheduledTime
              })
            }).then(() => {
              console.log(`已保存会话 ${session.id} 的scheduledTime`);
            }).catch(error => {
              console.error(`保存会话 ${session.id} 的scheduledTime失败:`, error);
            });
          }
        } catch (e) {
          console.error(`从预约信息中提取时间失败:`, e);
        }
      } else if (session.scheduledTime) {
        // 使用已有的scheduledTime
        console.log(`会话 ${session.id} 的计划时间:`, session.scheduledTime);
        
        // 将ISO字符串转换为时间戳
        try {
          // 支持北京时间格式
          targetTime = parseBeijingISOString(session.scheduledTime).getTime();
          if (isNaN(targetTime)) {
            console.error(`无效的日期格式: ${session.scheduledTime}`);
            return; // 跳过此会话
          }
          console.log(`解析后的目标时间戳:`, targetTime);
        } catch (error) {
          console.error(`解析日期错误:`, error);
          return; // 跳过此会话
        }
      }
      
      // 如果获取到有效的目标时间，创建倒计时
      if (targetTime) {
        console.log(`目标时间戳:`, targetTime);
        console.log(`当前时间戳(北京时间):`, createBeijingDate().getTime());
        
        // 初始计算倒计时
        const countdown = calculateCountdown(targetTime);
        console.log(`初始倒计时:`, countdown);
        newCountdowns[session.id] = countdown;
        
        // 设置计时器每秒更新一次
        const timerId = setInterval(() => {
          setCountdowns(prevCountdowns => {
            const updatedCountdown = calculateCountdown(targetTime);
            
            // 如果倒计时结束，清除计时器
            if (updatedCountdown.total <= 0) {
              clearInterval(countdownTimersRef.current[session.id]);
              delete countdownTimersRef.current[session.id];
              
              // 刷新会话列表获取最新状态
              setTimeout(() => loadSessions(), 5000);
            }
            
            return {
              ...prevCountdowns,
              [session.id]: updatedCountdown
            };
          });
        }, 1000);
        
        // 存储计时器ID以便后续清理
        countdownTimersRef.current[session.id] = timerId;
      }
    });
    
    // 如果强制同步，对所有会话进行处理
    if (forceSyncCountdowns) {
      console.log('强制同步所有等待预约的会话');
      waitingSessions.forEach(session => {
        if (session.reserveInfo && !session.scheduledTime) {
          // 从预约信息中提取日期并保存
          try {
            const dateMatch = session.reserveInfo.match(/等待预约：(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) {
              const dateStr = dateMatch[1];
              // 计算预约时间（前一天上午10点）
              const targetDate = new Date(dateStr);
              const reservationTime = new Date(targetDate);
              reservationTime.setDate(reservationTime.getDate() - 1);
              reservationTime.setHours(10, 0, 0, 0);
              
              // 保存到服务器
              fetch('/api/sessions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: session.id,
                  scheduledTime: reservationTime.toISOString()
                })
              }).then(() => {
                console.log(`已保存会话 ${session.id} 的scheduledTime`);
              }).catch(error => {
                console.error(`保存会话 ${session.id} 的scheduledTime失败:`, error);
              });
            }
          } catch (e) {
            console.error(`从预约信息中提取时间失败:`, e);
          }
        }
      });
    }
    
    setCountdowns(newCountdowns);
    console.log('初始化的倒计时:', newCountdowns);
  };
  
  // 计算倒计时
  const calculateCountdown = (targetTime) => {
    const now = createBeijingDate().getTime();
    const timeRemaining = Math.max(0, targetTime - now);
    
    const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
    
    return {
      total: timeRemaining,
      days,
      hours,
      minutes,
      seconds,
      formatted: `${days}天${hours}小时${minutes}分钟${seconds}秒`
    };
  };

  // 格式化会话预约信息
  const formatSessionInfo = (session) => {
    if (!session.reserveInfo) return '-';
    
    // 添加调试信息
    console.log(`格式化会话 ${session.id} 的信息:`, {
      reserveInfo: session.reserveInfo,
      scheduledTime: session.scheduledTime,
      hasCountdown: !!countdowns[session.id]
    });
    
    // 如果是等待预约状态，并且有倒计时信息，则替换倒计时部分
    if (session.reserveStatus === 'waiting' && countdowns[session.id]) {
      // 将原始信息中的倒计时部分替换为客户端计算的倒计时
      const parts = session.reserveInfo.split('\n');
      if (parts.length > 1) {
        // 假设第二行包含倒计时信息
        // 尝试识别倒计时部分
        let prefix = '';
        let suffix = '';
        
        if (parts[1].includes('预约将在')) {
          const countdownParts = parts[1].split('预约将在');
          prefix = countdownParts[0] + '预约将在 ';
          
          if (countdownParts[1].includes('后自动进行')) {
            suffix = ' 后自动进行';
          }
        } else {
          // 如果没有标准格式，使用默认
          prefix = '预约将在 ';
          suffix = ' 后自动进行';
        }
        
        return parts[0] + '\n' + prefix + countdowns[session.id].formatted + suffix;
      }
    }
    
    return session.reserveInfo;
  };

  useEffect(() => {
    loadSessions();
    
    // 组件卸载时清除所有计时器
    return () => {
      Object.values(countdownTimersRef.current).forEach(timer => clearInterval(timer));
    };
  }, []);

  // 每分钟刷新一次会话列表（后台同步状态）
  useEffect(() => {
    const intervalId = setInterval(() => {
      loadSessions();
    }, 60000); // 改回1分钟

    return () => clearInterval(intervalId);
  }, []);

  const handleAddSession = async (e) => {
    e.preventDefault();
    if (!newSessionId.trim()) {
      setError('请输入 PHPSESSID');
      return;
    }

    setLoading(true);
    try {
      // 检查会话是否有效
      const checkResponse = await fetch('/api/check_php_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phpSessionId: newSessionId })
      });
      const checkResult = await checkResponse.json();

      // 添加会话
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newSessionId,
          description: newDescription,
          isValid: checkResult.success,
          reserveStatus: null, // 添加预约状态字段
          reserveInfo: null // 添加预约信息字段
        })
      });

      await loadSessions();
      setNewSessionId('');
      setNewDescription('');
      setError('');
    } catch (error) {
      setError('添加会话失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      await loadSessions();
    } catch (error) {
      setError('删除失败');
    }
  };

  const handleCheck = async (id) => {
    try {
      setLoading(true);
      const checkResponse = await fetch('/api/check_php_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phpSessionId: id })
      });
      const checkResult = await checkResponse.json();
      
      // 根据检查结果更新会话状态
      await fetch('/api/sessions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: id,
          isValid: checkResult.success
        })
      });

      await loadSessions();
      
      // 显示检查结果提示
      if (checkResult.success) {
        setError('');
        alert('会话有效，可以使用');
      } else {
        setError(`会话无效: ${checkResult.message || '未知错误'}`);
      }

    } catch (error) {
      setError('检查会话状态失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReservation = async (session) => {
    if (session.reserveStatus === 'reserved' || session.reserveStatus === 'waiting') {
      // 确认是否取消预约
      if (!confirm(`确定要取消${session.reserveStatus === 'waiting' ? '等待中的' : ''}预约吗？`)) {
        return;
      }
      
      try {
        // 如果是等待中的预约，需要取消调度任务
        if (session.reserveStatus === 'waiting' && session.scheduledJobId) {
          const cancelResponse = await fetch('/api/cancel_scheduled_reserve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phpSessionId: session.id,
              scheduledJobId: session.scheduledJobId
            })
          });
          
          const cancelResult = await cancelResponse.json();
          if (!cancelResult.success) {
            throw new Error(cancelResult.message || '取消预约失败');
          }
        } else {
          // 直接重置预约状态
          await fetch('/api/sessions', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: session.id,
              reserveStatus: null,
              reserveInfo: null,
              scheduledJobId: null
            })
          });
        }
        
        await loadSessions();
      } catch (error) {
        setError('取消预约失败: ' + (error.message || '未知错误'));
      }
    } else {
      // 检查会话是否有效
      try {
        const checkResponse = await fetch('/api/check_php_session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phpSessionId: session.id })
        });
        
        const checkResult = await checkResponse.json();
        
        if (checkResult.success) {
          // 会话有效，显示预约对话框
          setSelectedSession(session);
          setDialogOpen(true);
          setError('');
        } else {
          // 会话无效，显示错误信息
          setError(`会话已失效: ${checkResult.message || '未知错误'}`);
        }
      } catch (error) {
        setError('检查会话状态失败');
      }
    }
  };

  const handleConfirmReservation = async (selectedDate, selectedSlots, scheduleData) => {
    if (!selectedSession) return;
    
    try {
      if (scheduleData) {
        console.log("处理延迟预约数据:", scheduleData);
        
        // 处理延迟预约
        await fetch('/api/sessions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedSession.id,
            reserveStatus: 'waiting',
            reserveInfo: scheduleData.info,
            scheduledTime: scheduleData.scheduledTime,
            targetDate: scheduleData.targetDate,
            timeSlots: scheduleData.timeSlots,
            scheduledJobId: scheduleData.scheduledJobId
          })
        });
        
        // 确认已成功保存后，手动设置一个初始倒计时
        const targetTime = new Date(scheduleData.scheduledTime).getTime();
        const initialCountdown = calculateCountdown(targetTime);
        setCountdowns(prev => ({
          ...prev,
          [selectedSession.id]: initialCountdown
        }));
        
        console.log("延迟预约已设置, 计划时间:", scheduleData.scheduledTime);
        console.log("初始倒计时:", initialCountdown);
        
        await loadSessions(); // 这将同时初始化倒计时
        return;
      }

      // 处理直接预约
      const reserveResponse = await fetch('/api/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phpSessionId: selectedSession.id,
          date: selectedDate,
          slots: selectedSlots
        })
      });
      const reserveResult = await reserveResponse.json();

      if (reserveResult.success) {
        await fetch('/api/sessions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: selectedSession.id,
            reserveStatus: 'reserved',
            reserveInfo: reserveResult.info
          })
        });
        await loadSessions();
      } else {
        throw new Error(reserveResult.message || '预约失败');
      }
    } catch (error) {
      throw error;
    }
  };

  // 同步倒计时
  const handleSyncCountdowns = () => {
    console.log('手动同步倒计时');
    loadSessions(true);
  };
  
  // 检查所有会话
  const handleCheckAllSessions = async () => {
    try {
      setLoading(true);
      console.log('开始检查所有会话');
      
      const response = await fetch('/api/check_all_sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        alert('所有会话检查已开始，请稍候刷新查看结果');
        // 延迟3秒后刷新会话列表，以便看到更新后的结果
        setTimeout(() => loadSessions(), 3000);
      } else {
        setError(`检查失败: ${result.message || '未知错误'}`);
      }
    } catch (error) {
      setError(`检查所有会话失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="bg-white rounded-lg shadow p-6">
        {/* 添加表单 */}
        <form onSubmit={handleAddSession} className="mb-6 flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">PHPSESSID</label>
            <input
              type="text"
              value={newSessionId}
              onChange={(e) => setNewSessionId(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="输入PHPSESSID"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">描述</label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="姓名缩写"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
          >
            添加
          </button>
        </form>

        {error && (
          <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="mb-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold">会话列表</h2>
          <div className="flex space-x-2">
            <button
              onClick={handleCheckAllSessions}
              disabled={loading}
              className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm disabled:bg-green-300"
            >
              检查所有会话
            </button>
            <button
              onClick={handleSyncCountdowns}
              className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
            >
              同步倒计时
            </button>
          </div>
        </div>

        {/* 会话列表 */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left">PHPSESSID</th>
                <th className="px-4 py-2 text-left">描述</th>
                <th className="px-4 py-2 text-center">状态</th>
                <th className="px-4 py-2 text-center">预约状态</th>
                <th className="px-4 py-2 text-left">预约信息</th>
                <th className="px-4 py-2 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-t">
                  <td className="px-4 py-2 break-all whitespace-normal">{session.id}</td>
                  <td className="px-4 py-2">{session.description || '-'}</td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={`inline-block px-2 py-1 rounded text-sm ${
                        session.isValid
                          ? 'bg-green-100 text-green-800'
                          : session.isValid === false
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {session.isValid
                        ? '有效'
                        : session.isValid === false
                        ? '无效'
                        : '未知'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={`inline-block px-2 py-1 rounded text-sm ${
                        session.reserveStatus === 'reserved'
                          ? 'bg-blue-100 text-blue-800'
                          : session.reserveStatus === 'waiting'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {session.reserveStatus === 'reserved' 
                        ? '已预约' 
                        : session.reserveStatus === 'waiting'
                        ? '等待预约'
                        : '未预约'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600 whitespace-pre-line">
                    {formatSessionInfo(session)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => handleCheck(session.id)}
                      className="mr-2 px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                    >
                      检查
                    </button>
                    <button
                      onClick={() => handleReservation(session)}
                      className={`mr-2 px-2 py-1 text-white rounded ${
                        session.reserveStatus === 'reserved' || session.reserveStatus === 'waiting'
                          ? 'bg-orange-500 hover:bg-orange-600'
                          : session.isValid
                          ? 'bg-blue-500 hover:bg-blue-600'
                          : 'bg-gray-400 cursor-not-allowed'
                      }`}
                      disabled={!session.isValid && !session.reserveStatus}
                      title={!session.isValid && !session.reserveStatus ? '会话无效，无法预约' : ''}
                    >
                      {session.reserveStatus === 'reserved' || session.reserveStatus === 'waiting' 
                        ? '取消预约' 
                        : '预约'}
                    </button>
                    <button
                      onClick={() => handleDelete(session.id)}
                      className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ReservationDialog
        isOpen={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setSelectedSession(null);
        }}
        onConfirm={handleConfirmReservation}
        session={selectedSession}
      />
    </div>
  );
} 