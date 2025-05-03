import { useState, useEffect } from 'react';
import { createBeijingDate, formatLocalDate } from '../utils/dateUtils';

export default function ReservationDialog({ isOpen, onClose, onConfirm, session }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedSlots, setSelectedSlots] = useState([]);

  // 生成未来7天的日期选项
  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const date = createBeijingDate();
    date.setDate(date.getDate() + i);
    return {
      value: formatLocalDate(date),
      label: `${date.getMonth() + 1}月${date.getDate()}日`
    };
  });

  // 获取可用时间段
  const fetchAvailableSlots = async (date) => {
    try {
      setLoading(true);
      const formattedDate = date.replace(/-/g, '');
      const response = await fetch('/api/get_available_slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phpSessionId: session.id,
          areaId: "6005",
          roomId: "15501",
          queryDate: formattedDate
        })
      });

      const data = await response.json();
      if (data.success) {
        setAvailableSlots(data.availableSlots || []);
        setError('');
      } else {
        setError(data.message || '获取时间段失败');
        setAvailableSlots([]);
      }
    } catch (error) {
      setError('获取时间段失败');
      setAvailableSlots([]);
    } finally {
      setLoading(false);
    }
  };

  // 当日期改变时获取可用时间段
  useEffect(() => {
    if (selectedDate) {
      fetchAvailableSlots(selectedDate);
    }
  }, [selectedDate]);

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setSelectedSlots([]);
  };

  const handleSlotToggle = (slot) => {
    if (selectedSlots.includes(slot)) {
      setSelectedSlots(selectedSlots.filter(s => s !== slot));
    } else if (selectedSlots.length < 2) {
      // 检查是否是同一个场地
      if (selectedSlots.length === 0 || selectedSlots[0].roomId === slot.roomId) {
        setSelectedSlots([...selectedSlots, slot]);
      } else {
        setError('只能选择同一个场地的时间段');
      }
    } else {
      setError('最多只能选择两个时间段');
    }
  };

  const handleConfirm = async () => {
    if (!selectedDate || selectedSlots.length === 0) {
      setError('请选择日期和时间段');
      return;
    }

    setLoading(true);
    setError('');
    try {
      // 检查是否所有选中的时间段都是相同状态
      const firstSlotStatus = selectedSlots[0].status;
      const allSameStatus = selectedSlots.every(slot => slot.status === firstSlotStatus);
      if (!allSameStatus) {
        throw new Error('不能混合预约不同状态的时间段');
      }

      // 根据状态调用不同的API
      let response;
      if (firstSlotStatus === 'available') {
        // 直接预约
        response = await onConfirm(selectedDate, selectedSlots);
      } else if (firstSlotStatus === 'not_yet_open') {
        // 延迟预约
        response = await fetch('/api/schedule_reserve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phpSessionId: session.id,
            date: selectedDate,
            slots: selectedSlots.map(slot => slot.timeId)
          })
        });
        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || '延迟预约失败');
        }
        // 更新会话状态
        await onConfirm(selectedDate, selectedSlots, data);
      } else {
        throw new Error('无效的时间段状态');
      }
      onClose();
    } catch (error) {
      setError(error.message || '预约失败');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-lg pointer-events-auto">
        <h2 className="text-xl font-semibold mb-4">确认预约</h2>
        
        <div className="mb-4">
          <div className="text-gray-600 mb-2">会话信息：</div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="mb-1">
              <span className="font-medium">PHPSESSID:</span> 
              <span className="font-mono ml-2">{session.id}</span>
            </div>
            <div>
              <span className="font-medium">描述:</span> 
              <span className="ml-2">{session.description || '-'}</span>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">选择日期：</label>
          <select
            value={selectedDate}
            onChange={handleDateChange}
            className="w-full p-2 border rounded"
            disabled={loading}
          >
            <option value="">请选择日期</option>
            {dateOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {selectedDate && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">可用时间段：</label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {loading ? (
                <div className="text-center py-4">加载中...</div>
              ) : availableSlots.length > 0 ? (
                availableSlots.map((slot, index) => (
                  <div
                    key={`${slot.roomId}_${slot.timeId}`}
                    className={`p-2 rounded cursor-pointer ${
                      selectedSlots.includes(slot)
                        ? 'bg-blue-100 border-blue-500'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                    onClick={() => handleSlotToggle(slot)}
                  >
                    <div className="flex justify-between items-center">
                      <span>{slot.display}</span>
                      <span className="text-sm text-gray-500">
                        {slot.statusDisplay}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500">
                  暂无可用时间段
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
            disabled={loading}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || selectedSlots.length === 0}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
          >
            {loading ? '预约中...' : '确认预约'}
          </button>
        </div>
      </div>
    </div>
  );
} 