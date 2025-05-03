import { NextResponse } from 'next/server';

async function checkPhpSession(id) {
  const loginCheckUrl = "https://reservation.bupt.edu.cn/index.php/Wechat/User/user_is_login";
  const loginCheckHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.101 Safari/537.36 Language/zh ColorScheme/Light wxwork/4.1.36 (MicroMessenger/6.2) WindowsWechat  MailPlugin_Electron WeMail embeddisk wwmver/3.26.36.641 noMediaCs/false",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest", 
    "Origin": "https://reservation.bupt.edu.cn",
    "Referer": "https://reservation.bupt.edu.cn/index.php/Wechat/Other/show_disclaimer/back_url/display_index",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    "sec-ch-ua": "\"Chromium\";v=\"129\", \"Not=A?Brand\";v=\"8\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "Connection": "keep-alive"
  };
  
  // 修改为JSON格式的请求体
  const loginCheckData = JSON.stringify({
    "is_need_login": false,
    "is_specified_page_login": false
  });
  
  // 修改Cookie中的think_language大小写
  const initial_cookies = {"PHPSESSID": id, "think_language": "zh-CN"};

  try {
    const response = await fetch(loginCheckUrl, {
      method: 'POST',
      headers: {
        ...loginCheckHeaders,
        "Cookie": Object.entries(initial_cookies).map(([key, value]) => `${key}=${value}`).join('; ')
      },
      body: loginCheckData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 检查响应内容是否为参数错误
    const responseText = await response.text();
    if (responseText.includes('参数错误')) {
      return {
        isValid: false,
        code: 400,
        message: '参数错误'
      };
    }
    
    try {
      // 尝试将响应解析为JSON
      const jsonResponse = JSON.parse(responseText);
      return {
        isValid: jsonResponse.code === 200,
        code: jsonResponse.code,
        message: jsonResponse.message || '未知错误'
      };
    } catch (e) {
      // 如果无法解析为JSON，返回错误
      return {
        isValid: false,
        code: 500,
        message: '无法解析服务器响应'
      };
    }
    
    const jsonResponse = await response.json();
    return {
      isValid: jsonResponse.code === 200,
      code: jsonResponse.code,
      message: jsonResponse.message || '未知错误'
    };
  } catch (error) {
    console.error('检查会话状态时出错:', error);
    return {
      isValid: false,
      code: 200,
      message: error.message
    };
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { phpSessionId } = body;

    if (!phpSessionId) {
      return NextResponse.json({
        success: false,
        message: '缺少 PHPSESSID'
      }, { status: 400 });
    }

    const sessionStatus = await checkPhpSession(phpSessionId);

    return NextResponse.json({
      success: sessionStatus.isValid,
      code: sessionStatus.code,
      message: sessionStatus.message
    });

  } catch (error) {
    console.error('API 处理错误:', error);
    return NextResponse.json({
      success: false,
      message: '服务器内部错误'
    }, { status: 500 });
  }
} 