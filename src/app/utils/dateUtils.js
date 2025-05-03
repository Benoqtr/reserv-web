/**
 * 日期和时区处理工具函数
 */

// 创建UTC+8（北京时间）的当前时间对象
export function createBeijingDate() {
  // 获取当前UTC时间
  const date = new Date();
  
  // 计算北京时间偏移（UTC+8)
  const beijingOffset = 8 * 60 * 60 * 1000; // 8小时的毫秒数
  
  // 获取本地时区偏移
  const localOffset = date.getTimezoneOffset() * 60 * 1000; // 本地偏移的毫秒数（注意getTimezoneOffset返回负值）
  
  // 计算北京时间
  return new Date(date.getTime() + beijingOffset + localOffset);
}

// 将日期转换为北京时间的ISO字符串
export function toBeijingISOString(date) {
  if (!date) {
    date = new Date();
  }
  
  // 获取本地时区偏移
  const localOffset = date.getTimezoneOffset() * 60 * 1000;
  
  // 北京时间偏移
  const beijingOffset = 8 * 60 * 60 * 1000;
  
  // 调整为北京时间
  const beijingTime = new Date(date.getTime() + beijingOffset + localOffset);
  
  // 输出ISO格式，并将Z（表示UTC）替换为+08:00（表示UTC+8）
  return beijingTime.toISOString().replace('Z', '+08:00');
}

// 后端已返回北京时间，直接解析即可
export function parseBeijingISOString(isoString) {
  if (!isoString) return null;
  
  try {
    // 直接解析后端返回的北京时间
    return new Date(isoString);
  } catch (error) {
    console.error('解析北京时间出错:', error);
    return null;
  }
}

// 格式化为本地日期字符串（YYYY-MM-DD）
export function formatLocalDate(date) {
  if (!date) {
    date = createBeijingDate();
  }
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

// 格式化为本地时间字符串（含时分秒）
export function formatLocalDateTime(date) {
  if (!date) {
    date = createBeijingDate();
  }
  
  const formattedDate = formatLocalDate(date);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${formattedDate} ${hours}:${minutes}:${seconds}`;
}

// 获取当前北京时间的时间戳
export function getBeijingTimestamp() {
  return createBeijingDate().getTime();
}