// @ts-ignore
import { NapCatPluginContext } from 'napcat-types';
import { currentConfig, saveConfig } from './config';
import { LockedUser, TargetedUser } from './types';

// 辅助：HTML 实体解码 (新增)
// 用于处理 &#91;Bot&#93; 这类转义字符
function decodeHtml(str: string): string {
  if (!str) return str;
  return str
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec)) // 十进制实体 &#91; -> [
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))) // 十六进制
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
}

// 辅助：API 调用封装
async function callOB11 (ctx: NapCatPluginContext, action: string, params: any) {
  try {
    const result = await ctx.actions.call(action, params, ctx.adapterName, ctx.pluginManager.config);
    return result;
  } catch (e: any) {
    if (typeof e === 'object' && e.message && e.message.includes('No data returned')) {
      return { status: 'ok', retcode: 0, data: null };
    }
    ctx.logger.error(`[OB11] Call ${action} failed:`, e);
    throw e;
  }
}

// 辅助：检查群是否允许运行插件
function isGroupAllowed (groupId: string): boolean {
  const { groupListMode, groupListIds } = currentConfig;
  if (groupListMode === 'none') return true;

  const list = groupListIds.split(',').map(id => id.trim()).filter(id => id);
  if (groupListMode === 'blacklist') {
    return !list.includes(groupId);
  } else if (groupListMode === 'whitelist') {
    return list.includes(groupId);
  }
  return true;
}

// 辅助：获取用户锁定信息 (兼容旧版 string 数据)
function getLockedInfo (groupId: string, userId: string): LockedUser | null {
  const data = currentConfig.lockedNicknames?.[groupId]?.[userId];
  if (!data) return null;
  if (typeof data === 'string') {
    return { nickname: data, lockedByAdmin: true };
  }
  return data;
}

// 辅助：获取用户是否被针对
function getTargetedInfo (groupId: string, userId: string): TargetedUser | null {
  return currentConfig.targetedUsers?.[groupId]?.[userId] || null;
}

// 辅助：检查是否为主人
function isOwner (userId: string): boolean {
  const owners = (currentConfig.ownerQQs || '').split(',').map(s => s.trim()).filter(s => s);
  return owners.includes(userId);
}

