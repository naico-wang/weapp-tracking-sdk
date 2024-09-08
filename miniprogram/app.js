// app.js
import WeChatTrackingSDK from './tracking.js'

WeChatTrackingSDK.init({
  // serverUrl: 'https://api2.middleware.sit.marriott.com.cn/frontend-log-service/api/logs'
})

App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录
    wx.login({
      success: res => {
        // 发送 res.code 到后台换取 openId, sessionKey, unionId
      }
    })
  },
  globalData: {
    userInfo: null
  }
})
