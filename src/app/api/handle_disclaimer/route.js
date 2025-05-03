import { NextResponse } from 'next/server';

const createHeaders = (phpSessionId, additionalHeaders = {}) => ({
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.101 Safari/537.36 Language/zh ColorScheme/Light wxwork/4.1.36 (MicroMessenger/6.2) WindowsWechat  MailPlugin_Electron WeMail embeddisk wwmver/3.26.36.641 noMediaCs/false",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "zh-CN,zh;q=0.9",
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  "X-Requested-With": "XMLHttpRequest", 
  "Origin": "https://reservation.bupt.edu.cn",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Dest": "empty",
  "sec-ch-ua": "\"Chromium\";v=\"129\", \"Not=A?Brand\";v=\"8\"",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\"Windows\"",
  "Connection": "keep-alive",
  "Cookie": `PHPSESSID=${phpSessionId}; think_language=zh-CN`,
  ...additionalHeaders
});

const TARGET_AREA_ID = "6005"; // 默认值

export async function POST(request) {
  try {
    const body = await request.json();
    const { phpSessionId, initialUrl, redirectLocation } = body;

    if (!phpSessionId || !initialUrl || !redirectLocation) {
      return NextResponse.json({
        success: false,
        message: '缺少必要参数'
      }, { status: 400 });
    }

    const disclaimerUrl = `https://reservation.bupt.edu.cn${redirectLocation}`;
    const confirmUrl = "https://reservation.bupt.edu.cn/index.php/Wechat/Other/confirm_disclaimer/back_url/choose_template";

    // 第一步：获取免责声明页面
    const headers = createHeaders(phpSessionId, {
      "Referer": initialUrl
    });

    const disclaimerResp = await fetch(disclaimerUrl, {
      method: 'GET',
      headers: headers,
      redirect: 'follow',
    });

    if (!disclaimerResp.ok) {
      throw new Error(`获取免责声明页面失败: ${disclaimerResp.status}`);
    }

    // 第二步：确认免责声明
    const postHeaders = createHeaders(phpSessionId, {
      "Referer": disclaimerUrl,
      "Origin": "https://reservation.bupt.edu.cn",
      "Content-Type": "application/x-www-form-urlencoded"
    });

    let postData = { 'back_url': 'choose_template' };
    
    // 解析重定向URL中的参数
    try {
      const pathParts = redirectLocation.split('/');
      const paramsMap = { 'template': '1', 'area_id': TARGET_AREA_ID, 'country_id': '0' };
      for (let i = 0; i < pathParts.length; i++) {
        if (paramsMap.hasOwnProperty(pathParts[i]) && i + 1 < pathParts.length) {
          paramsMap[pathParts[i]] = pathParts[i + 1];
        }
      }
      postData = { ...postData, ...paramsMap };
    } catch (error) {
      console.warn("无法从免责声明URL中解析参数，使用默认值。");
    }

    const confirmResp = await fetch(confirmUrl, {
      method: 'POST',
      headers: postHeaders,
      body: new URLSearchParams(postData),
      redirect: 'manual'
    });

    if (confirmResp.status === 302) {
      const finalLocation = confirmResp.headers.get('Location');
      console.log(`https://reservation.bupt.edu.cn${finalLocation}`);
      return NextResponse.json({
        success: true,
        finalUrl: `https://reservation.bupt.edu.cn${finalLocation}`,
        disclaimerUrl
      });
    } else {
      return NextResponse.json({
        success: false,
        message: `确认免责声明失败: ${confirmResp.status}`
      }, { status: confirmResp.status });
    }

  } catch (error) {
    console.error('处理免责声明时出错:', error);
    return NextResponse.json({
      success: false,
      message: error.message
    }, { status: 500 });
  }
} 