/**
 * 小程序 API 根地址。
 *
 * 默认指向部署域名；如需本地联调，可在控制台执行：
 * uni.setStorageSync('bibi_api_base', 'http://你的局域网IP:3000')
 */
const DEFAULT_API_BASE = 'http://110.42.229.152:3000'

let runtimeApiBase = DEFAULT_API_BASE

try {
  if (typeof uni !== 'undefined') {
    const cached = uni.getStorageSync('bibi_api_base')
    if (cached) {
      runtimeApiBase = cached
    }
  }
} catch (error) {
  runtimeApiBase = DEFAULT_API_BASE
}

export const API_BASE = String(runtimeApiBase).replace(/\/$/, '')
