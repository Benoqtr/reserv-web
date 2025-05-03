// Filename: pages/api/reserve.js
// (或者你项目中的其他 API 路由文件)

import { NextResponse } from 'next/server';

// 辅助函数：生成请求头
const getHeaders = (phpSessionId, additionalHeaders = {}) => {
    // Base headers common to most requests
    const baseHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.101 Safari/537.36 Language/zh ColorScheme/Light wxwork/4.1.36 (MicroMessenger/6.2) WindowsWechat  MailPlugin_Electron WeMail embeddisk wwmver/3.26.36.641 noMediaCs/false",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Connection": "keep-alive",
        "Cookie": `PHPSESSID=${phpSessionId}; think_language=zh-cn`,
        "Origin": "https://reservation.bupt.edu.cn",
        "Sec-Fetch-Site": "same-origin",
        "sec-ch-ua": "\"Chromium\";v=\"129\", \"Not=A?Brand\";v=\"8\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
    };

    // Merge base headers with specific additional/overriding headers
    const mergedHeaders = { ...baseHeaders, ...additionalHeaders };

    // Clean up undefined headers (important when overriding)
    Object.keys(mergedHeaders).forEach(key => {
        if (mergedHeaders[key] === undefined) {
            delete mergedHeaders[key];
        }
    });

    return mergedHeaders;
};


