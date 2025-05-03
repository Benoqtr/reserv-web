import { NextResponse } from 'next/server';

const getHeaders = (phpSessionId, additionalHeaders = {}) => ({
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

export async function POST(request) {
  try {
    const body = await request.json();
    const { phpSessionId, areaId, queryDate, refererUrl } = body;

    if (!phpSessionId || !areaId || !queryDate || !refererUrl) {
      return NextResponse.json({
        success: false,
        message: '缺少必要参数'
      }, { status: 400 });
    }

    const ajaxUrl = "https://reservation.bupt.edu.cn/index.php/Wechat/Booking/get_one_day_one_area_state_table_html";
    const ajaxHeaders = getHeaders(phpSessionId, {
      "Referer": refererUrl
    });

    const ajaxData = {
      "now_area_id": areaId,
      "query_date": queryDate,
      "first_room_id": "0",
      "start_date": queryDate,
      "the_ajax_execute_times": "1"
    };

    const response = await fetch(ajaxUrl, {
      method: 'POST',
      headers: ajaxHeaders,
      body: new URLSearchParams(ajaxData)
    });

    if (!response.ok) {
      throw new Error(`获取时间表失败: ${response.status}`);
    }

    const jsonData = await response.json();
    
    if ("table_html" in jsonData) {
      return NextResponse.json({
        success: true,
        tableHtml: jsonData.table_html
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'AJAX 响应中未找到 table_html'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('获取预订时间表时出错:', error);
    return NextResponse.json({
      success: false,
      message: error.message
    }, { status: 500 });
  }
} 