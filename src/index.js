const CryptoJS = require('crypto-js')
const uuidStorageKey = 'mtt_uuid'
const LOG_TYPE = {
  LC: 'lifecycle',
  EVENT: 'events',
  PERF: 'performance',
  ERROR: 'error'
}

class WeChatTrackingSDK {
  constructor() {
    this.originalPage = Page;
    this.originalComponent = Component;
    this.originalApp = App;
    this.lifecycleHooks = ['onLoad', 'onShow', 'onHide', 'onUnload'];
    this.trackingData = [];
    this.isSending = false;
    this.serverUrl = null;
    this.sendToServer = false

    this.generateUUID()
  }

  generateUUID() {
    return wx.setStorageSync(uuidStorageKey, this.getUUid())
  }

  // 初始化 SDK
  init(options = {}) {
    if (options) {
      this.serverUrl = options.serverUrl || 'https://api2.middleware.sit.marriott.com.cn/frontend-log-service/api/logs';
      this.appId = options.appId || ''
      this.uIdStorageKey = options?.uIdStorageKey || 'userId'
      this.sendLog = options?.sendLog || false
    }

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
          if (hook === 'onShow') {
            _this.flushTrackingData();  // 在小程序进入后台时发送追踪数据
          }
          if (hook === 'onError') {
            _this.trackErrorMessage(...args);
          }
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
          if (hook === 'onUnload') {
            _this.flushTrackingData();  // 在页面卸载时发送追踪数据
          }
          if (originalHook) {
            originalHook.apply(this, args);
          }
        };
      });

      // Hook 自定义点击方法
      Object.keys(pageOptions).forEach((key) => {
        if (typeof pageOptions[key] === 'function') {
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
          if (hook === 'onUnload') {
            _this.flushTrackingData();  // 在组件卸载时发送追踪数据
          }
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

    observer.observe({ entryTypes: ['render', 'navigation'] });

    // 收集启动时间
    const launchTime = performance.now();

    this.trackPerformance({ entryType: 'App', path: '/', name: 'launch', startTime: launchTime, duration: 0, referrerPath: '' });
  }

  trackErrorMessage(error) {
    const data = this.buildTrackingParams(LOG_TYPE.ERROR, JSON.stringify(error))

    this.trackingData.push(data)
  }

  // 生命周期事件追踪
  trackLifecycle(type, hook, identifier = '') {
    const data = this.buildTrackingParams(LOG_TYPE.LC, { type, hook, identifier })

    this.trackingData.push(data);
  }

  // 点击事件追踪
  trackClickEvent(component, methodName, event) {
    const data = this.buildTrackingParams(LOG_TYPE.EVENT, { component, methodName, event })

    this.trackingData.push(data);
  }

  // 性能参数追踪
  trackPerformance(entry) {
    const data = this.buildTrackingParams(LOG_TYPE.PERF, entry)

    this.trackingData.push(data)
  }

  getUUid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        let r = Math.random() * 16 | 0,
            v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
  }


  buildTrackingParams(type, extraData) {
    const baseParams = this.getBaseParams()

    if (type === LOG_TYPE.PERF) {
      baseParams.contents.push(...this.getPerformanceParams(extraData))
    }

    if (type === LOG_TYPE.EVENT) {
      baseParams.contents.push(...this.getEventParams(extraData))
    }

    if (type === LOG_TYPE.LC) {
      baseParams.contents.push(...this.getLifeTimeParams(extraData))
    }

    if (type === LOG_TYPE.ERROR) {
      baseParams.contents.push(...this.getErrorParams(extraData))
    }

    return baseParams
  }

  getErrorParams(data) {
    const params = []

    params.push({
      'key': 'type',
      'value': LOG_TYPE.ERROR
    })
    params.push({
      'key': 'path',
      'value': ''
    })
    params.push({
      'key': 'referrerPath',
      'value': ''
    })
    params.push({
      'key': 'description',
      'value': data
    })

    return params
  }

  getLifeTimeParams(data) {
    const params = []

    params.push({
      'key': 'type',
      'value': LOG_TYPE.LC
    })
    params.push({
      'key': 'path',
      'value': data.identifier
    })
    params.push({
      'key': 'referrerPath',
      'value': ''
    })
    params.push({
      'key': 'description',
      'value': `[${data.type}] - ${data.hook} - ${data.identifier}`
    })

    return params
  }

  getEventParams(data) {
    const params = []

    params.push({
      'key': 'type',
      'value': LOG_TYPE.EVENT
    })
    params.push({
      'key': 'path',
      'value': data.component
    })
    params.push({
      'key': 'referrerPath',
      'value': ''
    })
    params.push({
      'key': 'description',
      'value': `[${data.event.type}] - ${data.component} - ${data.methodName}`
    })

    return params
  }

  getPerformanceParams(entry) {
    const params = []

    params.push({
      'key': 'type',
      'value': LOG_TYPE.PERF
    })
    params.push({
      'key': 'path',
      'value': entry.path
    })
    params.push({
      'key': 'referrerPath',
      'value': entry.referrerPath
    })
    params.push({
      'key': 'description',
      'value': `[${entry.entryType}] - ${entry.name} - StartTime: ${entry.startTime} - ${entry.duration}`
    })

    return params
  }

  getBaseParams() {
    // 获取当前时间 yyyyMMddHHmmss
    const currentTime = Math.floor(Date.now() / 1000);

    return {
      time: currentTime,
      contents: [{
        key: "userId",
        value: wx.getStorageSync(this.uIdStorageKey) || ''
      }, {
        key: "traceId",
        value: wx.getStorageSync(uuidStorageKey)
      }]
    }
  }

  flushTrackingData() {
    if (this.isSending || this.trackingData.length === 0) {
      return;
    }

    this.isSending = true;
    const dataToSend = [...this.trackingData];  // 复制数据
    this.trackingData = [];  // 清空队列

    const currentTime = Math.floor(Date.now() / 1000);
    const logData = {
      source: this.appId,
      topic: 'WMP_LOG',
      logs: dataToSend
    }

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

    if (!this.serverUrl) {
      console.error('Server URL is not configured');
      this.isSending = false;
      return;
    }

    if (!this.sendToServer) {
      console.log("[Tracking Data] - ", payload)
      this.isSending = false;

      return;
    }

    wx.request({
      url: this.serverUrl,  // 发送到配置的服务器URL
      method: 'POST',
      data: payload,
      success: () => {
        console.log('Tracking data sent successfully');
      },
      fail: (error) => {
        // 如果发送失败，可以将数据重新加入队列
        this.trackingData = [...dataToSend, ...this.trackingData];
        console.error('Failed to send tracking data', error);
      },
      complete: () => {
        this.isSending = false;
      }
    });
  }
}

// 导出 SDK 类实例
module.exports = new WeChatTrackingSDK();