// 消息处理
export async function onMessage (ctx: NapCatPluginContext, event: any) {
  if (event.message_type !== 'group') return;
  const groupId = String(event.group_id);

  // 黑白名单检查
  if (!isGroupAllowed(groupId)) return;

  const msg = event.raw_message?.trim() || '';
  const userId = String(event.user_id);
  const sender = event.sender || {};
  const senderRole = sender.role;
  const isAdmin = ['owner', 'admin'].includes(senderRole) || isOwner(userId);

  // --- [新增] 0. 锁定昵称被动检查 (核心修复：发言时强制检查) ---
  // 即使收不到 group_card 通知，只要用户说话，我们就能检测到并纠正
  const lockedInfo = getLockedInfo(groupId, userId);
  if (lockedInfo) {
    // sender.card 是用户当前的名片，如果为空字符串表示未设置
    const currentCard = sender.card || '';
    if (currentCard !== lockedInfo.nickname) {
      ctx.logger.info(`[MsgCheck] 监测到 ${userId} 名片异常(当前: "${currentCard}", 锁定: "${lockedInfo.nickname}")，正在执行修正...`);
      // 立即改回
      await callOB11(ctx, 'set_group_card', { group_id: groupId, user_id: userId, card: lockedInfo.nickname });
    }
  }

  // --- 1. 针对用户检查 (被针对的用户发消息立即撤回) ---
  const targetedInfo = getTargetedInfo(groupId, userId);
  if (targetedInfo && !isAdmin) {
    try {
      await callOB11(ctx, 'delete_msg', { message_id: event.message_id });
      ctx.logger.info(`[Targeted] 已撤回被针对用户 ${userId} 的消息`);
    } catch (e) { }
    return;
  }

  // --- 2. 违禁词过滤 ---
  if (!isAdmin && currentConfig.filterEnable && currentConfig.filterKeywords) {
    const keywords = currentConfig.filterKeywords.split('|').filter(k => k);
    if (keywords.some(k => msg.includes(k))) {
      try {
        await callOB11(ctx, 'delete_msg', { message_id: event.message_id });
        if (currentConfig.filterPunish === 'ban') {
          await callOB11(ctx, 'set_group_ban', { group_id: groupId, user_id: userId, duration: 60 });
        } else if (currentConfig.filterPunish === 'kick') {
          await callOB11(ctx, 'set_group_kick_members', { group_id: groupId, user_id: [userId], reject_add_request: false });
        }
      } catch (e) { }
      return;
    }
  }

  // --- 3. 针对命令 (无需/前缀) ---
  const atSeg = Array.isArray(event.message) ? event.message.find((s: any) => s.type === 'at') : null;
  const targetId = atSeg ? String(atSeg.data?.qq) : null;

  if (isAdmin) {
    if (msg.startsWith('针对') && !msg.startsWith('针对列表')) {
      const targetQQ = targetId || msg.replace('针对', '').trim();
      if (!targetQQ) {
        await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '请指定要针对的用户 (@ 或 QQ号)' });
        return;
      }
      if (!currentConfig.targetedUsers) currentConfig.targetedUsers = {};
      if (!currentConfig.targetedUsers[groupId]) currentConfig.targetedUsers[groupId] = {};
      currentConfig.targetedUsers[groupId][targetQQ] = { addedBy: userId, addedAt: Date.now() };
      saveConfig(ctx, { targetedUsers: currentConfig.targetedUsers });
      await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已针对 ${targetQQ}，该用户发言将被立即撤回` });
      return;
    }
    if (msg.startsWith('取消针对')) {
      const targetQQ = targetId || msg.replace('取消针对', '').trim();
      if (!targetQQ) {
        await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '请指定要取消针对的用户 (@ 或 QQ号)' });
        return;
      }
      if (currentConfig.targetedUsers?.[groupId]?.[targetQQ]) {
        delete currentConfig.targetedUsers[groupId][targetQQ];
        saveConfig(ctx, { targetedUsers: currentConfig.targetedUsers });
        await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已取消针对 ${targetQQ}` });
      } else {
        await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `${targetQQ} 未在针对列表中` });
      }
      return;
    }
    if (msg === '针对列表') {
      const list = currentConfig.targetedUsers?.[groupId];
      if (!list || Object.keys(list).length === 0) {
        await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '当前没有被针对的用户' });
      } else {
        const users = Object.keys(list).join(', ');
        await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `当前被针对的用户: ${users}` });
      }
      return;
    }
  }

  // --- 4. 命令处理 (需/前缀) ---
  if (!msg.startsWith('/')) return;

  const parts = msg.split(/\s+/);
  const command = parts[0];

  try {
    // 管理员指令
    if (isAdmin) {
      if (command === '/kick' && targetId) {
        await callOB11(ctx, 'set_group_kick_members', { group_id: groupId, user_id: [targetId], reject_add_request: false });
        await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已踢出成员 ${targetId}` });
        return;
      }
      if (command === '/ban' && targetId) {
        const time = parseInt(parts[2]) || 600;
        await callOB11(ctx, 'set_group_ban', { group_id: groupId, user_id: targetId, duration: time });
        await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已禁言 ${targetId} ${time}秒` });
        return;
      }
      if (command === '/unban' && targetId) {
        await callOB11(ctx, 'set_group_ban', { group_id: groupId, user_id: targetId, duration: 0 });
        await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已解除 ${targetId} 禁言` });
        return;
      }
      if (command === '/muteall') {
        await callOB11(ctx, 'set_group_whole_ban', { group_id: groupId, enable: true });
        return;
      }
      if (command === '/unmuteall') {
        await callOB11(ctx, 'set_group_whole_ban', { group_id: groupId, enable: false });
        return;
      }
    }

    // 锁定昵称
    if (command === '/lockname') {
      const isSelf = !targetId;
      const operateTargetId = targetId || userId;

      // [修改] 提取昵称逻辑：支持空格
      let rawName = parts.slice(isSelf ? 1 : 2).join(' ').trim();

      // [修改] URL 解码逻辑
      try {
        if (rawName && rawName.includes('%')) {
          rawName = decodeURIComponent(rawName);
        }
      } catch (e) { }

      // [新增] HTML 实体解码逻辑 (解决 &#91;Bot&#93; 问题)
      if (rawName) {
        rawName = decodeHtml(rawName);
      }

      const newName = rawName;

      if (!newName) {
        await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '请指定要锁定的昵称' });
        return;
      }

      if (isSelf) {
        const currentLock = getLockedInfo(groupId, userId);
        if (currentLock && currentLock.lockedByAdmin) {
          await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '您的昵称已被管理员锁定，无法自行修改' });
          return;
        }
      } else {
        if (!isAdmin) {
          await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '权限不足，无法锁定他人昵称' });
          return;
        }
      }

      await callOB11(ctx, 'set_group_card', { group_id: groupId, user_id: operateTargetId, card: newName });

      if (!currentConfig.lockedNicknames) currentConfig.lockedNicknames = {};
      if (!currentConfig.lockedNicknames[groupId]) currentConfig.lockedNicknames[groupId] = {};

      currentConfig.lockedNicknames[groupId][operateTargetId] = {
        nickname: newName,
        lockedByAdmin: !isSelf
      };
      saveConfig(ctx, { lockedNicknames: currentConfig.lockedNicknames });

      const operatorStr = isSelf ? '自己' : '管理员';
      await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已${operatorStr}锁定 ${operateTargetId} 的昵称为: ${newName}` });
    }

    // 解锁昵称
    else if (command === '/unlockname') {
      const isSelf = !targetId;
      const operateTargetId = targetId || userId;

      if (isSelf) {
        const currentLock = getLockedInfo(groupId, userId);
        if (currentLock && currentLock.lockedByAdmin) {
          await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '您的昵称由管理员锁定，请联系管理员解锁' });
          return;
        }
      } else {
        if (!isAdmin) {
          await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '权限不足' });
          return;
        }
      }

      if (currentConfig.lockedNicknames?.[groupId]?.[operateTargetId]) {
        delete currentConfig.lockedNicknames[groupId][operateTargetId];
        saveConfig(ctx, { lockedNicknames: currentConfig.lockedNicknames });
        await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已解除 ${operateTargetId} 的昵称锁定` });
      } else {
        await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '该用户未被锁定昵称' });
      }
    }

  } catch (e) {
    ctx.logger.error('[Command] 执行异常', e);
    await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '指令执行出错' }).catch(() => { });
  }
}

// 事件处理
export async function onEvent (ctx: NapCatPluginContext, event: any) {
  const groupId = String(event.group_id);
  if (groupId && !isGroupAllowed(groupId)) return;

  // 入群欢迎 + 入群强制改名
  if (event.post_type === 'notice' && event.notice_type === 'group_increase') {
    const userId = String(event.user_id);

    // 检查是否有锁定昵称，如果有，延迟执行改名 (防止入群事件处理过快导致API失败)
    const lockedInfo = getLockedInfo(groupId, userId);
    if (lockedInfo) {
      setTimeout(async () => {
        ctx.logger.info(`[EnterCheck] 新成员 ${userId} 存在锁定昵称，正在执行应用...`);
        await callOB11(ctx, 'set_group_card', { group_id: groupId, user_id: userId, card: lockedInfo.nickname });
      }, 1500);
    }

    if (currentConfig.welcomeEnable) {
      let nickname = userId;
      try {
        const resp = await callOB11(ctx, 'get_group_member_info', { group_id: groupId, user_id: userId, no_cache: true });
        if (resp?.data) nickname = resp.data.nickname || resp.data.card || userId;
      } catch { }

      const msg = currentConfig.welcomeTemplate.replace(/{nickname}/g, nickname).replace(/{user_id}/g, userId);
      await callOB11(ctx, 'send_group_msg', {
        group_id: groupId,
        message: [{ type: 'at', data: { qq: userId } }, { type: 'text', data: { text: ` ${msg}` } }]
      });
    }
  }

  // 群名片变更监控 (如果 NapCat 支持此事件则生效)
  if (event.post_type === 'notice' && event.notice_type === 'group_card') {
    const userId = String(event.user_id);
    const newCard = event.card_new;
    const lockedInfo = getLockedInfo(groupId, userId);

    if (lockedInfo && newCard !== lockedInfo.nickname) {
      ctx.logger.info(`[EventCheck] 监测到 ${userId} 修改了昵称，正在回退...`);
      await callOB11(ctx, 'set_group_card', { group_id: groupId, user_id: userId, card: lockedInfo.nickname });
    }
  }
}