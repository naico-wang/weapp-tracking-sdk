// index.js

Page({
  data: {},
  onLoad() {
    // trackthis();
    console.log('onLoad')
  },
  bindViewTap() {
    wx.navigateTo({
      url: '../logs/logs'
    })
  },
  onButtonClick() {
    wx.navigateTo({
      url: '../logs/logs'
    })
  }
})
