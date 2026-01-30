// @ts-ignore
import { NapCatPluginContext } from 'napcat-types';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, PluginConfig } from './types';

// 内存中的配置缓存
export let currentConfig: PluginConfig = { ...DEFAULT_CONFIG };

// 初始化配置（从文件加载）
export function loadConfig(ctx: NapCatPluginContext) {
    const configFilePath = ctx.configPath;

    try {
        if (fs.existsSync(configFilePath)) {
            const raw = fs.readFileSync(configFilePath, 'utf-8');
            const loaded = JSON.parse(raw);
            currentConfig = { ...DEFAULT_CONFIG, ...loaded };
            ctx.logger.info('配置已加载');
        } else {
            saveConfig(ctx, DEFAULT_CONFIG);
        }
    } catch (e) {
        ctx.logger.error('加载配置失败', e);
    }
}

// 保存配置到文件
export function saveConfig(ctx: NapCatPluginContext, newConfig: Partial<PluginConfig>) {
    const configFilePath = ctx.configPath;

    try {
        currentConfig = { ...currentConfig, ...newConfig };

        const dir = path.dirname(configFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(configFilePath, JSON.stringify(currentConfig, null, 2), 'utf-8');
        ctx.logger.info('配置已保存');
    } catch (e) {
        ctx.logger.error('保存配置失败', e);
    }
}

// 构建配置 UI
export function buildConfigUI(ctx: NapCatPluginContext) {
    const { NapCatConfig } = ctx;

    return NapCatConfig.combine(
        NapCatConfig.html('<div style="padding:10px; border-bottom:1px solid #ccc;"><h3>🛡️ 群管插件设置</h3></div>'),

        // --- 黑白名单设置 ---
        NapCatConfig.html('<div style="margin-top:10px;"><b>📋 群组名单控制</b></div>'),
        NapCatConfig.select('groupListMode', '名单模式', [
            { label: '不启用 (管理所有群)', value: 'none' },
            { label: '黑名单 (忽略下列群)', value: 'blacklist' },
            { label: '白名单 (只管下列群)', value: 'whitelist' }
        ], DEFAULT_CONFIG.groupListMode, '选择插件生效的范围'),
        NapCatConfig.text('groupListIds', '群号列表', DEFAULT_CONFIG.groupListIds, '多个群号用英文逗号 , 分隔'),

        // --- 入群欢迎 ---
        NapCatConfig.html('<div style="margin-top:20px;"><b>👋 入群欢迎</b></div>'),
        NapCatConfig.boolean('welcomeEnable', '启用入群欢迎', DEFAULT_CONFIG.welcomeEnable, '是否在新成员入群时发送欢迎语'),
        NapCatConfig.text('welcomeTemplate', '欢迎语模板', DEFAULT_CONFIG.welcomeTemplate, '支持变量: {nickname}, {user_id}'),

        // --- 违禁词 ---
        NapCatConfig.html('<div style="margin-top:20px;"><b>🚫 违禁词过滤</b></div>'),
        NapCatConfig.boolean('filterEnable', '启用关键词过滤', DEFAULT_CONFIG.filterEnable, '检测到关键词自动撤回'),
        NapCatConfig.text('filterKeywords', '违禁词列表', DEFAULT_CONFIG.filterKeywords, '使用 | 分隔多个词'),
        NapCatConfig.select('filterPunish', '触发惩罚', [
            { label: '仅撤回', value: 'none' },
            { label: '撤回并禁言1分钟', value: 'ban' },
            { label: '撤回并踢出', value: 'kick' }
        ], DEFAULT_CONFIG.filterPunish, '触发违禁词后的额外操作')
    );
}