// 获取表单验证码和请求ID
async function getFormValidCode(phpSessionId, areaId, roomId, queryDate, selectedTimeIds) {
  const functionName = "getFormValidCode"; // For logging context
  const timeIds = selectedTimeIds.map(id => String(id.id || id));
  const tdIdUrlParam = timeIds.map(tid => `${roomId}_${tid}`).join(',');
  const url = `https://reservation.bupt.edu.cn/index.php/Wechat/Booking/confirm_booking?area_id=${areaId}&td_id=${tdIdUrlParam}&query_date=${queryDate}&country_id=0`;
  const headers = getHeaders(phpSessionId, {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document",
    "Upgrade-Insecure-Requests": "1",
    "Referer": `https://reservation.bupt.edu.cn/index.php/Wechat/Booking/choose_template/template/1/area_id/${areaId}/country_id/0`,
  });

  console.log(`[${functionName}] 获取令牌: GET ${url}`);
  try {
    const response = await fetch(url, { method: 'GET', headers: headers });
    console.log(`[${functionName}] 令牌页面响应状态: ${response.status}`);
    const html = await response.text(); // Read text regardless of status for logging

    if (!response.ok) {
        console.error(`[${functionName}] 获取令牌页面失败: ${response.status}`);
        console.debug(`[${functionName}] 失败响应体预览:\n${html.substring(0, 1000)}`);
        throw new Error(`获取令牌页面失败: ${response.status}`);
    }

    const formValidCodeMatch = html.match(/id=["']form_valid_code_value["'][^>]*value=["']([^"']+)["']/i) || html.match(/value=["']([^"']+)["'][^>]*id=["']form_valid_code_value["']/i);
    const requestIdMatch = html.match(/name=["']request_id["'][^>]*value=["']([^"']+)["']/i) || html.match(/value=["']([^"']+)["'][^>]*name=["']request_id["']/i);
    const formValidCode = formValidCodeMatch ? formValidCodeMatch[1] : null;
    const requestId = requestIdMatch ? requestIdMatch[1] : null;

    if (!formValidCode || !requestId) {
      console.error(`[${functionName}] 未能找到确认页面的必要隐藏字段`);
      console.error(`  表单验证码: ${formValidCode ? '找到' : '未找到'}`);
      console.error(`  请求ID: ${requestId ? '找到' : '未找到'}`);
      console.debug(`[${functionName}] HTML预览 (确认页面):\n${html.substring(0, 2000)}`);
      throw new Error('未能找到确认页面的必要隐藏字段');
    }

    console.log(`[${functionName}] 获取令牌成功 (Code: ${formValidCode.substring(0, 5)}..., ReqID: ${requestId.substring(0, 5)}...)`);
    return { formValidCode, requestId };
  } catch (error) {
    console.error(`[${functionName}] 失败:`, error);
    // Consider logging request details here on error if needed
    // console.error("Request Headers:", headers);
    throw error;
  }
}

// 检查余额和支付
async function checkBalanceAndPayment(phpSessionId, areaId, roomId, queryDate, selectedTimeIds) {
  const functionName = "checkBalanceAndPayment";
  const timeIds = selectedTimeIds.map(id => String(id.id || id));
  const timeIdDataParam = timeIds.join(' ');
  const tdIdUrlParam = timeIds.map(tid => `${roomId}_${tid}`).join(',');
  const ajaxUrl = "https://reservation.bupt.edu.cn/index.php/Wechat/MixedPayment/get_balance_and_packages_of_one_user";
  const ajaxHeaders = getHeaders(phpSessionId, {
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": `https://reservation.bupt.edu.cn/index.php/Wechat/Booking/confirm_booking?area_id=${areaId}&td_id=${tdIdUrlParam}&query_date=${queryDate}&country_id=0`
  });
  const ajaxData = new URLSearchParams({
    "room_id": roomId, "device_id": "0", "soft_id": "0", "time_id": timeIdDataParam,
    "area_id": areaId, "card_id": "0", "card_name": "0", "card_type": "0",
    "card_discount": "0", "finall_price": "0", "occupy_quota": "1"
  });

  console.log(`[${functionName}] 支付预检查: POST ${ajaxUrl}`);
  try {
    const response = await fetch(ajaxUrl, { method: 'POST', headers: ajaxHeaders, body: ajaxData.toString() });
    console.log(`[${functionName}] 支付预检查响应状态: ${response.status}`);

    if (!response.ok) {
       let errorBody = '[无法读取响应体]';
       try { errorBody = await response.text(); } catch {}
       console.error(`[${functionName}] HTTP错误: ${response.status}. Body: ${errorBody.substring(0,500)}`);
       throw new Error(`支付预检查失败: ${response.status}`);
    }

    try {
      const jsonResponse = await response.json();
      console.debug(`[${functionName}] 响应JSON:`, JSON.stringify(jsonResponse));
      const paymentConfig = jsonResponse.payment_config || {};
      if (paymentConfig.is_use_remainder_pay === "1") {
        console.log(`[${functionName}] ✅ 余额支付已启用。`);
        return true;
      } else {
        console.warn(`[${functionName}] ⚠️ 余额支付可能未启用。`);
        return true; // Continue anyway
      }
    } catch (jsonError) {
      console.error(`[${functionName}] ❌ 无法解析JSON响应:`, jsonError);
      let text = '[无法读取响应体]';
      try { text = await response.text(); } catch {} // Try to read body as text
      console.debug(`[${functionName}] Response Text: ${text.substring(0, 200)}`);
      return false; // Fail if response is not valid JSON
    }
  } catch (error) {
    console.error(`[${functionName}] 过程中发生错误:`, error);
    // Log details on error
    console.error(`  Request URL: ${ajaxUrl}`);
    console.error(`  Request Data: ${ajaxData.toString()}`);
    // console.error("  Request Headers:", ajaxHeaders); // Be careful with logging cookies
    return false; // Indicate potential issue but allow continuation
  }
}

// 提交预约
async function makeReservation(phpSessionId, areaId, roomId, queryDate, formValidCode, requestId, selectedTimeIds) {
  const functionName = "makeReservation";
  const timeIds = selectedTimeIds.map(id => String(id.id || id));
  const timeIdDataParam = timeIds.join(' ');
  const tdIdUrlParam = timeIds.map(tid => `${roomId}_${tid}`).join(',');
  const url = "https://reservation.bupt.edu.cn/index.php/Wechat/Register/register_show";
  const headers = getHeaders(phpSessionId, {
      "Content-Type": undefined, // Let fetch set this for FormData
      "Referer": `https://reservation.bupt.edu.cn/index.php/Wechat/Booking/confirm_booking?area_id=${areaId}&td_id=${tdIdUrlParam}&query_date=${queryDate}&country_id=0`,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Upgrade-Insecure-Requests": "1", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document",
      "Sec-Fetch-User": "?1", "Cache-Control": "max-age=0",
      "X-Requested-With": undefined
  });
  if(headers["Content-Type"] === undefined) delete headers["Content-Type"];
  if(headers["X-Requested-With"] === undefined) delete headers["X-Requested-With"];

  const formData = new FormData();
  formData.append("form_valid_code_value", formValidCode || '');
  formData.append("request_id", requestId || '');
  formData.append("time_id", timeIdDataParam);
  formData.append("occupy_quota", "1");
  formData.append("mixed_payment_type", "balance_pay");
  formData.append("total_amount", "0");
  formData.append("custom_class_ids", ""); formData.append("country_id", "0"); formData.append("country_name", "");
  formData.append("area_id", areaId); formData.append("area_name", "沙河校区羽毛球场地-室内");
  formData.append("room_id", roomId); formData.append("room_name", "沙河羽毛球1号");
  formData.append("is_open_reserve_captcha", "0"); formData.append("device_id", "0"); formData.append("selected_device_name", "");
  formData.append("soft_id", "0"); formData.append("selected_soft_name", ""); formData.append("times_arr", "Array");
  formData.append("packages_showing_type", "2"); formData.append("to_use_vip_id", "0");
  const timeSlots = ["08:00-09:00", "09:00-10:00", "10:00-11:00", "11:00-12:00", "11:30-12:30", "12:00-13:00", "13:00-14:00", "14:00-15:00", "15:00-16:00", "16:00-17:00", "17:00-18:00", "18:00-19:00", "19:00-20:00", "20:00-21:00", "21:00-22:00"];
  timeSlots.forEach((slot, index) => { formData.append(`times_arr_${index + 1}`, slot); });
  formData.append("is_queue", "0"); formData.append("randstr", ""); formData.append("ticket", ""); formData.append("sign_and_login_type", "1");

  console.log(`[${functionName}] 提交预订: POST ${url}`);
  try {
    // Log headers being sent (excluding Cookie for brevity/security)
    const loggedHeaders = {...headers};
    delete loggedHeaders.Cookie;
    console.debug(`[${functionName}] Request Headers (excluding Cookie):`, loggedHeaders);
    console.debug(`[${functionName}] Request Body (FormData Keys):`, Array.from(formData.keys()));

    const response = await fetch(url, { method: 'POST', headers, body: formData, redirect: 'manual' });
    console.log(`[${functionName}] 提交响应状态: ${response.status}`);
    console.debug(`[${functionName}] Response Headers:`, Object.fromEntries(response.headers.entries()));

    const responseData = { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: null };
    try {
      const text = await response.text();
      if (response.status !== 302 && text) { console.debug(`[${functionName}][${response.status}] Response Body Preview:\n${text.substring(0, 1500)}...`); }
      try { responseData.body = JSON.parse(text); } catch (e) { responseData.body = text; }
    } catch (e) { console.warn(`[${functionName}] 读取响应内容时出错:`, e); }

    if (response.status === 302) { console.log(`[${functionName}] 预约请求发送，收到重定向响应`); }
    else { console.error(`[${functionName}] 预约请求失败或未重定向，状态码: ${response.status}`); }

    return responseData;
  } catch (error) {
    console.error(`[${functionName}] 提交过程中发生错误:`, error);
    // Log details on error
    console.error(`  Request URL: ${url}`);
    // console.error("  Request Headers:", headers); // Be careful logging cookies
    console.error("  Request Body Keys:", Array.from(formData.keys()));
    throw error; // Re-throw
  }
}

// --- API Route Handler ---
export async function POST(request) {
  const functionName = "API Route Handler";
  try {
    const { phpSessionId, date: rawDate, slots: rawSlots } = await request.json();

    // Input Validation
    if (!phpSessionId || !rawDate || !rawSlots || !Array.isArray(rawSlots) || rawSlots.length === 0 || rawSlots.length > 2) {
      console.error(`[${functionName}] 请求参数无效:`, { phpSessionId: phpSessionId ? '***' : 'Missing', date: rawDate, slots: rawSlots });
      return NextResponse.json({ success: false, message: '请求参数无效 (需要 phpSessionId, date, slots[1或2项])' }, { status: 400 });
    }

    // Format date and slots
    let formattedDate = String(rawDate);
    if (formattedDate.includes('-')) formattedDate = formattedDate.replace(/-/g, '');
    if (!/^\d{8}$/.test(formattedDate)) {
         console.error(`[${functionName}] 日期格式无效:`, rawDate);
         return NextResponse.json({ success: false, message: '日期格式无效 (应为 YYYY-MM-DD 或 YYYYMMDD)' }, { status: 400 });
    }
    // Ensure slots contain only the timeId strings needed for subsequent calls
    const slots = rawSlots.map(slot => String(slot.timeId || slot)).filter(id => id);
     if (slots.length === 0) {
         console.error(`[${functionName}] 处理后的 slots 数组为空:`, rawSlots);
         return NextResponse.json({ success: false, message: '时间段参数无效' }, { status: 400 });
     }


    const areaId = "6005";
    const roomId = "15501"; // TODO: Extract from selected slot if applicable

    console.log(`[${functionName}] 开始处理预约请求: Date=${formattedDate}, Slots=${JSON.stringify(slots)}`);

    // 1. Get tokens
    console.log(`[${functionName}] 步骤 1: 获取令牌...`);
    const { formValidCode, requestId } = await getFormValidCode(phpSessionId, areaId, roomId, formattedDate, slots);
    console.log(`[${functionName}] 步骤 1: 令牌获取完成。`);

    // Optional Delay 1
    // await new Promise(resolve => setTimeout(resolve, 150)); // e.g., 150ms delay

    // 2. Perform pre-check
    console.log(`[${functionName}] 步骤 2: 执行支付预检查...`);
    const paymentCheckResult = await checkBalanceAndPayment(phpSessionId, areaId, roomId, formattedDate, slots);
    if (!paymentCheckResult) {
      console.warn(`[${functionName}] ⚠️ 支付预检查失败或返回警告，仍将继续尝试提交...`);
    } else {
       console.info(`[${functionName}] 步骤 2: 支付预检查通过。`);
    }

    // Optional Delay 2
    // await new Promise(resolve => setTimeout(resolve, 150)); // e.g., 150ms delay


    // 3. Make reservation
    console.log(`[${functionName}] 步骤 3: 提交预约...`);
    const response = await makeReservation(phpSessionId, areaId, roomId, formattedDate, formValidCode, requestId, slots);
    console.log(`[${functionName}] 步骤 3: 提交完成，响应状态 ${response.status}`);


    // 4. Check final result
    const expectedRedirectUrl = '/index.php/Wechat/Home/my_register';
    const actualLocation = response.headers['location'];

    if (response.status === 302 && actualLocation === expectedRedirectUrl) {
        console.log(`[${functionName}] ✅ 预约成功，重定向到: ${actualLocation}`);
        // 构建预约信息
        const timeSlots = slots.map(slotId => {
            // 从完整ID中提取最后两位作为时间段ID
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
        return NextResponse.json({ 
            success: true, 
            info: `预约成功：${rawDate} ${timeSlots}`
        });
    } else {
        let errorMessage = '预约失败';
        let responseBodyForError = response.body;

        if (response.status === 200 && typeof responseBodyForError === 'string') {
             if (responseBodyForError.includes("已约满") || responseBodyForError.includes("已被预订") || responseBodyForError.includes("不可预约") || responseBodyForError.includes("已被预约")) { errorMessage = "时间段可能已被预订"; }
             else if (responseBodyForError.includes("数据校验失败")) { errorMessage = "数据校验失败 (令牌失效?)"; }
             else if (responseBodyForError.includes("异常请求")) { errorMessage = "服务器报告异常请求"; }
             else if (responseBodyForError.includes("至少选择一种支付方式")) { errorMessage = "需要选择支付方式"; }
             else { errorMessage = `预约失败 (收到200 OK 但内容未知)`; }
             console.error(`[${functionName}] Booking failed (200 OK): ${errorMessage}`);
        } else if (response.status === 302) {
             errorMessage = `预约失败 (重定向到错误页面: ${actualLocation})`;
             console.error(`[${functionName}] Booking failed (302 Redirect): ${errorMessage}`);
        } else {
             errorMessage = `预约失败 (HTTP ${response.status})`;
             console.error(`[${functionName}] Booking failed (${response.status}): ${errorMessage}`);
        }
        return NextResponse.json({ 
            success: false, 
            message: errorMessage,
            info: errorMessage, // 添加info字段以匹配前端期望
            status: response.status 
        }, { status: 400 });
    }

  } catch (error) {
    console.error('[API Route Handler] 捕获到错误:', error);
    console.error(error.stack || 'No stack trace available');
    return NextResponse.json({ 
        success: false, 
        message: error.message || '服务器内部错误',
        info: error.message || '服务器内部错误', // 添加info字段以匹配前端期望
        status: 500 
    }, { status: 500 });
  }
}