/* global Page, App, Component, wx */

const CryptoJS = require('crypto-js');
const uuidStorageKey = 'mtt_uuid';
const LOG_TYPE = {
  LC: 'lifecycle',
  EVENT: 'events',
  API: 'apiRequest',
  PERF: 'performance',
  ERROR: 'error',
};

class WeChatTrackingSDK {
  constructor() {
    this.originalPage = Page;
    this.originalComponent = Component;
    this.originalApp = App;
    this.lifecycleHooks = ['onLoad', 'onShow', 'onHide', 'onUnload'];
    this.trackingData = [];
    this.isSending = false;
    this.serverUrl = null;
    this.sendToServer = false;

    this.uuid = this.getOrCreateUUID();
  }

  getOrCreateUUID() {
    let uuid = wx.getStorageSync(uuidStorageKey);
    if (!uuid) {
      uuid = this.generateUUID();
      wx.setStorageSync(uuidStorageKey, uuid);
    }
    return uuid;
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // 初始化 SDK
  init(options = {}) {
    this.serverUrl = options.serverUrl || 'https://api2.middleware.sit.marriott.com.cn/frontend-log-service/api/logs';
    this.appId = options.appId || '';
    this.uIdStorageKey = options.uIdStorageKey || 'userId';
    this.sendToServer = options.sendLog || false;

    this.hookApp();
    this.hookPage();
    this.hookComponent();
    this.hookRequestMethods();
    this.collectPerformance();
  }

  hookApp() {
    const _this = this;
    // eslint-disable-next-line no-global-assign
    App = function (appOptions) {
      ['onLaunch', 'onShow', 'onHide', 'onError'].forEach(hook => {
        const originalHook = appOptions[hook];
        appOptions[hook] = function (...args) {
          _this.trackLifecycle('App', hook);
          if (hook === 'onShow') _this.flushTrackingData();
          if (hook === 'onError') _this.trackErrorMessage(...args);
          if (originalHook) originalHook.apply(this, args);
        };
      });
      _this.originalApp(appOptions);
    };
  }

  hookPage() {
    const _this = this;
    // eslint-disable-next-line no-global-assign
    Page = function (pageOptions) {
      _this.lifecycleHooks.forEach(hook => {
        const originalHook = pageOptions[hook];
        pageOptions[hook] = function (...args) {
          _this.trackLifecycle('Page', hook, this.route);
          if (hook === 'onUnload') _this.flushTrackingData();
          if (originalHook) originalHook.apply(this, args);
        };
      });

      // Hook 自定义点击方法
      _this.hookCustomMethods(pageOptions, pageOptions);
      _this.originalPage(pageOptions);
    };
  }

  hookComponent() {
    const _this = this;
    // eslint-disable-next-line no-global-assign
    Component = function (componentOptions) {
      _this.lifecycleHooks.forEach(hook => {
        const originalHook = componentOptions[hook];
        componentOptions[hook] = function (...args) {
          _this.trackLifecycle('Component', hook, this.is);
          if (hook === 'onUnload') _this.flushTrackingData();
          if (originalHook) originalHook.apply(this, args);
        };
      });

      // Hook 自定义点击方法
      _this.hookCustomMethods(componentOptions.methods, componentOptions);
      _this.originalComponent(componentOptions);
    };
  }

  hookCustomMethods(methods, context) {
    const _this = this;
    Object.keys(methods || {}).forEach(key => {
      if (typeof methods[key] === 'function') {
        const originalMethod = methods[key];
        methods[key] = function (event) {
          if (event && event.type === 'tap') {
            _this.trackClickEvent(context.route || context.is, key, event);
          }
          originalMethod.apply(this, arguments);
        };
      }
    });
  }

  hookRequestMethods() {
    // 保存原始的 wx.request 方法
    const _this = this;
    const originalRequest = wx.request;

    // 重写 wx.request 方法
    wx.request = function (options) {
      // 你自定义的逻辑
      // console.log('Request intercepted:', options.url);
      const startTime = Date.now();
      const originalSuccess = options.success;
      const originalFail = options.fail;
      const originalComplete = options.complete;

      options.success = function (res) {
        // console.log('Request success:', res);
        if (originalSuccess) originalSuccess(res);
      };

      options.fail = function (err) {
        // console.log('Request failed:', err);
        if (originalFail) originalFail(err);
      };

      options.complete = function (res) {
        let data = {}
        const endTime = Date.now();

        data.duration = endTime - startTime;
        // console.log(`Request completed. Duration: ${endTime - startTime}ms`);

        _this.trackApiRequest({ duration: endTime - startTime, path: options.url })

        if (originalComplete) originalComplete(res);
      };

      return originalRequest(options);
    };
  }

  collectPerformance() {
    const performance = wx.getPerformance();
    const observer = performance.createObserver(entryList => {
      entryList.getEntries().forEach(entry => this.trackPerformance(entry));
    });

    observer.observe({ entryTypes: ['render', 'navigation'] });

    // 收集启动时间
    this.trackPerformance({
      entryType: 'App',
      path: '/',
      name: 'launch',
      startTime: performance.now(),
      duration: 0,
      referrerPath: '',
    });
  }

  trackErrorMessage(error) {
    this.trackingData.push(this.buildTrackingParams(LOG_TYPE.ERROR, JSON.stringify(error)));
  }

  trackLifecycle(type, hook, identifier = '') {
    this.trackingData.push(this.buildTrackingParams(LOG_TYPE.LC, { type, hook, identifier }));
  }

  trackClickEvent(component, methodName, event) {
    this.trackingData.push(this.buildTrackingParams(LOG_TYPE.EVENT, { component, methodName, event }));
  }

  trackPerformance(entry) {
    this.trackingData.push(this.buildTrackingParams(LOG_TYPE.PERF, entry));
  }

  trackApiRequest(data) {
    this.trackingData.push(this.buildTrackingParams(LOG_TYPE.API, data));
  }

  buildTrackingParams(type, extraData) {
    const baseParams = this.getBaseParams();

    const dataMap = {
      [LOG_TYPE.PERF]: this.getPerformanceParams,
      [LOG_TYPE.EVENT]: this.getEventParams,
      [LOG_TYPE.LC]: this.getLifeTimeParams,
      [LOG_TYPE.ERROR]: this.getErrorParams,
      [LOG_TYPE.API]: this.getApiRequestParams,
    };

    baseParams.contents.push(...dataMap[type].call(this, extraData));

    return baseParams;
  }

  getApiRequestParams(data) {
    return [{
      key: 'type',
      value: LOG_TYPE.API,
    }, {
      key: 'path',
      value: data.path,
    }, {
      key: 'referrerPath',
      value: '',
    }, {
      key: 'description',
      value: `TotalTime: ${data.duration}ms`,
    }];
  }

  getErrorParams(data) {
    return [{
      key: 'type',
      value: LOG_TYPE.ERROR,
    }, {
      key: 'path',
      value: '',
    }, {
      key: 'referrerPath',
      value: '',
    }, {
      key: 'description',
      value: data,
    }];
  }

  getLifeTimeParams(data) {
    return [{
      key: 'type',
      value: LOG_TYPE.LC,
    }, {
      key: 'path',
      value: data.identifier,
    }, {
      key: 'referrerPath',
      value: '',
    }, {
      key: 'description',
      value: `[${data.type}] - ${data.hook} - ${data.identifier}`,
    }];
  }

  getEventParams(data) {
    return [{
      key: 'type',
      value: LOG_TYPE.EVENT,
    }, {
      key: 'path',
      value: data.component,
    }, {
      key: 'referrerPath',
      value: '',
    }, {
      key: 'description',
      value: `[${data.event.type}] - ${data.component} - ${data.methodName}`,
    }];
  }

  getPerformanceParams(entry) {
    return [{
      key: 'type',
      value: LOG_TYPE.PERF,
    }, {
      key: 'path',
      value: entry.path,
    }, {
      key: 'referrerPath',
      value: entry.referrerPath,
    }, {
      key: 'description',
      value: `[${entry.entryType}] - ${entry.name} - StartTime: ${entry.startTime} - ${entry.duration}`,
    }];
  }

  getBaseParams() {
    const currentTime = Math.floor(Date.now() / 1000);
    return {
      time: currentTime,
      contents: [{
        key: "userId",
        value: wx.getStorageSync(this.uIdStorageKey) || '',
      }, {
        key: "traceId",
        value: this.uuid,
      }],
    };
  }

  flushTrackingData() {
    if (this.isSending || this.trackingData.length === 0) return;

    this.isSending = true;
    const dataToSend = [...this.trackingData];
    this.trackingData = [];

    this.sendTracking(dataToSend)
  }

  sendTracking(dataToSend) {
    const currentTime = Math.floor(Date.now() / 1000);
    const logData = {
      source: this.appId,
      topic: 'WMP_LOG',
      logs: dataToSend,
    };
    const rawString = currentTime + 'marriottlog' + JSON.stringify(logData);
    const encryptedLog = CryptoJS.SHA512(rawString).toString();

    const payload = {
      data: logData,
      sign: encryptedLog,
      timestamp: currentTime,
    };

    if (!this.serverUrl) {
      console.error('Server URL is not configured');
      this.isSending = false;
      return;
    }

    if (!this.sendToServer) {
      console.log("[Tracking Data] - ", payload);
      this.isSending = false;
      return;
    }

    wx.request({
      url: this.serverUrl,
      method: 'POST',
      data: payload,
      success: () => {
        console.log('Tracking data sent successfully');
      },
      fail: (error) => {
        this.trackingData = [...dataToSend, ...this.trackingData];
        console.error('Failed to send tracking data', error);
      },
      complete: () => {
        this.isSending = false;
      },
    });
  }
}

module.exports = new WeChatTrackingSDK();
