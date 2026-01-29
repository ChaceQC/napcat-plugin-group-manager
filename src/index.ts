import { NapCatPluginContext } from 'napcat-types';
import { loadConfig, saveConfig, currentConfig, buildConfigUI } from './config';
import { onMessage, onEvent } from './handlers';

// 1. 定义导出的配置 UI 变量 (NapCat 会读取这个变量)
export let plugin_config_ui: any = [];

// 2. 插件初始化
export async function plugin_init(ctx: NapCatPluginContext) {
    ctx.logger.info('正在加载 Group Manager...');

    // 加载本地配置
    loadConfig(ctx);

    // 初始化配置界面 (赋值给导出的变量，而不是 ctx)
    plugin_config_ui = buildConfigUI(ctx);

    ctx.logger.info('Group Manager 加载完成!');
}

// 3. 返回当前配置 (用于前端回显)
export async function plugin_get_config(ctx: NapCatPluginContext) {
    return currentConfig;
}

// 4. 配置变更监听 (保存配置)
export function plugin_on_config_change(ctx: NapCatPluginContext, _: any, key: string, value: any) {
    saveConfig(ctx, { [key]: value });
}

// 5. 导出消息和事件处理器
export const plugin_onmessage = onMessage;
export const plugin_onevent = onEvent;