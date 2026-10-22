// 认证相关错误码 → 给人看的中文说明。
// 单独一份是给页面和接口共用：接口只回 code（URL 干净、便于日志统计），
// 页面负责翻译成人话。code 里绝不能带邮箱是否存在之类的细节——
// 否则等于给攻击者一个「这个邮箱已注册」的探测接口。
export const AUTH_ERRORS: Record<string, string> = {
  'bad-form': '提交的数据有问题，请重试。',
  'bad-email': '邮箱格式看起来不对，请检查一下。',
  'bad-name': '昵称请填 1–24 个字。',
  'weak-password': '密码至少 8 位。',
  'long-password': '密码太长了（最多 128 位）。',
  'password-mismatch': '两次输入的密码不一致。',
  'email-taken': '这个邮箱已经注册过了，直接登录即可。',
  'bad-credentials': '邮箱或密码不对。',
  suspended: '这个账号已被停用，请联系站长。',
  empty: '邮箱和密码都要填。',
  'captcha-missing': '人机验证没完成，请稍等一下再试。',
  'captcha-failed': '人机验证没通过，请重试。',
  'captcha-unreachable': '人机验证服务暂时连不上，请稍后再试。',
  'captcha-not-configured': '站点的人机验证还没配置好，请联系站长。',
  'not-logged-in': '请先登录。',
  'no-permission': '当前身份没有这个权限。',
  'already-applied': '你已经有一条待审核的申请了，等站长处理即可。',
  'applied-recently': '你的申请刚刚被驳回，请过几天再提。',
  'bad-reason': '自荐理由请写 20–800 字，说明你在站内的活跃情况。',
  'not-pending': '这条申请已经被处理过了。',
  'not-found': '没有找到这条记录。',
  'last-owner': '不能停用/降级站长自己。',
};

export function authError(code: string | null | undefined): string | null {
  if (!code) return null;
  return AUTH_ERRORS[code] ?? '出了点问题，请重试。';
}
