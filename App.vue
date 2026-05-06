<script>
import { isLoggedIn } from './utils/session.js'
import { fetchMe } from './utils/api.js'
import { refreshTabBadges } from './utils/badges.js'

export default {
  async onLaunch() {
    // #ifdef APP-PLUS
    // 强制设置状态栏样式为黑色图标，适应浅色背景
    plus.navigator.setStatusBarStyle('dark')
    // 开屏动画检查与手动关闭：
    // 设置 autoclose: false 后，必须在此处手动调用 closeSplashscreen。
    // 使用稍长的时间（1.5s - 2s）可以确保首屏（尤其是自定义导航栏页面）完全渲染完毕，
    // 避免出现短暂的白屏或布局跳动（状态栏避让逻辑生效前的瞬间）。
    setTimeout(() => {
      plus.navigator.closeSplashscreen({
        animationType: 'fade-out',
        duration: 300
      })
    }, 1500)
    // #endif

    // NOTE: onLaunch 阶段 getCurrentPages() 为空，不能依赖 ensureLogin()
    // 直接跳转登录页，避免首页在未登录状态下发起请求导致 401 报错
    if (!isLoggedIn()) {
      uni.reLaunch({ url: '/pages/login/login' })
      return
    }

    try {
      await fetchMe()
      await refreshTabBadges()
    } catch (error) {
      console.error('[App:onLaunch]', error)
      // NOTE: fetchMe 失败可能是 token 过期，跳转登录页
      uni.reLaunch({ url: '/pages/login/login' })
    }
  },
  async onShow() {
    // NOTE: 未登录状态下不需要刷新徽章，静默返回即可
    if (!isLoggedIn()) {
      return
    }

    try {
      await refreshTabBadges()
    } catch (error) {
      console.error('[App:onShow]', error)
    }
  }
}
</script>

<style>
page {
  background-color: #f6f7f8;
}

/* 全局状态栏占位符 */
.status-bar {
  height: var(--status-bar-height);
  width: 100%;
  background-color: transparent;
}
</style>
