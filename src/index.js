// WeChatTrackingSDK.js
class WeChatTrackingSDK {
  constructor(config) {
    this.serverUrl = config.serverUrl || 'https://api2.middleware.sit.marriott.com.cn/frontend-log-service/api/logs'
    this.originalPage = Page;
    this.originalComponent = Component;
    this.originalApp = App;
    this.lifecycleHooks = ['onLoad', 'onShow', 'onHide', 'onUnload'];
  }

  // 初始化 SDK
  init() {
    this.hookApp();
    this.hookPage();
    this.hookComponent();
    this.collectPerformance();
  }

  // Hook App 的生命周期
  hookApp() {
    const _this = this;
    App = function(appOptions) {
      ['onLaunch', 'onShow', 'onHide', 'onError'].forEach((hook) => {
        const originalHook = appOptions[hook];
        appOptions[hook] = function(...args) {
          _this.trackLifecycle('App', hook);
          if (originalHook) {
            originalHook.apply(this, args);
          }
        };
      });

      _this.originalApp(appOptions);
    };
  }

  // Hook Page 的生命周期和自定义点击方法
  hookPage() {
    const _this = this;
    Page = function(pageOptions) {
      // Hook 页面生命周期
      _this.lifecycleHooks.forEach((hook) => {
        const originalHook = pageOptions[hook];
        pageOptions[hook] = function(...args) {
          _this.trackLifecycle('Page', hook, this.route);
          if (originalHook) {
            originalHook.apply(this, args);
          }
        };
      });

      // Hook 自定义点击方法
      Object.keys(pageOptions).forEach((key) => {
        if (typeof pageOptions[key] === 'function' && key.startsWith('on')) {
          const originalMethod = pageOptions[key];
          pageOptions[key] = function(event) {
            if (event && event.type === 'tap') {
              _this.trackClickEvent(this.route, key, event);
            }
            originalMethod.apply(this, arguments);
          };
        }
      });

      _this.originalPage(pageOptions);
    };
  }

  // Hook Component 的生命周期和自定义点击方法
  hookComponent() {
    const _this = this;
    Component = function(componentOptions) {
      // Hook 组件生命周期
      _this.lifecycleHooks.forEach((hook) => {
        const originalHook = componentOptions[hook];
        componentOptions[hook] = function(...args) {
          _this.trackLifecycle('Component', hook, this.is);
          if (originalHook) {
            originalHook.apply(this, args);
          }
        };
      });

      // Hook 组件自定义点击方法
      Object.keys(componentOptions.methods || {}).forEach((key) => {
        if (typeof componentOptions.methods[key] === 'function') {
          const originalMethod = componentOptions.methods[key];
          componentOptions.methods[key] = function(event) {
            if (event && event.type === 'tap') {
              _this.trackClickEvent(this.is, key, event);
            }
            originalMethod.apply(this, arguments);
          };
        }
      });

      _this.originalComponent(componentOptions);
    };
  }

  // 收集小程序的性能参数
  collectPerformance() {
    const performance = wx.getPerformance();
    const observer = performance.createObserver((entryList) => {
      entryList.getEntries().forEach((entry) => {
        this.trackPerformance(entry);
      });
    });

    observer.observe({ entryTypes: ['render', 'script', 'navigation'] });

    // 收集启动时间
    const launchTime = performance.now();
    this.trackPerformance({ name: 'launch', startTime: launchTime });
  }

  // 生命周期事件追踪
  trackLifecycle(type, hook, identifier = '') {
    console.log(`[Tracking] ${type} - ${hook} - ${identifier}`);
    // 这里可以上传数据到服务器
  }

  // 点击事件追踪
  trackClickEvent(component, methodName, event) {
    console.log(`[Tracking] Click - ${component} - ${methodName} - ${JSON.stringify(event.detail)}`);
    // 这里可以上传数据到服务器
  }

  // 性能参数追踪
  trackPerformance(entry) {
    console.log(entry)
    console.log(`[Tracking] Performance - ${entry.name} - StartTime: ${entry.startTime}`);
    // 这里可以上传数据到服务器
  }

  buildTrackingParams() {
    // 获取当前时间 yyyyMMddHHmmss
    const currentTime = Math.floor(Date.now() / 1000);
    // 模拟日志数据
    const logData = {
      logs: [{
        time: currentTime,
        contents: [{
          key: "action",
          value: "user called a service"
        }, {
          key: "userId",
          value: 'test_user_id_12345'
        }, {
          key: "traceId",
          value: this.uuid()
        }]
      }],
      topic,
      source
    };
    // 拼接待加密字符串
    const rawString = currentTime + 'marriottlog' + JSON.stringify(logData);
    // 使用SHA512加密
    const encryptedLog = CryptoJS.SHA512(rawString).toString();
    // 准备要发送到服务器的数据
    const payload = {
      data: logData,
      sign: encryptedLog,
      timestamp: currentTime
    };
  }
}

// 导出 SDK 类实例
module.exports = new WeChatTrackingSDK();
