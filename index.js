const puppeteer = require('puppeteer');
const fs = require('fs');
// const urls = require('./10000.json');
const urls = require('./link.json');

urls.filter(Boolean);

if (!fs.existsSync('./output')) {
  fs.mkdirSync('./output');
}

const getTime = () => `[${new Date().toLocaleTimeString()}]`;

const log = (msg) => {
  console.log(`${getTime()}${msg} 进行中...`);
  return (append = '') => console.log(`${getTime()}${msg} 完成 ${append}`);
};

class Screenshot {
  /**
   *
   * @param {Number} maxPage 最多页面实例限制
   */
  constructor(maxPage = 3) {
    // 浏览器实例
    this.browser = null;
    // 任务列表
    this.links = urls;
    // 页面实例列表
    this.pageBox = new Array(maxPage);
    // 开启时间
    this.startTime = Date.now();
  }
  /**
   * 初始化，获取链接，启动浏览器，开启抓取任务
   * @param {*} urls DEBUG: 手动传入
   * @returns
   */
  async init(urls = []) {
    await this.getLinks(urls);
    // 如果没有任务，则直接退出
    if (!this.hasLink()) {
      await this.closeBrowser();
      return;
    }
    await this.openBrowser();

    this.start();
  }
  /**
   * 从服务端获取连接；链接状态：未抓取(初始)，分配中(超过一定时间需要超时回到未抓取)，已抓取(即任务截图回传)，已抓取有效(回传后需人工确认)
   * DEBUG: 手动传入
   */
  async getLinks(links) {
    const done = log('获取链接列表');
    this.links = links;
    done(`链接数 ${this.links.length}`);
  }
  /**
   * 是否还有链接
   */
  hasLink() {
    return this.links.length > 0;
  }
  /**
   * 是否有运行中的页面实例
   */
  hasRunningPage() {
    return this.pageBox.some((v) => !!v);
  }
  /**
   * 判断运行时间是否超长 1 小时
   */
  hasTimeout() {
    return Date.now() - this.startTime > 1 * 60 * 60 * 1000;
  }
  /**
   * 关闭浏览器，当一波任务执行完后关闭一次，避免长时间执行卡死
   */
  async closeBrowser() {
    if (this.browser) {
      const done = log('关闭浏览器');
      await this.browser.close();
      this.browser = null;
      done();
    }
  }
  /**
   * 启动浏览器
   */
  async openBrowser() {
    await this.closeBrowser();

    const done = log('开启浏览器');
    this.browser = await puppeteer.launch({
      headless: true,
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
      args: ['--no-sandbox', '--start-maximized', '--disable-setuid-sandbox'],
    });
    done();
  }
  async start() {
    // 判断是否超时以及正在执行中的任务
    if (this.hasTimeout()) {
      // 还有任务先 hold
      if (this.hasRunningPage()) {
        return;
      }
      // 关闭退出
      await this.closeBrowser();
      return;
    }
    // 判断是否还有任务以及正在执行中的任务
    if (!this.hasLink()) {
      // 判断是否还有坑，如果没有，则退出等
      if (this.hasRunningPage()) {
        return;
      }
      // 没有任务，重新初始化
      this.init();

      return;
    }
    // 判断是否还有坑位
    const pageIndex = await this.getAvailablePage();
    // 没坑位退出，等其他已完成的调用
    if (pageIndex < 0) {
      return;
    }
    // 有任务和实例开始执行
    this.tick({ pageIndex, link: this.links.pop() });
    // 递归执行，直到任务执行
    this.start();
  }
  /**
   * 获取一个可用 page 实例
   * @returns
   */
  async getAvailablePage() {
    const done = log('获取可用页面实例');
    const index = this.pageBox.findIndex((v) => !v);

    // 判断是否有可用索引
    if (index === -1) {
      done('无可用');
      return index;
    }
    const page = await this.browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.64 Safari/537.36'
    );

    this.pageBox[index] = page;

    done(index);

    return index;
  }
  /**
   * 创建任务
   */
  async tick({ link, pageIndex }) {
    const log1 = log(`使用实例 ${pageIndex} 抓取 ${link}`);
    const page = this.pageBox[pageIndex];
    // 跳转登录页
    try {
      await page.goto(link, {
        // 超时 45s
        timeout: 45 * 1000,
        // 不再有网络连接时触发（至少500毫秒后）
        waitUntil: 'networkidle0',
      });
    } catch (error) {
      // 有可能超时，暂不处理
      console.log(`${getTime()}实例 ${pageIndex} 跳转异常`, error.toString());
    }
    try {
      await page.screenshot({
        path: `./output/${Date.now()}-${encodeURIComponent(link.slice(0, 50))}.png`,
        fullPage: true,
      });
    } catch (error) {
      console.log(`${getTime()}实例 ${pageIndex} 截图异常`, error.toString());
    }
    log1();
    // 销毁 page
    await page.close();
    this.pageBox[pageIndex] = null;
    this.start();
  }
}

const screenshot = new Screenshot();
screenshot.init(urls);
