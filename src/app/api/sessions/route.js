import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { createBeijingDate } from '../../utils/dateUtils';

const DATA_FILE = path.join(process.cwd(), 'src', 'app', 'data', 'sessions.json');

// 读取会话数据
async function readSessions() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // 如果文件不存在，创建空文件
      await fs.writeFile(DATA_FILE, '[]', 'utf8');
      return [];
    }
    throw error;
  }
}

// 写入会话数据
async function writeSessions(sessions) {
  await fs.writeFile(DATA_FILE, JSON.stringify(sessions, null, 2), 'utf8');
}

// GET: 获取所有会话
export async function GET() {
  try {
    const sessions = await readSessions();
    return NextResponse.json(sessions);
  } catch (error) {
    console.error('获取会话列表失败:', error);
    return NextResponse.json({ error: '获取会话列表失败' }, { status: 500 });
  }
}

// POST: 添加新会话
export async function POST(request) {
  try {
    const { id, description, reserveStatus, reserveInfo } = await request.json();
    if (!id) {
      return NextResponse.json({ error: '缺少会话 ID' }, { status: 400 });
    }

    const sessions = await readSessions();
    const timestamp = createBeijingDate().toISOString();
    
    const existingIndex = sessions.findIndex(s => s.id === id);
    if (existingIndex >= 0) {
      sessions[existingIndex] = {
        ...sessions[existingIndex],
        description: description || sessions[existingIndex].description,
        reserveStatus: reserveStatus !== undefined ? reserveStatus : sessions[existingIndex].reserveStatus,
        reserveInfo: reserveInfo !== undefined ? reserveInfo : sessions[existingIndex].reserveInfo,
        lastChecked: timestamp
      };
    } else {
      sessions.push({
        id,
        description,
        reserveStatus: reserveStatus || null,
        reserveInfo: reserveInfo || null,
        addedAt: timestamp,
        lastChecked: timestamp,
        isValid: null
      });
    }

    await writeSessions(sessions);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('添加会话失败:', error);
    return NextResponse.json({ error: '添加会话失败' }, { status: 500 });
  }
}

// PUT: 更新会话
export async function PUT(request) {
  try {
    const { id, description, isValid, reserveStatus, reserveInfo, scheduledTime, scheduledJobId } = await request.json();
    if (!id) {
      return NextResponse.json({ error: '缺少会话 ID' }, { status: 400 });
    }

    const sessions = await readSessions();
    const session = sessions.find(s => s.id === id);
    
    if (!session) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 });
    }

    if (description !== undefined) {
      session.description = description;
    }
    
    if (isValid !== undefined) {
      session.isValid = isValid;
      session.lastChecked = createBeijingDate().toISOString();
    }

    if (reserveStatus !== undefined) {
      session.reserveStatus = reserveStatus;
    }

    if (reserveInfo !== undefined) {
      session.reserveInfo = reserveInfo;
    }

    if (scheduledTime !== undefined) {
      session.scheduledTime = scheduledTime;
    }

    if (scheduledJobId !== undefined) {
      session.scheduledJobId = scheduledJobId;
    }

    await writeSessions(sessions);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('更新会话失败:', error);
    return NextResponse.json({ error: '更新会话失败' }, { status: 500 });
  }
}

// DELETE: 删除会话
export async function DELETE(request) {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: '缺少会话 ID' }, { status: 400 });
    }

    const sessions = await readSessions();
    const filteredSessions = sessions.filter(s => s.id !== id);
    
    await writeSessions(filteredSessions);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除会话失败:', error);
    return NextResponse.json({ error: '删除会话失败' }, { status: 500 });
  }
} 