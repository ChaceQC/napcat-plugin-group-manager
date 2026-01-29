// 简单的权限判断辅助函数
export function isAdmin(role: string): boolean {
    return role === 'admin' || role === 'owner';
}