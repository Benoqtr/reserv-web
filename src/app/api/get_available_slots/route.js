import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

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

async function getAvailableSlots(phpSessionId, areaId, queryDate, roomId) {
  try {
    const initialListUrl = `https://reservation.bupt.edu.cn/index.php/Wechat/Booking/choose_template/template/1/area_id/${areaId}/query_date/${queryDate}/country_id/0`;
    let finalListUrl = initialListUrl;
    let refererForAjax = initialListUrl;

    const headers = getHeaders(phpSessionId, {
      "Referer": "https://reservation.bupt.edu.cn/index.php/Wechat/Booking/choose_area"
    });

    // 第一步：访问初始页面
    const responseGet1 = await fetch(initialListUrl, {
      method: 'GET',
      headers: headers,
      redirect: 'manual'
    });

    // 处理可能的免责声明重定向
    if (responseGet1.status === 302 && responseGet1.headers.get('Location')?.includes('show_disclaimer')) {
      console.log('处理免责声明');
      const disclaimerResponse = await fetch("http://localhost:3000/api/handle_disclaimer", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phpSessionId,
          initialUrl: initialListUrl,
          redirectLocation: responseGet1.headers.get('Location')
        })
      });
      if (!disclaimerResponse.ok) {
        throw new Error('处理免责声明失败');
      }

      const disclaimerResult = await disclaimerResponse.json();
      if (!disclaimerResult.success) {
        throw new Error(disclaimerResult.message);
      }

      finalListUrl = disclaimerResult.finalUrl;
      const responseGet2 = await fetch(finalListUrl, {
        method: 'GET',
        headers: getHeaders(phpSessionId, {
          "Referer": disclaimerResult.disclaimerUrl
        }),
      });

      if (!responseGet2.ok) {
        throw new Error(`访问最终页面失败: ${responseGet2.status}`);
      }

      refererForAjax = finalListUrl;
    } else if (responseGet1.status !== 200) {
      throw new Error(`访问初始页面失败: ${responseGet1.status}`);
    }

    console.log(refererForAjax);
    console.log(finalListUrl);

    // 获取时间表
    const bookingTableResponse = await fetch(`http://localhost:3000/api/get_booking_table`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phpSessionId,
        areaId,
        queryDate,
        refererUrl: refererForAjax
      })
    });

    if (!bookingTableResponse.ok) {
      throw new Error('获取时间表失败');
    }

    const bookingTableResult = await bookingTableResponse.json();
    if (!bookingTableResult.success) {
      throw new Error(bookingTableResult.message);
    }

    // 解析时间表HTML
    const $ = cheerio.load(bookingTableResult.tableHtml);
    const availableSlots = [];
    const processedIds = new Set();

    // 1. 查找可预约的时段
    $('div.no-registered').each((_, div) => {
      const $div = $(div);
      const onclickAttr = $div.attr('onclick') || '';
      const idAttr = $div.attr('id') || '';

      if (!onclickAttr.includes('do_reservation') || !idAttr || !idAttr.includes('_')) {
        return;
      }

      try {
        const [roomIdStr, timeIdStr] = idAttr.split('_', 2);
        if (!timeIdStr.startsWith(queryDate) || timeIdStr.length !== 10) {
          return;
        }

        const timeTag = $div.find('div.time');
        let displayTime = timeTag.text().trim() || `未知(${timeIdStr})`;
        if (displayTime.includes('(')) {
          displayTime = displayTime.split('(')[0].trim();
        }

        availableSlots.push({
          timeId: timeIdStr,
          display: displayTime,
          roomId: roomIdStr,
          status: "available",
          statusDisplay: "可预约"
        });
        processedIds.add(idAttr);
      } catch (error) {
        console.error('解析可预约时段出错:', error);
      }
    });

    // 2. 查找尚未开始的时段
    $('div[id]').each((_, div) => {
      const $div = $(div);
      const idAttr = $div.attr('id') || '';

      if (!idAttr.includes('_') || processedIds.has(idAttr)) {
        return;
      }

      const stateTag = $div.find('span.state_text');
      if (!stateTag.length || !stateTag.text().includes('尚未开放')) {
        return;
      }

      try {
        const [roomIdStr, timeIdStr] = idAttr.split('_', 2);
        if (!timeIdStr.startsWith(queryDate) || timeIdStr.length !== 10) {
          return;
        }

        const timeTag = $div.find('div.time');
        let displayTime = timeTag.text().trim() || `未知(${timeIdStr})`;
        if (displayTime.includes('(')) {
          displayTime = displayTime.split('(')[0].trim();
        }

        availableSlots.push({
          timeId: timeIdStr,
          display: displayTime,
          roomId: roomIdStr,
          status: "not_yet_open",
          statusDisplay: "尚未开放"
        });
        processedIds.add(idAttr);
      } catch (error) {
        console.error('解析未开始时段出错:', error);
      }
    });

    // 3. 按时间排序
    availableSlots.sort((a, b) => a.timeId.localeCompare(b.timeId));

    return {
      success: true,
      availableSlots
    };
  } catch (error) {
    console.error('获取可用时间段时出错:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { phpSessionId, areaId, queryDate, roomId } = body;

    if (!phpSessionId || !areaId || !queryDate || !roomId) {
      return NextResponse.json({
        success: false,
        message: '缺少必要参数'
      }, { status: 400 });
    }

    const result = await getAvailableSlots(phpSessionId, areaId, queryDate, roomId);
    
    return NextResponse.json(result, { 
      status: result.success ? 200 : 500 
    });

  } catch (error) {
    console.error('API 处理错误:', error);
    return NextResponse.json({
      success: false,
      message: '服务器内部错误'
    }, { status: 500 });
  }
} 