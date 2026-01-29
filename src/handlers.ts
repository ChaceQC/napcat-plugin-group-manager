import { NapCatPluginContext } from 'napcat-types';
import { currentConfig } from './config';

// 封装 API 调用，专门处理 "No data returned" 误报
async function callOB11(ctx: NapCatPluginContext, action: string, params: any) {
    try {
        const result = await ctx.actions.call(action, params, ctx.adapterName, ctx.pluginManager.config);
        return result;
    } catch (e: any) {
        // 核心修复：如果错误包含 "No data returned"，视为成功
        if (typeof e === 'object' && e.message && e.message.includes('No data returned')) {
            ctx.logger.warn(`[OB11] ${action} 执行成功但无返回数据 (已忽略报错)`);
            return { status: 'ok', retcode: 0, data: null, message: 'Success (No data)' };
        }

        // 其他错误正常抛出
        ctx.logger.error(`[OB11] Call ${action} failed:`, e);
        throw e;
    }
}

// 消息处理（命令 + 过滤）
export async function onMessage(ctx: NapCatPluginContext, event: any) {
    if (event.message_type !== 'group') return;

    const msg = event.raw_message?.trim() || '';
    const groupId = String(event.group_id);
    const userId = String(event.user_id);
    const senderRole = event.sender?.role;

    // --- 1. 违禁词过滤 ---
    if (currentConfig.filterEnable && currentConfig.filterKeywords) {
        const keywords = currentConfig.filterKeywords.split('|').filter(k => k);
        if (keywords.some(k => msg.includes(k))) {
            try {
                ctx.logger.info(`[Filter] 检测到违禁词，撤回消息: ${event.message_id}`);

                await callOB11(ctx, 'delete_msg', { message_id: event.message_id });

                if (currentConfig.filterPunish === 'ban') {
                    await callOB11(ctx, 'set_group_ban', { group_id: groupId, user_id: userId, duration: 60 });
                } else if (currentConfig.filterPunish === 'kick') {
                    // 使用 set_group_kick_members 替代 set_group_kick
                    await callOB11(ctx, 'set_group_kick_members', {
                        group_id: groupId,
                        user_id: [userId],
                        reject_add_request: false
                    });
                }
            } catch (e) {
                // 忽略违禁词处理过程中的错误，防止刷屏报错
            }
            return;
        }
    }

    // --- 2. 管理员命令 ---
    if (!msg.startsWith('/') || !['owner', 'admin'].includes(senderRole)) return;

    const parts = msg.split(' ');
    const command = parts[0];

    try {
        // 提取 @ 的目标 ID
        const atSeg = Array.isArray(event.message) ? event.message.find((s: any) => s.type === 'at') : null;
        const targetId = atSeg ? String(atSeg.data?.qq) : null;

        // 踢人: /kick @xxx
        if (command === '/kick' && targetId) {
            // 修正：NapCat 文档推荐使用 set_group_kick_members
            await callOB11(ctx, 'set_group_kick_members', {
                group_id: groupId,
                user_id: [targetId],
                reject_add_request: false
            });
            await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已踢出成员 ${targetId}` });
        }
        // 禁言: /ban @xxx [秒数]
        else if (command === '/ban' && targetId) {
            const time = parseInt(parts[2]) || 600;
            await callOB11(ctx, 'set_group_ban', { group_id: groupId, user_id: targetId, duration: time });
            await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已禁言 ${targetId} ${time}秒` });
        }
        // 解除禁言: /unban @xxx
        else if (command === '/unban' && targetId) {
            await callOB11(ctx, 'set_group_ban', { group_id: groupId, user_id: targetId, duration: 0 });
            await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: `已解除 ${targetId} 禁言` });
        }
        // 全员禁言: /muteall
        else if (command === '/muteall') {
            await callOB11(ctx, 'set_group_whole_ban', { group_id: groupId, enable: true });
            await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '全员禁言已开启' });
        }
        // 解除全员禁言: /unmuteall
        else if (command === '/unmuteall') {
            await callOB11(ctx, 'set_group_whole_ban', { group_id: groupId, enable: false });
            await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '全员禁言已关闭' });
        }

    } catch (e) {
        ctx.logger.error('[Command] 执行异常', e);
        // 仅在非 "No data" 错误时提示
        await callOB11(ctx, 'send_group_msg', { group_id: groupId, message: '命令执行出错，请查看日志' }).catch(() => {});
    }
}

// 事件处理（入群欢迎）
export async function onEvent(ctx: NapCatPluginContext, event: any) {
    if (event.post_type === 'notice' && event.notice_type === 'group_increase') {
        if (!currentConfig.welcomeEnable) return;

        const groupId = String(event.group_id);
        const userId = String(event.user_id);

        let nickname = userId;
        try {
            const resp = await callOB11(ctx, 'get_group_member_info', { group_id: groupId, user_id: userId, no_cache: true });
            if (resp && resp.data) {
                nickname = resp.data.nickname || resp.data.card || userId;
            }
        } catch {}

        const msgText = currentConfig.welcomeTemplate
            .replace(/{nickname}/g, nickname)
            .replace(/{user_id}/g, userId);

        await callOB11(ctx, 'send_group_msg', {
            group_id: groupId,
            message: [
                { type: 'at', data: { qq: userId } },
                { type: 'text', data: { text: ` ${msgText}` } }
            ]
        });
    }
}