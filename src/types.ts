// 定义锁定用户的详细信息
export interface LockedUser {
  nickname: string;
  lockedByAdmin: boolean; // 是否由管理员锁定（管理员锁定的，普通用户不能改）
}

// 定义配置接口
export interface PluginConfig {
  ownerQQs: string; // 主人QQ列表，逗号分隔
  welcomeEnable: boolean;
  welcomeTemplate: string;
  filterEnable: boolean;
  filterKeywords: string;
  filterPunish: 'none' | 'ban' | 'kick';

  // 群组黑白名单
  groupListMode: 'none' | 'blacklist' | 'whitelist';
  groupListIds: string;

  // 固定昵称数据
  // 结构: { "群号": { "QQ号": { nickname: "名字", lockedByAdmin: true/false } } }
  // 兼容性注：如果读取到旧版 string 类型，代码中需自动兼容
  lockedNicknames: Record<string, Record<string, LockedUser | string>>;

  // 被针对用户数据
  // 结构: { "群号": { "QQ号": { addedBy: "添加者QQ", addedAt: 时间戳 } } }
  targetedUsers: Record<string, Record<string, TargetedUser>>;
}

// 被针对用户信息
export interface TargetedUser {
  addedBy: string; // 添加者QQ
  addedAt: number; // 添加时间戳
}

// 默认配置
export const DEFAULT_CONFIG: PluginConfig = {
  ownerQQs: '',
  welcomeEnable: true,
  welcomeTemplate: '欢迎 {nickname}({user_id}) 加入本群！',
  filterEnable: false,
  filterKeywords: '加群|兼职|博彩',
  filterPunish: 'none',

  groupListMode: 'none',
  groupListIds: '',
  lockedNicknames: {},
  targetedUsers: {}
};