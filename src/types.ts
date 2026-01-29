// 定义配置接口
export interface PluginConfig {
    welcomeEnable: boolean;
    welcomeTemplate: string;
    filterEnable: boolean;
    filterKeywords: string;
    filterPunish: 'none' | 'ban' | 'kick';
}

// 默认配置
export const DEFAULT_CONFIG: PluginConfig = {
    welcomeEnable: true,
    welcomeTemplate: '欢迎 {nickname}({user_id}) 加入本群！',
    filterEnable: false,
    filterKeywords: '加群|兼职|博彩',
    filterPunish: 'none'
};